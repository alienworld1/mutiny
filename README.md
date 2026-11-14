# Mutiny: The Fine Print

A small tactics game about a kingdom’s payroll and the workers hired to guard it. Escort a cart through a painted miniature battlefield. Read the enemy’s posted orders, use their fine print to cause a strike, and borrow a worker for one turn.

**[Play Mutiny](https://mutiny-the-fine-print.vercel.app/)** · [Economy replay](https://mutiny-the-fine-print.vercel.app/?demo=economy) · [Testnet Registry](https://testnet.nearblocks.io/address/v4r1.mutiny-company-2026.testnet)

## Try it

1. Choose **Play Free**. First Shift guides you through a delivery, a strike, and Borrow. No wallet is needed.
2. Push the cart three times within five rounds. Keep the cart and captain alive. Preview each order, then **Confirm**.
3. Open the **Job Board** to try all nine encounters and change your crew, fine print, or placement. Your Captain’s Ledger saves progress in this browser.
4. Choose **Deliver supplies** from the title screen and connect a NEAR testnet wallet. Select a delivery, hire a mercenary, play, then **Save Job**. An accepted delivery adds supplies, advances town restoration, and pays your company.

The [economy replay](https://mutiny-the-fine-print.vercel.app/?demo=economy) needs no wallet. Scrub its timeline to see recorded local contract hires, deliveries, changing prices, exhausted town funding, and a contribution reopening work. It is a labeled Sandbox recording, separate from the live testnet kingdom.

## Run locally

Install [Node.js](https://nodejs.org/) **24.22.1**, pnpm **12.16.1**, and [Rust via rustup](https://rustup.rs/). The repository pins the Rust toolchain and Wasm target.

```sh
corepack enable
corepack prepare pnpm@12.16.1 --activate
cargo install wasm-bindgen-cli --version 0.2.105 --locked
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Vite. No environment file or signing keys are needed. The default public contract is in [app/.env.example](app/.env.example).

```sh
pnpm build                         # Production site in app/dist, including offline assets
pnpm --filter @mutiny/app preview  # Preview the build
```

Free Play supports offline refresh and resume after its assets finish installing. Clearing browser data removes local progress. Company records stay on NEAR.

## What NEAR does

Six mercenary NFTs each have a separate keyless NEAR account. Hiring pays 95% of the fee to the worker and 5% to the Hall. Owners choose package offers and can claim earnings or transfer the NFT. A transfer during a shift preserves the renter’s booked rights and changes who can claim earnings.

The Registry reserves a worker, delivery terms, and a funded town payment when a job is booked. Battles run locally in Rust/Wasm. **Save Job** replays the action log with the same Rust rules on NEAR before accepting a delivery. Town supplies fall over time; shortages change work and payments. Owner-approved automatic offers adjust prices within fixed bounds as workers are hired or sit idle.

This is a small **testnet** economy with six seeded workers and finite, contributed town funds. Availability and funding can run out. Each booking also reserves **0.03 testnet NEAR for storage**, plus gas; unused storage returns after closing. Once a hire activates, its fee stays spent even if the delivery fails. Rehearsal and retries are possible: replay checks a valid solution, not human effort or a binding first attempt. The seeded activity does not demonstrate organic demand or sustainable returns.

Contracts are keyless and immutable. A trusted operator can enable bookings and repair lost payment callbacks; a false failure attestation can allow duplicate payment. See [testnet operations](docs/testnet.md) for accounts, recovery, deployment, and reproducible multi-account checks.

Public transaction evidence: [accepted delivery and commission](https://testnet.nearblocks.io/txns/7KfR8RakH8TxiEy6Kfq4b32ZM3wTFRtE2zMajA2Vry83), [company withdrawal](https://testnet.nearblocks.io/txns/3UkEdTBeVvsFHArvxETRBTXjZnuLfsqBPmzc5peYmnH6).

## Verify

```sh
pnpm lint
pnpm test
cargo test --workspace --locked
pnpm build
pnpm test:parity
pnpm test:kingdom
pnpm exec playwright install --with-deps
pnpm test:e2e
MUTINY_PREVIEW=1 pnpm test:e2e --project=chromium --grep "production offline"
```

Rust tests cover game rules, legal transitions, authored wins, and invalid actions. Browser tests cover the playable path, keyboard/touch input, narrow screens, transaction recovery with mocked RPC, and offline Free Play. [Sandbox and signed testnet checks](docs/testnet.md#verify-the-contracts) exercise real contracts separately.

## Built with

React, Vite, Tailwind CSS, PixiJS, wasm-bindgen, near-sdk, and HOT Connect. [MIT licensed](LICENSE). Bundled fonts use the SIL Open Font License; Phosphor icons use MIT. Codex assisted development and editing. Painted assets were generated with OpenAI imagegen; see their [manifest](app/src/stage/art-manifest.json).
