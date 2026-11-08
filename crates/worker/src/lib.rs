use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, Promise, env,
    json_types::{U64, U128},
    near, require,
    store::LookupMap,
};

const RESERVE: u128 = 1_000_000_000_000_000_000_000_000;
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Credit {
    pub amount: U128,
    pub status: String,
}
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Claim {
    pub recipient: AccountId,
    pub amount: U128,
    pub status: String,
}
#[near(serializers = [json])]
pub struct Accounting {
    pub reserve: U128,
    pub balance: U128,
    pub staged: U128,
    pub recognized: U128,
    pub paid: U128,
    pub claimable: U128,
}
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Worker {
    registry_id: AccountId,
    credits: LookupMap<u64, Credit>,
    claims: LookupMap<u64, Claim>,
    staged: u128,
    unpaid: u128,
    paid: u128,
    pending: u128,
}
#[near]
impl Worker {
    #[init]
    pub fn new(registry_id: AccountId) -> Self {
        require!(
            env::predecessor_account_id() == registry_id,
            "Initialize from Registry"
        );
        require!(
            env::current_account_id()
                .as_str()
                .split_once('.')
                .is_some_and(|(name, parent)| parent == registry_id.as_str()
                    && ["rook", "mallow", "nix", "dot", "brisk", "peebles"].contains(&name)),
            "Invalid worker identity"
        );
        require!(
            env::account_balance().as_yoctonear() >= RESERVE * 2,
            "Worker funding too small"
        );
        Self {
            registry_id,
            credits: LookupMap::new(b"c"),
            claims: LookupMap::new(b"p"),
            staged: 0,
            unpaid: 0,
            paid: 0,
            pending: 0,
        }
    }
    pub fn registry_id(&self) -> AccountId {
        self.registry_id.clone()
    }
    pub fn recognized_earnings(&self) -> U128 {
        U128(self.unpaid)
    }
    pub fn accounting(&self) -> Accounting {
        let balance = env::account_balance().as_yoctonear();
        let protected = RESERVE
            .max(u128::from(env::storage_usage() + 2048) * env::storage_byte_cost().as_yoctonear());
        Accounting {
            reserve: U128(protected),
            balance: U128(balance),
            staged: U128(self.staged),
            recognized: U128(self.unpaid),
            paid: U128(self.paid),
            claimable: U128(
                self.unpaid.saturating_sub(self.pending).min(
                    balance
                        .saturating_sub(protected)
                        .saturating_sub(self.staged),
                ),
            ),
        }
    }
    pub fn get_credit(&self, credit_id: U64) -> Option<Credit> {
        self.credits.get(&credit_id.0).cloned()
    }
    pub fn get_claim(&self, claim_id: U64) -> Option<Claim> {
        self.claims.get(&claim_id.0).cloned()
    }
    #[payable]
    pub fn stage_credit(&mut self, credit_id: U64) -> Credit {
        self.authorize();
        require!(
            self.credits.get(&credit_id.0).cloned().is_none(),
            "Credit already exists; look up its status"
        );
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Missing credit");
        let accounting = self.accounting();
        require!(
            accounting.balance.0
                >= accounting.reserve.0
                    + self.staged
                    + self.unpaid.saturating_sub(self.pending)
                    + amount,
            "Worker reserve needs funding"
        );
        self.staged = self.staged.checked_add(amount).expect("Credit limit");
        let credit = Credit {
            amount: U128(amount),
            status: "staged".into(),
        };
        self.credits.insert(credit_id.0, credit.clone());
        credit
    }
    pub fn finalize_credit(&mut self, credit_id: U64) -> Credit {
        self.authorize();
        let mut credit = self
            .credits
            .get(&credit_id.0)
            .cloned()
            .expect("Unknown credit");
        if credit.status == "finalized" {
            return credit;
        }
        require!(credit.status == "staged", "Credit cannot finalize");
        self.staged -= credit.amount.0;
        self.unpaid = self
            .unpaid
            .checked_add(credit.amount.0)
            .expect("Earnings limit");
        credit.status = "finalized".into();
        self.credits.insert(credit_id.0, credit.clone());
        credit
    }
    pub fn reverse_credit(&mut self, credit_id: U64) {
        self.authorize();
        // An absent-credit tombstone also prevents a delayed stage from arriving after cancellation.
        let mut credit = self.credits.get(&credit_id.0).cloned().unwrap_or(Credit {
            amount: U128(0),
            status: "staged".into(),
        });
        if credit.status == "reversed" || credit.status == "reversing" {
            return;
        }
        require!(credit.status == "staged", "Finalized credit cannot reverse");
        credit.status = "reversing".into();
        self.credits.insert(credit_id.0, credit.clone());
        self.return_credit(credit_id, credit.amount);
    }
    pub fn retry_reversal(&mut self, credit_id: U64) {
        self.authorize();
        let mut credit = self
            .credits
            .get(&credit_id.0)
            .cloned()
            .expect("Unknown credit");
        require!(
            credit.status == "reverse_failed",
            "Reversal is pending or complete"
        );
        credit.status = "reversing".into();
        self.credits.insert(credit_id.0, credit.clone());
        self.return_credit(credit_id, credit.amount);
    }
    #[private]
    pub fn on_reversal(&mut self, credit_id: U64) {
        let Some(mut credit) = self.credits.get(&credit_id.0).cloned() else {
            return;
        };
        if credit.status != "reversing" {
            return;
        }
        if env::promise_result_checked(0, 1024).is_ok() {
            self.staged -= credit.amount.0;
            credit.status = "reversed".into();
        } else {
            credit.status = "reverse_failed".into();
        }
        self.credits.insert(credit_id.0, credit.clone());
    }
    pub fn reconcile_reversal(&self, credit_id: U64) -> Promise {
        self.authorize();
        Promise::new(self.registry_id.clone())
            .function_call(
                "get_job",
                near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"job_id":credit_id}))
                    .unwrap(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(10),
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_return_status",
                    near_sdk::serde_json::to_vec(
                        &near_sdk::serde_json::json!({"credit_id":credit_id}),
                    )
                    .unwrap(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(15),
                ),
            )
    }
    #[private]
    pub fn on_return_status(&mut self, credit_id: U64) {
        let Some(mut credit) = self.credits.get(&credit_id.0).cloned() else {
            return;
        };
        if credit.status != "reversing" {
            return;
        }
        let job = env::promise_result_checked(0, 8192).ok().and_then(|bytes| {
            near_sdk::serde_json::from_slice::<near_sdk::serde_json::Value>(&bytes).ok()
        });
        if job.is_some_and(|j| {
            j["status"] == "cancelled"
                && j["credit_status"] == "reversed"
                && j["worker_account"] == env::current_account_id().as_str()
        }) {
            self.staged -= credit.amount.0;
            credit.status = "reversed".into();
            self.credits.insert(credit_id.0, credit);
        }
    }
    pub fn payout(&mut self, claim_id: U64, recipient: AccountId, amount: U128) -> Option<Claim> {
        self.authorize();
        if let Some(claim) = self.claims.get(&claim_id.0).cloned() {
            return Some(claim);
        }
        if amount.0 == 0 || amount.0 > self.accounting().claimable.0 {
            // Failure is terminal for this ID too. A delayed retry must never become
            // payable after Registry has unlocked title or accepted another claim.
            let claim = Claim {
                recipient,
                amount,
                status: "failed".into(),
            };
            self.claims.insert(claim_id.0, claim.clone());
            return Some(claim);
        }
        let claim = Claim {
            recipient: recipient.clone(),
            amount,
            status: "pending".into(),
        };
        self.pending += amount.0;
        self.claims.insert(claim_id.0, claim.clone());
        Promise::new(recipient)
            .transfer(NearToken::from_yoctonear(amount.0))
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_payout",
                    near_sdk::serde_json::to_vec(
                        &near_sdk::serde_json::json!({"claim_id":claim_id}),
                    )
                    .unwrap(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(15),
                ),
            )
            .detach();
        Some(claim)
    }
    /// Registry's deployment operator attests a FINAL native-transfer receipt after a lost callback.
    /// No new transfer is scheduled here; recipient and amount stay immutable.
    pub fn repair_payout(&mut self, claim_id: U64, succeeded: bool) {
        self.authorize();
        let Some(mut claim) = self.claims.get(&claim_id.0).cloned() else {
            return;
        };
        if claim.status != "pending" {
            return;
        }
        self.pending -= claim.amount.0;
        if succeeded {
            self.unpaid -= claim.amount.0;
            self.paid += claim.amount.0;
        }
        claim.status = if succeeded { "paid" } else { "failed" }.into();
        self.claims.insert(claim_id.0, claim);
    }
    #[private]
    pub fn on_payout(&mut self, claim_id: U64) {
        let Some(mut claim) = self.claims.get(&claim_id.0).cloned() else {
            return;
        };
        if claim.status != "pending" {
            return;
        }
        self.pending -= claim.amount.0;
        if env::promise_result_checked(0, 0).is_ok() {
            self.unpaid -= claim.amount.0;
            self.paid += claim.amount.0;
            claim.status = "paid".into();
        } else {
            claim.status = "failed".into();
        }
        self.claims.insert(claim_id.0, claim.clone());
    }
}
impl Worker {
    fn authorize(&self) {
        require!(
            env::predecessor_account_id() == self.registry_id,
            "Only Registry"
        );
    }
    fn return_credit(&self, credit_id: U64, amount: U128) {
        Promise::new(self.registry_id.clone())
            .function_call(
                "receive_reversal",
                near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"job_id":credit_id}))
                    .unwrap(),
                NearToken::from_yoctonear(amount.0),
                Gas::from_tgas(30),
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_reversal",
                    near_sdk::serde_json::to_vec(
                        &near_sdk::serde_json::json!({"credit_id":credit_id}),
                    )
                    .unwrap(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(15),
                ),
            )
            .detach();
    }
}
