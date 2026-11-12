use game_core::{ActionLog, Command};
use wasm_bindgen::prelude::*;

fn serialize(value: &impl serde::Serialize) -> Result<String, JsValue> {
    serde_json::to_string(value).map_err(|e| JsValue::from_str(&e.to_string()))
}
fn decode_log(json: &str) -> Result<ActionLog, JsValue> {
    if json.len() > 16_384 {
        return Err(error("Oversized action log"));
    }
    let log: ActionLog = serde_json::from_str(json).map_err(error)?;
    game_core::canonical(&log).map_err(error)?;
    Ok(log)
}
fn error(e: impl ToString) -> JsValue {
    JsValue::from_str(&e.to_string())
}
#[wasm_bindgen]
pub fn start() -> Result<String, JsValue> {
    serialize(&game_core::start())
}
#[wasm_bindgen]
pub fn replay(log_json: &str) -> Result<String, JsValue> {
    let log = decode_log(log_json)?;
    serialize(&game_core::replay(&log).map_err(error)?)
}
#[wasm_bindgen]
pub fn apply(log_json: &str, command_json: &str) -> Result<String, JsValue> {
    let log = decode_log(log_json)?;
    let command: Command = serde_json::from_str(command_json).map_err(error)?;
    let prior = game_core::replay(&log).map_err(error)?;
    serialize(&game_core::apply(&prior.state, &command).map_err(error)?)
}
#[wasm_bindgen]
pub fn choices(log_json: &str, unit: u8, path_json: &str) -> Result<String, JsValue> {
    let log = decode_log(log_json)?;
    let path: Vec<u8> = serde_json::from_str(path_json).map_err(error)?;
    let prior = game_core::replay(&log).map_err(error)?;
    serialize(&game_core::choices(&prior.state, unit, &path).map_err(error)?)
}
#[wasm_bindgen]
pub fn canonical(log_json: &str) -> Result<Vec<u8>, JsValue> {
    let log = decode_log(log_json)?;
    game_core::canonical(&log).map_err(error)
}

#[wasm_bindgen]
pub fn content() -> Result<String, JsValue> {
    serialize(&game_core::bundle())
}
#[wasm_bindgen]
pub fn configure(config_json: &str) -> Result<String, JsValue> {
    let config: game_core::Configuration = serde_json::from_str(config_json).map_err(error)?;
    serialize(&game_core::start_config(&config).map_err(error)?)
}

#[wasm_bindgen]
pub fn configure_version(config_json: &str, version: u16) -> Result<String, JsValue> {
    let config: game_core::Configuration = serde_json::from_str(config_json).map_err(error)?;
    serialize(&game_core::start_config_version(&config, version).map_err(error)?)
}
#[wasm_bindgen]
pub fn content_version(version: u16) -> Result<String, JsValue> {
    serialize(&game_core::bundle_version(version).map_err(error)?)
}
#[wasm_bindgen]
pub fn simulate_kingdom(
    snapshot_json: &str,
    hours: u8,
    deliveries: bool,
) -> Result<String, JsValue> {
    use game_core::economy::{Objective, Stock};
    #[derive(serde::Deserialize)]
    struct Snapshot {
        stocks: [Stock; 3],
        treasuries: [String; 3],
    }
    if snapshot_json.len() > 4096 || hours > 24 {
        return Err(error("Preview exceeds one day"));
    }
    let snapshot: Snapshot = serde_json::from_str(snapshot_json).map_err(error)?;
    let mut stocks = snapshot.stocks;
    if stocks.iter().any(|s| s.supplies > 6) {
        return Err(error("Invalid stock"));
    }
    let mut treasuries = [0u128; 3];
    for (i, amount) in snapshot.treasuries.iter().enumerate() {
        treasuries[i] = amount.parse::<u128>().map_err(error)?;
    }
    let mut paid = [0u128; 3];
    let mut frames = vec![];
    for hour in 0..=hours {
        if hour > 0 {
            for (i, stock) in stocks.iter_mut().enumerate() {
                stock.advance(stock.updated_at.saturating_add(3600));
                if deliveries {
                    if let Some(payment) = stock
                        .payment(Objective::Routine)
                        .filter(|p| *p <= treasuries[i])
                    {
                        treasuries[i] -= payment;
                        paid[i] += payment;
                        stock.deliver();
                    }
                }
            }
        }
        frames.push(serde_json::json!({"stocks":stocks,"treasuries":treasuries.map(|n|n.to_string()),"paid":paid.map(|n|n.to_string())}));
    }
    serialize(&frames)
}

/// Recording parity uses chain timestamps, never an assumed block duration.
#[wasm_bindgen]
pub fn project_stock(stock_json: &str, now: u64, delivery: bool) -> Result<String, JsValue> {
    let mut stock: game_core::economy::Stock = serde_json::from_str(stock_json).map_err(error)?;
    if stock.supplies > game_core::economy::CAPACITY {
        return Err(error("Invalid stock"));
    }
    stock.advance(now);
    if delivery {
        stock.deliver();
    }
    serialize(&stock)
}

#[wasm_bindgen]
pub fn project_quote(
    base: &str,
    floor: &str,
    ceiling: &str,
    step: &str,
    pressure: u8,
    updated_at: u64,
    now: u64,
    idle_steps: u64,
) -> Result<String, JsValue> {
    let parse = |s: &str| s.parse::<u128>().map_err(error);
    let (base, floor, ceiling, step) = (parse(base)?, parse(floor)?, parse(ceiling)?, parse(step)?);
    if floor > ceiling {
        return Err(error("Invalid quote bounds"));
    }
    Ok(game_core::economy::automatic_quote(
        base,
        floor,
        ceiling,
        step,
        game_core::economy::decayed_pressure(pressure, updated_at, now),
        idle_steps,
    )
    .to_string())
}

#[wasm_bindgen]
pub fn stock_terms(stock_json: &str, town: usize) -> Result<String, JsValue> {
    use game_core::economy::{CAPACITY, Objective, Stock};
    let stock: Stock = serde_json::from_str(stock_json).map_err(error)?;
    if town >= 3 || stock.supplies > CAPACITY {
        return Err(error("Invalid town stock"));
    }
    let terms: Vec<_> = [Objective::Routine, Objective::Intact, Objective::Express].into_iter()
        .filter_map(|objective| stock.payment(objective).map(|payment| serde_json::json!({
            "objective": objective, "payment": payment.to_string(), "setup_ids": [stock.setup_id(town)]
        }))).collect();
    serialize(&terms)
}
