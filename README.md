# Mutiny: The Fine Print

A small tactics game about a kingdom's payroll and its workers' terms. Deliver a cart across nine encounters, read posted enemy orders, and turn fine print into strikes and borrowed help. **Play Free** needs no wallet or RPC and saves progress in this browser.

Company play supplies a shared kingdom on NEAR testnet. Deliveries replenish towns and permanently restore destinations. Towns consume supplies every 30 minutes; shortages change encounter variants, delivery terms, and payments. Choose ordinary work or a premium intact-cart/express delivery, then hire a crew for the plan.

## Run

Use Node.js 24.22.1, pnpm 12.16.1, and the pinned Rust toolchain.

```sh
cargo install wasm-bindgen-cli --version 0.2.105 --locked
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm build` creates `app/dist`. Once its offline assets finish installing, Free Play supports offline refresh and resume. Clearing browser data loses local progress. Company records stay onchain.

## The economy

Six NFT workers each hold paid-hire earnings in a separate keyless NEAR account. Two package offers share one worker's availability. Owners may post automatic price policies: confirmed paid hires raise bounded demand pressure, while time and idle availability reduce the ask. Owners retain offer, claim, self-use, and transfer rights. Hiring sends 95% to the worker and 5% to the Hall.

Booking freezes the route, delivery terms, hire price, and payment, reserving both town capacity and the full commission. Battles run locally; **Save Job** replays the same Rust rules onchain. Accepted delivery pays withdrawable company funds and adds one supply. Defeat, unmet terms, and expiry pay nothing; the activated hire fee stays spent. Rehearsal and retries are possible: replay proves a valid solution, not human effort or a binding first attempt.

Town treasuries start with explicitly contributed testnet funds. Anyone can make a nonrefundable contribution, with no ownership or promised return. An underfunded town stops booking. Consumption creates demand but does not mint money. The accelerated **Simulation** forecasts supply and finite treasury changes without touching live funds.

The live Registry is `v4r1.mutiny-company-2026.testnet`; see [public configuration](app/.env.example). The previous-company link preserves v3 funds, jobs, and claims; the previous-worker link preserves m5 rights. The disabled first kingdom test deployment remains accessible with `?market=company-v4` for its funds and claims. Replacement NFTs inherit no earlier ownership, earnings, or history. Workers and activity are seeded demonstrations, not evidence of organic demand or sustainable returns.

Each job also reserves **0.03 testnet NEAR for storage**, plus gas. Unused storage returns after closing. Unactivated cancellation restores hire funds to their original company/wallet sources after worker-credit reversal. Interrupted operations have status/recovery controls. Unknown transfer outcomes never authorize a second payment.

Contracts are keyless and immutable. The deployment operator can enable payments and attest finalized native-transfer outcomes when callbacks are lost. **This recovery authority is trusted:** falsely attesting failure can permit duplicate payment. Worker claims use `repair_native_callback`; company withdrawals use `repair_company_withdrawal`. Check final receipts before recovery. There is no general treasury withdrawal.

Verified on testnet: [delivery and commission](https://testnet.nearblocks.io/txns/7KfR8RakH8TxiEy6Kfq4b32ZM3wTFRtE2zMajA2Vry83), [company withdrawal](https://testnet.nearblocks.io/txns/3UkEdTBeVvsFHArvxETRBTXjZnuLfsqBPmzc5peYmnH6).

## Verify and deploy

```sh
pnpm contract:build
cargo test --workspace --locked
pnpm test
pnpm lint
pnpm test:parity
pnpm test:kingdom
pnpm build
pnpm test:e2e
MUTINY_PREVIEW=1 pnpm test:e2e --project=chromium --grep "production offline"
```

Use the official [NEAR sandbox 2.14.0](https://github.com/near/nearcore/releases/tag/2.14.0) binary for `test:sandbox`, `test:paid`, `test:market`, and `test:company`:

```sh
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:company
# Creates a fresh immutable Registry and six workers; contributes 1 NEAR per town.
# Needs 39 testnet NEAR plus gas. Paid bookings start disabled.
bash scripts/deploy-testnet.sh your-owner.testnet
# Seeds automatic offers and signs a two-company demonstration.
MUTINY_TESTNET_OWNER=your-owner.testnet MUTINY_TESTNET_RENTER=your-bob.testnet \
  MUTINY_TESTNET_CAROL=your-carol.testnet MUTINY_ENABLE_KINGDOM=1 \
  node scripts/testnet-kingdom.mjs
```

Run sandbox gas/storage and recovery checks before enabling bookings. The browser budgets 200 Tgas and caps replay at 32 commands / 4 KiB. Leases last 2,400 blocks after activation; workers rest for 20 blocks. Advertised hire fees remain within 0.001–1 testnet NEAR.

Built with React, Vite, Tailwind CSS, PixiJS, wasm-bindgen, near-sdk, and HOT Connect. Bundled fonts use SIL Open Font Licenses; Phosphor icons use MIT. Painted assets were generated with OpenAI imagegen; their manifest is in `app/public/assets/art/manifest.json`.
