use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

pub const RULES_VERSION: u16 = 2;
pub const CONTENT_VERSION: u16 = 2;
pub const MAX_COMMANDS: usize = 32;
const CONTENT: &str = include_str!("../../../content/jobs.json");

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bundle {
    pub rules_version: u16,
    pub content_version: u16,
    pub setups: Vec<Setup>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Setup {
    pub rules_version: u16,
    pub content_version: u16,
    pub id: String,
    pub name: String,
    pub variant: String,
    pub description: String,
    pub route: Vec<u8>,
    pub walls: Vec<u8>,
    pub cover: Vec<u8>,
    pub walkable_cover: Vec<u8>,
    pub fire: Vec<u8>,
    pub smoke: Vec<u8>,
    pub policy: String,
    pub blast: Vec<u8>,
    pub units: Vec<Unit>,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    #[default]
    Normal,
    Striking,
    Recovering,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Package {
    #[default]
    None,
    Fire,
    Shouting,
    Friendly,
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
    pub package: Package,
    #[serde(default)]
    pub special_used: bool,
    #[serde(default)]
    pub borrowed: bool,
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
    Relocate { target: u8 },
    Certify { cell: u8 },
    Shove { target: u8, cell: u8 },
    Smoke { cell: u8 },
    Swap { target: u8 },
    CleanShot { target: u8 },
    Borrow { target: u8 },
    Blast { cell: u8 },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    Activate {
        unit: u8,
        path: Vec<u8>,
        action: Action,
    },
    BorrowedActivate {
        unit: u8,
        path: Vec<u8>,
        action: Action,
    },
    SkipBorrow {
        unit: u8,
    },
    EndPhase,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(deny_unknown_fields)]
pub struct Configuration {
    pub setup_id: String,
    pub placement: String,
    pub worker: u8,
    pub package_option: u8,
}
impl Default for Configuration {
    fn default() -> Self {
        Self {
            setup_id: "dock-fire-intro".into(),
            placement: "escort".into(),
            worker: 0,
            package_option: 0,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(deny_unknown_fields)]
pub struct ActionLog {
    pub rules_version: u16,
    pub content_version: u16,
    pub config: Configuration,
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
    pub original_violation: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Event {
    Moved { unit: u8, path: Vec<u8> },
    Guarded { unit: u8 },
    Pushed { from: u8, to: u8 },
    Ignited { cell: u8 },
    Smoked { cell: u8 },
    Certified { cell: u8 },
    Displaced { unit: u8, from: u8, to: u8 },
    Swapped { unit: u8, target: u8 },
    Borrowed { unit: u8 },
    Recovering { unit: u8 },
    Damaged { target: u8, hp: u8 },
    Protected { unit: u8, source: String },
    Strike { unit: u8, cell: u8, reason: String },
    Blocked { unit: u8, reason: String },
    Refused { unit: u8, reason: String },
    Recovered { unit: u8 },
    Attacked { unit: u8, affected: Vec<u8> },
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
    pub relocate_used: bool,
    pub certify_used: bool,
    pub fire: Vec<u8>,
    pub persistent_fire: Vec<u8>,
    pub smoke: Vec<u8>,
    pub certificates: Vec<u8>,
    pub activated: Vec<u8>,
    pub borrow_pending: Option<u8>,
    pub borrowed_unit: Option<u8>,
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
pub struct ActionOption {
    pub action: Action,
    pub cells: Vec<u8>,
}
#[derive(Serialize)]
pub struct Choices {
    pub moves: Vec<OptionView>,
    pub actions: Vec<ActionOption>,
}

pub fn bundle() -> Bundle {
    serde_json::from_str(CONTENT).expect("validated embedded content")
}
pub fn setup() -> Setup {
    bundle().setups.remove(0)
}
pub fn distance(a: u8, b: u8) -> u8 {
    (a / 7).abs_diff(b / 7) + (a % 7).abs_diff(b % 7)
}
fn adjacent(cell: u8) -> Vec<u8> {
    (0..49).filter(|&c| distance(c, cell) == 1).collect()
}
fn passable(s: &Setup, c: u8) -> bool {
    c < 49 && !s.walls.contains(&c) && (!s.cover.contains(&c) || s.walkable_cover.contains(&c))
}
pub fn validate_setup(s: &Setup) -> Result<(), String> {
    if s.rules_version != RULES_VERSION
        || s.content_version != CONTENT_VERSION
        || s.route.len() != 4
        || s.units.len() != 6
        || s.blast.iter().any(|id| !(3..6).contains(id))
        || !["dock", "bridge", "friday"].contains(&s.policy.as_str())
    {
        return Err("Unsupported authored content".into());
    }
    for cells in [
        &s.route,
        &s.walls,
        &s.cover,
        &s.walkable_cover,
        &s.fire,
        &s.smoke,
    ] {
        let mut unique = cells.clone();
        unique.sort();
        unique.dedup();
        if cells.iter().any(|&c| c >= 49) || unique.len() != cells.len() {
            return Err("Invalid terrain cells".into());
        }
    }
    if s.walkable_cover.iter().any(|c| !s.cover.contains(c))
        || s.cover.iter().any(|c| s.walls.contains(c))
        || s.fire.iter().chain(&s.smoke).any(|&c| !passable(s, c))
    {
        return Err("Conflicting terrain".into());
    }
    if s.route.windows(2).any(|w| distance(w[0], w[1]) != 1)
        || s.route.iter().any(|&c| !passable(s, c))
    {
        return Err("Invalid three-push route".into());
    }
    let mut occupied = vec![s.route[0]];
    for (i, u) in s.units.iter().enumerate() {
        let stats = match u.role.as_str() {
            "captain" | "supervisor" | "shieldbearer" => (3, 2),
            "courier" => (2, 3),
            "mage" => (2, 2),
            _ => return Err("Unknown role".into()),
        };
        if u.id as usize != i
            || (u.hp, u.movement) != stats
            || !passable(s, u.cell)
            || occupied.contains(&u.cell)
            || s.fire.contains(&u.cell)
            || u.side != if i < 3 { "player" } else { "enemy" }
            || u.status != Status::Normal
            || u.borrowed
            || u.special_used
            || u.guard
        {
            return Err("Invalid roster or spawn".into());
        }
        occupied.push(u.cell);
    }
    if s.units[0].role != "captain"
        || s.units[3].role != "supervisor"
        || [1, 2, 4, 5]
            .iter()
            .any(|&i| !["courier", "shieldbearer", "mage"].contains(&s.units[i].role.as_str()))
    {
        return Err("Invalid substitution slots".into());
    }
    Ok(())
}
pub fn start() -> State {
    start_config(&Configuration::default()).expect("valid default")
}
pub fn start_config(config: &Configuration) -> Result<State, String> {
    if config.setup_id.len() > 64
        || config.worker > 2
        || config.package_option > 1
        || !["escort", "infiltration"].contains(&config.placement.as_str())
    {
        return Err("Choose an approved house arrangement".into());
    }
    let mut setup = bundle()
        .setups
        .into_iter()
        .find(|s| s.id == config.setup_id)
        .ok_or("Unknown job variant")?;
    let slot = if config.placement == "escort" { 1 } else { 4 };
    let (name, role, hp, movement, packages) = match config.worker {
        0 => ("Rook", "courier", 2, 3, [Package::Fire, Package::Shouting]),
        1 => (
            "Mallow",
            "shieldbearer",
            3,
            2,
            [Package::Shouting, Package::Friendly],
        ),
        _ => ("Wisp", "mage", 2, 2, [Package::Friendly, Package::Fire]),
    };
    let u = &mut setup.units[slot];
    u.name = name.into();
    u.role = role.into();
    u.hp = hp;
    u.movement = movement;
    u.package = packages[config.package_option as usize];
    // Every arrangement replaces exactly one stable slot. The other house ally
    // remains authored; choosing Mallow instead supplies Wisp beside them.
    if config.placement == "escort" && config.worker == 1 {
        let u = &mut setup.units[2];
        u.name = "Wisp".into();
        u.role = "mage".into();
        u.hp = 2;
        u.movement = 2;
        u.package = Package::Fire;
    }
    validate_setup(&setup)?;
    let mut state = State {
        cart_cell: setup.route[0],
        fire: setup.fire.clone(),
        persistent_fire: setup.fire.clone(),
        smoke: setup.smoke.clone(),
        setup,
        round: 1,
        phase: "player".into(),
        cart_hp: 2,
        pushes: 0,
        pushed: false,
        burn_used: false,
        relocate_used: false,
        certify_used: false,
        certificates: vec![],
        activated: vec![],
        borrow_pending: None,
        borrowed_unit: None,
        orders: vec![],
        outcome: None,
        strikes: 0,
        log: ActionLog {
            rules_version: RULES_VERSION,
            content_version: CONTENT_VERSION,
            config: config.clone(),
            commands: vec![],
        },
    };
    publish(&mut state);
    Ok(state)
}
fn unit(s: &State, id: u8) -> Result<&Unit, String> {
    s.setup
        .units
        .get(id as usize)
        .filter(|u| u.hp > 0)
        .ok_or_else(|| "That unit is unavailable".into())
}
fn empty(s: &State, c: u8, moving: u8) -> bool {
    passable(&s.setup, c)
        && c != s.cart_cell
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
    for &c in path {
        if c >= 49 || distance(previous, c) != 1 {
            return Err("Move one orthogonal cell at a time".into());
        }
        if !empty(s, c, u.id) {
            return Err("That path is blocked".into());
        }
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
// Supercover includes both corner neighbours. This single ray serves tools,
// ordinary ranged attacks and Clean Shot; only their cover/unit policy differs.
fn ray(a: u8, b: u8) -> Vec<u8> {
    let (mut x, mut y) = ((a % 7) as i16, (a / 7) as i16);
    let (tx, ty) = ((b % 7) as i16, (b / 7) as i16);
    let (dx, dy) = ((tx - x).abs(), (ty - y).abs());
    let (sx, sy) = ((tx - x).signum(), (ty - y).signum());
    let (mut ix, mut iy) = (0, 0);
    let mut cells = vec![];
    while x != tx || y != ty {
        let decision = (1 + 2 * ix) * dy - (1 + 2 * iy) * dx;
        if decision == 0 {
            cells.push((y * 7 + x + sx) as u8);
            cells.push(((y + sy) * 7 + x) as u8);
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
        cells.push((y * 7 + x) as u8);
    }
    cells.sort();
    cells.dedup();
    cells
}
fn visible(s: &State, a: u8, b: u8) -> bool {
    ray(a, b)
        .iter()
        .all(|c| !s.setup.walls.contains(c) && !s.smoke.contains(c))
}
fn shot(s: &State, a: u8, b: u8, clean: bool, actor: u8) -> bool {
    let cells = ray(a, b);
    visible(s, a, b)
        && cells.iter().filter(|c| s.setup.cover.contains(c)).count() <= usize::from(clean)
        && !cells.iter().any(|&c| {
            c != b
                && s.setup
                    .units
                    .iter()
                    .any(|u| u.hp > 0 && u.id != actor && u.cell == c)
        })
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
fn friendly(s: &State, u: &Unit, target: u8) -> bool {
    target != 6
        && s.setup
            .units
            .get(target as usize)
            .is_some_and(|t| t.side == u.side)
}
fn pull_destination(a: u8, b: u8) -> Option<u8> {
    if distance(a, b) == 0 || distance(a, b) > 2 || !(a / 7 == b / 7 || a % 7 == b % 7) {
        None
    } else {
        Some(if a / 7 == b / 7 {
            if a < b { b - 1 } else { b + 1 }
        } else if a < b {
            b - 7
        } else {
            b + 7
        })
    }
}
fn area(action: &Action, s: &State) -> Vec<u8> {
    match action {
        Action::Attack { target } | Action::CleanShot { target } => {
            target_cell(s, *target).into_iter().collect()
        }
        Action::Blast { cell } => (0..49).filter(|&c| distance(c, *cell) <= 1).collect(),
        Action::Burn { cell }
        | Action::Smoke { cell }
        | Action::Certify { cell }
        | Action::Shove { cell, .. } => vec![*cell],
        Action::Relocate { target } | Action::Swap { target } | Action::Borrow { target } => {
            target_cell(s, *target).into_iter().collect()
        }
        Action::Push => s
            .setup
            .route
            .get(s.pushes as usize + 1)
            .copied()
            .into_iter()
            .collect(),
        _ => vec![],
    }
}
fn action_valid(s: &State, u: &Unit, endpoint: u8, action: &Action) -> Result<(), String> {
    let mut projected = s.clone();
    projected.setup.units[u.id as usize].cell = endpoint;
    let s = &projected;
    match action {
        Action::Guard => Ok(()),
        Action::Push => {
            if u.side != "player" && s.borrow_pending != Some(u.id) {
                return Err("Only your crew can push the cart".into());
            }
            if distance(endpoint, s.cart_cell) != 1 {
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
        Action::Attack { target } | Action::CleanShot { target } => {
            let clean = matches!(action, Action::CleanShot { .. });
            if clean && (u.package != Package::Friendly || u.special_used) {
                return Err("Clean Shot is unavailable".into());
            }
            if (*target == 6 && u.side == "player")
                || (*target != 6 && friendly(s, u, *target) && u.package != Package::Friendly)
                || *target == u.id
            {
                return Err("Choose an opposing unit".into());
            }
            let cell = target_cell(s, *target)?;
            let range = if clean {
                3
            } else if u.role == "mage" {
                2
            } else {
                1
            };
            if distance(endpoint, cell) == 0 || distance(endpoint, cell) > range {
                return Err(format!("Choose a target within {range} steps"));
            }
            if range > 1 && !shot(s, endpoint, cell, clean, u.id) {
                return Err("The shot is blocked by cover, smoke or a unit".into());
            }
            Ok(())
        }
        Action::Burn { cell } | Action::Smoke { cell } | Action::Certify { cell } => {
            if *cell >= 49 || distance(endpoint, *cell) > 2 || !visible(s, endpoint, *cell) {
                return Err("Choose a visible cell within 2 steps".into());
            }
            match action {
                Action::Burn { .. } => {
                    if u.id != 0 || s.burn_used {
                        return Err("Burn Notice is unavailable".into());
                    }
                    if !empty(s, *cell, u.id) || *cell == endpoint || s.fire.contains(cell) {
                        return Err("Choose an empty cell without fire".into());
                    }
                }
                Action::Smoke { .. } => {
                    if u.package != Package::Fire || u.special_used {
                        return Err("Smoke Break is unavailable".into());
                    }
                    if !passable(&s.setup, *cell) {
                        return Err("Choose an open tile".into());
                    }
                }
                _ => {
                    if u.id != 0 || s.certify_used {
                        return Err("Safety Certificate is unavailable".into());
                    }
                }
            }
            Ok(())
        }
        Action::Relocate { target } => {
            if u.id != 0 || s.relocate_used {
                return Err("Staff Relocation is unavailable".into());
            }
            let dest = pull_destination(endpoint, unit(s, *target)?.cell)
                .ok_or("Choose an aligned unit within 2 steps")?;
            if !empty(s, dest, *target) {
                return Err("There is no room to pull that unit".into());
            }
            Ok(())
        }
        Action::Shove { target, cell } => {
            if u.role != "shieldbearer" {
                return Err("Only a Shieldbearer can shove".into());
            }
            let t = unit(s, *target)?;
            if distance(endpoint, t.cell) != 1
                || *target == u.id
                || *cell >= 49
                || distance(t.cell, *cell) != 1
                || !empty(s, *cell, *target)
            {
                return Err("Shove an adjacent unit into an empty neighbouring cell".into());
            }
            Ok(())
        }
        Action::Swap { target } => {
            if u.package != Package::Shouting || u.special_used {
                return Err("Desk Swap is unavailable".into());
            }
            let t = unit(s, *target)?;
            if t.id == u.id
                || t.side != u.side
                || distance(endpoint, t.cell) > 2
                || s.fire.contains(&endpoint)
                || s.fire.contains(&t.cell)
                || !passable(&s.setup, endpoint)
                || !passable(&s.setup, t.cell)
            {
                return Err("Swap with a safe ally within 2 steps".into());
            }
            Ok(())
        }
        Action::Borrow { target } => {
            let t = unit(s, *target)?;
            if u.id != 0
                || t.side != "enemy"
                || t.status != Status::Striking
                || t.borrowed
                || distance(endpoint, t.cell) > 2
            {
                return Err("Borrow a fresh striking enemy within 2 steps".into());
            }
            Ok(())
        }
        Action::Blast { cell } => {
            if u.side != "enemy"
                || !s.setup.blast.contains(&u.id)
                || *cell >= 49
                || distance(endpoint, *cell) > 2
                || !visible(s, endpoint, *cell)
            {
                return Err("Blast is unavailable".into());
            }
            Ok(())
        }
    }
}
fn violation(s: &State, u: &Unit, path: &[u8], endpoint: u8, action: &Action) -> Option<String> {
    match u.package {
        Package::Fire if path.iter().any(|c| s.fire.contains(c)) => {
            Some("NOT ON THE FIRE: that path enters fire".into())
        }
        Package::Shouting
            if !path.is_empty()
                && !s.setup.units.iter().any(|a| {
                    a.hp > 0 && a.id != u.id && a.side == u.side && distance(endpoint, a.cell) <= 2
                }) =>
        {
            Some("WITHIN SHOUTING DISTANCE: no ally within 2 steps".into())
        }
        Package::Friendly
            if matches!(
                action,
                Action::Attack { .. } | Action::CleanShot { .. } | Action::Blast { .. }
            ) && s.setup.units.iter().any(|a| {
                a.hp > 0 && a.id != u.id && a.side == u.side && area(action, s).contains(&a.cell)
            }) =>
        {
            Some("ABSOLUTELY NO FRIENDLY FIRE: an ally is in the hit area".into())
        }
        _ => None,
    }
}
fn candidate_actions(s: &State) -> Vec<Action> {
    let mut actions = vec![Action::Guard, Action::Push];
    for target in 0..7 {
        actions.extend([
            Action::Attack { target },
            Action::CleanShot { target },
            Action::Relocate { target },
            Action::Swap { target },
            Action::Borrow { target },
        ]);
        if let Ok(t) = unit(s, target) {
            for cell in adjacent(t.cell) {
                actions.push(Action::Shove { target, cell });
            }
        }
    }
    for cell in 0..49 {
        actions.extend([
            Action::Burn { cell },
            Action::Smoke { cell },
            Action::Certify { cell },
        ]);
    }
    actions
}
fn ready(s: &State, id: u8, borrowed: bool) -> Result<&Unit, String> {
    let u = unit(s, id)?;
    if s.outcome.is_some() || s.phase != "player" || s.activated.contains(&id) {
        return Err("Choose a ready crew member".into());
    }
    if borrowed {
        if s.borrow_pending != Some(id) {
            return Err("No borrowed activation is pending".into());
        }
    } else if id >= 3 || u.side != "player" || s.borrow_pending.is_some() {
        return Err("Finish or skip the borrowed action first".into());
    }
    Ok(u)
}
pub fn choices(s: &State, id: u8, path: &[u8]) -> Result<Choices, String> {
    let u = ready(s, id, s.borrow_pending == Some(id))?;
    let endpoint = path_end(s, u, path)?;
    Ok(Choices {
        moves: paths(s, u)
            .into_iter()
            .map(|(cell, path)| OptionView { cell, path })
            .collect(),
        actions: candidate_actions(s)
            .into_iter()
            .filter(|a| action_valid(s, u, endpoint, a).is_ok())
            .map(|action| ActionOption {
                cells: area(&action, s),
                action,
            })
            .collect(),
    })
}
fn terminal(s: &mut State, events: &mut Vec<Event>) {
    let outcome = if s.setup.units[0].hp == 0 {
        Some("captain_lost")
    } else if s.cart_hp == 0 {
        Some("cart_lost")
    } else if s.pushes == 3 {
        Some("delivered")
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
    let cell = if target == 6 {
        s.cart_cell
    } else {
        s.setup.units[target as usize].cell
    };
    if s.phase == "enemy" {
        if let Some(i) = s.certificates.iter().position(|&c| c == cell) {
            s.certificates.remove(i);
            events.push(Event::Protected {
                unit: target,
                source: "Safety Certificate".into(),
            });
            return;
        }
        if target != 6 && s.setup.units[target as usize].guard {
            s.setup.units[target as usize].guard = false;
            events.push(Event::Protected {
                unit: target,
                source: "Guard".into(),
            });
            return;
        }
    }
    let hp = if target == 6 {
        &mut s.cart_hp
    } else {
        &mut s.setup.units[target as usize].hp
    };
    *hp = hp.saturating_sub(1);
    events.push(Event::Damaged { target, hp: *hp });
    terminal(s, events);
}
fn displace(s: &mut State, id: u8, to: u8, events: &mut Vec<Event>) {
    let from = s.setup.units[id as usize].cell;
    s.setup.units[id as usize].cell = to;
    events.push(Event::Displaced { unit: id, from, to });
    if s.fire.contains(&to) {
        damage(s, id, events);
    }
}
fn execute(s: &mut State, id: u8, path: &[u8], action: &Action, events: &mut Vec<Event>) {
    if !path.is_empty() {
        events.push(Event::Moved {
            unit: id,
            path: path.to_vec(),
        });
    }
    let mut burned = Vec::new();
    for &c in path {
        s.setup.units[id as usize].cell = c;
        if s.fire.contains(&c) && !burned.contains(&c) {
            burned.push(c);
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
        Action::Attack { target } | Action::CleanShot { target } => {
            if matches!(action, Action::CleanShot { .. }) {
                s.setup.units[id as usize].special_used = true;
            }
            events.push(Event::Attacked {
                unit: id,
                affected: area(action, s),
            });
            damage(s, *target, events);
        }
        Action::Burn { cell } => {
            s.burn_used = true;
            s.fire.push(*cell);
            events.push(Event::Ignited { cell: *cell });
        }
        Action::Smoke { cell } => {
            s.setup.units[id as usize].special_used = true;
            s.fire.retain(|c| c != cell);
            s.persistent_fire.retain(|c| c != cell);
            if !s.smoke.contains(cell) {
                s.smoke.push(*cell);
            }
            events.push(Event::Smoked { cell: *cell });
        }
        Action::Certify { cell } => {
            s.certify_used = true;
            s.certificates.push(*cell);
            events.push(Event::Certified { cell: *cell });
        }
        Action::Relocate { target } => {
            s.relocate_used = true;
            let to = pull_destination(
                s.setup.units[id as usize].cell,
                s.setup.units[*target as usize].cell,
            )
            .expect("validated pull");
            displace(s, *target, to, events);
        }
        Action::Shove { target, cell } => displace(s, *target, *cell, events),
        Action::Swap { target } => {
            s.setup.units[id as usize].special_used = true;
            let from = s.setup.units[id as usize].cell;
            s.setup.units[id as usize].cell = s.setup.units[*target as usize].cell;
            s.setup.units[*target as usize].cell = from;
            events.push(Event::Swapped {
                unit: id,
                target: *target,
            });
        }
        Action::Borrow { target } => {
            let t = &mut s.setup.units[*target as usize];
            t.borrowed = true;
            t.status = Status::Recovering;
            t.side = "player".into();
            s.borrow_pending = Some(*target);
            s.borrowed_unit = Some(*target);
            events.push(Event::Borrowed { unit: *target });
        }
        Action::Blast { .. } => {
            let cells = area(action, s);
            events.push(Event::Attacked {
                unit: id,
                affected: cells.clone(),
            });
            // Freeze victims before damage. Stable slot order handles terminal
            // knockouts immediately; later victims cannot undo a terminal result.
            let mut victims: Vec<u8> = s
                .setup
                .units
                .iter()
                .filter(|u| u.hp > 0 && cells.contains(&u.cell))
                .map(|u| u.id)
                .collect();
            if cells.contains(&s.cart_cell) {
                victims.push(6);
            }
            for target in victims {
                damage(s, target, events);
                if s.outcome.is_some() {
                    break;
                }
            }
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
        // Fixed policy: Dock/Bridge specialist pressures the captain, shield
        // pressures the cart; Friday all units pressure the captain. Special
        // priority is Clean Shot at the objective, extinguish a burning next
        // route cell, then swap to improve objective distance, then basic/blast.
        // Ties: distance, path length, endpoint cell, action target ID.
        let target = if s.setup.policy == "friday" || id == 3 || id == 4 {
            0
        } else {
            6
        };
        let objective = target_cell(s, target).expect("live objective");
        let mut candidates = paths(s, u);
        candidates.retain(|(_, p)| !p.iter().any(|c| s.fire.contains(c)));
        candidates.sort_by_key(|(c, p)| (distance(*c, objective), p.len(), *c));
        let mut selected = None;
        if s.setup.id == "dock-fire-intro"
            && s.round == 1
            && id == 4
            && path_end(s, u, &[25]).is_ok()
        {
            let a = Action::Attack { target: 0 };
            if action_valid(s, u, 25, &a).is_ok() && violation(s, u, &[25], 25, &a).is_none() {
                selected = Some((25, vec![25], a));
            }
        }
        for (endpoint, path) in candidates {
            if selected.is_some() {
                break;
            }
            let mut options = vec![Action::CleanShot { target }];
            if let Some(&cell) = s.setup.route.get(s.pushes as usize + 1)
                && s.fire.contains(&cell)
            {
                options.push(Action::Smoke { cell });
            }
            let mut allies: Vec<_> = s
                .setup
                .units
                .iter()
                .filter(|a| {
                    a.hp > 0
                        && a.side == u.side
                        && a.id != u.id
                        && distance(a.cell, objective) < distance(endpoint, objective)
                })
                .collect();
            allies.sort_by_key(|a| (a.cell, a.id));
            options.extend(allies.into_iter().map(|a| Action::Swap { target: a.id }));
            if s.setup.blast.contains(&(id as u8)) {
                options.push(Action::Blast { cell: objective });
            }
            options.extend([Action::Attack { target }, Action::Guard]);
            if let Some(action) = options.into_iter().find(|a| {
                action_valid(s, u, endpoint, a).is_ok()
                    && violation(s, u, &path, endpoint, a).is_none()
            }) {
                selected = Some((endpoint, path, action));
            }
        }
        let (endpoint, path, action) = selected.unwrap_or((u.cell, vec![], Action::Guard));
        // Even the stationary fallback must satisfy its package. If no legal
        // employer order exists there is no posted order, hence no free strike.
        if violation(s, u, &path, endpoint, &action).is_some() {
            continue;
        }
        s.orders.push(Order {
            unit: id as u8,
            start: u.cell,
            path,
            endpoint,
            affected: area(&action, s),
            action,
            original_violation: false,
        });
    }
}
fn end_phase(s: &mut State, events: &mut Vec<Event>) {
    s.phase = "enemy".into();
    // Classify against the end of the player phase, before any enemy moves.
    // A later enemy displacement must never create a player-caused strike.
    let refusals: Vec<_> = s
        .orders
        .iter()
        .map(|o| {
            let u = &s.setup.units[o.unit as usize];
            if u.hp > 0 && !o.original_violation && path_end(s, u, &o.path).is_ok() {
                violation(s, u, &o.path, o.endpoint, &o.action)
            } else {
                None
            }
        })
        .collect();
    let recovering: Vec<_> = s
        .setup
        .units
        .iter()
        .filter(|u| u.status != Status::Normal)
        .map(|u| u.id)
        .collect();
    for &id in &recovering {
        s.setup.units[id as usize].status = Status::Recovering;
        events.push(Event::Recovering { unit: id });
    }
    for (order, refusal) in s.orders.clone().into_iter().zip(refusals) {
        if s.outcome.is_some() {
            break;
        }
        let Ok(u) = unit(s, order.unit).cloned() else {
            continue;
        };
        if u.status != Status::Normal {
            continue;
        }
        if let Some(reason) = refusal {
            s.setup.units[u.id as usize].status = Status::Striking;
            s.strikes += 1;
            let cell = order
                .path
                .iter()
                .find(|c| s.fire.contains(c))
                .copied()
                .unwrap_or(order.endpoint);
            events.push(Event::Strike {
                unit: u.id,
                cell,
                reason,
            });
            continue;
        }
        if let Err(reason) = path_end(s, &u, &order.path).and_then(|end| {
            if let Some(reason) = violation(s, &u, &order.path, end, &order.action) {
                return Err(reason);
            }
            action_valid(s, &u, end, &order.action)
        }) {
            s.setup.units[u.id as usize].guard = true;
            events.push(Event::Blocked { unit: u.id, reason });
            continue;
        }
        execute(s, u.id, &order.path, &order.action, events);
    }
    if s.outcome.is_some() {
        return;
    }
    if let Some(id) = s.borrowed_unit.take() {
        s.setup.units[id as usize].side = "enemy".into();
    }
    for id in recovering {
        s.setup.units[id as usize].status = Status::Normal;
        events.push(Event::Recovered { unit: id });
    }
    for u in &mut s.setup.units {
        u.guard = false;
    }
    s.fire = s.persistent_fire.clone();
    s.smoke = s.setup.smoke.clone();
    s.certificates.clear();
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
    match command {
        Command::Activate {
            unit: id,
            path,
            action,
        }
        | Command::BorrowedActivate {
            unit: id,
            path,
            action,
        } => {
            let u = ready(s, *id, matches!(command, Command::BorrowedActivate { .. }))?;
            let endpoint = path_end(s, u, path)?;
            action_valid(s, u, endpoint, action)?;
        }
        Command::SkipBorrow { unit } => {
            if s.borrow_pending != Some(*unit) {
                return Err("No borrowed action to skip".into());
            }
        }
        Command::EndPhase => {
            if s.borrow_pending.is_some() {
                return Err("Finish or skip the borrowed action first".into());
            }
        }
    }
    let mut state = s.clone();
    let mut events = vec![];
    state.log.commands.push(command.clone());
    match command {
        Command::EndPhase => end_phase(&mut state, &mut events),
        Command::SkipBorrow { unit } => {
            state.borrow_pending = None;
            state.activated.push(*unit);
        }
        Command::Activate {
            unit: id,
            path,
            action,
        }
        | Command::BorrowedActivate {
            unit: id,
            path,
            action,
        } => {
            state.activated.push(*id);
            let endpoint = path_end(s, &s.setup.units[*id as usize], path)?;
            if let Some(reason) = violation(s, &s.setup.units[*id as usize], path, endpoint, action)
            {
                events.push(Event::Refused { unit: *id, reason });
            } else {
                execute(&mut state, *id, path, action, &mut events);
            }
            if matches!(command, Command::BorrowedActivate { .. }) {
                state.borrow_pending = None;
            }
        }
    }
    Ok(Transition { state, events })
}
pub fn replay(log: &ActionLog) -> Result<Transition, String> {
    canonical(log)?;
    let mut result = Transition {
        state: start_config(&log.config)?,
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
    let oversized_path = log.commands.iter().any(|command| match command {
        Command::Activate { path, .. } | Command::BorrowedActivate { path, .. } => path.len() > 3,
        _ => false,
    });
    if log.rules_version != RULES_VERSION
        || log.content_version != CONTENT_VERSION
        || log.config.setup_id.len() > 64
        || log.commands.len() > MAX_COMMANDS
        || oversized_path
    {
        return Err("Unsupported or oversized action log".into());
    }

    let bytes = borsh::to_vec(log).map_err(|e| e.to_string())?;
    if bytes.len() > 4096 {
        return Err("Oversized action log".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn published_orders_are_legal_for_every_configuration() {
        for setup in bundle().setups {
            for placement in ["escort", "infiltration"] {
                for worker in 0..3 {
                    for package_option in 0..2 {
                        let s = start_config(&Configuration {
                            setup_id: setup.id.clone(),
                            placement: placement.into(),
                            worker,
                            package_option,
                        })
                        .unwrap();
                        for order in &s.orders {
                            let u = unit(&s, order.unit).unwrap();
                            assert_eq!(path_end(&s, u, &order.path).unwrap(), order.endpoint);
                            action_valid(&s, u, order.endpoint, &order.action).unwrap();
                            assert!(
                                violation(&s, u, &order.path, order.endpoint, &order.action)
                                    .is_none()
                            );
                        }
                    }
                }
            }
        }
    }
    #[test]
    fn enemy_package_priority_is_real_and_deterministic() {
        let mut s = start();
        s.round = 2;
        s.setup.units[5].cell = 25;
        s.fire = vec![30];
        s.setup.units[4].cell = 24;
        publish(&mut s);
        assert!(
            s.orders
                .iter()
                .any(|o| o.unit == 4 && matches!(o.action, Action::Smoke { cell: 30 }))
        );
        s.fire.clear();
        s.setup.units[4].cell = 4;
        s.setup.units[4].package = Package::Shouting;
        s.setup.units[5].cell = 25;
        publish(&mut s);
        assert!(
            s.orders
                .iter()
                .any(|o| o.unit == 4 && matches!(o.action, Action::Swap { target: 5 }))
        );
        s.setup.units[4].package = Package::Friendly;
        s.setup.units[4].cell = 18;
        s.setup.units[5].cell = 20;
        publish(&mut s);
        assert!(
            s.orders
                .iter()
                .any(|o| o.unit == 4 && matches!(o.action, Action::CleanShot { target: 0 }))
        );
        let orders = s.orders.clone();
        publish(&mut s);
        assert_eq!(orders, s.orders);
    }
}
