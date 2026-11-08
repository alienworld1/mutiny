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

The owner of the Rook NFT can select Escort or Infiltration, reserve one shift, play locally, and choose **Save Job**. The immutable Registry replays the canonical actions through the same Rust engine before saving a result. Pending requests and unsaved moves stay in IndexedDB. Use **Contract Job → Check status** after a refresh.

Self-use has no hire fee or rental earnings. It requires a **0.03 testnet NEAR storage deposit**, plus gas. Actual retained storage is charged; unused funds return after saving or calling **Release worker** on an expired lease. Anyone may expire a job. The lease lasts 2,400 blocks; the worker then rests for 20 blocks. Paid hiring and claims are not enabled.

The seeded test owner is `mutiny-dev-2026.testnet`. Registry: [`m3.mutiny-dev-2026.testnet`](https://testnet.nearblocks.io/address/m3.mutiny-dev-2026.testnet). Worker: [`rook.m3.mutiny-dev-2026.testnet`](https://testnet.nearblocks.io/address/rook.m3.mutiny-dev-2026.testnet). Both contract accounts have no access keys or upgrade/withdrawal methods. The owner can transfer the NFT; an existing job keeps its frozen renter. Set `VITE_REGISTRY_ID` to another compatible testnet Registry if needed.

```sh
pnpm contract:build
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:sandbox
# Creates a fresh immutable Registry and worker using your testnet CLI keychain:
bash scripts/deploy-testnet.sh your-owner.testnet
# Signs real self-use jobs and prints gas/storage measurements:
MUTINY_TESTNET_OWNER=your-owner.testnet node scripts/testnet-jobs.mjs
```

Verified testnet saves: [Escort](https://testnet.nearblocks.io/txns/5XCfsyPW1DBRWLwzKUioqvhVWuGBWN1NSDomCxnhPjYZ), [Infiltration](https://testnet.nearblocks.io/txns/BAGRdAdfKi6eupS81snEhZsXEFsbatD6ij1vxrbYrCXm), and [five-round Borrow](https://testnet.nearblocks.io/txns/GWVuJtqBT31BPtfJhpW9fDiB2XkLQiAmQPySjygr7NG5). Eight measured self-use jobs used at most 15.91 Tgas per save and 538 retained storage bytes, with unused deposits returned and no worker earnings.

Build contracts before workspace Rust tests: the Registry embeds the Worker Wasm. The sandbox suite uses the official [NEAR sandbox 2.14.0](https://github.com/near/nearcore/releases/tag/2.14.0) binary. Deployment needs 14 testnet NEAR plus gas. The earlier no-deposit [Meteor wallet compatibility call](https://testnet.nearblocks.io/txns/6yTmeNkxoHrZ7N5R3Q8pecvhw2GEKvQMnPDk3wWgfaj6) remains separate from the Registry; its development-only page is `/wallet-smoke.html`.

Built with React, Vite, Tailwind CSS, PixiJS, wasm-bindgen, near-sdk and HOT Connect. Atkinson Hyperlegible Next and Fraunces are bundled under their included SIL Open Font Licenses.
