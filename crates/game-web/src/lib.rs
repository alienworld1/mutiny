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
