# Testnet operations

[Back to the game](../README.md)

## Public deployment

The app defaults to Registry `v4r1.mutiny-company-2026.testnet`. Its six worker accounts are:

- `rook.v4r1.mutiny-company-2026.testnet`
- `mallow.v4r1.mutiny-company-2026.testnet`
- `nix.v4r1.mutiny-company-2026.testnet`
- `dot.v4r1.mutiny-company-2026.testnet`
- `brisk.v4r1.mutiny-company-2026.testnet`
- `peebles.v4r1.mutiny-company-2026.testnet`

The Registry and worker contracts are keyless and immutable. The deployment operator can enable payments and attest finalized native-transfer outcomes when callbacks are lost. This recovery authority is trusted: falsely attesting failure can permit duplicate payment. Worker claims use `repair_native_callback`; company withdrawals use `repair_company_withdrawal`. Check final receipts before recovery. There is no general treasury withdrawal.

Town treasuries start with explicitly contributed testnet funds. Contributions are nonrefundable and grant no ownership or return. An underfunded town stops booking; supply consumption does not create money. The in-game Simulation forecasts supply and finite treasury changes without touching live funds.

The browser budgets 200 Tgas per job call and caps replay at 32 commands / 4 KiB. Leases last 2,400 blocks after activation; workers rest for 20 blocks. Advertised hire fees stay within 0.001–1 testnet NEAR. Bookings reserve 0.03 testnet NEAR for storage, plus gas. Unused storage returns after closing.

Unactivated cancellation restores hire funds to their original company/wallet sources after worker-credit reversal. Interrupted operations have status and recovery controls. An unknown transfer outcome must be resolved before another payment is attempted.

### Earlier deployments

Open these routes on the hosted game or local app to access earlier funds and claims:

| Route                 | Deployment                       | Records retained                                       |
| --------------------- | -------------------------------- | ------------------------------------------------------ |
| `/?market=company-v3` | `v3.mutiny-company-2026.testnet` | Company funds, jobs, and claims                        |
| `/?market=legacy`     | `m5.mutiny-m5-2026.testnet`      | Worker ownership, jobs, and earnings                   |
| `/?market=company-v4` | `v4.mutiny-company-2026.testnet` | First kingdom test funds and claims; bookings disabled |

Replacement NFTs inherit no earlier ownership, earnings, or history.

## Verify the contracts

Start with the setup and fast checks in the [README](../README.md#verify). Build the contracts, then use the official [NEAR Sandbox 2.14.0](https://github.com/near/nearcore/releases/tag/2.14.0) binary:

```sh
pnpm contract:build
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:sandbox
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:paid
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:market
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm test:company
```

These checks cover replay, paid hires, storage/gas limits, recovery, shared worker reservations, NFT transfers, earnings claims, and company funds. They run on disposable local accounts.

### Signed three-account demonstration

Use three distinct testnet accounts you control, funded with testnet NEAR and available through the NEAR CLI keychain. The following commands deploy immutable contracts and sign testnet transactions. Use a fresh deployment for reproduction rather than changing the shared public kingdom.

```sh
# Creates a Registry and six workers; contributes 1 NEAR per town.
# Needs 39 testnet NEAR plus gas. Paid bookings start disabled.
bash scripts/deploy-testnet.sh your-owner.testnet

# Seeds offers, enables bookings, hires, delivers, transfers NFTs,
# checks former/new-owner claims, and withdraws company funds.
MUTINY_TESTNET_OWNER=your-owner.testnet MUTINY_TESTNET_RENTER=your-bob.testnet \
  MUTINY_TESTNET_CAROL=your-carol.testnet MUTINY_ENABLE_KINGDOM=1 \
  node scripts/testnet-kingdom.mjs
```

Run sandbox gas/storage and recovery checks before enabling bookings. The demonstration writes transaction evidence to the system temporary directory. Set `MUTINY_TESTNET_EVIDENCE` to choose a different output file. No signing keys belong in this repository or in `VITE_` variables.

## Recreate the economy recording

The checked-in recording can be viewed at `/?demo=economy` without running a node or connecting a wallet. To regenerate it:

```sh
NEAR_SANDBOX_BIN_PATH=/absolute/path/to/near-sandbox pnpm demo:record
pnpm dev
```

The runner writes `app/public/demo/economy.json` only after local contract hires, verified deliveries, Rust/Wasm stock and quote comparisons, and funding checks pass. Play, Pause, and the timeline show restoration, changing offers, idle pricing, consumption, exhausted funding, and a contribution reopening work. The accounts are controlled demonstrations.

The download includes contract code hashes, which do not by themselves establish a match to public testnet code. Compare them with finalized accounts using:

```sh
pnpm demo:verify-code v4r1.mutiny-company-2026.testnet rook.v4r1.mutiny-company-2026.testnet
```

A mismatch fails the command. A matching hash verifies code, not public-chain execution of the recording. Use confirmed testnet transactions as public-chain evidence.

## Vercel

Set **Root Directory** to `app` and enable **Include source files outside of the Root Directory in the Build Step**. The checked-in configuration installs the pinned Rust/Wasm tools, builds the shared game engine, and generates offline assets in `app/dist`. The first build needs extra time to compile the tools.

The public Registry ID has a built-in default. To use a separate testnet deployment, set `VITE_REGISTRY_ID` before building; see [app/.env.example](../app/.env.example).
