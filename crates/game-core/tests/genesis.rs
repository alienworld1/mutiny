use game_core::{Configuration, start_config, worker_identity};

#[test]
fn six_genesis_workers_keep_authored_identity_and_role_statistics_in_both_placements() {
    for (worker, name, role, hp, movement) in [
        (0, "Rook", "courier", 2, 3),
        (1, "Mallow", "shieldbearer", 3, 2),
        (3, "Nix", "mage", 2, 2),
        (4, "Dot", "courier", 2, 3),
        (5, "Brisk", "shieldbearer", 3, 2),
        (6, "Peebles", "mage", 2, 2),
    ] {
        let identity = worker_identity(worker).unwrap();
        assert_eq!(
            (identity.0, identity.1, identity.2, identity.3),
            (name, role, hp, movement)
        );
        for setup in game_core::bundle().setups {
            for placement in ["escort", "infiltration"] {
                for package_option in 0..2 {
                    let config = Configuration {
                        setup_id: setup.id.clone(),
                        placement: placement.into(),
                        worker,
                        package_option,
                    };
                    let state = start_config(&config).unwrap();
                    let unit = &state.setup.units[if placement == "escort" { 1 } else { 4 }];
                    assert_eq!(
                        (
                            unit.name.as_str(),
                            unit.role.as_str(),
                            unit.hp,
                            unit.movement
                        ),
                        (name, role, hp, movement)
                    );
                    assert_eq!(unit.package, identity.4[package_option as usize]);
                    assert_eq!(
                        state
                            .setup
                            .units
                            .iter()
                            .filter(|u| u.side == "player")
                            .count(),
                        3
                    );
                    assert_eq!(
                        state
                            .setup
                            .units
                            .iter()
                            .filter(|u| u.side == "enemy")
                            .count(),
                        3
                    );
                    assert_eq!(state, start_config(&config).unwrap());
                }
            }
        }
    }
    assert!(worker_identity(7).is_none());
}
