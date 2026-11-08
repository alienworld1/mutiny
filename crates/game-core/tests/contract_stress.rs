use game_core::*;
#[test]
fn contract_stress_logs_reach_five_rounds_with_real_specials_strikes_and_borrow() {
    let logs: Vec<ActionLog> =
        serde_json::from_str(include_str!("fixtures/contract-stress-logs.json")).unwrap();
    assert_eq!(logs.len(), 6);
    let mut borrow = false;
    let mut relocation = false;
    for log in logs {
        let replay = replay(&log).unwrap();
        assert_eq!(replay.state.round, 5);
        assert!(replay.state.outcome.is_some());
        assert!(log.commands.len() >= 20);
        assert!(canonical(&log).unwrap().len() <= 4096);
        assert!(serde_json::to_vec(&log).unwrap().len() <= 4096);
        assert!(replay.state.strikes > 0);
        borrow |= replay
            .events
            .iter()
            .any(|e| matches!(e, Event::Borrowed { .. }));
        relocation |= replay.state.relocate_used;
    }
    assert!(borrow && relocation);
}
