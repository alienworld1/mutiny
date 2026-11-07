use near_sdk::{PanicOnDefault, near};

/// M1 compatibility probe only. No tokens, jobs, employment or funds.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Registry {
    calls: u32,
}

#[near]
impl Registry {
    #[init]
    pub fn new() -> Self {
        Self { calls: 0 }
    }
    pub fn smoke(&mut self) -> u32 {
        game_core::validate_setup(&game_core::setup()).expect("valid shared core content");
        self.calls = self.calls.checked_add(1).expect("probe limit");
        self.calls
    }
    pub fn smoke_calls(&self) -> u32 {
        self.calls
    }
    pub fn rules_version(&self) -> u16 {
        game_core::start().setup.rules_version
    }
}
