# Mutiny: The Fine Print

A small tactics game about a kingdom's payroll and its workers' terms. Play the introductory **Dock Fire** job: read posted orders, protect and push the cart, or use Burn Notice to cause a real fine-print refusal. Win, lose, and try again. Free Play needs no wallet or RPC.

## Run

Install Node.js 24.22.1, pnpm 12.16.1, and Rust via rustup. The repository pins the Rust toolchain and Wasm target.

```sh
cargo install wasm-bindgen-cli --version 0.2.105 --locked
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` and `pnpm build` compile the shared Rust engine to browser Wasm. Progress is saved on this browser when IndexedDB is available.

```sh
cargo test --workspace --locked
pnpm test
pnpm test:parity
pnpm lint
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## NEAR compatibility probe

The Registry is a **test-only compatibility probe**, with no NFTs, hiring, earnings, or saved jobs yet. Build it with `pnpm contract:build`. To run `pnpm test:sandbox`, install an official [NEAR sandbox](https://github.com/near/near-sandbox) 2.14.0 binary and set `NEAR_SANDBOX_BIN_PATH` to its absolute path.

During development, `/wallet-smoke.html` tests HOT Connect against `mutiny-dev-2026.testnet` using a testnet-capable browser wallet. It calls `smoke` with zero deposit; testnet gas still applies. A near-cli signature alone does not verify browser-wallet compatibility. This probe is excluded from the production app. Local sandbox deployment and a [Meteor testnet call](https://testnet.nearblocks.io/txns/6yTmeNkxoHrZ7N5R3Q8pecvhw2GEKvQMnPDk3wWgfaj6) have been verified.

Built with React, Vite, Tailwind CSS, PixiJS, wasm-bindgen, near-sdk and HOT Connect. Atkinson Hyperlegible Next and Fraunces are bundled under their included SIL Open Font Licenses.
