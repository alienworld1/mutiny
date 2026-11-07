use game_core::*;
fn act(unit: u8, path: &[u8], action: Action) -> Command {
    Command::Activate {
        unit,
        path: path.to_vec(),
        action,
    }
}
fn run(s: &State, c: Command) -> Transition {
    apply(s, &c).unwrap()
}
fn arena() -> State {
    let mut s = start();
    s.setup.walls.clear();
    s.setup.cover.clear();
    s.setup.walkable_cover.clear();
    s.fire.clear();
    s.persistent_fire.clear();
    s.smoke.clear();
    s.orders.clear();
    s.cart_cell = 44;
    s.setup.route = vec![44, 37, 30, 23];
    for (u, c) in s.setup.units.iter_mut().zip([24, 31, 38, 3, 10, 17]) {
        u.cell = c;
        u.package = Package::None;
    }
    s
}
fn order(unit: u8, start: u8, path: &[u8], action: Action, affected: &[u8]) -> Order {
    Order {
        unit,
        start,
        path: path.to_vec(),
        endpoint: *path.last().unwrap_or(&start),
        action,
        affected: affected.to_vec(),
        original_violation: false,
    }
}
#[test]
fn all_nine_variants_and_all_house_substitutions_are_valid() {
    let b = bundle();
    assert_eq!(b.setups.len(), 9);
    let mut ids = std::collections::HashSet::new();
    for s in b.setups {
        assert!(ids.insert(s.id.clone()));
        validate_setup(&s).unwrap();
        for placement in ["escort", "infiltration"] {
            for worker in 0..3 {
                for package_option in 0..2 {
                    let c = Configuration {
                        setup_id: s.id.clone(),
                        placement: placement.into(),
                        worker,
                        package_option,
                    };
                    let s = start_config(&c).unwrap();
                    assert_eq!(
                        s.setup.units.iter().filter(|u| u.side == "player").count(),
                        3
                    );
                    assert_eq!(s.setup.units.len(), 6);
                    for o in &s.orders {
                        assert!(!o.original_violation);
                        assert_eq!(o.endpoint, *o.path.last().unwrap_or(&o.start));
                    }
                    if placement == "infiltration" {
                        assert!(apply(&s, &act(4, &[], Action::Guard)).is_err());
                    }
                }
            }
        }
    }
    let mut invalid = setup();
    invalid.route[1] = 48;
    assert!(validate_setup(&invalid).is_err());
    let mut invalid = setup();
    invalid.units[1].cell = invalid.units[0].cell;
    assert!(validate_setup(&invalid).is_err());
    let mut invalid = setup();
    invalid.units[2].hp = 99;
    assert!(validate_setup(&invalid).is_err());
}
#[test]
fn self_refusal_spends_activation_without_moving_or_using_special() {
    let mut s = arena();
    s.setup.units[1].package = Package::Fire;
    s.fire.push(32);
    let t = run(&s, act(1, &[32], Action::Smoke { cell: 25 }));
    assert_eq!(t.state.setup.units[1].cell, 31);
    assert_eq!(t.state.setup.units[1].hp, 2);
    assert!(!t.state.setup.units[1].special_used);
    assert!(t.state.activated.contains(&1));
    assert!(matches!(&t.events[0], Event::Refused { .. }));
    assert_eq!(t.state.strikes, 0);
    assert!(apply(&s, &act(1, &[32], Action::Attack { target: 3 })).is_err()); // malformed action is not a refusal
}
#[test]
fn shouting_self_refusal_and_safe_swap() {
    let mut s = arena();
    s.setup.units[1].package = Package::Shouting;
    s.setup.units[1].cell = 25;
    s.setup.units[2].cell = 39;
    let t = run(&s, act(1, &[26, 27, 20], Action::Guard));
    assert!(matches!(t.events[0], Event::Refused { .. }));
    assert_eq!(t.state.setup.units[1].cell, 25);
    let t = run(&s, act(1, &[], Action::Swap { target: 0 }));
    assert_eq!(t.state.setup.units[1].cell, 24);
    assert_eq!(t.state.setup.units[0].cell, 25);
    assert!(t.state.setup.units[1].special_used);
    s.fire.push(24);
    assert!(apply(&s, &act(1, &[], Action::Swap { target: 0 })).is_err());
    assert!(apply(&s, &act(1, &[], Action::Swap { target: 5 })).is_err());
}
#[test]
fn shove_and_pull_respect_occupancy_and_entry_damage() {
    let mut s = arena();
    s.setup.units[2].cell = 25;
    s.setup.units[5].cell = 26;
    s.fire.push(27);
    let t = run(
        &s,
        act(
            2,
            &[],
            Action::Shove {
                target: 5,
                cell: 27,
            },
        ),
    );
    assert_eq!(t.state.setup.units[5].cell, 27);
    assert_eq!(t.state.setup.units[5].hp, 2);
    assert!(
        apply(
            &s,
            &act(
                2,
                &[],
                Action::Shove {
                    target: 5,
                    cell: 25
                }
            )
        )
        .is_err()
    );
    s.setup.units[2].cell = 38;
    s.setup.units[5].cell = 26;
    let t = run(&s, act(0, &[], Action::Relocate { target: 5 }));
    assert_eq!(t.state.setup.units[5].cell, 25);
    assert!(t.state.relocate_used);
    assert!(apply(&t.state, &act(0, &[], Action::Relocate { target: 5 })).is_err());
}
#[test]
fn cover_smoke_clean_shot_and_walkability_share_geometry() {
    let mut s = arena();
    s.setup.units[0].cell = 40;
    s.setup.units[1].cell = 22;
    s.setup.units[1].role = "mage".into();
    s.setup.units[1].movement = 2;
    s.setup.units[1].package = Package::Friendly;
    s.setup.units[4].cell = 25;
    s.setup.cover.push(23);
    assert!(apply(&s, &act(1, &[23], Action::Guard)).is_err());
    assert!(apply(&s, &act(1, &[], Action::Attack { target: 4 })).is_err());
    let t = run(&s, act(1, &[], Action::CleanShot { target: 4 }));
    assert_eq!(t.state.setup.units[4].hp, 1);
    assert!(t.state.setup.units[1].special_used);
    s.setup.cover.push(24);
    assert!(apply(&s, &act(1, &[], Action::CleanShot { target: 4 })).is_err());
    s.setup.cover.pop();
    s.smoke.push(23);
    assert!(apply(&s, &act(1, &[], Action::CleanShot { target: 4 })).is_err());
    s.smoke.clear();
    s.setup.units[2].cell = 23;
    assert!(apply(&s, &act(1, &[], Action::CleanShot { target: 4 })).is_err());
    s.setup.units[2].cell = 38;
    s.setup.walkable_cover.push(23);
    assert!(apply(&s, &act(1, &[23], Action::Guard)).is_ok());
    s.setup.units[4].cell = 24;
    s.setup.cover.clear();
    assert!(apply(&s, &act(1, &[], Action::Attack { target: 4 })).is_ok());
}
#[test]
fn smoke_extinguishes_preset_fire_and_expires() {
    let mut s = arena();
    s.setup.units[1].package = Package::Fire;
    s.setup.fire = vec![32];
    s.persistent_fire = vec![32];
    s.fire = vec![32];
    let t = run(&s, act(1, &[], Action::Smoke { cell: 32 }));
    assert!(!t.state.fire.contains(&32));
    assert!(t.state.smoke.contains(&32));
    let t = run(&t.state, Command::EndPhase);
    assert!(!t.state.fire.contains(&32));
    assert!(t.state.smoke.is_empty());
}
#[test]
fn safety_precedes_guard_and_both_expire() {
    let mut s = arena();
    s.orders = vec![
        order(3, 3, &[], Action::Blast { cell: 24 }, &[17, 23, 24, 25, 31]),
        order(5, 17, &[], Action::Attack { target: 0 }, &[24]),
    ];
    s.setup.blast = vec![3];
    s.setup.units[3].cell = 10;
    s.orders[0].start = 10;
    s.orders[0].endpoint = 10;
    let t = run(&s, act(0, &[], Action::Certify { cell: 24 }));
    let t = run(&t.state, act(1, &[], Action::Guard));
    // Fixture guards the captain to test two simultaneous protections at one cell.
    let mut s = t.state;
    s.setup.units[0].guard = true;
    let t = run(&s, Command::EndPhase);
    let protections: Vec<_> = t
        .events
        .iter()
        .filter_map(|e| {
            if let Event::Protected { unit: 0, source } = e {
                Some(source.as_str())
            } else {
                None
            }
        })
        .collect();
    assert_eq!(protections, vec!["Safety Certificate", "Guard"]);
    assert_eq!(t.state.setup.units[0].hp, 3);
    assert!(t.state.certificates.is_empty());
    assert!(!t.state.setup.units[0].guard);
}
#[test]
fn friendly_blast_strike_and_smoke_block_are_distinct() {
    let mut s = arena();
    s.setup.blast = vec![5];
    s.setup.units[5].package = Package::Friendly;
    s.setup.units[4].cell = 22;
    s.orders = vec![order(
        5,
        17,
        &[],
        Action::Blast { cell: 24 },
        &[17, 23, 24, 25, 31],
    )];
    let t = run(&s, act(0, &[], Action::Relocate { target: 4 }));
    let t = run(&t.state, Command::EndPhase);
    assert!(
        t.events
            .iter()
            .any(|e| matches!(e, Event::Strike { unit: 5, .. }))
    );
    assert_eq!(t.state.setup.units[0].hp, 3);
    s.setup.units[1].package = Package::Fire;
    let t = run(&s, act(1, &[], Action::Smoke { cell: 24 }));
    let t = run(&t.state, Command::EndPhase);
    assert!(
        t.events
            .iter()
            .any(|e| matches!(e, Event::Blocked { unit: 5, .. }))
    );
    assert!(!t.events.iter().any(|e| matches!(e, Event::Strike { .. })));
    s.orders[0].original_violation = true;
    s.setup.units[4].cell = 23;
    let t = run(&s, Command::EndPhase);
    assert!(!t.events.iter().any(|e| matches!(e, Event::Strike { .. })));
}
#[test]
fn shouting_strike_is_player_caused_not_enemy_caused() {
    let mut s = arena();
    s.setup.units[4].package = Package::Shouting;
    s.setup.units[4].cell = 10;
    s.setup.units[5].cell = 18;
    s.setup.units[3].cell = 0;
    s.setup.units[0].cell = 32;
    s.orders = vec![order(4, 10, &[11, 12], Action::Guard, &[])];
    // Pull the only ally in shouting range one cell away (18 -> 25).
    s.setup.units[0].cell = 32;
    let t = run(&s, act(0, &[], Action::Relocate { target: 5 }));
    let t = run(&t.state, Command::EndPhase);
    assert!(
        t.events
            .iter()
            .any(|e| matches!(e, Event::Strike { unit: 4, .. }))
    );
    // Identical distance change during the enemy phase is not a player strike.
    s.orders.insert(0, order(5, 18, &[25], Action::Guard, &[]));
    let t = run(&s, Command::EndPhase);
    assert!(!t.events.iter().any(|e| matches!(e, Event::Strike { .. })));
}
#[test]
fn borrow_requires_a_real_strike_and_one_pending_activation() {
    let s = run(&start(), act(0, &[], Action::Burn { cell: 25 })).state;
    let s = run(&s, Command::EndPhase).state;
    assert!(
        apply(
            &s,
            &Command::BorrowedActivate {
                unit: 4,
                path: vec![],
                action: Action::Guard
            }
        )
        .is_err()
    );
    let s = run(&s, act(0, &[25], Action::Borrow { target: 4 })).state;
    assert_eq!(s.borrow_pending, Some(4));
    assert!(s.activated.contains(&0));
    assert_eq!(s.setup.units[4].status, Status::Recovering);
    assert!(apply(&s, &act(1, &[], Action::Guard)).is_err());
    assert!(apply(&s, &Command::EndPhase).is_err());
    assert!(apply(&s, &act(4, &[], Action::Guard)).is_err());
    let t = run(
        &s,
        Command::BorrowedActivate {
            unit: 4,
            path: vec![],
            action: Action::Guard,
        },
    );
    assert_eq!(t.state.borrow_pending, None);
    assert!(t.state.setup.units[4].borrowed);
    let t = run(&t.state, Command::EndPhase);
    assert_eq!(t.state.setup.units[4].status, Status::Normal);
    assert!(
        t.events
            .iter()
            .any(|e| matches!(e, Event::Recovering { unit: 4 }))
    );
    assert!(apply(&t.state, &act(0, &[], Action::Borrow { target: 4 })).is_err());
    let t = run(&s, Command::SkipBorrow { unit: 4 });
    assert_eq!(t.state.borrow_pending, None);
    assert!(t.state.setup.units[4].borrowed);
}
#[test]
fn illegal_input_properties_are_atomic_and_bounded() {
    let s = start();
    let initial = s.clone();
    for cell in 49..=255 {
        assert!(apply(&s, &act(0, &[cell], Action::Guard)).is_err());
        assert!(apply(&s, &act(0, &[], Action::Burn { cell })).is_err());
    }
    for target in 7..=255 {
        assert!(apply(&s, &act(0, &[], Action::Attack { target })).is_err());
    }
    for cell in 0..49 {
        if distance(s.setup.units[0].cell, cell) != 1 {
            assert!(apply(&s, &act(0, &[cell], Action::Guard)).is_err());
        }
    }
    assert_eq!(s, initial);
    let mut log = s.log;
    log.commands = vec![Command::EndPhase; 33];
    assert!(replay(&log).is_err());
    log.commands = vec![act(0, &[31, 24, 17, 10], Action::Guard)];
    assert!(canonical(&log).is_err());
    assert!(borsh::from_slice::<ActionLog>(&[0, 1, 2]).is_err());
}
#[test]
fn friendly_player_command_is_a_visible_rule_legal_refusal() {
    let mut s = arena();
    s.setup.units[1].package = Package::Friendly;
    let t = run(&s, act(1, &[], Action::CleanShot { target: 0 }));
    assert!(matches!(t.events[0], Event::Refused { unit: 1, .. }));
    assert_eq!(t.state.setup.units[0].hp, 3);
    assert!(!t.state.setup.units[1].special_used);
    assert!(t.state.activated.contains(&1));
}
#[test]
fn borrowed_worker_uses_temporary_allies_and_can_attack_its_old_side() {
    let s = run(&start(), act(0, &[], Action::Burn { cell: 25 })).state;
    let s = run(&s, Command::EndPhase).state;
    let s = run(&s, act(0, &[25], Action::Borrow { target: 4 })).state;
    assert_eq!(s.setup.units[4].side, "player");
    let mut s = s;
    s.setup.units[5].cell = 19;
    let t = run(
        &s,
        Command::BorrowedActivate {
            unit: 4,
            path: vec![],
            action: Action::Attack { target: 5 },
        },
    );
    assert_eq!(t.state.setup.units[5].hp, 2);
    let t = run(&t.state, Command::EndPhase);
    assert_eq!(t.state.setup.units[4].side, "enemy");
}
#[test]
fn revisiting_one_fire_tile_damages_only_once_per_activation() {
    let mut s = arena();
    s.fire.push(32);
    s.setup.units[1].hp = 2;
    let t = run(&s, act(1, &[32, 31, 32], Action::Guard));
    assert_eq!(t.state.setup.units[1].hp, 1);
    assert_eq!(t.state.setup.units[1].cell, 32);
    assert_eq!(
        t.events
            .iter()
            .filter(|e| matches!(e, Event::Damaged { target: 1, .. }))
            .count(),
        1
    );
}

#[test]
fn authored_enemy_blast_is_not_a_player_captain_tool() {
    let s = start();
    assert!(apply(&s, &act(0, &[], Action::Blast { cell: 25 })).is_err());
    let s = run(&s, act(0, &[], Action::Burn { cell: 25 })).state;
    let s = run(&s, Command::EndPhase).state;
    let mut s = run(&s, act(0, &[25], Action::Borrow { target: 4 })).state;
    s.setup.blast.push(4);
    assert!(
        apply(
            &s,
            &Command::BorrowedActivate {
                unit: 4,
                path: vec![],
                action: Action::Blast { cell: 25 }
            }
        )
        .is_err()
    );
}
