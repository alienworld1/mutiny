//! Bounded offline search for reproducible authored encounter reference logs.
use game_core::*;
use std::collections::{HashSet, hash_map::DefaultHasher};
use std::hash::{Hash, Hasher};

fn score(s: &State, combat: bool) -> i32 {
    let next = s.setup.route[(usize::from(s.pushes) + 1).min(3)];
    i32::from(s.pushes) * if combat { 400 } else { 1500 }
        + i32::from(s.cart_hp) * 450
        + i32::from(s.setup.units[0].hp) * 80
        - i32::from(s.round) * 100
        - s.setup.units[3..]
            .iter()
            .map(|u| i32::from(u.hp) * if combat { 300 } else { 35 })
            .sum::<i32>()
        - s.setup.units[..3]
            .iter()
            .filter(|u| u.hp > 0)
            .map(|u| i32::from(distance(u.cell, next)) * 8)
            .sum::<i32>()
}
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let config = Configuration {
        setup_id: args[1].clone(),
        worker: args[2].parse().unwrap(),
        package_option: args[3].parse().unwrap(),
        placement: args.get(4).cloned().unwrap_or("escort".into()),
    };
    let objective = args.get(5).map(String::as_str).unwrap_or("routine");
    let mut beam = vec![start_config(&config).unwrap()];
    let mut seen = HashSet::new();
    for _ in 0..28 {
        let mut candidates = vec![];
        for state in beam {
            let mut commands = vec![Command::EndPhase];
            if let Some(unit) = state.borrow_pending {
                commands.push(Command::SkipBorrow { unit });
            }
            for unit in 0..6 {
                let Ok(options) = choices(&state, unit, &[]) else {
                    continue;
                };
                for position in options.moves {
                    let Ok(options) = choices(&state, unit, &position.path) else {
                        continue;
                    };
                    for option in options.actions {
                        commands.push(if state.borrow_pending == Some(unit) {
                            Command::BorrowedActivate {
                                unit,
                                path: position.path.clone(),
                                action: option.action,
                            }
                        } else {
                            Command::Activate {
                                unit,
                                path: position.path.clone(),
                                action: option.action,
                            }
                        });
                    }
                }
            }
            let mut local = vec![];
            for command in commands {
                let Ok(next) = apply(&state, &command) else {
                    continue;
                };
                if next
                    .events
                    .iter()
                    .any(|e| matches!(e, Event::Refused { .. }))
                {
                    continue;
                }
                let s = next.state;
                let attacks = s
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
                if s.outcome.as_deref() == Some("delivered")
                    && (objective != "combat" || (attacks >= 3 && s.round >= 4))
                    && (objective != "intact" || s.cart_hp == 2)
                    && (objective != "express" || s.round <= 4)
                {
                    println!("{}", serde_json::to_string(&s.log).unwrap());
                    return;
                }
                if s.outcome.is_some()
                    || (objective == "intact" && s.cart_hp < 2)
                    || (objective == "express" && s.round > 4)
                {
                    continue;
                }
                let mut key = s.clone();
                key.log.commands.clear();
                let mut hasher = DefaultHasher::new();
                serde_json::to_vec(&key).unwrap().hash(&mut hasher);
                if seen.insert(hasher.finish()) {
                    local.push((score(&s, objective == "combat"), s));
                }
            }
            local.sort_unstable_by_key(|(score, _)| std::cmp::Reverse(*score));
            candidates.extend(local.into_iter().take(24));
        }
        candidates.sort_unstable_by_key(|(score, _)| std::cmp::Reverse(*score));
        beam = candidates
            .into_iter()
            .take(240)
            .map(|(_, state)| state)
            .collect();
        if beam.is_empty() {
            break;
        }
    }
    eprintln!("No reference found for {config:?} ({objective}) within search budget");
    std::process::exit(1);
}
