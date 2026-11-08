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

```sh
pnpm contract:build
cargo test --workspace --locked
pnpm test
pnpm test:parity
pnpm lint
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
MUTINY_PREVIEW=1 pnpm test:e2e --grep "production offline"
```

## Contract Jobs (NEAR testnet)

In **Contract Job**, Rook’s owner can post one **Not On The Fire** offer. A different wallet can review the current fee, choose Escort or Infiltration, and **Hire**. The worker account receives 95% of the fee (with integer rounding); the Hall keeps 5%. Payment reserves the NFT globally. **Resume Job** appears only after the Registry confirms activation. Play locally, then **Save Job**: the immutable Registry replays the same Rust rules before recording the result.

Each job also requires a separate **0.03 testnet NEAR storage deposit**, plus wallet gas. Saving or expiring an active job charges actual retained storage and returns the rest. The lease lasts 2,400 blocks from activation, followed by 20 blocks of rest. The owner can use either immutable package without a hire fee or rental earnings. Battle results never change the fee or pay rewards.

Pending jobs and moves survive refresh in IndexedDB. Use **Check status**, **Check payment**, or **Check claim** to recover. Before activation, **Cancel hire** returns the full fee and storage deposit after the staged worker credit is returned. An uncertain transfer stays locked; a timeout never triggers a second payment. **Claim** pays only recognized worker earnings above its storage/reserve floor, excluding staged credits and direct donations. NFT title cannot transfer during an unresolved claim.

Seeded demonstration owner/operator: `mutiny-m4-safe-2026.testnet`; independent renter: `mutiny-m4-safe-renter-2026.testnet`. Registry: [`m4.mutiny-m4-safe-2026.testnet`](https://testnet.nearblocks.io/address/m4.mutiny-m4-safe-2026.testnet). Worker: [`rook.m4.mutiny-m4-safe-2026.testnet`](https://testnet.nearblocks.io/address/rook.m4.mutiny-m4-safe-2026.testnet). These are controlled test accounts, with no claim of organic demand. One worker and one paid option are implemented; the six-worker market is not yet available. Set `VITE_REGISTRY_ID` to another compatible testnet Registry if needed.

Both contract accounts are keyless and immutable. The original deployment operator can enable paid hiring after resource tests and a worker-funding check. It can also attest a finalized native-transfer receipt when its callback was lost. **This recovery authority is trusted:** a false failure attestation can allow duplicate payment. It cannot change the original recipient or amount, withdraw arbitrary funds, or change NFT ownership. The Hall’s earned share remains in Registry; there is no treasury withdrawal method.

For a missing native callback, inspect the transaction’s **FINAL** receipts and the matching job/claim ID first. The original operator may call `repair_native_callback({job_id, succeeded, receipt_id})`, using a job ID for a refund or `null` for the current claim. `succeeded` must match the original transfer receipt. Then use **Check claim** or, only after confirmed transfer failure, **Retry deposit return**. Never attest failure while a transfer is pending. Ordinary credit lookup and reversal recovery require no operator privilege.

```sh
pnpm contract:build
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:sandbox
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:paid
# Uses your testnet CLI keychain; requires 17 testnet NEAR plus gas:
bash scripts/deploy-testnet.sh your-owner.testnet
MUTINY_TESTNET_OWNER=your-owner.testnet node scripts/testnet-jobs.mjs
# Only after sandbox and testnet resource gates pass, verify a real paid job:
MUTINY_TESTNET_OWNER=your-owner.testnet MUTINY_TESTNET_RENTER=your-renter.testnet \
  MUTINY_TESTNET_PAID_ONLY=1 MUTINY_ENABLE_PAID=1 node scripts/testnet-jobs.mjs
```

Verified live testnet: [paid hire](https://testnet.nearblocks.io/txns/5jMwQ22NHEeprYQqDuhkbcbYyM3vZvXRxEHSQviVBVsU), [saved job](https://testnet.nearblocks.io/txns/BQmJ3t8x2SZereogYSnnLR5vhigB7fthSLiJdNoYY5Nj), [earnings claim](https://testnet.nearblocks.io/txns/HdzzUi58Yo2UNvcgEPkaedPQytXMCDDZmQkTG8YydFhJ), and [five-round Infiltration](https://testnet.nearblocks.io/txns/2jGRnY5EHPnk5y3jbYyTfNugKNup96tXqoQ4n9wR9XkM). Hire used 24.15 Tgas; the five-round save used 16 Tgas and 554 storage bytes. Exact worker/Hall split, unused deposits, and return to the original 3 NEAR worker funding after claiming were checked. Browser reads use the [documented FastNEAR testnet RPC](https://docs.near.org/api/rpc/providers).

Build contracts before workspace Rust tests: Registry embeds Worker Wasm. Sandbox tests use the official [NEAR sandbox 2.14.0](https://github.com/near/nearcore/releases/tag/2.14.0) binary and inject failures only in the local sandbox. Live transactions use CLI signing; automated browser tests substitute the wallet/RPC boundary while retaining the real Wasm game. The earlier [Meteor compatibility call](https://testnet.nearblocks.io/txns/6yTmeNkxoHrZ7N5R3Q8pecvhw2GEKvQMnPDk3wWgfaj6) verifies the connector separately.

Built with React, Vite, Tailwind CSS, PixiJS, wasm-bindgen, near-sdk and HOT Connect. Atkinson Hyperlegible Next and Fraunces are bundled under their included SIL Open Font Licenses.
