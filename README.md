# Mutiny: The Fine Print

A small tactics game about a kingdom's payroll and its workers' terms. Deliver the cart across nine authored setups in **Dock Fire**, **Bridge Audit**, and **Friday, Again**. Choose a house crew and fine print, read posted orders, and win through delivery, combat, or a well-earned strike and Borrow. Free Play needs no wallet or RPC.

The Captain's Ledger tracks local attempts, clears, goals, and previous/fastest results. Progress stays in this browser; clearing browser data or changing devices loses it. After the production build finishes installing its offline files, Free Play also works through an offline refresh.

## Run

Install Node.js 24.22.1, pnpm 12.16.1, and Rust via rustup. The repository pins the Rust toolchain and Wasm target.

```sh
cargo install wasm-bindgen-cli --version 0.2.105 --locked
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` and `pnpm build` compile the shared Rust engine to browser Wasm. Progress is saved on this browser when IndexedDB is available.

`pnpm build` produces the complete static site in `app/dist`, including offline Free Play. Preview with `pnpm --filter @mutiny/app preview`. Deploy that directory to a static host after building with the prerequisites above. Deployment and further playtest-driven polish are deferred.

```sh
pnpm contract:build
cargo test --workspace --locked
pnpm test
pnpm test:parity
pnpm lint
pnpm build
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test:e2e
MUTINY_PREVIEW=1 pnpm test:e2e --grep "production offline"
```

## Companies (NEAR testnet)

Start as a renter, choose funded work, hire a specialist, and run a three-job dispatch. Two verified commission deliveries earn a charter and open additional route variants. Any company can take intact-cart or express work. Your first delivery puts a sign on the office; the charter improves it. Company funds and dispatches persist onchain. Free Play and its local Ledger remain wallet-free.

**Restore the Royal Supply Route** has nine shared delivery slots: three routine; two routine and one intact-cart; two routine and one express. Routine work pays 0.05 testnet NEAR; premium work pays 0.075. The developer sponsors each finite batch with 0.5 testnet NEAR. Booking reserves a delivery slot and one worker. Verified delivery credits withdrawable company funds; use them for another hire or withdraw to your wallet. Failure or expiry consumes the dispatch leg and releases the commission. The hire fee stays paid. New supply batches need fresh funding; there is no automatic money faucet or game token.

Six replacement NFT workers offer two independently priced packages each. Choose Escort or Infiltration and inspect the actual crew. Hires send 95% to the worker's separate account and 5% to the Hall. Owners may use their idle workers without a hire fee. Every job also requires a **0.03 testnet NEAR storage deposit**, plus gas; actual retained storage is charged and unused storage returned. Before activation, cancellation restores the company and wallet hire portions to their original sources after worker-credit reversal. Company-job cancellation retains its actual record storage.

Battles run locally without per-move signatures. **Save Job** replays the Rust engine onchain before accepting a result, paying a commission, or advancing progress. Local battles can be rehearsed or automated; replay proves a valid delivery, not human effort or a single attempt. Seeded workers and sponsored testnet payments demonstrate mechanics, not organic demand or guaranteed returns.

The replacement Registry is `v3.mutiny-company-2026.testnet`. Set `VITE_REGISTRY_ID` to a compatible company deployment; see [the public example](app/.env.example). The **Previous deployment** link opens `m5.mutiny-m5-2026.testnet` for its jobs and claims. Old NFTs, ownership, earnings, and history do not migrate to the replacement collection. Both deployments use six distinct worker subaccounts named after their tokens.

Verified on testnet: [express delivery and commission](https://testnet.nearblocks.io/txns/G5JafaJAGNk4ZDVr8vBQw5feaL4pziFGjSBMHLjyBzE2), [company withdrawal](https://testnet.nearblocks.io/txns/DDMeu2Zc4H9xnFyYWUCuLX9mBQFyqwnBowRLrA38s3PY). The nine-job verification exhausted the first batch; a separate sponsor transaction funded the next one.

Moves and pending requests survive refresh. **Check status**, **Check payment**, and **Check claim** recover interrupted operations. A pending withdrawal remains locked until its actual outcome is known; timeout never authorizes another transfer. Worker title can change during a shift without invalidating the renter's frozen rights. Only the current owner can initiate a worker earnings claim. Claims exclude staged credits, donations, and protected reserves.

Registry and worker accounts are keyless and immutable. The deployment operator may enable payments and attest FINAL native-transfer receipts when callbacks are lost. **This recovery authority is trusted:** falsely attesting failure can permit duplicate payment. Company recovery uses `repair_company_withdrawal` with the original account and withdrawal ID. Existing worker/refund recovery uses `repair_native_callback`. Verify FINAL receipts first; never attest failure for a pending transfer. There is no general project or Hall treasury withdrawal.

## Contract verification and deployment

Build contracts before Rust workspace tests: Registry embeds Worker Wasm. Use the official [NEAR sandbox 2.14.0](https://github.com/near/nearcore/releases/tag/2.14.0) binary and [NEAR CLI](https://docs.near.org/tools/cli).

```sh
pnpm contract:build
cargo test --workspace --locked
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:sandbox
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:paid
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:market
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:company
# Creates a new immutable Registry and six replacement workers; sponsors one batch.
# Requires 36.5 testnet NEAR plus gas from the named owner.
bash scripts/deploy-testnet.sh your-owner.testnet
# Signs a nine-delivery demonstration and withdrawal using your three accounts.
MUTINY_TESTNET_OWNER=your-owner.testnet MUTINY_TESTNET_RENTER=your-bob.testnet \
  MUTINY_TESTNET_CAROL=your-carol.testnet MUTINY_ENABLE_COMPANY=1 \
  node scripts/testnet-company.mjs
```

New company bookings start disabled. Measure settlement gas and storage with `test:company`, publish offers and run worker funding checks, then enable the tested deployment with `set_economy_enabled`. The browser attaches 200 Tgas and enforces 32 commands / 4 KiB per replay. Leases last 2,400 blocks after activation with 20 blocks of rest. Advertised hire fees remain within 0.001–1 testnet NEAR.

Built with React, Vite, Tailwind CSS, PixiJS, wasm-bindgen, near-sdk and HOT Connect. Atkinson Hyperlegible Next and Fraunces are bundled under their included SIL Open Font Licenses.
IBM Plex Mono uses the SIL Open Font License; Phosphor icons use MIT. Painted scenery, characters and props were generated with OpenAI imagegen and are bundled locally. Asset layout and generation briefs are in `app/public/assets/art/manifest.json`. The game has no audio dependency.
