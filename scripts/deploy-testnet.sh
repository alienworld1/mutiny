#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
owner="${1:?Usage: bash scripts/deploy-testnet.sh owner.testnet}"
[[ "$owner" == *.testnet ]] || { echo "Use a named testnet owner." >&2; exit 1; }
registry="m3.$owner"
pnpm --config.verifyDepsBeforeRun=false contract:build
# Atomic creation/deployment/initialization, deliberately without an access key.
# This deployment is immutable. The owner keeps its existing contract and access keys.
near transaction construct-transaction "$owner" receiver-id "$registry" \
  add-action create-account add-action transfer '14 NEAR' \
  add-action deploy-contract use-file target/wasm32-unknown-unknown/release/registry.wasm \
  with-init-call new json-args "{\"owner_id\":\"$owner\",\"worker_account\":\"rook.$registry\"}" \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' skip \
  network-config testnet sign-with-keychain send
