use super::*;

pub const ROUTINE_PAY: u128 = 50_000_000_000_000_000_000_000;
pub const PREMIUM_PAY: u128 = 75_000_000_000_000_000_000_000;
pub const PROJECT_BUDGET: u128 = 500_000_000_000_000_000_000_000;

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Objective {
    Routine,
    Intact,
    Express,
}
impl Objective {
    pub fn payment(self) -> u128 {
        if self == Self::Routine {
            ROUTINE_PAY
        } else {
            PREMIUM_PAY
        }
    }
    pub fn met(self, record: &JobRecord) -> bool {
        record.outcome == "delivered"
            && match self {
                Self::Routine => true,
                Self::Intact => record.cart_hp == 2,
                Self::Express => record.round <= 4,
            }
    }
}
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Booking {
    pub commission_id: U64,
    pub dispatch_id: U64,
    pub expected_terms: Base64VecU8,
    pub company_contribution: U128,
}
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Commission {
    pub commission_id: U64,
    pub dispatch_id: U64,
    pub objective: Objective,
    pub payment: U128,
    pub setup_ids: Vec<String>,
    pub terms_hash: Base64VecU8,
    pub available: bool,
}
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Employment {
    pub commission_id: U64,
    pub dispatch_id: U64,
    pub leg: u8,
    pub objective: Objective,
    pub payment: U128,
    pub company_contribution: U128,
    pub earned: U128,
    pub closed: bool,
}
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Dispatch {
    pub dispatch_id: U64,
    pub completed: u8,
    pub fulfilled: u8,
    pub jobs: [Option<U64>; 3],
}
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum WithdrawalStatus {
    None,
    Pending,
    Paid,
    Failed,
}
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct CompanyWithdrawal {
    pub withdrawal_id: U64,
    pub amount: U128,
    pub status: WithdrawalStatus,
}
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Company {
    pub account_id: AccountId,
    pub deliveries: U64,
    pub funds: U128,
    pub active_job: Option<U64>,
    pub dispatch: Dispatch,
    pub withdrawal: CompanyWithdrawal,
}
impl Company {
    fn new(account_id: AccountId) -> Self {
        Self {
            account_id,
            deliveries: U64(0),
            funds: U128(0),
            active_job: None,
            dispatch: Dispatch {
                dispatch_id: U64(0),
                completed: 0,
                fulfilled: 0,
                jobs: [None; 3],
            },
            withdrawal: CompanyWithdrawal {
                withdrawal_id: U64(0),
                amount: U128(0),
                status: WithdrawalStatus::None,
            },
        }
    }
    fn next_dispatch(&self) -> u64 {
        self.dispatch.dispatch_id.0 + u64::from(self.dispatch.completed == 3)
    }
}
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Project {
    pub batch: U64,
    pub funded: bool,
    pub restored: bool,
    pub slots: [u8; 9], // 0 open, 1 reserved, 2 fulfilled
    pub reservations: [Option<U64>; 9],
    pub unreserved: U128,
    pub reserved: U128,
    pub paid: U128,
}
impl Default for Project {
    fn default() -> Self {
        Self {
            batch: U64(0),
            funded: false,
            restored: false,
            slots: [0; 9],
            reservations: [None; 9],
            unreserved: U128(0),
            reserved: U128(0),
            paid: U128(0),
        }
    }
}
impl Project {
    pub fn stage(&self) -> u8 {
        (0..3)
            .find(|&stage| self.slots[stage * 3..stage * 3 + 3].iter().any(|&s| s != 2))
            .unwrap_or(3) as u8
    }
    fn objective(slot: usize) -> Objective {
        match slot {
            5 => Objective::Intact,
            8 => Objective::Express,
            _ => Objective::Routine,
        }
    }
    fn setups(slot: usize) -> Vec<String> {
        let family = ["Dock Fire", "Bridge Audit", "Friday, Again"][slot % 3];
        game_core::bundle()
            .setups
            .into_iter()
            .filter(|s| {
                s.name == family
                    && (Self::objective(slot) == Objective::Routine
                        || matches!(
                            s.id.as_str(),
                            "friday-again-overtime" | "friday-again-crossed"
                        ))
            })
            .map(|s| s.id)
            .collect()
    }
    fn company_setups(slot: usize, deliveries: u64) -> Vec<String> {
        let mut setups = Self::setups(slot);
        if deliveries < 2 {
            setups.truncate(1);
        }
        setups
    }
    fn terms(&self, slot: usize) -> Base64VecU8 {
        hash(&(
            3u8,
            self.batch,
            slot,
            Self::objective(slot),
            Self::objective(slot).payment(),
            Self::setups(slot),
            content_hash(),
        ))
    }
    fn reserve(&mut self, slot: usize, job_id: U64) {
        require!(
            self.funded && slot / 3 == usize::from(self.stage()) && self.slots[slot] == 0,
            "Commission is unavailable"
        );
        let payment = Self::objective(slot).payment();
        require!(self.unreserved.0 >= payment, "Project has no funds");
        self.slots[slot] = 1;
        self.reservations[slot] = Some(job_id);
        self.unreserved.0 -= payment;
        self.reserved.0 += payment;
    }
    fn close(&mut self, slot: usize, job_id: U64, fulfilled: bool) {
        require!(
            self.reservations[slot] == Some(job_id) && self.slots[slot] == 1,
            "Commission reservation mismatch"
        );
        let payment = Self::objective(slot).payment();
        self.reservations[slot] = None;
        self.reserved.0 -= payment;
        self.slots[slot] = if fulfilled { 2 } else { 0 };
        if fulfilled {
            self.paid.0 += payment;
        } else {
            self.unreserved.0 += payment;
        }
        if self.stage() == 3 {
            self.restored = true;
        }
    }
}
#[near(serializers = [json])]
pub struct EconomyView {
    pub version: u8,
    pub company: Option<Company>,
    pub project: Project,
    pub stage: u8,
    pub commissions: Vec<Commission>,
    pub sponsor: AccountId,
    pub enabled: bool,
}

#[near]
impl Registry {
    pub fn get_economy(&self, account_id: Option<AccountId>) -> EconomyView {
        let company = account_id.and_then(|id| self.companies.get(&id));
        let dispatch_id = U64(company.as_ref().map_or(0, Company::next_dispatch));
        let commissions = (0..9)
            .filter(|&slot| slot / 3 == usize::from(self.project.stage()))
            .map(|slot| {
                let objective = Project::objective(slot);
                Commission {
                    commission_id: U64(self.project.batch.0 * 9 + slot as u64),
                    dispatch_id,
                    objective,
                    payment: U128(objective.payment()),
                    setup_ids: Project::company_setups(
                        slot,
                        company.as_ref().map_or(0, |c| c.deliveries.0),
                    ),
                    terms_hash: self.project.terms(slot),
                    available: self.economy_enabled
                        && self.project.funded
                        && self.project.slots[slot] == 0,
                }
            })
            .collect();
        EconomyView {
            version: 3,
            company,
            project: self.project.clone(),
            stage: self.project.stage(),
            commissions,
            sponsor: self.deployment_owner.clone(),
            enabled: self.economy_enabled,
        }
    }
    /// Enable only after measuring the additional settlement and storage work.
    pub fn set_economy_enabled(&mut self, enabled: bool) {
        require!(
            env::predecessor_account_id() == self.deployment_owner,
            "Only deployment operator"
        );
        self.economy_enabled = enabled;
    }
    #[payable]
    pub fn fund_project(&mut self) {
        require!(
            env::predecessor_account_id() == self.deployment_owner,
            "Only project sponsor"
        );
        require!(
            env::attached_deposit().as_yoctonear() == PROJECT_BUDGET,
            "Attach exactly 0.5 testnet NEAR; deployment storage is separately funded"
        );
        require!(
            !self.project.funded || self.project.stage() == 3,
            "Current project is still funded"
        );
        if self.project.funded {
            self.project.batch.0 = self.project.batch.0.checked_add(1).expect("Batch limit");
        }
        require!(self.project.batch.0 <= u64::MAX / 9 - 1, "Commission limit");
        self.project.funded = true;
        self.project.slots = [0; 9];
        self.project.reservations = [None; 9];
        self.project.unreserved = U128(PROJECT_BUDGET);
        self.project.reserved = U128(0);
        self.project.paid = U128(0);
    }
    pub fn withdraw_company_funds(&mut self, amount: U128) -> CompanyWithdrawal {
        let account = env::predecessor_account_id();
        let mut company = self.companies.get(&account).expect("Start a company first");
        require!(
            company.withdrawal.status != WithdrawalStatus::Pending,
            "Withdrawal pending; check its transaction"
        );
        require!(
            amount.0 > 0 && amount.0 <= company.funds.0,
            "Insufficient available company funds"
        );
        company.funds.0 -= amount.0;
        company.withdrawal = CompanyWithdrawal {
            withdrawal_id: U64(company
                .withdrawal
                .withdrawal_id
                .0
                .checked_add(1)
                .expect("Withdrawal limit")),
            amount,
            status: WithdrawalStatus::Pending,
        };
        let withdrawal = company.withdrawal.clone();
        self.companies.insert(&account, &company);
        Promise::new(account.clone()).transfer(NearToken::from_yoctonear(amount.0))
            .then(self.callback("on_company_withdrawal", near_sdk::serde_json::json!({"account_id":account,"withdrawal_id":withdrawal.withdrawal_id}), 15)).detach();
        withdrawal
    }
    #[private]
    pub fn on_company_withdrawal(&mut self, account_id: AccountId, withdrawal_id: U64) {
        self.finish_company_withdrawal(
            account_id,
            withdrawal_id,
            env::promise_result_checked(0, 0).is_ok(),
        );
    }
    /// Same disclosed FINAL-receipt attestation trust as worker/refund recovery.
    pub fn repair_company_withdrawal(
        &mut self,
        account_id: AccountId,
        withdrawal_id: U64,
        succeeded: bool,
        receipt_id: String,
    ) {
        require!(
            env::predecessor_account_id() == self.deployment_owner,
            "Only deployment operator"
        );
        require!(
            (32..=64).contains(&receipt_id.len())
                && receipt_id.bytes().all(|b| b.is_ascii_alphanumeric()),
            "Provide finalized receipt ID"
        );
        env::log_str(&near_sdk::serde_json::json!({"event":"company_withdrawal_repair","account_id":account_id,"withdrawal_id":withdrawal_id,"succeeded":succeeded,"receipt_id":receipt_id}).to_string());
        self.finish_company_withdrawal(account_id, withdrawal_id, succeeded);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn charter_opens_routes_without_locking_a_commission_type() {
        for slot in 0..9 {
            assert_eq!(Project::company_setups(slot, 0).len(), 1);
            assert!(Project::company_setups(slot, 2).len() >= 2);
        }
        let mut record = JobRecord {
            outcome: "delivered".into(),
            round: 5,
            cart_hp: 1,
            strikes: 0,
            borrows: 0,
            clauses: vec![],
            commitment: vec![].into(),
            final_hash: vec![].into(),
            confirmed_block: U64(0),
        };
        assert!(Objective::Routine.met(&record));
        assert!(!Objective::Intact.met(&record));
        assert!(!Objective::Express.met(&record));
        record.round = 4;
        record.cart_hp = 2;
        assert!(Objective::Intact.met(&record));
        assert!(Objective::Express.met(&record));
        record.outcome = "cart_lost".into();
        assert!(!Objective::Routine.met(&record));
        assert!(!Objective::Intact.met(&record));
        assert!(!Objective::Express.met(&record));
    }
    #[test]
    fn project_capacity_and_money_follow_confirmed_deliveries() {
        let mut project = Project {
            funded: true,
            unreserved: U128(PROJECT_BUDGET),
            ..Project::default()
        };
        for slot in 0..9 {
            let id = U64(slot as u64);
            assert_eq!(project.stage(), (slot / 3) as u8);
            project.reserve(slot, id);
            assert_eq!(
                project.unreserved.0 + project.reserved.0 + project.paid.0,
                PROJECT_BUDGET
            );
            let before = project.unreserved.0;
            project.close(slot, id, false);
            assert_eq!(
                project.unreserved.0,
                before + Project::objective(slot).payment()
            );
            project.reserve(slot, id);
            project.close(slot, id, true);
            assert_eq!(
                project.unreserved.0 + project.reserved.0 + project.paid.0,
                PROJECT_BUDGET
            );
        }
        assert_eq!(project.stage(), 3);
        assert!(project.restored);
        assert_eq!(project.paid.0, PROJECT_BUDGET);
        assert_eq!(project.unreserved.0, 0);
        assert_eq!(project.reserved.0, 0);
    }
    #[test]
    fn all_advertised_premium_setups_have_wins_for_every_nft_arrangement() {
        let refs: Vec<near_sdk::serde_json::Value> = near_sdk::serde_json::from_str(include_str!(
            "../../game-core/tests/fixtures/winning-logs.json"
        ))
        .unwrap();
        for slot in [5, 8] {
            for setup_id in Project::setups(slot) {
                for worker in [0, 1, 3, 4, 5, 6] {
                    for placement in ["escort", "infiltration"] {
                        for package_option in 0..2 {
                            let config = Configuration {
                                setup_id: setup_id.clone(),
                                worker,
                                placement: placement.into(),
                                package_option,
                            };
                            let wins = refs.iter().any(|reference| {
                                let mut log: ActionLog =
                                    near_sdk::serde_json::from_value(reference["log"].clone())
                                        .unwrap();
                                if log.config.setup_id != setup_id {
                                    return false;
                                }
                                log.config = config.clone();
                                game_core::replay(&log).is_ok_and(|r| {
                                    r.state.outcome.as_deref() == Some("delivered")
                                        && match Project::objective(slot) {
                                            Objective::Intact => r.state.cart_hp == 2,
                                            Objective::Express => r.state.round <= 4,
                                            Objective::Routine => true,
                                        }
                                })
                            });
                            assert!(
                                wins,
                                "No premium win for {} {} {} {}",
                                setup_id, worker, placement, package_option
                            );
                        }
                    }
                }
            }
        }
    }
}
impl Registry {
    fn finish_company_withdrawal(&mut self, account: AccountId, id: U64, succeeded: bool) {
        let Some(mut company) = self.companies.get(&account) else {
            return;
        };
        if company.withdrawal.withdrawal_id != id
            || company.withdrawal.status != WithdrawalStatus::Pending
        {
            return;
        }
        company.withdrawal.status = if succeeded {
            WithdrawalStatus::Paid
        } else {
            WithdrawalStatus::Failed
        };
        if !succeeded {
            company.funds.0 = company
                .funds
                .0
                .checked_add(company.withdrawal.amount.0)
                .expect("Funds limit");
        }
        self.companies.insert(&account, &company);
    }
    pub(super) fn reserve_commission(
        &mut self,
        booking: &Booking,
        setup_id: &str,
        fee: u128,
        job_id: U64,
    ) -> Employment {
        require!(self.economy_enabled, "Company bookings are not enabled");
        require!(
            booking.commission_id.0 / 9 == self.project.batch.0,
            "Project changed; review current work"
        );
        let slot = (booking.commission_id.0 % 9) as usize;
        require!(
            booking.expected_terms == self.project.terms(slot)
                && Project::setups(slot).iter().any(|s| s == setup_id),
            "Commission terms changed or setup is unsupported"
        );
        let account = env::predecessor_account_id();
        let mut company = self
            .companies
            .get(&account)
            .unwrap_or_else(|| Company::new(account.clone()));
        require!(
            company.active_job.is_none(),
            "Finish the current company job first"
        );
        require!(
            booking.dispatch_id.0 == company.next_dispatch(),
            "Dispatch changed; refresh"
        );
        let objective = Project::objective(slot);
        require!(
            Project::company_setups(slot, company.deliveries.0)
                .iter()
                .any(|s| s == setup_id),
            "Earn a charter to open this route variant"
        );
        require!(
            booking.company_contribution.0 <= fee
                && booking.company_contribution.0 <= company.funds.0,
            "Insufficient company funds or excessive contribution"
        );
        self.project.reserve(slot, job_id);
        if company.dispatch.completed == 3 {
            company.dispatch = Dispatch {
                dispatch_id: booking.dispatch_id,
                completed: 0,
                fulfilled: 0,
                jobs: [None; 3],
            };
        }
        company.funds.0 -= booking.company_contribution.0;
        company.active_job = Some(job_id);
        let employment = Employment {
            commission_id: booking.commission_id,
            dispatch_id: booking.dispatch_id,
            leg: company.dispatch.completed,
            objective,
            payment: U128(objective.payment()),
            company_contribution: booking.company_contribution,
            earned: U128(0),
            closed: false,
        };
        self.companies.insert(&account, &company);
        employment
    }
    pub(super) fn close_commission(&mut self, job: &mut Job, cancelled: bool) {
        let Some(employment) = job.employment.as_mut() else {
            return;
        };
        require!(!employment.closed, "Commission already closed");
        let mut company = self.companies.get(&job.renter_id).expect("Company missing");
        require!(
            company.active_job == Some(job.job_id)
                && company.dispatch.dispatch_id == employment.dispatch_id
                && company.dispatch.completed == employment.leg,
            "Dispatch reservation mismatch"
        );
        let fulfilled = !cancelled
            && job
                .record
                .as_ref()
                .is_some_and(|r| employment.objective.met(r));
        self.project.close(
            (employment.commission_id.0 % 9) as usize,
            job.job_id,
            fulfilled,
        );
        if cancelled {
            company.funds.0 += employment.company_contribution.0;
        } else {
            company.dispatch.jobs[usize::from(employment.leg)] = Some(job.job_id);
            company.dispatch.completed += 1;
            if fulfilled {
                employment.earned = employment.payment;
                company.funds.0 = company
                    .funds
                    .0
                    .checked_add(employment.payment.0)
                    .expect("Funds limit");
                company.deliveries.0 = company.deliveries.0.checked_add(1).expect("Delivery limit");
                company.dispatch.fulfilled += 1;
            }
        }
        company.active_job = None;
        employment.closed = true;
        self.companies.insert(&job.renter_id, &company);
    }
}
