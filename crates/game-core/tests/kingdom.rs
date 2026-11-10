use game_core::*;
#[derive(serde::Deserialize)]
struct Reference {
    objective: economy::Objective,
    log: ActionLog,
}

#[test]
fn every_kingdom_arrangement_has_a_verified_delivery() {
    let references: Vec<Reference> =
        serde_json::from_str(include_str!("fixtures/kingdom-logs.json")).unwrap();
    assert_eq!(references.len(), 216);
    let mut arrangements = std::collections::HashSet::new();
    for reference in references {
        assert_eq!(reference.log.content_version, CONTENT_VERSION);
        let s = replay(&reference.log).unwrap().state;
        assert!(
            reference
                .objective
                .met(s.outcome.as_deref().unwrap(), s.cart_hp, s.round),
            "{:?}",
            reference.log.config
        );
        assert!(arrangements.insert(serde_json::to_string(&reference.log.config).unwrap()));
    }
}

#[test]
fn old_frozen_jobs_replay_their_original_content() {
    let references: Vec<serde_json::Value> =
        serde_json::from_str(include_str!("fixtures/legacy-winning-logs.json")).unwrap();
    for reference in references {
        let log: ActionLog = serde_json::from_value(reference["log"].clone()).unwrap();
        let s = replay(&log).unwrap().state;
        assert_eq!(s.setup.content_version, 2);
        assert_eq!(s.outcome.as_deref(), Some("delivered"));
    }
    let config = Configuration {
        setup_id: "dock-fire-embers".into(),
        ..Configuration::default()
    };
    assert_ne!(
        start_config(&config).unwrap().setup,
        start_config_version(&config, 2).unwrap().setup
    );
}
