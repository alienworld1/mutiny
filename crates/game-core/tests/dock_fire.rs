use game_core::*;
fn activate(unit: u8, path: &[u8], action: Action) -> Command {
    Command::Activate {
        unit,
        path: path.to_vec(),
        action,
    }
}
fn run(s: &State, c: Command) -> State {
    apply(s, &c).unwrap().state
}
fn push(s: &State, path: &[u8]) -> State {
    run(s, activate(1, path, Action::Push))
}

#[test]
fn content_and_original_orders_are_legal() {
    let s = start();
    validate_setup(&s.setup).unwrap();
    assert_eq!(s.orders.len(), 3);
    for order in &s.orders {
        assert!(!order.original_violation);
        assert_eq!(order.endpoint, *order.path.last().unwrap_or(&order.start));
    }
    assert_eq!(s.orders[1].path, vec![25]);
    assert_eq!(s.orders[1].action, Action::Attack { target: 0 });
}
#[test]
fn three_push_golden() {
    let mut s = run(&start(), activate(0, &[], Action::Guard));
    s = push(&s, &[]);
    assert_eq!(s.cart_cell, 30);
    assert!(apply(&s, &activate(0, &[31], Action::Push)).is_err());
    s = run(&s, Command::EndPhase);
    s = run(&s, activate(0, &[], Action::Guard));
    s = push(&s, &[37]);
    s = run(&s, Command::EndPhase);
    s = push(&s, &[30]);
    assert_eq!(s.outcome.as_deref(), Some("delivered"));
    assert_eq!(s.round, 3);
    assert_eq!(replay(&s.log).unwrap().state, s);
    assert!(apply(&s, &Command::EndPhase).is_err());
}
#[test]
fn new_fire_clause_strike_is_not_an_ordinary_block() {
    let s = run(&start(), activate(0, &[], Action::Burn { cell: 25 }));
    let t = apply(&s, &Command::EndPhase).unwrap();
    assert!(t.events.contains(&Event::Strike {
        unit: 4,
        cell: 25,
        reason: "NOT ON THE FIRE: that path enters fire".into()
    }));
    assert_eq!(t.state.setup.units[4].cell, 18);
    assert_eq!(t.state.setup.units[4].status, Status::Striking);
    assert!(!t.state.fire.contains(&25));
    let recovery = apply(&t.state, &Command::EndPhase).unwrap();
    assert!(recovery.events.contains(&Event::Recovered { unit: 4 }));
    assert_eq!(recovery.state.setup.units[4].status, Status::Normal);
    assert!(!t.state.orders.iter().any(|o| o.unit == 4));
}
#[test]
fn occupied_path_and_moved_target_are_blocks() {
    let s = run(&start(), activate(0, &[25], Action::Guard));
    let t = apply(&s, &Command::EndPhase).unwrap();
    assert!(
        t.events
            .iter()
            .any(|e| matches!(e, Event::Blocked { unit: 4, .. }))
    );
    assert!(!t.events.iter().any(|e| matches!(e, Event::Strike { .. })));
    let s = run(&start(), activate(0, &[33], Action::Guard));
    let t = apply(&s, &Command::EndPhase).unwrap();
    assert!(
        t.events
            .iter()
            .any(|e| matches!(e, Event::Blocked { unit: 4, .. }))
    );
}
#[test]
fn invalid_commands_are_atomic() {
    let s = start();
    for c in [
        activate(0, &[24], Action::Guard),
        activate(0, &[39, 38, 31], Action::Guard),
        activate(0, &[31, 30, 37], Action::Guard),
        activate(4, &[], Action::Guard),
        activate(0, &[], Action::Attack { target: 3 }),
        activate(0, &[], Action::Burn { cell: 18 }),
        activate(0, &[], Action::Burn { cell: 49 }),
    ] {
        assert!(apply(&s, &c).is_err(), "{c:?}");
    }
    assert!(s.log.commands.is_empty());
    let s = run(&s, activate(0, &[], Action::Guard));
    assert!(apply(&s, &activate(0, &[], Action::Guard)).is_err());
}
#[test]
fn guard_blocks_one_hit_and_expires() {
    let s = run(&start(), activate(0, &[], Action::Guard));
    let t = apply(&s, &Command::EndPhase).unwrap();
    assert!(t.events.contains(&Event::Protected {
        unit: 0,
        source: "Guard".into()
    }));
    assert_eq!(t.state.setup.units[0].hp, 3);
    assert!(!t.state.setup.units[0].guard);
}
#[test]
fn defeat_retry_and_limits() {
    let mut s = start();
    while s.outcome.is_none() {
        s = run(&s, Command::EndPhase);
    }
    assert_ne!(s.outcome.as_deref(), Some("delivered"));
    assert!(s.round <= 5);
    let fresh = start();
    assert_eq!(fresh.round, 1);
    assert_eq!(fresh.cart_hp, 2);
    assert!(!fresh.burn_used);
    assert_eq!(fresh, start());
    let log = ActionLog {
        rules_version: RULES_VERSION,
        content_version: CONTENT_VERSION,
        config: Configuration::default(),
        commands: vec![Command::EndPhase; 33],
    };
    assert!(replay(&log).is_err());
    assert!(canonical(&log).is_err());
    assert!(
        replay(&ActionLog {
            rules_version: 99,
            content_version: CONTENT_VERSION,
            config: Configuration::default(),
            commands: vec![]
        })
        .is_err()
    );
}
#[test]
fn captain_cart_and_timeout_end_immediately() {
    for (cart_hp, captain_hp, expected) in [(1, 3, "cart_lost"), (2, 1, "captain_lost")] {
        let mut s = start();
        s.cart_hp = cart_hp;
        s.setup.units[0].hp = captain_hp;
        s.orders = vec![Order {
            unit: 4,
            start: 18,
            path: vec![25],
            endpoint: 25,
            action: Action::Attack {
                target: if expected == "cart_lost" { 6 } else { 0 },
            },
            affected: vec![],
            original_violation: false,
        }];
        if expected == "cart_lost" {
            s.cart_cell = 24;
        }
        let t = apply(&s, &Command::EndPhase).unwrap();
        assert_eq!(t.state.outcome.as_deref(), Some(expected));
    }
    let mut s = start();
    s.round = 5;
    s.orders.clear();
    assert_eq!(
        run(&s, Command::EndPhase).outcome.as_deref(),
        Some("time_up")
    );
}
#[test]
fn fire_damage_and_tool_consumption() {
    let s = run(&start(), activate(0, &[], Action::Burn { cell: 25 }));
    assert!(s.burn_used);
    let mut s = run(&s, Command::EndPhase);
    assert!(apply(&s, &activate(0, &[], Action::Burn { cell: 31 })).is_err());
    s.fire.push(31);
    let t = apply(&s, &activate(0, &[31], Action::Guard)).unwrap();
    assert_eq!(t.state.setup.units[0].hp, 2);
}
#[test]
fn canonical_encoding_round_trips() {
    let s = push(&start(), &[]);
    let bytes = canonical(&s.log).unwrap();
    let decoded: ActionLog = borsh::from_slice(&bytes).unwrap();
    assert_eq!(decoded, s.log);
}
