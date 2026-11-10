mod economy;
mod paid;
use economy::{Booking, Company, Employment, Town};
use game_core::{ActionLog, Configuration, Event};
use near_contract_standards::non_fungible_token::{
    NonFungibleToken, Token, TokenId,
    approval::NonFungibleTokenApproval,
    core::{NonFungibleTokenCore, NonFungibleTokenResolver},
    enumeration::NonFungibleTokenEnumeration,
    metadata::{NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata},
};
use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    collections::LookupMap,
    env,
    json_types::{Base64VecU8, U64, U128},
    near, require,
};

// Deployment candidates, gated by sandbox and testnet measurements before paid hiring.
const JOB_BOND: u128 = 30_000_000_000_000_000_000_000; // 0.03 NEAR, storage only
const LEASE_BLOCKS: u64 = 2400;
const COOLDOWN_BLOCKS: u64 = 20;
const MAX_LOG_BYTES: usize = 4096;
const TOKEN: &str = "rook";
const TOKENS: [&str; 6] = ["rook", "mallow", "nix", "dot", "brisk", "peebles"];
const MIN_PRICE: u128 = 1_000_000_000_000_000_000_000;
const MAX_PRICE: u128 = 1_000_000_000_000_000_000_000_000;
const IDLE_BLOCKS: u64 = 120;
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Offer {
    pub package_option: u8,
    pub starting_ask: U128,
    pub floor_ask: U128,
    pub discount_step: U128,
    pub available_since: U64,
    pub automatic: Option<PricePolicy>,
}
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct PricePolicy {
    pub ceiling: U128,
    pub pressure: u8,
    pub updated_at: U64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Claim {
    pub claim_id: U64,
    pub recipient: AccountId,
    pub amount: U128,
    pub status: String,
}
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Credit {
    pub amount: U128,
    pub status: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct JobRecord {
    pub outcome: String,
    pub round: u8,
    pub cart_hp: u8,
    pub strikes: u8,
    pub borrows: u8,
    pub clauses: Vec<String>,
    pub commitment: Base64VecU8,
    pub final_hash: Base64VecU8,
    pub confirmed_block: U64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Job {
    pub job_id: U64,
    pub renter_id: AccountId,
    pub token_id: String,
    pub worker_account: AccountId,
    pub config: Configuration,
    pub unit_slot: u8,
    pub rules_version: u16,
    pub content_version: u16,
    pub content_hash: Base64VecU8,
    pub setup_hash: Base64VecU8,
    pub accepted_fee: U128,
    pub created_at_block: U64,
    pub expires_at_block: U64,
    pub status: String,
    pub cooldown_until: U64,
    pub record: Option<JobRecord>,
    pub bond: U128,
    pub storage_bytes: u64,
    pub refund_owed: U128,
    pub refund_in_flight: bool,
    pub credit_status: String,
    pub employment: Option<Employment>,
}

#[near(serializers = [json])]
pub struct WorkerView {
    pub token: Token,
    pub worker_account: AccountId,
    pub character: String,
    pub role: String,
    pub packages: [String; 2],
    pub visual_identity: String,
    pub status: String,
    pub job: Option<Job>,
    pub block_height: U64,
    pub job_storage_deposit: U128,
    pub lease_blocks: U64,
    pub cooldown_blocks: U64,
    pub content_hash: Base64VecU8,
    pub offers: [Option<Offer>; 2],
    pub quotes: [Option<U128>; 2],
    pub recent_paid_hires: Vec<Job>,
    pub offer: Option<Offer>,
    pub quote: Option<U128>,
    pub hall_earned: U128,
    pub claim: Option<Claim>,
    pub paid_enabled: bool,
    pub timestamp: U64,
}

#[near(serializers = [borsh])]
pub struct WorkerState {
    worker_account: AccountId,
    current_job: Option<u64>,
    transfer_pending: bool,
    offers: [Option<Offer>; 2],
    claim: Option<Claim>,
    paid_enabled: bool,
    recent_paid_hires: Vec<u64>,
    provisioned: bool,
    provision_pending: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Registry {
    nft: NonFungibleToken,
    workers: std::collections::BTreeMap<String, WorkerState>,
    jobs: LookupMap<u64, Job>,
    next_job: u64,
    hall_earned: u128,
    next_claim: u64,
    deployment_owner: AccountId,
    companies: LookupMap<AccountId, Company>,
    towns: [Town; 3],
    economy_enabled: bool,
}

fn hash(value: &impl near_sdk::serde::Serialize) -> Base64VecU8 {
    env::sha256(&near_sdk::serde_json::to_vec(value).expect("serialize commitment")).into()
}
fn content_hash() -> Base64VecU8 {
    hash(&game_core::bundle())
}

#[near]
impl Registry {
    #[init]
    pub fn new(owner_id: AccountId, worker_account: AccountId) -> Self {
        require!(
            env::predecessor_account_id() == owner_id,
            "Initialize from the genesis owner"
        );
        require!(
            env::current_account_id()
                .as_str()
                .split_once('.')
                .map(|(_, parent)| parent)
                == Some(owner_id.as_str()),
            "Registry must be an owner subaccount"
        );
        require!(
            worker_account.as_str() == format!("rook.{}", env::current_account_id()),
            "Use the dedicated Rook subaccount"
        );
        let mut nft = NonFungibleToken::new(
            b"n".to_vec(),
            env::current_account_id(),
            Some(b"m".to_vec()),
            Some(b"e".to_vec()),
            Some(b"a".to_vec()),
        );
        let mut workers = std::collections::BTreeMap::new();
        for (index, token) in TOKENS.iter().enumerate() {
            let (name, role, _, _, packages) = game_core::worker_identity(if index < 2 {
                index as u8
            } else {
                index as u8 + 1
            })
            .expect("genesis identity");
            let worker_account: AccountId = format!("{token}.{}", env::current_account_id())
                .parse()
                .unwrap();
            nft.internal_mint_with_refund((*token).into(), owner_id.clone(), Some(TokenMetadata {
                title: Some(name.into()), copies: Some(1),
                extra: Some(near_sdk::serde_json::json!({"worker_account":worker_account,"visual_identity":token,"role":role,"packages":packages}).to_string()),
                ..Default::default()
            }), None);
            workers.insert(
                (*token).into(),
                WorkerState {
                    worker_account,
                    current_job: None,
                    transfer_pending: false,
                    offers: [None, None],
                    claim: None,
                    paid_enabled: false,
                    recent_paid_hires: Vec::new(),
                    provisioned: false,
                    provision_pending: false,
                },
            );
        }
        Self {
            nft,
            workers,
            jobs: LookupMap::new(b"j"),
            next_job: 0,
            hall_earned: 0,
            next_claim: 0,
            deployment_owner: owner_id,
            companies: LookupMap::new(b"c"),
            towns: std::array::from_fn(|i| Town {
                town_id: i as u8,
                name: ["Docks", "Crossing", "Royal office"][i].into(),
                stock: game_core::economy::Stock {
                    supplies: [1, 3, 5][i],
                    updated_at: env::block_timestamp() / 1_000_000_000,
                    deliveries: 0,
                },
                incoming: [None, None],
                unreserved: U128(0),
                reserved: U128(0),
                paid: U128(0),
                contributed: U128(0),
            }),
            economy_enabled: false,
        }
    }

    /// Bootstrap each account separately to stay inside NEAR's transaction gas limit.
    pub fn provision_worker(&mut self, token_id: TokenId) -> Promise {
        require!(
            env::predecessor_account_id() == self.deployment_owner,
            "Only deployment operator"
        );
        let w = self.workers.get_mut(&token_id).expect("Unknown worker");
        require!(
            !w.provisioned && !w.provision_pending,
            "Worker already provisioned or pending"
        );
        w.provision_pending = true;
        Promise::new(w.worker_account.clone())
            .create_account()
            .transfer(NearToken::from_near(3))
            .deploy_contract(
                include_bytes!("../../../target/wasm32-unknown-unknown/release/worker.wasm")
                    .to_vec(),
            )
            .function_call(
                "new",
                near_sdk::serde_json::to_vec(
                    &near_sdk::serde_json::json!({"registry_id":env::current_account_id()}),
                )
                .unwrap(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(10),
            )
            .then(self.callback(
                "on_provision",
                near_sdk::serde_json::json!({"token_id":token_id}),
                5,
            ))
    }
    #[private]
    pub fn on_provision(&mut self, token_id: TokenId) {
        let w = self.workers.get_mut(&token_id).expect("Unknown worker");
        w.provisioned = env::promise_result_checked(0, 32).is_ok();
        w.provision_pending = false;
    }

    pub fn get_worker(&self, token_id: Option<TokenId>) -> WorkerView {
        let token_id = token_id.unwrap_or_else(|| TOKEN.into());
        let w = self.worker(&token_id);
        let index = Self::worker_index(&token_id);
        let (name, role, _, _, packages) = game_core::worker_identity(index).expect("identity");
        let job = w.current_job.and_then(|id| self.jobs.get(&id));
        let status = if !w.provisioned {
            "unavailable"
        } else if w.transfer_pending {
            "transfer_pending"
        } else {
            match &job {
                Some(j) if ["payment_pending", "recovery_pending"].contains(&j.status.as_str()) => {
                    &j.status
                }
                Some(j) if j.refund_in_flight || j.status == "cancelled" && j.refund_owed.0 > 0 => {
                    "recovery_pending"
                }
                Some(j) if j.status == "active" => {
                    if env::block_height() >= j.expires_at_block.0 {
                        "expired_pending"
                    } else {
                        "active"
                    }
                }
                Some(j) if env::block_height() < j.cooldown_until.0 => "cooldown",
                _ => "idle",
            }
        };
        let mut offers = w.offers.clone();
        for o in offers.iter_mut().flatten() {
            if let Some(policy) = o.automatic.as_mut() {
                let now = env::block_timestamp() / 1_000_000_000;
                let ticks = now.saturating_sub(policy.updated_at.0)
                    / game_core::economy::CONSUMPTION_SECONDS;
                policy.pressure =
                    game_core::economy::decayed_pressure(policy.pressure, policy.updated_at.0, now);
                policy.updated_at.0 = policy
                    .updated_at
                    .0
                    .saturating_add(ticks * game_core::economy::CONSUMPTION_SECONDS);
            }
            if let Some(j) = &job {
                o.available_since = U64(o.available_since.0.max(j.cooldown_until.0));
            }
        }
        WorkerView {
            token: self.nft.nft_token(token_id.clone()).expect("genesis token"),
            worker_account: w.worker_account.clone(),
            character: name.into(),
            role: role.into(),
            packages: packages.map(|p| {
                near_sdk::serde_json::to_value(p)
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .to_string()
            }),
            visual_identity: token_id.clone(),
            status: status.into(),
            job,
            block_height: U64(env::block_height()),
            job_storage_deposit: U128(JOB_BOND),
            lease_blocks: U64(LEASE_BLOCKS),
            cooldown_blocks: U64(COOLDOWN_BLOCKS),
            content_hash: content_hash(),
            offers: offers.clone(),
            quotes: std::array::from_fn(|i| {
                w.offers[i].as_ref().map(|o| U128(self.price(&token_id, o)))
            }),
            recent_paid_hires: w
                .recent_paid_hires
                .iter()
                .rev()
                .filter_map(|id| self.jobs.get(id))
                .collect(),
            offer: w.offers[0].clone(),
            quote: w.offers[0].as_ref().map(|o| U128(self.price(&token_id, o))),
            hall_earned: U128(self.hall_earned),
            claim: w.claim.clone(),
            paid_enabled: w.paid_enabled,
            timestamp: U64(env::block_timestamp() / 1_000_000_000),
        }
    }
    pub fn get_job(&self, job_id: U64) -> Option<Job> {
        self.jobs.get(&job_id.0)
    }
    pub fn get_job_record(&self, job_id: U64) -> Option<JobRecord> {
        self.jobs.get(&job_id.0).and_then(|j| j.record)
    }
    pub fn get_opening(&self, job_id: U64) -> game_core::State {
        let job = self.jobs.get(&job_id.0).expect("Unknown job");
        Self::opening(&job)
    }

    #[payable]
    pub fn open_owned_job(
        &mut self,
        token_id: TokenId,
        package_option: u8,
        placement: String,
        setup_id: String,
        expected_content_hash: Base64VecU8,
        commission: Option<Booking>,
    ) -> Job {
        self.owner(&token_id);
        require!(
            env::attached_deposit().as_yoctonear() == JOB_BOND,
            "Attach exactly the job storage deposit"
        );
        self.create_job(
            token_id,
            package_option,
            placement,
            setup_id,
            expected_content_hash,
            0,
            commission,
        )
    }
}
impl Registry {
    fn create_job(
        &mut self,
        token_id: TokenId,
        package_option: u8,
        placement: String,
        setup_id: String,
        expected_content_hash: Base64VecU8,
        fee: u128,
        commission: Option<Booking>,
    ) -> Job {
        Self::worker_index(&token_id);
        require!(
            self.get_worker(Some(token_id.clone())).status == "idle",
            "Worker is occupied or cooling down"
        );
        require!(!self.claim_pending(&token_id), "Claim is pending");
        require!(
            expected_content_hash == content_hash(),
            "Content changed; refresh before opening"
        );
        let cooldown = self
            .worker(&token_id)
            .current_job
            .and_then(|id| self.jobs.get(&id))
            .map_or(0, |j| j.cooldown_until.0);
        for o in self
            .workers
            .get_mut(&token_id)
            .unwrap()
            .offers
            .iter_mut()
            .flatten()
        {
            o.available_since = U64(o.available_since.0.max(cooldown));
        }
        let config = Configuration {
            setup_id,
            placement,
            worker: Self::worker_index(&token_id),
            package_option,
        };
        let opening = game_core::start_config(&config).expect("Unsupported job configuration");
        let before = env::storage_usage();
        let id = self.next_job;
        self.next_job = id.checked_add(1).expect("Job limit");
        let employment = commission
            .as_ref()
            .map(|booking| self.reserve_commission(booking, &config.setup_id, fee, U64(id)));
        let mut job = Job {
            job_id: U64(id),
            renter_id: env::predecessor_account_id(),
            token_id: token_id.clone(),
            worker_account: self.worker(&token_id).worker_account.clone(),
            unit_slot: if config.placement == "escort" { 1 } else { 4 },
            config,
            rules_version: game_core::RULES_VERSION,
            content_version: game_core::CONTENT_VERSION,
            content_hash: content_hash(),
            setup_hash: hash(&opening.setup),
            accepted_fee: U128(fee),
            created_at_block: U64(env::block_height()),
            expires_at_block: U64(env::block_height()
                .checked_add(LEASE_BLOCKS)
                .expect("Block limit")),
            status: if fee == 0 {
                "active"
            } else {
                "payment_pending"
            }
            .into(),
            cooldown_until: U64(0),
            record: None,
            bond: U128(JOB_BOND),
            storage_bytes: 0,
            refund_owed: U128(0),
            refund_in_flight: false,
            credit_status: if fee == 0 { "none" } else { "unknown" }.into(),
            employment,
        };
        self.jobs.insert(&id, &job);
        // Option<u64> in root state grows by eight bytes on the first reservation.
        job.storage_bytes = env::storage_usage() - before
            + if self.worker(&token_id).current_job.is_none() {
                8
            } else {
                0
            };
        require!(
            u128::from(job.storage_bytes + 1024) * env::storage_byte_cost().as_yoctonear()
                <= JOB_BOND,
            "Storage reserve too small"
        );
        self.jobs.insert(&id, &job);
        self.workers.get_mut(&token_id).unwrap().current_job = Some(id);
        job
    }
}
#[near]
impl Registry {
    pub fn settle(&mut self, job_id: U64, action_log: String) -> JobRecord {
        require!(action_log.len() <= MAX_LOG_BYTES, "Oversized action log");
        let mut job = self.jobs.get(&job_id.0).expect("Unknown job");
        require!(
            job.renter_id == env::predecessor_account_id(),
            "Only the frozen renter may save"
        );
        require!(job.status == "active", "Job already closed");
        require!(
            env::block_height() < job.expires_at_block.0,
            "Job lease expired"
        );
        let log: ActionLog =
            near_sdk::serde_json::from_str(&action_log).expect("Invalid action log");
        require!(log.config == job.config, "Opening configuration mismatch");
        require!(
            log.rules_version == job.rules_version && log.content_version == job.content_version,
            "Replay version does not match the frozen job"
        );
        Self::opening(&job);
        let canonical = game_core::canonical(&log).expect("Invalid canonical log");
        let replay = game_core::replay(&log).expect("Invalid game action");
        let state = replay.state;
        let outcome = state
            .outcome
            .clone()
            .expect("Finish the battle before saving");
        let mut clauses = Vec::new();
        let mut borrows = 0;
        for event in replay.events {
            match event {
                Event::Strike { reason, .. } => {
                    if !clauses.contains(&reason) {
                        clauses.push(reason);
                    }
                }
                Event::Borrowed { .. } => borrows += 1,
                _ => {}
            }
        }
        let mut commitment = job.setup_hash.0.clone();
        commitment.extend(canonical);
        let record = JobRecord {
            outcome,
            round: state.round,
            cart_hp: state.cart_hp,
            strikes: state.strikes,
            borrows,
            clauses,
            commitment: env::sha256(&commitment).into(),
            final_hash: hash(&state),
            confirmed_block: U64(env::block_height()),
        };
        let before = env::storage_usage();
        job.record = Some(record.clone());
        job.status = "saved".into();
        self.close_commission(&mut job, false);
        self.close(&mut job, before);
        record
    }

    pub fn expire(&mut self, job_id: U64) {
        let mut job = self.jobs.get(&job_id.0).expect("Unknown job");
        require!(job.status == "active", "Job already closed");
        require!(
            env::block_height() >= job.expires_at_block.0,
            "Lease is still active"
        );
        let before = env::storage_usage();
        job.status = "expired".into(); // Abandonment has no battle result.
        self.close_commission(&mut job, false);
        self.close(&mut job, before);
    }

    pub fn retry_storage_refund(&mut self, job_id: U64) {
        let mut job = self.jobs.get(&job_id.0).expect("Unknown job");
        require!(
            ["saved", "expired", "cancelled"].contains(&job.status.as_str()),
            "Job is still active"
        );
        require!(!job.refund_in_flight, "Refund already submitted");
        self.refund(&mut job);
    }

    #[private]
    pub fn on_storage_refund(&mut self, job_id: U64) {
        let mut job = self.jobs.get(&job_id.0).expect("Unknown job");
        if !job.refund_in_flight {
            return;
        }
        if env::promise_result_checked(0, 0).is_ok() {
            job.refund_owed = U128(0);
        }
        job.refund_in_flight = false;
        self.jobs.insert(&job_id.0, &job);
    }
}
impl Registry {
    fn opening(job: &Job) -> game_core::State {
        require!(
            job.rules_version == game_core::RULES_VERSION
                && job.content_version == game_core::CONTENT_VERSION
                && job.content_hash == content_hash(),
            "Frozen content unavailable"
        );
        let opening = game_core::start_config(&job.config).expect("Approved configuration");
        require!(
            hash(&opening.setup) == job.setup_hash,
            "Frozen setup mismatch"
        );
        opening
    }
    fn close(&mut self, job: &mut Job, before: u64) {
        job.cooldown_until = U64(env::block_height()
            .checked_add(COOLDOWN_BLOCKS)
            .expect("Block limit"));
        self.jobs.insert(&job.job_id.0, job);
        let after = env::storage_usage();
        job.storage_bytes = if after >= before {
            job.storage_bytes + after - before
        } else {
            job.storage_bytes - (before - after)
        };
        let cost = u128::from(job.storage_bytes) * env::storage_byte_cost().as_yoctonear();
        require!(cost <= job.bond.0, "Record exceeds reserved storage");
        job.refund_owed = U128(job.bond.0 - cost);
        self.refund(job);
    }
    fn refund(&mut self, job: &mut Job) {
        if job.refund_owed.0 > 0 {
            job.refund_in_flight = true;
            Promise::new(job.renter_id.clone())
                .transfer(NearToken::from_yoctonear(job.refund_owed.0))
                .then(
                    Promise::new(env::current_account_id()).function_call(
                        "on_storage_refund",
                        near_sdk::serde_json::to_vec(
                            &near_sdk::serde_json::json!({"job_id":job.job_id}),
                        )
                        .unwrap(),
                        NearToken::from_yoctonear(0),
                        Gas::from_tgas(10),
                    ),
                )
                .detach();
        }
        self.jobs.insert(&job.job_id.0, job);
    }
}

#[near]
impl NonFungibleTokenCore for Registry {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        require!(
            !self.worker(&token_id).transfer_pending && !self.claim_pending(&token_id),
            "Title transfer or claim is pending"
        );
        self.nft
            .nft_transfer(receiver_id, token_id, approval_id, memo);
    }
    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        require!(
            !self.worker(&token_id).transfer_pending && !self.claim_pending(&token_id),
            "Title transfer or claim is pending"
        );
        self.workers
            .get_mut(&token_id)
            .expect("Unknown worker")
            .transfer_pending = true;
        self.nft
            .nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }
    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.nft.nft_token(token_id)
    }
}
#[near]
impl NonFungibleTokenResolver for Registry {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<std::collections::HashMap<AccountId, u64>>,
    ) -> bool {
        let retained = self.nft.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id.clone(),
            approved_account_ids,
        );
        self.workers
            .get_mut(&token_id)
            .expect("Unknown worker")
            .transfer_pending = false;
        retained
    }
}
#[near]
impl NonFungibleTokenEnumeration for Registry {
    fn nft_total_supply(&self) -> U128 {
        self.nft.nft_total_supply()
    }
    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.nft.nft_tokens(from_index, limit)
    }
    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.nft.nft_supply_for_owner(account_id)
    }
    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.nft.nft_tokens_for_owner(account_id, from_index, limit)
    }
}
#[near]
impl NonFungibleTokenMetadataProvider for Registry {
    fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: "nft-1.0.0".into(),
            name: "Mutiny: The Fine Print".into(),
            symbol: "MUTINY".into(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }
}

impl Registry {
    fn worker(&self, token: &str) -> &WorkerState {
        self.workers.get(token).expect("Unknown worker")
    }
    fn worker_index(token: &str) -> u8 {
        let index = TOKENS
            .iter()
            .position(|id| *id == token)
            .expect("Unknown worker") as u8;
        if index < 2 { index } else { index + 1 }
    }
}
#[near]
impl Registry {
    pub fn get_market(&self) -> Vec<WorkerView> {
        TOKENS
            .iter()
            .map(|id| self.get_worker(Some((*id).into())))
            .collect()
    }
    pub fn find_cheapest(&self, package: String, max_price: U128) -> Option<WorkerView> {
        self.get_market()
            .into_iter()
            .filter(|w| {
                w.status == "idle"
                    && w.paid_enabled
                    && !w.claim.as_ref().is_some_and(|c| c.status == "pending")
            })
            .filter_map(|w| {
                let price = w
                    .packages
                    .iter()
                    .enumerate()
                    .filter(|(_, p)| **p == package)
                    .filter_map(|(i, _)| w.quotes[i].map(|q| q.0))
                    .filter(|q| *q <= max_price.0)
                    .min()?;
                Some((price, w))
            })
            .min_by(|(a, wa), (b, wb)| a.cmp(b).then(wa.token.token_id.cmp(&wb.token.token_id)))
            .map(|(_, w)| w)
    }
}
#[near]
impl NonFungibleTokenApproval for Registry {
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        require!(
            !self.worker(&token_id).transfer_pending,
            "Title transfer is pending"
        );
        self.nft.nft_approve(token_id, account_id, msg)
    }
    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        require!(
            !self.worker(&token_id).transfer_pending,
            "Title transfer is pending"
        );
        self.nft.nft_revoke(token_id, account_id);
    }
    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        require!(
            !self.worker(&token_id).transfer_pending,
            "Title transfer is pending"
        );
        self.nft.nft_revoke_all(token_id);
    }
    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.nft
            .nft_is_approved(token_id, approved_account_id, approval_id)
    }
}
