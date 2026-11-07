#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --locked -p game-web --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/game_web.wasm --target web --out-dir app/src/game/wasm
