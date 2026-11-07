# Mutiny: The Fine Print

A tactical game in development for NEAR testnet. The first playable job is not yet available.

## Setup

Install Node.js 24.22.1, pnpm 12.16.1, and Rust with rustup, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Run `pnpm build`, `pnpm lint`, and `cargo test --workspace` to check the project. The Rust toolchain and browser Wasm target are specified in `rust-toolchain.toml`.
