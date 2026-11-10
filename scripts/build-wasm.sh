#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v wasm-bindgen >/dev/null 2>&1; then
  echo "Missing wasm-bindgen. Install the CLI matching crates/game-web/Cargo.toml:" >&2
  echo "  cargo install wasm-bindgen-cli --version 0.2.105 --locked" >&2
  echo 'Ensure "$HOME/.cargo/bin" is on PATH, then retry.' >&2
  exit 127
fi
cargo build --locked -p game-web --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/game_web.wasm --target web --out-dir app/src/game/wasm
