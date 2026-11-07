use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

pub const RULES_VERSION: u16 = 1;
pub const MAX_COMMANDS: usize = 32;
const CONTENT: &str = include_str!("../../../content/dock-fire.json");

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Setup {
    pub rules_version: u16,
    pub content_version: u16,
    pub id: String,
    pub name: String,
    pub route: Vec<u8>,
    pub walls: Vec<u8>,
    pub fire: Vec<u8>,
    pub units: Vec<Unit>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Normal,
    Striking,
    Recovering,
}
impl Default for Status {
    fn default() -> Self {
        Self::Normal
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Unit {
    pub id: u8,
    pub name: String,
    pub role: String,
    pub side: String,
    pub cell: u8,
    pub hp: u8,
    pub movement: u8,
    pub fire_clause: bool,
    #[serde(default)]
    pub guard: bool,
    #[serde(default)]
    pub status: Status,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    Guard,
    Push,
    Attack { target: u8 },
    Burn { cell: u8 },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    Activate {
        unit: u8,
        path: Vec<u8>,
        action: Action,
    },
    EndPhase,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(deny_unknown_fields)]
pub struct ActionLog {
    pub rules_version: u16,
    pub commands: Vec<Command>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Order {
    pub unit: u8,
    pub start: u8,
    pub path: Vec<u8>,
    pub endpoint: u8,
    pub action: Action,
    pub affected: Vec<u8>,
    pub original_fire_violation: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Event {
    Moved { unit: u8, path: Vec<u8> },
    Guarded { unit: u8 },
    Pushed { from: u8, to: u8 },
    Ignited { cell: u8 },
    Damaged { target: u8, hp: u8 },
    Protected { unit: u8 },
    Strike { unit: u8, cell: u8 },
    Blocked { unit: u8, reason: String },
    Refused { unit: u8 },
    Recovered { unit: u8 },
    Ended { outcome: String },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct State {
    pub setup: Setup,
    pub round: u8,
    pub phase: String,
    pub cart_cell: u8,
    pub cart_hp: u8,
    pub pushes: u8,
    pub pushed: bool,
    pub burn_used: bool,
    pub fire: Vec<u8>,
    pub activated: Vec<u8>,
    pub orders: Vec<Order>,
    pub outcome: Option<String>,
    pub strikes: u8,
    pub log: ActionLog,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Transition {
    pub state: State,
    pub events: Vec<Event>,
}
#[derive(Serialize)]
pub struct OptionView {
    pub cell: u8,
    pub path: Vec<u8>,
}
#[derive(Serialize)]
pub struct Choices {
    pub moves: Vec<OptionView>,
    pub attacks: Vec<u8>,
    pub burns: Vec<u8>,
    pub push: bool,
}

pub fn distance(a: u8, b: u8) -> u8 {
    (a / 7).abs_diff(b / 7) + (a % 7).abs_diff(b % 7)
}
fn adjacent(cell: u8) -> Vec<u8> {
    (0..49).filter(|&c| distance(c, cell) == 1).collect()
}
pub fn setup() -> Setup {
    serde_json::from_str(CONTENT).expect("validated embedded Dock Fire")
}
pub fn validate_setup(s: &Setup) -> Result<(), String> {
    if s.rules_version != RULES_VERSION || s.route.len() != 4 || s.units.len() != 6 {
        return Err("Invalid introductory content".into());
    }
    let mut cells = Vec::new();
    for &c in s.walls.iter().chain(s.fire.iter()).chain(s.route.iter()) {
        if c >= 49 {
            return Err("Cell outside board".into());
        }
    }
    for w in s.route.windows(2) {
        if distance(w[0], w[1]) != 1 {
            return Err("Route must be orthogonal".into());
        }
    }
    for (i, u) in s.units.iter().enumerate() {
        if u.id as usize != i
            || u.cell >= 49
            || u.hp == 0
            || cells.contains(&u.cell)
            || s.walls.contains(&u.cell)
            || u.cell == s.route[0]
        {
            return Err("Invalid roster".into());
        }
        cells.push(u.cell);
    }
    let mut route = s.route.clone();
    route.sort();
    route.dedup();
    if route.len() != 4 || s.route.iter().any(|c| s.walls.contains(c)) {
        return Err("Invalid cart route".into());
    }
    Ok(())
}
pub fn start() -> State {
    let setup = setup();
    validate_setup(&setup).expect("valid content");
    let mut state = State {
        cart_cell: setup.route[0],
        fire: setup.fire.clone(),
        setup,
        round: 1,
        phase: "player".into(),
        cart_hp: 2,
        pushes: 0,
        pushed: false,
        burn_used: false,
        activated: vec![],
        orders: vec![],
        outcome: None,
        strikes: 0,
        log: ActionLog {
            rules_version: RULES_VERSION,
            commands: vec![],
        },
    };
    publish(&mut state);
    state
}
fn unit(s: &State, id: u8) -> Result<&Unit, String> {
    s.setup
        .units
        .get(id as usize)
        .filter(|u| u.hp > 0)
        .ok_or_else(|| "That unit is unavailable".into())
}
fn empty(s: &State, c: u8, moving: u8) -> bool {
    c < 49
        && c != s.cart_cell
        && !s.setup.walls.contains(&c)
        && !s
            .setup
            .units
            .iter()
            .any(|u| u.hp > 0 && u.id != moving && u.cell == c)
}
fn path_end(s: &State, u: &Unit, path: &[u8]) -> Result<u8, String> {
    if path.len() > u.movement as usize {
        return Err("That path is too long".into());
    }
    let mut previous = u.cell;
    let mut visited = vec![previous];
    for &c in path {
        if c >= 49 || distance(previous, c) != 1 {
            return Err("Move one orthogonal cell at a time".into());
        }
        if !empty(s, c, u.id) || visited.contains(&c) {
            return Err("That path is blocked".into());
        }
        visited.push(c);
        previous = c;
    }
    Ok(previous)
}
fn paths(s: &State, u: &Unit) -> Vec<(u8, Vec<u8>)> {
    let mut queue = VecDeque::from([(u.cell, vec![])]);
    let mut result = vec![];
    let mut seen = vec![u.cell];
    while let Some((c, path)) = queue.pop_front() {
        result.push((c, path.clone()));
        if path.len() == u.movement as usize {
            continue;
        }
        for n in adjacent(c) {
            if !seen.contains(&n) && empty(s, n, u.id) {
                let mut p = path.clone();
                p.push(n);
                seen.push(n);
                queue.push_back((n, p));
            }
        }
    }
    result
}
fn visible(s: &State, a: u8, b: u8) -> bool {
    // Burn Notice uses a short supercover ray, including both cells at a corner.
    let (mut x, mut y) = ((a % 7) as i16, (a / 7) as i16);
    let (tx, ty) = ((b % 7) as i16, (b / 7) as i16);
    let (dx, dy) = ((tx - x).abs(), (ty - y).abs());
    let (sx, sy) = ((tx - x).signum(), (ty - y).signum());
    let (mut ix, mut iy) = (0, 0);
    while x != tx || y != ty {
        let decision = (1 + 2 * ix) * dy - (1 + 2 * iy) * dx;
        if decision == 0 {
            if s.setup.walls.contains(&((y * 7 + x + sx) as u8))
                || s.setup.walls.contains(&(((y + sy) * 7 + x) as u8))
            {
                return false;
            }
            x += sx;
            y += sy;
            ix += 1;
            iy += 1;
        } else if decision < 0 {
            x += sx;
            ix += 1;
        } else {
            y += sy;
            iy += 1;
        }
        if s.setup.walls.contains(&((y * 7 + x) as u8)) {
            return false;
        }
    }
    true
}
fn target_cell(s: &State, target: u8) -> Result<u8, String> {
    if target == 6 {
        if s.cart_hp > 0 {
            Ok(s.cart_cell)
        } else {
            Err("The cart is destroyed".into())
        }
    } else {
        Ok(unit(s, target)?.cell)
    }
}
fn action_valid(s: &State, u: &Unit, endpoint: u8, action: &Action) -> Result<(), String> {
    match action {
        Action::Guard => Ok(()),
        Action::Push => {
            if u.side != "player" || distance(endpoint, s.cart_cell) != 1 {
                return Err("Stand beside the cart to push".into());
            }
            if s.pushed {
                return Err("The cart has already moved this round".into());
            }
            let next = *s
                .setup
                .route
                .get(s.pushes as usize + 1)
                .ok_or("The cart is delivered")?;
            if !empty(s, next, u.id) || next == endpoint {
                return Err("The cart route is occupied".into());
            }
            Ok(())
        }
        Action::Attack { target } => {
            if *target == 6 && u.side == "player" {
                return Err("Protect your cart".into());
            }
            if *target != 6 && unit(s, *target)?.side == u.side {
                return Err("Choose an opposing unit".into());
            }
            if distance(endpoint, target_cell(s, *target)?) != 1 {
                return Err("Attack an adjacent target".into());
            }
            Ok(())
        }
        Action::Burn { cell } => {
            if u.id != 0 || s.burn_used {
                return Err("Burn Notice is unavailable".into());
            }
            if *cell >= 49
                || distance(endpoint, *cell) > 2
                || !empty(s, *cell, u.id)
                || *cell == endpoint
                || !visible(s, endpoint, *cell)
                || s.fire.contains(cell)
            {
                return Err("Choose a visible empty cell within 2 steps".into());
            }
            Ok(())
        }
    }
}
pub fn choices(s: &State, id: u8, path: &[u8]) -> Result<Choices, String> {
    let u = unit(s, id)?;
    if s.outcome.is_some() || s.phase != "player" || u.side != "player" || s.activated.contains(&id)
    {
        return Err("Choose a ready crew member".into());
    }
    let endpoint = path_end(s, u, path)?;
    Ok(Choices {
        moves: paths(s, u)
            .into_iter()
            .map(|(cell, path)| OptionView { cell, path })
            .collect(),
        attacks: (0..6)
            .filter(|&target| action_valid(s, u, endpoint, &Action::Attack { target }).is_ok())
            .collect(),
        burns: (0..49)
            .filter(|&cell| action_valid(s, u, endpoint, &Action::Burn { cell }).is_ok())
            .collect(),
        push: action_valid(s, u, endpoint, &Action::Push).is_ok(),
    })
}
fn terminal(s: &mut State, events: &mut Vec<Event>) {
    let outcome = if s.pushes == 3 {
        Some("delivered")
    } else if s.cart_hp == 0 {
        Some("cart_lost")
    } else if s.setup.units[0].hp == 0 {
        Some("captain_lost")
    } else {
        None
    };
    if let Some(o) = outcome {
        s.outcome = Some(o.into());
        s.phase = "ended".into();
        events.push(Event::Ended { outcome: o.into() });
    }
}
fn damage(s: &mut State, target: u8, events: &mut Vec<Event>) {
    if target == 6 {
        s.cart_hp = s.cart_hp.saturating_sub(1);
        events.push(Event::Damaged {
            target,
            hp: s.cart_hp,
        });
    } else {
        let u = &mut s.setup.units[target as usize];
        if u.guard {
            u.guard = false;
            events.push(Event::Protected { unit: target });
        } else {
            u.hp = u.hp.saturating_sub(1);
            events.push(Event::Damaged { target, hp: u.hp });
        }
    }
    terminal(s, events);
}
fn execute(s: &mut State, id: u8, path: &[u8], action: &Action, events: &mut Vec<Event>) {
    if !path.is_empty() {
        events.push(Event::Moved {
            unit: id,
            path: path.to_vec(),
        });
    }
    for &c in path {
        s.setup.units[id as usize].cell = c;
        if s.fire.contains(&c) {
            damage(s, id, events);
            if s.outcome.is_some() || s.setup.units[id as usize].hp == 0 {
                return;
            }
        }
    }
    match action {
        Action::Guard => {
            s.setup.units[id as usize].guard = true;
            events.push(Event::Guarded { unit: id });
        }
        Action::Push => {
            let from = s.cart_cell;
            s.pushes += 1;
            s.cart_cell = s.setup.route[s.pushes as usize];
            s.pushed = true;
            events.push(Event::Pushed {
                from,
                to: s.cart_cell,
            });
            terminal(s, events);
        }
        Action::Attack { target } => damage(s, *target, events),
        Action::Burn { cell } => {
            s.burn_used = true;
            s.fire.push(*cell);
            events.push(Event::Ignited { cell: *cell });
        }
    }
}
fn publish(s: &mut State) {
    s.orders.clear();
    for id in 3..6 {
        let u = &s.setup.units[id];
        if u.hp == 0 || u.status != Status::Normal {
            continue;
        }
        // Introductory Dot order teaches a real fire-path clause. Later orders
        // advance toward the captain (Supervisor and Dot) or cart, with cell-index tie breaks.
        let target = if id == 3 || id == 4 { 0 } else { 6 };
        let objective = if target == 6 {
            s.cart_cell
        } else {
            s.setup.units[0].cell
        };
        let mut candidates = paths(s, u);
        candidates.retain(|(_, p)| !p.iter().any(|c| s.fire.contains(c)));
        candidates.sort_by_key(|(c, p)| (distance(*c, objective), p.len(), *c));
        let (endpoint, path) = if s.round == 1
            && id == 4
            && path_end(s, u, &[25]).is_ok()
            && action_valid(s, u, 25, &Action::Attack { target: 0 }).is_ok()
        {
            (25, vec![25])
        } else {
            candidates.first().cloned().unwrap_or((u.cell, vec![]))
        };
        let action = if action_valid(s, u, endpoint, &Action::Attack { target }).is_ok() {
            Action::Attack { target }
        } else {
            Action::Guard
        };
        let affected = match action {
            Action::Attack { target } => vec![target_cell(s, target).expect("living target")],
            _ => vec![],
        };
        s.orders.push(Order {
            unit: id as u8,
            start: u.cell,
            path,
            endpoint,
            action,
            affected,
            original_fire_violation: false,
        });
    }
}
fn end_phase(s: &mut State, events: &mut Vec<Event>) {
    s.phase = "enemy".into();
    // Enemy Guard from the previous phase protects until its next activation.
    for id in 3..6 {
        s.setup.units[id].guard = false;
    }
    let prior_strikers: Vec<u8> = s
        .setup
        .units
        .iter()
        .filter(|u| u.status == Status::Striking)
        .map(|u| u.id)
        .collect();
    for &id in &prior_strikers {
        s.setup.units[id as usize].status = Status::Recovering;
    }
    for order in s.orders.clone() {
        if s.outcome.is_some() {
            break;
        }
        let Ok(u) = unit(s, order.unit).cloned() else {
            continue;
        };
        if u.status != Status::Normal {
            continue;
        }
        if let Err(reason) = path_end(s, &u, &order.path) {
            s.setup.units[u.id as usize].guard = true;
            events.push(Event::Blocked { unit: u.id, reason });
            continue;
        }
        if u.fire_clause && !order.original_fire_violation {
            if let Some(&cell) = order
                .path
                .iter()
                .find(|c| s.fire.contains(c) && !s.setup.fire.contains(c))
            {
                s.setup.units[u.id as usize].status = Status::Striking;
                s.strikes += 1;
                events.push(Event::Strike { unit: u.id, cell });
                continue;
            }
        }
        if let Err(reason) = action_valid(s, &u, order.endpoint, &order.action) {
            s.setup.units[u.id as usize].guard = true;
            events.push(Event::Blocked { unit: u.id, reason });
            continue;
        }
        execute(s, u.id, &order.path, &order.action, events);
    }
    if s.outcome.is_some() {
        return;
    }
    for id in prior_strikers {
        s.setup.units[id as usize].status = Status::Normal;
        events.push(Event::Recovered { unit: id });
    }
    for u in &mut s.setup.units {
        if u.side == "player" {
            u.guard = false;
        }
    }
    s.fire = s.setup.fire.clone();
    if s.round == 5 {
        s.outcome = Some("time_up".into());
        s.phase = "ended".into();
        events.push(Event::Ended {
            outcome: "time_up".into(),
        });
        return;
    }
    s.round += 1;
    s.pushed = false;
    s.activated.clear();
    s.phase = "player".into();
    publish(s);
}
pub fn apply(s: &State, command: &Command) -> Result<Transition, String> {
    if s.outcome.is_some() || s.phase != "player" {
        return Err("This job has ended. Play again".into());
    }
    if s.log.commands.len() >= MAX_COMMANDS {
        return Err("Action limit reached".into());
    }
    // Validate against the original state; rejected commands never mutate it.
    if let Command::Activate {
        unit: id,
        path,
        action,
    } = command
    {
        let u = unit(s, *id)?;
        if u.side != "player" || s.activated.contains(id) {
            return Err("Choose a ready crew member".into());
        }
        let endpoint = path_end(s, u, path)?;
        action_valid(s, u, endpoint, action)?;
    }
    let mut state = s.clone();
    let mut events = vec![];
    state.log.commands.push(command.clone());
    match command {
        Command::EndPhase => end_phase(&mut state, &mut events),
        Command::Activate {
            unit: id,
            path,
            action,
        } => {
            state.activated.push(*id);
            if state.setup.units[*id as usize].fire_clause
                && path.iter().any(|c| state.fire.contains(c))
            {
                events.push(Event::Refused { unit: *id });
            } else {
                execute(&mut state, *id, path, action, &mut events);
            }
        }
    }
    Ok(Transition { state, events })
}
pub fn replay(log: &ActionLog) -> Result<Transition, String> {
    if log.rules_version != RULES_VERSION || log.commands.len() > MAX_COMMANDS {
        return Err("Unsupported or oversized action log".into());
    }
    let mut result = Transition {
        state: start(),
        events: vec![],
    };
    for command in &log.commands {
        let next = apply(&result.state, command)?;
        result.state = next.state;
        result.events.extend(next.events);
    }
    Ok(result)
}
pub fn canonical(log: &ActionLog) -> Result<Vec<u8>, String> {
    if log.commands.len() > MAX_COMMANDS
        || log
            .commands
            .iter()
            .any(|c| matches!(c,Command::Activate{path,..} if path.len()>3))
    {
        return Err("Oversized action log".into());
    }
    let bytes = borsh::to_vec(log).map_err(|e| e.to_string())?;
    if bytes.len() > 4096 {
        return Err("Oversized action log".into());
    }
    Ok(bytes)
}
