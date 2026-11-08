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

The Hiring Hall has six NFT workers: Rook, Mallow, Nix, Dot, Brisk, and Peebles. Each can advertise two independently priced fine-print packages, with one shared shift. Compare the current fees, floors, roles, and abilities, or use **Find Cheapest** for a package and maximum fee. Choose an Escort or Infiltration placement and review the actual crew before **Hire**. Prices come from chain blocks: an owner may set a discount every 120 idle blocks, capped at three discounts. Editing one option resets only its clock; returning from a shift and cooldown resets both.

A paid hire sends 95% of its fee to that NFT's separate worker account; the Hall keeps 5%, with exact integer rounding. Each job also requires a **0.03 testnet NEAR storage deposit**, plus wallet gas. The owner can reserve an idle worker without a hire fee, including an unadvertised package. Self-use adds no rental income or paid-hire history. The profile shows the newest ten confirmed paid hires and their actual job records. These seeded test accounts demonstrate behavior, not organic demand.

After confirmed activation, play locally and **Save Job**. The Registry replays the shared Rust engine before accepting a result. Battle outcomes never change the fee or pay rewards. Saving or expiring a job charges actual retained job storage and returns the rest. Leases last 2,400 blocks from activation, followed by 20 blocks of rest. Both offers stay unavailable throughout the reservation and cooldown.

Moves and pending requests survive refresh. Use **Check status**, **Check payment**, or **Check claim** to recover. Before activation, **Cancel hire** returns the full fee and storage deposit after the staged worker credit returns. An uncertain transfer stays locked; timeout never triggers a second payment. Owners can edit or withdraw idle offers and transfer NFT title. An active renter keeps the same job after transfer; only the current owner can initiate an earnings claim. Standard NFT approvals and transfer-call acceptance/rollback are supported. Pending claims and transfer-call resolution lock conflicting title or earnings operations.

Registry: [`m5.mutiny-m5-2026.testnet`](https://testnet.nearblocks.io/address/m5.mutiny-m5-2026.testnet). Worker accounts are `rook.<registry>`, `mallow.<registry>`, `nix.<registry>`, `dot.<registry>`, `brisk.<registry>`, and `peebles.<registry>`. Seeded operator/Alice: `mutiny-m5-2026.testnet`; Bob: `mutiny-m5-bob-2026.testnet`; Carol: `mutiny-m5-carol-2026.testnet`. Set `VITE_REGISTRY_ID` to another compatible testnet Registry if needed.

Verified live: [Escort saved after transfer](https://testnet.nearblocks.io/txns/6bU9AqJS6obiHU7qVQWE7gxJU7ePB5RjUwdBD6yK5p5x), [Infiltration saved after transfer](https://testnet.nearblocks.io/txns/8K14tLsaSRwo28XcWvZXetpXL9yVWNzuK1v9TGFjhzAu), [former-owner claim rejected](https://testnet.nearblocks.io/txns/GrPc3LrnE4nCUNKy9SF7KQcanSXyxvkJiLvbAxn7zYjW), and [current-owner claim paid](https://testnet.nearblocks.io/txns/Gy1TUrNzYCfQF3QNi83qYCqqubrCmKxMHwUcYS9DXgYV).

Registry and workers are keyless and immutable. Each worker starts with 3 independently funded testnet NEAR. Claims exclude staged credits, direct donations, and the protected storage/reserve floor shown in its profile. The original operator may enable payments after resource checks and attest a **FINAL** native-transfer receipt if its callback is lost. **This recovery authority is trusted:** falsely attesting failure can allow duplicate payment. It cannot change the original recipient or amount, withdraw arbitrary funds, or change NFT ownership. There is no treasury withdrawal method.

For a missing native callback, inspect FINAL receipts and the matching job/claim ID first. The operator can call `repair_native_callback({token_id, job_id, succeeded, receipt_id})`, using a job ID for a refund or `null` for a claim. Then use **Check claim**, or retry a return only after confirmed transfer failure. Never attest failure while a transfer is pending. Ordinary credit lookup and reversal recovery require no operator privilege.

Use the [NEAR CLI](https://docs.near.org/tools/cli) with three funded testnet accounts in its keychain.

```sh
pnpm contract:build
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:sandbox
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:paid
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:market
# Deploys a new immutable Registry and six workers.
# Owner needs 32 testnet NEAR plus gas; Bob and Carol also need testnet gas/deposits.
bash scripts/deploy-testnet.sh your-owner.testnet
MUTINY_TESTNET_OWNER=your-owner.testnet MUTINY_TESTNET_RENTER=your-bob.testnet \
  MUTINY_TESTNET_CAROL=your-carol.testnet MUTINY_ENABLE_PAID=1 \
  node scripts/testnet-market.mjs
```

Build contracts before workspace Rust tests: Registry embeds Worker Wasm. Sandbox tests use the official [NEAR sandbox 2.14.0](https://github.com/near/nearcore/releases/tag/2.14.0) binary; receiver fixtures and fault injection stay in local tests. Live integration verification uses CLI signing. Browser tests substitute only wallet/RPC, keeping the real Wasm game. Browser reads use the [documented FastNEAR testnet RPC](https://docs.near.org/api/rpc/providers).

Built with React, Vite, Tailwind CSS, PixiJS, wasm-bindgen, near-sdk and HOT Connect. Atkinson Hyperlegible Next and Fraunces are bundled under their included SIL Open Font Licenses.
