#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs |
    sh -s -- -y --profile minimal --default-toolchain none --no-modify-path
fi

# Cargo uses rust-toolchain.toml, including the browser Wasm target.
cargo --version
bindgen_version="$(sed -n 's/^wasm-bindgen = "=\([^"]*\)"$/\1/p' crates/game-web/Cargo.toml)"
if [[ -z "$bindgen_version" ]]; then
  echo "Missing exact wasm-bindgen version in crates/game-web/Cargo.toml" >&2
  exit 1
fi
if ! command -v wasm-bindgen >/dev/null 2>&1 ||
  [[ "$(wasm-bindgen --version)" != "wasm-bindgen $bindgen_version" ]]; then
  cargo install wasm-bindgen-cli --version "$bindgen_version" --locked --force
fi

pnpm run build
