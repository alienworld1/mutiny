use super::*;

pub use game_core::economy::Objective;
use game_core::economy::{CAPACITY, MAX_INCOMING, Stock};

fn now() -> u64 {
    env::block_timestamp() / 1_000_000_000
}
fn objective_met(objective: Objective, record: &JobRecord) -> bool {
    objective.met(&record.outcome, record.cart_hp, record.round)
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
    pub town_id: u8,
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
    pub town_id: u8,
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
pub struct Town {
    pub town_id: u8,
    pub name: String,
    pub stock: Stock,
    pub incoming: [Option<U64>; 2],
    pub unreserved: U128,
    pub reserved: U128,
    pub paid: U128,
    pub contributed: U128,
}
impl Town {
    fn count(&self) -> usize {
        self.incoming.iter().flatten().count()
    }
    fn available(&self, payment: u128) -> bool {
        self.count() < MAX_INCOMING
            && usize::from(self.stock.supplies) + self.count() < usize::from(CAPACITY)
            && self.unreserved.0 >= payment
    }
}
#[near(serializers = [json])]
pub struct EconomyView {
    pub version: u8,
    pub company: Option<Company>,
    pub towns: [Town; 3],
    pub commissions: Vec<Commission>,
    pub sponsor: AccountId,
    pub enabled: bool,
    pub timestamp: U64,
}
impl Registry {
    fn projected_towns(&self) -> [Town; 3] {
        let mut towns = self.towns.clone();
        for town in &mut towns {
            town.stock.advance(now());
        }
        towns
    }
    fn commission(
        &self,
        town: &Town,
        objective: Objective,
        dispatch_id: U64,
    ) -> Option<Commission> {
        let payment = town.stock.payment(objective)?;
        let setup_ids = vec![town.stock.setup_id(usize::from(town.town_id)).to_string()];
        let commission_id = U64(u64::from(town.town_id) * 3
            + match objective {
                Objective::Routine => 0,
                Objective::Intact => 1,
                Objective::Express => 2,
            });
        let terms_hash = hash(&(
            4u8,
            commission_id,
            objective,
            U128(payment),
            &setup_ids,
            content_hash(),
        ));
        Some(Commission {
            town_id: town.town_id,
            commission_id,
            dispatch_id,
            objective,
            payment: U128(payment),
            setup_ids,
            terms_hash,
            available: self.economy_enabled && town.available(payment),
        })
    }
}
#[near]
impl Registry {
    pub fn get_economy(&self, account_id: Option<AccountId>) -> EconomyView {
        let company = account_id.and_then(|id| self.companies.get(&id));
        let dispatch_id = U64(company.as_ref().map_or(0, Company::next_dispatch));
        let towns = self.projected_towns();
        let commissions = towns
            .iter()
            .flat_map(|town| {
                [Objective::Routine, Objective::Intact, Objective::Express]
                    .into_iter()
                    .filter_map(|objective| self.commission(town, objective, dispatch_id))
            })
            .collect();
        EconomyView {
            version: 4,
            company,
            towns,
            commissions,
            sponsor: self.deployment_owner.clone(),
            enabled: self.economy_enabled,
            timestamp: U64(now()),
        }
    }
    pub fn set_economy_enabled(&mut self, enabled: bool) {
        require!(
            env::predecessor_account_id() == self.deployment_owner,
            "Only deployment operator"
        );
        self.economy_enabled = enabled;
    }
    #[payable]
    pub fn fund_town(&mut self, town_id: u8, expected_contributed: U128) {
        require!(town_id < 3, "Unknown destination");
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Attach a contribution");
        self.towns = self.projected_towns();
        let town = &mut self.towns[usize::from(town_id)];
        require!(
            town.contributed == expected_contributed,
            "Treasury changed; check contribution status before retrying"
        );
        town.unreserved.0 = town
            .unreserved
            .0
            .checked_add(amount)
            .expect("Treasury limit");
        town.contributed.0 = town
            .contributed
            .0
            .checked_add(amount)
            .expect("Treasury limit");
        env::log_str(
            &near_sdk::serde_json::json!({"event":"town_funded","town_id":town_id,
            "contributor":env::predecessor_account_id(),"amount":U128(amount)})
            .to_string(),
        );
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
        self.towns = self.projected_towns();
        require!(booking.commission_id.0 < 9, "Unknown commission");
        let town_id = (booking.commission_id.0 / 3) as usize;
        let objective = match booking.commission_id.0 % 3 {
            0 => Objective::Routine,
            1 => Objective::Intact,
            _ => Objective::Express,
        };
        let commission = self
            .commission(&self.towns[town_id], objective, booking.dispatch_id)
            .expect("Work changed; review current terms");
        require!(
            commission.available
                && booking.expected_terms == commission.terms_hash
                && commission.setup_ids.iter().any(|s| s == setup_id),
            "Work or terms changed; review current work"
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
        require!(
            booking.company_contribution.0 <= fee
                && booking.company_contribution.0 <= company.funds.0,
            "Insufficient company funds or excessive contribution"
        );
        let town = &mut self.towns[town_id];
        let incoming = town
            .incoming
            .iter_mut()
            .find(|id| id.is_none())
            .expect("Destination is booked");
        *incoming = Some(job_id);
        town.unreserved.0 -= commission.payment.0;
        town.reserved.0 += commission.payment.0;
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
            town_id: town_id as u8,
            commission_id: booking.commission_id,
            dispatch_id: booking.dispatch_id,
            leg: company.dispatch.completed,
            objective,
            payment: commission.payment,
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
                .is_some_and(|r| objective_met(employment.objective, r));
        self.towns = self.projected_towns();
        let town = &mut self.towns[usize::from(employment.town_id)];
        let incoming = town
            .incoming
            .iter_mut()
            .find(|id| **id == Some(job.job_id))
            .expect("Delivery reservation missing");
        *incoming = None;
        town.reserved.0 -= employment.payment.0;
        if fulfilled {
            town.paid.0 = town
                .paid
                .0
                .checked_add(employment.payment.0)
                .expect("Treasury limit");
            town.stock.deliver();
        } else {
            town.unreserved.0 = town
                .unreserved
                .0
                .checked_add(employment.payment.0)
                .expect("Treasury limit");
        }
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
