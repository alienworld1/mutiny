use game_core::*;
#[derive(serde::Deserialize)]
struct Reference {
    approach: String,
    log: ActionLog,
}
#[test]
fn twenty_seven_authored_wins_prove_two_approaches_and_infiltration() {
    let references: Vec<Reference> =
        serde_json::from_str(include_str!("fixtures/winning-logs.json")).unwrap();
    assert_eq!(references.len(), 27);
    for setup in bundle().setups {
        let cases: Vec<_> = references
            .iter()
            .filter(|r| r.log.config.setup_id == setup.id)
            .collect();
        assert_eq!(cases.len(), 3);
        let mut commands = vec![];
        for r in cases {
            let t = replay(&r.log).unwrap();
            assert_eq!(
                t.state.outcome.as_deref(),
                Some("delivered"),
                "{} {}",
                setup.id,
                r.approach
            );
            assert!(!t.events.iter().any(|e| matches!(e, Event::Refused { .. })));
            let bytes = canonical(&r.log).unwrap();
            let decoded: ActionLog = borsh::from_slice(&bytes).unwrap();
            assert_eq!(decoded, r.log);
            assert!(bytes.len() <= 4096);
            let attacks = r
                .log
                .commands
                .iter()
                .filter(|c| {
                    matches!(
                        c,
                        Command::Activate {
                            action: Action::Attack { .. } | Action::CleanShot { .. },
                            ..
                        }
                    )
                })
                .count();
            if r.approach == "combat" {
                assert!(attacks >= 3);
                assert!(t.state.round >= 4);
                assert_eq!(r.log.config.placement, "escort");
            }
            if r.approach == "delivery" {
                assert!(t.state.round <= 4);
                assert!(!t.state.setup.units.iter().any(|u| u.borrowed));
            }
            if r.approach == "infiltration" {
                assert_eq!(r.log.config.placement, "infiltration");
                assert!(
                    !r.log
                        .commands
                        .iter()
                        .any(|c| matches!(c, Command::Activate { unit: 4, .. }))
                );
            }
            if r.approach != "infiltration" {
                assert!(!commands.contains(&r.log.commands));
                commands.push(r.log.commands.clone());
            }
        }
    }
}
