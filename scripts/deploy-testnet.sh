#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
owner="${1:?Usage: bash scripts/deploy-testnet.sh owner.testnet}"
[[ "$owner" == *.testnet ]] || { echo "Use a named testnet owner." >&2; exit 1; }
registry="${MUTINY_DEPLOYMENT_TAG:-v4r1}.$owner"
pnpm --config.verifyDepsBeforeRun=false contract:build
# Atomic creation/deployment/initialization, deliberately without an access key.
# This deployment is immutable. The owner keeps its existing contract and access keys.
near transaction construct-transaction "$owner" receiver-id "$registry" \
  add-action create-account add-action transfer '36 NEAR' \
  add-action deploy-contract use-file target/wasm32-unknown-unknown/release/registry.wasm \
  with-init-call new json-args "{\"owner_id\":\"$owner\",\"worker_account\":\"rook.$registry\"}" \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' skip \
  network-config testnet sign-with-keychain send

# One atomic account+code deployment per call stays within the chain gas limit.
for token in rook mallow nix dot brisk peebles; do
  near contract call-function as-transaction "$registry" provision_worker \
    json-args "{\"token_id\":\"$token\"}" prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
    sign-as "$owner" network-config testnet sign-with-keychain send
done

# Explicitly backed town treasuries. No batch reset or automatic money faucet.
for town in 0 1 2; do
  near contract call-function as-transaction "$registry" fund_town \
    json-args "{\"town_id\":$town,\"expected_contributed\":\"0\"}" prepaid-gas '100 Tgas' attached-deposit '1 NEAR' \
    sign-as "$owner" network-config testnet sign-with-keychain send
done
