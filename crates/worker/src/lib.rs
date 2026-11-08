use near_sdk::{AccountId, PanicOnDefault, env, json_types::U128, near, require};

/// Self-use creates no worker earnings. Paid credit and claims are added in M4.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Worker {
    registry_id: AccountId,
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
            env::current_account_id().as_str() == format!("rook.{registry_id}"),
            "Invalid worker identity"
        );
        Self { registry_id }
    }
    pub fn registry_id(&self) -> AccountId {
        self.registry_id.clone()
    }
    pub fn recognized_earnings(&self) -> U128 {
        U128(0)
    }
}
