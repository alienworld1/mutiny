use game_core::*;
fn main() {
    let cases = [
        vec![],
        vec![
            Command::Activate {
                unit: 0,
                path: vec![],
                action: Action::Burn { cell: 25 },
            },
            Command::EndPhase,
        ],
        vec![
            Command::Activate {
                unit: 0,
                path: vec![25],
                action: Action::Guard,
            },
            Command::EndPhase,
        ],
        vec![
            Command::Activate {
                unit: 0,
                path: vec![],
                action: Action::Burn { cell: 25 },
            },
            Command::Activate {
                unit: 1,
                path: vec![],
                action: Action::Push,
            },
            Command::EndPhase,
            Command::Activate {
                unit: 1,
                path: vec![37],
                action: Action::Push,
            },
            Command::EndPhase,
            Command::Activate {
                unit: 1,
                path: vec![30],
                action: Action::Push,
            },
        ],
        vec![Command::EndPhase, Command::EndPhase],
    ];
    let goldens: Vec<_>=cases.into_iter().map(|commands| { let log=ActionLog{rules_version:1,commands}; let transition=replay(&log).unwrap(); serde_json::json!({"log":log,"transition":transition,"canonical":canonical(&log).unwrap()}) }).collect();
    println!("{}", serde_json::to_string(&goldens).unwrap());
}
