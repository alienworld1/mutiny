//! Deterministic kingdom policies shared by the Registry and browser preview.
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

pub const CONSUMPTION_SECONDS: u64 = 1800;
pub const CAPACITY: u8 = 6;
pub const MAX_INCOMING: usize = 2;
pub const MILLINEAR: u128 = 1_000_000_000_000_000_000_000;

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize,
)]
#[serde(rename_all = "snake_case")]
pub enum Objective {
    Routine,
    Intact,
    Express,
}
impl Objective {
    pub fn met(self, outcome: &str, cart_hp: u8, round: u8) -> bool {
        outcome == "delivered"
            && match self {
                Self::Routine => true,
                Self::Intact => cart_hp == 2,
                Self::Express => round <= 4,
            }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct Stock {
    pub supplies: u8,
    pub updated_at: u64,
    pub deliveries: u64,
}
impl Stock {
    pub fn advance(&mut self, now: u64) {
        let ticks = now.saturating_sub(self.updated_at) / CONSUMPTION_SECONDS;
        self.supplies = self
            .supplies
            .saturating_sub(ticks.min(u64::from(CAPACITY)) as u8);
        self.updated_at = self.updated_at.saturating_add(ticks * CONSUMPTION_SECONDS);
    }
    pub fn band(&self) -> usize {
        match self.supplies {
            0..=1 => 0,
            2..=3 => 1,
            _ => 2,
        }
    }
    pub fn premium(&self) -> Option<Objective> {
        match self.band() {
            0 => Some(Objective::Express),
            1 => Some(Objective::Intact),
            _ => None,
        }
    }
    pub fn payment(&self, objective: Objective) -> Option<u128> {
        if self.supplies >= CAPACITY
            || (objective != Objective::Routine && Some(objective) != self.premium())
        {
            return None;
        }
        Some(
            ([50, 40, 30][self.band()]
                + if objective == Objective::Routine {
                    0
                } else {
                    25
                })
                * MILLINEAR,
        )
    }
    pub fn deliver(&mut self) {
        self.supplies = self.supplies.saturating_add(1).min(CAPACITY);
        self.deliveries = self.deliveries.saturating_add(1);
    }
    pub fn restored(&self) -> bool {
        self.deliveries >= 3
    }
    pub fn setup_id(&self, town: usize) -> &'static str {
        const SETUPS: [[&str; 3]; 3] = [
            ["dock-fire-crosswind", "dock-fire-embers", "dock-fire-intro"],
            [
                "bridge-audit-queue",
                "bridge-audit-toll",
                "bridge-audit-paper",
            ],
            [
                "friday-again-last",
                "friday-again-crossed",
                "friday-again-overtime",
            ],
        ];
        SETUPS[town][self.band()]
    }
}

pub fn automatic_quote(
    base: u128,
    floor: u128,
    ceiling: u128,
    step: u128,
    pressure: u8,
    idle_steps: u64,
) -> u128 {
    base.saturating_add(step.saturating_mul(u128::from(pressure.min(4))))
        .saturating_sub(step.saturating_mul(u128::from(idle_steps.min(4))))
        .clamp(floor, ceiling)
}
pub fn decayed_pressure(pressure: u8, updated_at: u64, now: u64) -> u8 {
    pressure.saturating_sub((now.saturating_sub(updated_at) / CONSUMPTION_SECONDS).min(4) as u8)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn time_is_bounded_and_restoration_survives_consumption() {
        let mut stock = Stock {
            supplies: 5,
            updated_at: 100,
            deliveries: 3,
        };
        stock.advance(1899);
        assert_eq!(stock.supplies, 5);
        stock.advance(1900);
        assert_eq!(stock.supplies, 4);
        stock.advance(u64::MAX);
        assert_eq!(stock.supplies, 0);
        assert!(stock.restored());
        let unchanged = stock.clone();
        stock.advance(0);
        assert_eq!(stock, unchanged);
    }
    #[test]
    fn delivery_changes_terms_and_consumption_reopens_work() {
        let mut stock = Stock {
            supplies: 1,
            updated_at: 0,
            deliveries: 0,
        };
        assert_eq!(stock.payment(Objective::Express), Some(75 * MILLINEAR));
        stock.deliver();
        assert_eq!(stock.payment(Objective::Express), None);
        assert_eq!(stock.payment(Objective::Intact), Some(65 * MILLINEAR));
        for _ in 0..4 {
            stock.deliver();
        }
        assert_eq!(stock.payment(Objective::Routine), None);
        stock.advance(1800);
        assert_eq!(stock.payment(Objective::Routine), Some(30 * MILLINEAR));
    }
    #[test]
    fn pressure_idle_and_bounds_move_real_quotes() {
        assert_eq!(automatic_quote(10, 2, 15, 2, 4, 0), 15);
        assert_eq!(automatic_quote(10, 2, 15, 2, 0, 100), 2);
        assert_eq!(automatic_quote(10, 2, 15, 2, 1, 0), 12);
        assert_eq!(decayed_pressure(4, 0, 3600), 2);
        assert_eq!(decayed_pressure(4, 0, u64::MAX), 0);
    }
}
