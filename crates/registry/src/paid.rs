use super::*;

#[near]
impl Registry {
    /// Deployment gate: only the original testnet operator enables new payments after resource tests.
    pub fn enable_paid_hiring(&self, token_id: Option<TokenId>) -> Promise {
        let token_id = token_id.unwrap_or_else(|| TOKEN.into());
        require!(
            env::predecessor_account_id() == self.deployment_owner,
            "Only deployment operator"
        );
        self.worker_call(
            &token_id,
            "accounting",
            near_sdk::serde_json::json!({}),
            0,
            10,
        )
        .then(self.callback(
            "on_funding",
            near_sdk::serde_json::json!({"token_id":token_id}),
            10,
        ))
    }
    #[private]
    pub fn on_funding(&mut self, token_id: TokenId) {
        if let Some(v) = result::<near_sdk::serde_json::Value>() {
            let amount = |key: &str| {
                v[key]
                    .as_str()
                    .and_then(|s| s.parse::<u128>().ok())
                    .unwrap_or(0)
            };
            self.workers
                .get_mut(&token_id)
                .expect("Unknown worker")
                .paid_enabled = amount("reserve") >= 10u128.pow(24)
                && amount("balance")
                    >= amount("reserve") + amount("staged") + amount("recognized") + 10u128.pow(23);
        }
    }
    pub fn set_offer(
        &mut self,
        token_id: Option<TokenId>,
        package_option: u8,
        starting_ask: U128,
        floor_ask: U128,
        discount_step: U128,
    ) {
        let token_id = token_id.unwrap_or_else(|| TOKEN.into());
        self.owner(&token_id);
        require!(
            self.get_worker(Some(token_id.clone())).status == "idle"
                && !self.claim_pending(&token_id),
            "Worker is occupied"
        );
        require!(package_option < 2, "Unknown package option");
        require!(
            floor_ask.0 >= MIN_PRICE
                && floor_ask.0 <= starting_ask.0
                && starting_ask.0 <= MAX_PRICE
                && discount_step.0 <= MAX_PRICE,
            "Invalid price bounds"
        );
        self.workers.get_mut(&token_id).unwrap().offers[package_option as usize] = Some(Offer {
            package_option,
            starting_ask,
            floor_ask,
            discount_step,
            available_since: U64(env::block_height()),
        });
    }
    pub fn withdraw_offer(&mut self, token_id: Option<TokenId>, package_option: Option<u8>) {
        let token_id = token_id.unwrap_or_else(|| TOKEN.into());
        self.owner(&token_id);
        require!(
            self.get_worker(Some(token_id.clone())).status == "idle"
                && !self.claim_pending(&token_id),
            "Worker is occupied"
        );
        let option = package_option.unwrap_or(0);
        require!(option < 2, "Unknown package option");
        self.workers.get_mut(&token_id).unwrap().offers[option as usize] = None;
    }
    #[payable]
    pub fn hire_and_open(
        &mut self,
        token_id: TokenId,
        package_option: u8,
        placement: String,
        setup_id: String,
        expected_content_hash: Base64VecU8,
        expected_quote: U128,
        commission: Option<Booking>,
    ) -> Job {
        require!(
            self.worker(&token_id).paid_enabled,
            "Paid hiring is not enabled"
        );
        require!(
            self.nft.owner_by_id.get(&token_id) != Some(env::predecessor_account_id()),
            "Use owner self-use"
        );
        require!(package_option < 2, "Unknown package option");
        let offer = self.worker(&token_id).offers[package_option as usize]
            .as_ref()
            .expect("No advertised offer");
        require!(
            package_option == offer.package_option,
            "Option is not advertised"
        );
        let quote = self.price(&token_id, offer);
        require!(
            expected_quote.0 == quote,
            "Price changed; confirm the current price"
        );
        require!(
            env::attached_deposit().as_yoctonear()
                == quote
                    .checked_sub(commission.as_ref().map_or(0, |c| c.company_contribution.0))
                    .expect("Contribution exceeds fee")
                    + JOB_BOND,
            "Attach wallet share plus storage deposit"
        );
        let job = self.create_job(
            token_id,
            package_option,
            placement,
            setup_id,
            expected_content_hash,
            quote,
            commission,
        );
        self.worker_call(
            &job.token_id,
            "stage_credit",
            near_sdk::serde_json::json!({"credit_id":job.job_id}),
            Self::worker_share(quote),
            20,
        )
        .then(self.callback(
            "on_credit",
            near_sdk::serde_json::json!({"job_id":job.job_id}),
            60,
        ))
        .detach();
        job
    }
    /// Status reads never send another paid stage. Safe even after a lost callback.
    pub fn reconcile_payment(&self, job_id: U64) -> Promise {
        let job = self.jobs.get(&job_id.0).expect("Unknown job");
        require!(job.accepted_fee.0 > 0, "Not a paid job");
        if job.credit_status == "reversed" {
            return self.worker_call(
                &job.token_id,
                "reconcile_reversal",
                near_sdk::serde_json::json!({"credit_id":job_id}),
                0,
                40,
            );
        }
        self.worker_call(
            &job.token_id,
            "get_credit",
            near_sdk::serde_json::json!({"credit_id":job_id}),
            0,
            10,
        )
        .then(self.callback(
            "on_credit",
            near_sdk::serde_json::json!({"job_id":job_id}),
            60,
        ))
    }
    #[private]
    pub fn on_credit(&mut self, job_id: U64) {
        let Some(mut job) = self.jobs.get(&job_id.0) else {
            return;
        };
        let Some(credit) = result::<Option<Credit>>().flatten() else {
            if job.status == "payment_pending" {
                job.credit_status = "unknown".into();
                self.update_job(&mut job);
            }
            return;
        };
        if credit.amount.0 != Self::worker_share(job.accepted_fee.0) {
            return;
        }
        if job.status == "payment_pending" && credit.status == "staged" {
            job.status = "active".into();
            job.expires_at_block = U64(env::block_height().saturating_add(LEASE_BLOCKS));
            self.hall_earned += job.accepted_fee.0 - credit.amount.0;
            let history = &mut self
                .workers
                .get_mut(&job.token_id)
                .unwrap()
                .recent_paid_hires;
            if history.len() == 10 {
                history.remove(0);
            }
            history.push(job.job_id.0);
        }
        if ["active", "saved", "expired"].contains(&job.status.as_str()) {
            if credit.status == "staged" {
                job.credit_status = "staged".into();
                self.worker_call(
                    &job.token_id,
                    "finalize_credit",
                    near_sdk::serde_json::json!({"credit_id":job_id}),
                    0,
                    20,
                )
                .then(self.callback(
                    "on_credit",
                    near_sdk::serde_json::json!({"job_id":job_id}),
                    25,
                ))
                .detach();
            } else if credit.status == "finalized" {
                job.credit_status = "finalized".into();
            }
        }
        self.update_job(&mut job);
    }
    pub fn cancel_pending_hire(&mut self, job_id: U64) {
        let mut job = self.jobs.get(&job_id.0).expect("Unknown job");
        require!(
            env::predecessor_account_id() == job.renter_id,
            "Only renter may cancel"
        );
        require!(
            ["payment_pending", "recovery_pending"].contains(&job.status.as_str()),
            "An activated fee cannot be refunded"
        );
        job.status = "recovery_pending".into();
        self.update_job(&mut job);
        self.worker_call(
            &job.token_id,
            "reverse_credit",
            near_sdk::serde_json::json!({"credit_id":job_id}),
            0,
            90,
        )
        .detach();
    }
    pub fn retry_credit_return(&self, job_id: U64) {
        let job = self.jobs.get(&job_id.0).expect("Unknown job");
        require!(job.status == "recovery_pending", "No recovery pending");
        self.worker_call(
            &job.token_id,
            "retry_reversal",
            near_sdk::serde_json::json!({"credit_id":job_id}),
            0,
            90,
        )
        .detach();
    }
    #[payable]
    pub fn receive_reversal(&mut self, job_id: U64) {
        require!(
            env::predecessor_account_id()
                == self
                    .jobs
                    .get(&job_id.0)
                    .expect("Unknown job")
                    .worker_account,
            "Only worker may return credit"
        );
        let mut job = self.jobs.get(&job_id.0).expect("Unknown job");
        require!(job.status == "recovery_pending", "Booking is not cancelled");
        let amount = env::attached_deposit().as_yoctonear();
        require!(
            amount == 0 || amount == Self::worker_share(job.accepted_fee.0),
            "Wrong returned credit"
        );
        let before = env::storage_usage();
        job.status = "cancelled".into();
        job.credit_status = "reversed".into();
        let company_share = job
            .employment
            .as_ref()
            .map_or(0, |e| e.company_contribution.0);
        self.close_commission(&mut job, true);
        self.jobs.insert(&job.job_id.0, &job);
        let after = env::storage_usage();
        job.storage_bytes = if after >= before {
            job.storage_bytes + after - before
        } else {
            job.storage_bytes - (before - after)
        };
        // Company/dispatch records survive cancellation. Charge their actual storage,
        // rather than consuming another project's budget or another company's funds.
        let cost = u128::from(job.storage_bytes) * env::storage_byte_cost().as_yoctonear();
        job.refund_owed = U128(
            job.accepted_fee.0 - company_share + job.bond.0
                - if job.employment.is_some() { cost } else { 0 },
        );
        self.refund(&mut job);
    }
    /// Last-resort receipt attestation. Only the immutable deployment operator may resolve
    /// a lost native-transfer callback, after checking FINAL receipt success/failure.
    /// A false failure attestation can cause double payment: this is a disclosed trust boundary.
    pub fn repair_native_callback(
        &mut self,
        job_id: Option<U64>,
        token_id: Option<TokenId>,
        succeeded: bool,
        receipt_id: String,
    ) {
        let token_id = token_id.unwrap_or_else(|| TOKEN.into());
        require!(
            env::predecessor_account_id() == self.deployment_owner,
            "Only deployment operator"
        );
        require!(
            receipt_id.len() >= 32
                && receipt_id.len() <= 64
                && receipt_id.bytes().all(|b| b.is_ascii_alphanumeric()),
            "Provide finalized receipt ID"
        );
        env::log_str(&near_sdk::serde_json::json!({"event":"native_callback_repair","job_id":job_id,"succeeded":succeeded,"receipt_id":receipt_id}).to_string());
        if let Some(id) = job_id {
            let mut job = self.jobs.get(&id.0).expect("Unknown job");
            require!(job.refund_in_flight, "No uncertain refund");
            if succeeded {
                job.refund_owed = U128(0);
            }
            job.refund_in_flight = false;
            self.update_job(&mut job);
        } else {
            let claim = self.worker(&token_id).claim.as_ref().expect("No claim");
            require!(claim.status == "pending", "No uncertain claim");
            self.worker_call(
                &token_id,
                "repair_payout",
                near_sdk::serde_json::json!({"claim_id":claim.claim_id,"succeeded":succeeded}),
                0,
                15,
            )
            .detach();
        }
    }
    pub fn request_claim(&mut self, amount: U128, token_id: Option<TokenId>) -> Claim {
        let token_id = token_id.unwrap_or_else(|| TOKEN.into());
        self.owner(&token_id);
        require!(
            !self.claim_pending(&token_id),
            "Claim is pending; check its status"
        );
        require!(amount.0 > 0, "Enter an earnings amount");
        let claim = Claim {
            claim_id: U64(self.next_claim),
            recipient: env::predecessor_account_id(),
            amount,
            status: "pending".into(),
        };
        self.next_claim = self.next_claim.checked_add(1).expect("Claim limit");
        self.workers.get_mut(&token_id).unwrap().claim = Some(claim.clone());
        self.send_claim(&token_id, &claim);
        claim
    }
    pub fn reconcile_claim(&self, token_id: Option<TokenId>) {
        let token_id = token_id.unwrap_or_else(|| TOKEN.into());
        let claim = self.worker(&token_id).claim.as_ref().expect("No claim");
        require!(claim.status == "pending", "Claim already resolved");
        // Worker payout is keyed by ID; replaying this call cannot repeat a native transfer.
        self.send_claim(&token_id, claim);
    }
    #[private]
    pub fn on_claim(&mut self, claim_id: U64, token_id: TokenId) {
        let Some(mut claim) = self.worker(&token_id).claim.clone() else {
            return;
        };
        if claim.claim_id != claim_id || claim.status != "pending" {
            return;
        }
        if let Some(value) = result::<Option<near_sdk::serde_json::Value>>() {
            if let Some(v) = value {
                if v["recipient"] != claim.recipient.as_str()
                    || v["amount"] != claim.amount.0.to_string()
                {
                    return;
                }
                if let Some(status) = v["status"]
                    .as_str()
                    .filter(|s| ["paid", "failed"].contains(s))
                {
                    claim.status = status.into();
                }
            } else {
                claim.status = "failed".into();
            }
            self.workers.get_mut(&token_id).unwrap().claim = Some(claim);
        }
    }
}
impl Registry {
    fn update_job(&mut self, job: &mut Job) {
        let before = env::storage_usage();
        self.jobs.insert(&job.job_id.0, job);
        let after = env::storage_usage();
        job.storage_bytes = if after >= before {
            job.storage_bytes + after - before
        } else {
            job.storage_bytes - (before - after)
        };
        self.jobs.insert(&job.job_id.0, job);
    }
    pub(super) fn owner(&self, token_id: &str) {
        require!(
            !self.worker(token_id).transfer_pending,
            "Title transfer is pending"
        );
        require!(
            self.nft.owner_by_id.get(&token_id.to_string()) == Some(env::predecessor_account_id()),
            "Only the current owner may manage this worker"
        );
    }
    pub(super) fn claim_pending(&self, token_id: &str) -> bool {
        self.worker(&token_id)
            .claim
            .as_ref()
            .is_some_and(|c| c.status == "pending")
    }
    pub(super) fn price(&self, token_id: &str, offer: &Offer) -> u128 {
        let available = self
            .worker(token_id)
            .current_job
            .and_then(|id| self.jobs.get(&id))
            .map_or(offer.available_since.0, |j| {
                offer.available_since.0.max(j.cooldown_until.0)
            });
        offer_price(offer, env::block_height(), available)
    }

    fn worker_share(fee: u128) -> u128 {
        fee - fee / 20
    }
    fn worker_call(
        &self,
        token_id: &str,
        method: &str,
        args: near_sdk::serde_json::Value,
        amount: u128,
        gas: u64,
    ) -> Promise {
        Promise::new(self.worker(token_id).worker_account.clone()).function_call(
            method.to_string(),
            near_sdk::serde_json::to_vec(&args).unwrap(),
            NearToken::from_yoctonear(amount),
            Gas::from_tgas(gas),
        )
    }
    pub(super) fn callback(
        &self,
        method: &str,
        args: near_sdk::serde_json::Value,
        gas: u64,
    ) -> Promise {
        Promise::new(env::current_account_id()).function_call(
            method.to_string(),
            near_sdk::serde_json::to_vec(&args).unwrap(),
            NearToken::from_yoctonear(0),
            Gas::from_tgas(gas),
        )
    }
    fn send_claim(&self, token_id: &str, claim: &Claim) {
        self.worker_call(&token_id, "payout", near_sdk::serde_json::json!({"claim_id":claim.claim_id,"recipient":claim.recipient,"amount":claim.amount}), 0, 40)
            .then(self.callback("on_claim", near_sdk::serde_json::json!({"claim_id":claim.claim_id,"token_id":token_id}), 15)).detach();
    }
}
fn result<T: near_sdk::serde::de::DeserializeOwned>() -> Option<T> {
    env::promise_result_checked(0, 4096)
        .ok()
        .and_then(|bytes| near_sdk::serde_json::from_slice(&bytes).ok())
}

fn offer_price(offer: &Offer, block: u64, available: u64) -> u128 {
    let steps = (block.saturating_sub(available) / IDLE_BLOCKS).min(3);
    offer
        .starting_ask
        .0
        .saturating_sub(offer.discount_step.0.saturating_mul(steps.into()))
        .max(offer.floor_ask.0)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn idle_price_boundaries_floor_and_overflow() {
        let mut o = Offer {
            package_option: 0,
            starting_ask: U128(4000),
            floor_ask: U128(1000),
            discount_step: U128(1000),
            available_since: U64(50),
        };
        for (elapsed, expected) in [
            (0, 4000),
            (119, 4000),
            (120, 3000),
            (239, 3000),
            (240, 2000),
            (359, 2000),
            (360, 1000),
            (u64::MAX - 50, 1000),
        ] {
            assert_eq!(offer_price(&o, 50 + elapsed, 50), expected);
        }
        assert_eq!(offer_price(&o, 49, 50), 4000);
        o.discount_step = U128(u128::MAX);
        assert_eq!(offer_price(&o, u64::MAX, 50), 1000);
        o.discount_step = U128(0);
        assert_eq!(offer_price(&o, u64::MAX, 50), 4000);
        // Reopening after cooldown starts the clock anew.
        assert_eq!(offer_price(&o, 500, 500), 4000);
    }
}
