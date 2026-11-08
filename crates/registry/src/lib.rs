use game_core::{ActionLog, Configuration, Event};
use near_contract_standards::non_fungible_token::{
    NonFungibleToken, Token, TokenId,
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
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Registry {
    nft: NonFungibleToken,
    worker_account: AccountId,
    jobs: LookupMap<u64, Job>,
    current_job: Option<u64>,
    next_job: u64,
    transfer_pending: bool,
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
            None::<Vec<u8>>,
        );
        nft.internal_mint_with_refund(TOKEN.into(), owner_id, Some(TokenMetadata {
            title: Some("Rook".into()),
            description: Some("Courier. Not On The Fire / Within Shouting Distance.".into()),
            copies: Some(1),
            extra: Some(near_sdk::serde_json::json!({"worker_account":worker_account,"visual_identity":"rook","role":"courier","packages":["fire","shouting"]}).to_string()),
            ..Default::default()
        }), None);
        Promise::new(worker_account.clone())
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
            .detach();
        Self {
            nft,
            worker_account,
            jobs: LookupMap::new(b"j"),
            current_job: None,
            next_job: 0,
            transfer_pending: false,
        }
    }

    pub fn get_worker(&self) -> WorkerView {
        let job = self.current_job.and_then(|id| self.jobs.get(&id));
        let status = if self.transfer_pending {
            "transfer_pending"
        } else {
            match &job {
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
        WorkerView {
            token: self.nft.nft_token(TOKEN.into()).expect("genesis token"),
            worker_account: self.worker_account.clone(),
            character: "Rook".into(),
            role: "courier".into(),
            packages: ["fire".into(), "shouting".into()],
            visual_identity: "rook".into(),
            status: status.into(),
            job,
            block_height: U64(env::block_height()),
            job_storage_deposit: U128(JOB_BOND),
            lease_blocks: U64(LEASE_BLOCKS),
            cooldown_blocks: U64(COOLDOWN_BLOCKS),
            content_hash: content_hash(),
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
    ) -> Job {
        require!(token_id == TOKEN, "Unknown worker");
        require!(
            self.nft.owner_by_id.get(&token_id) == Some(env::predecessor_account_id()),
            "Only the current owner may reserve Rook"
        );
        require!(
            self.get_worker().status == "idle",
            "Worker is occupied or cooling down"
        );
        require!(
            env::attached_deposit().as_yoctonear() == JOB_BOND,
            "Attach exactly the job storage deposit"
        );
        require!(
            expected_content_hash == content_hash(),
            "Content changed; refresh before opening"
        );
        let config = Configuration {
            setup_id,
            placement,
            worker: 0,
            package_option,
        };
        let opening = game_core::start_config(&config).expect("Unsupported job configuration");
        let before = env::storage_usage();
        let id = self.next_job;
        self.next_job = id.checked_add(1).expect("Job limit");
        let mut job = Job {
            job_id: U64(id),
            renter_id: env::predecessor_account_id(),
            token_id,
            worker_account: self.worker_account.clone(),
            unit_slot: if config.placement == "escort" { 1 } else { 4 },
            config,
            rules_version: game_core::RULES_VERSION,
            content_version: game_core::CONTENT_VERSION,
            content_hash: content_hash(),
            setup_hash: hash(&opening.setup),
            accepted_fee: U128(0),
            created_at_block: U64(env::block_height()),
            expires_at_block: U64(env::block_height()
                .checked_add(LEASE_BLOCKS)
                .expect("Block limit")),
            status: "active".into(),
            cooldown_until: U64(0),
            record: None,
            bond: U128(JOB_BOND),
            storage_bytes: 0,
            refund_owed: U128(0),
            refund_in_flight: false,
        };
        self.jobs.insert(&id, &job);
        // Option<u64> in root state grows by eight bytes on the first reservation.
        job.storage_bytes =
            env::storage_usage() - before + if self.current_job.is_none() { 8 } else { 0 };
        require!(
            u128::from(job.storage_bytes + 768) * env::storage_byte_cost().as_yoctonear()
                <= JOB_BOND,
            "Storage reserve too small"
        );
        self.jobs.insert(&id, &job);
        self.current_job = Some(id);
        job
    }

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
        self.close(&mut job, before);
    }

    pub fn retry_storage_refund(&mut self, job_id: U64) {
        let mut job = self.jobs.get(&job_id.0).expect("Unknown job");
        require!(job.status != "active", "Job is still active");
        require!(!job.refund_in_flight, "Refund already submitted");
        self.refund(&mut job);
    }

    #[private]
    pub fn on_storage_refund(&mut self, job_id: U64) {
        let mut job = self.jobs.get(&job_id.0).expect("Unknown job");
        require!(job.refund_in_flight, "No pending refund");
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
        require!(!self.transfer_pending, "Title transfer is pending");
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
        require!(!self.transfer_pending, "Title transfer is pending");
        self.transfer_pending = true;
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
            token_id,
            approved_account_ids,
        );
        self.transfer_pending = false;
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
