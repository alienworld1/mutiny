use game_core::*;
fn activate(unit: u8, path: &[u8], action: Action) -> Command {
    Command::Activate {
        unit,
        path: path.to_vec(),
        action,
    }
}
fn main() {
    let refs: Vec<serde_json::Value> =
        serde_json::from_str(include_str!("../tests/fixtures/winning-logs.json")).unwrap();
    let mut logs: Vec<ActionLog> = refs
        .into_iter()
        .map(|r| serde_json::from_value(r["log"].clone()).unwrap())
        .collect();
    logs.extend(
        serde_json::from_str::<Vec<ActionLog>>(include_str!(
            "../tests/fixtures/contract-stress-logs.json"
        ))
        .unwrap(),
    );
    for worker in [0, 1, 3, 4, 5, 6] {
        for placement in ["escort", "infiltration"] {
            for package_option in 0..2 {
                let mut state = start_config(&Configuration {
                    worker,
                    placement: placement.into(),
                    package_option,
                    ..Configuration::default()
                })
                .unwrap();
                while state.outcome.is_none() {
                    state = apply(&state, &Command::EndPhase).unwrap().state;
                }
                logs.push(state.log);
            }
        }
    }
    let s = start();
    logs.push(s.log.clone());
    for commands in [
        vec![
            activate(0, &[], Action::Burn { cell: 25 }),
            Command::EndPhase,
        ],
        vec![activate(0, &[25], Action::Guard), Command::EndPhase],
        vec![
            activate(0, &[], Action::Burn { cell: 31 }),
            activate(1, &[45, 38, 31], Action::Guard),
        ],
        vec![
            activate(0, &[], Action::Burn { cell: 25 }),
            Command::EndPhase,
            activate(0, &[25], Action::Borrow { target: 4 }),
            Command::BorrowedActivate {
                unit: 4,
                path: vec![],
                action: Action::Guard,
            },
            Command::EndPhase,
        ],
        vec![
            activate(0, &[], Action::Burn { cell: 25 }),
            Command::EndPhase,
            activate(0, &[25], Action::Borrow { target: 4 }),
            Command::SkipBorrow { unit: 4 },
            Command::EndPhase,
        ],
    ] {
        let mut log = s.log.clone();
        log.commands = commands;
        replay(&log).unwrap();
        logs.push(log);
    }
    // Exercise each remaining action through real approved setups, not custom
    // states, so native/Wasm parity covers the whole public player command set.
    for kind in [
        "smoke",
        "swap",
        "shove",
        "relocate",
        "certify",
        "clean_shot",
    ] {
        let mut found = None;
        'search: for setup in bundle().setups {
            for worker in 0..3 {
                for package_option in 0..2 {
                    let mut s = start_config(&Configuration {
                        setup_id: setup.id.clone(),
                        worker,
                        package_option,
                        ..Configuration::default()
                    })
                    .unwrap();
                    for _ in 0..3 {
                        for id in 0..3 {
                            if let Ok(c) = choices(&s, id, &[]) {
                                for m in c.moves {
                                    for a in choices(&s, id, &m.path).unwrap().actions {
                                        if serde_json::to_value(&a.action).unwrap()["kind"] == kind
                                        {
                                            let t = apply(&s, &activate(id, &m.path, a.action))
                                                .unwrap();
                                            if !t
                                                .events
                                                .iter()
                                                .any(|e| matches!(e, Event::Refused { .. }))
                                            {
                                                found = Some(t.state.log);
                                                break 'search;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        let t = apply(&s, &Command::EndPhase).unwrap();
                        s = t.state;
                        if s.outcome.is_some() {
                            break;
                        }
                    }
                }
            }
        }
        logs.push(found.unwrap_or_else(|| panic!("Missing {kind} parity case")));
    }
    let goldens:Vec<_>=logs.into_iter().map(|log|{let transition=replay(&log).unwrap();serde_json::json!({"log":log,"transition":transition,"canonical":canonical(&log).unwrap()})}).collect();
    println!("{}", serde_json::to_string(&goldens).unwrap());
}
