import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import init, {
  configure,
  replay,
  canonical,
  apply,
} from "../app/src/game/wasm/game_web.js";

const evidencePath =
  process.env.MUTINY_TESTNET_EVIDENCE ||
  resolve(tmpdir(), "mutiny-m5-testnet-evidence.json");
const owner = process.env.MUTINY_TESTNET_OWNER;
if (!owner?.endsWith(".testnet"))
  throw new Error(
    "Set MUTINY_TESTNET_OWNER to the authorized testnet NFT owner. This script signs real testnet calls through the CLI keychain.",
  );
const registry = process.env.MUTINY_REGISTRY_ID || `m5.${owner}`;
const rpcUrl =
  process.env.MUTINY_TESTNET_RPC_URL || "https://test.rpc.fastnear.com";
async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "mutiny-verification",
      method,
      params,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const result = await response.json();
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result.result;
}
async function view(method, args = {}, contractId = registry) {
  const result = await rpc("query", {
    request_type: "call_function",
    finality: "final",
    account_id: contractId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(result.result).toString());
}
const account = (id) =>
  rpc("query", {
    request_type: "view_account",
    finality: "final",
    account_id: id,
  });
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("base64");
async function change(
  method,
  args,
  deposit = "0 NEAR",
  signer = owner,
  rejected = false,
  receiptFailure = false,
) {
  const result = spawnSync(
    "near",
    [
      "contract",
      "call-function",
      "as-transaction",
      registry,
      method,
      "json-args",
      JSON.stringify(args),
      "prepaid-gas",
      "200 Tgas",
      "attached-deposit",
      deposit,
      "sign-as",
      signer,
      "network-config",
      "testnet",
      "sign-with-keychain",
      "send",
    ],
    { encoding: "utf8" },
  );
  const output = (result.stdout + result.stderr).replace(/\x1b\[[0-9;]*m/g, "");
  const txHash =
    /Transaction ID:\s*([A-Za-z0-9]+)/.exec(output)?.[1] ??
    /(?:transactions|txns)\/([A-Za-z0-9]{32,64})/.exec(output)?.[1];
  if (!txHash || (!rejected && result.status !== 0)) throw new Error(output);
  const tx = await rpc("tx", {
    tx_hash: txHash,
    sender_account_id: signer,
    wait_until: "FINAL",
  });
  assert.equal(!!tx.status.Failure, rejected, JSON.stringify(tx.status));
  const outcomes = [tx.transaction_outcome, ...tx.receipts_outcome];
  if (!rejected && !receiptFailure)
    assert(
      outcomes.every((o) => !o.outcome.status.Failure),
      "A transaction receipt failed",
    );
  const gas = outcomes.reduce(
    (sum, o) => sum + BigInt(o.outcome.gas_burnt),
    0n,
  );
  return {
    hash: txHash,
    failed: !!tx.status.Failure,
    gas_tgas: Number(gas) / 1e12,
    block_hash: tx.transaction_outcome.block_hash,
  };
}

const bob = process.env.MUTINY_TESTNET_RENTER;
const carol = process.env.MUTINY_TESTNET_CAROL;
if (
  !bob?.endsWith(".testnet") ||
  !carol?.endsWith(".testnet") ||
  new Set([owner, bob, carol]).size !== 3 ||
  process.env.MUTINY_ENABLE_PAID !== "1"
)
  throw Error(
    "Set distinct authorized MUTINY_TESTNET_OWNER, MUTINY_TESTNET_RENTER, MUTINY_TESTNET_CAROL and MUTINY_ENABLE_PAID=1. This script signs testnet offers, hires, transfers and claims.",
  );
await init({
  module_or_path: await readFile("app/src/game/wasm/game_web_bg.wasm"),
});
const tokens = ["rook", "mallow", "nix", "dot", "brisk", "peebles"];
const worker = (token_id) => view("get_worker", { token_id });
const evidence = {
  registry,
  owner,
  bob,
  carol,
  registry_code_hash: (await account(registry)).code_hash,
  workers: [],
  transactions: [],
  jobs: [],
};
const record = async (...args) => {
  const tx = await change(...args);
  evidence.transactions.push({
    method: args[0],
    signer: args[3] || owner,
    ...tx,
  });
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  return tx;
};
assert.equal(
  (
    await rpc("query", {
      request_type: "view_access_key_list",
      finality: "final",
      account_id: registry,
    })
  ).keys.length,
  0,
);
const initial = await view("get_market");
assert.equal(initial.length, 6);
assert.equal(new Set(initial.map((w) => w.worker_account)).size, 6);
const codeHash = (await import("near-workspaces")).hashContract;
assert.equal(
  evidence.registry_code_hash,
  codeHash(
    (
      await readFile("target/wasm32-unknown-unknown/release/registry.wasm")
    ).toString("base64"),
  ),
);
const workerHash = codeHash(
  (
    await readFile("target/wasm32-unknown-unknown/release/worker.wasm")
  ).toString("base64"),
);
for (const token_id of tokens) {
  const w = await worker(token_id);
  assert.equal(w.token.owner_id, owner);
  assert.equal(w.status, "idle");
  assert.equal((await account(w.worker_account)).code_hash, workerHash);
  assert.equal(
    (
      await rpc("query", {
        request_type: "view_access_key_list",
        finality: "final",
        account_id: w.worker_account,
      })
    ).keys.length,
    0,
  );
  const funds = await view("accounting", {}, w.worker_account);
  assert.equal(funds.recognized, "0");
  assert(BigInt(funds.balance) >= BigInt(funds.reserve));
  evidence.workers.push({
    token_id,
    worker_account: w.worker_account,
    packages: w.packages,
    code_hash: workerHash,
    initial_accounting: funds,
  });
  for (let package_option = 0; package_option < 2; package_option++)
    await record("set_offer", {
      token_id,
      package_option,
      starting_ask:
        package_option === 0
          ? "4000000000000000000000"
          : "5000000000000000000000",
      floor_ask: "1000000000000000000000",
      discount_step: "0",
    });
  await record("enable_paid_hiring", { token_id });
  assert((await worker(token_id)).paid_enabled);
}
const cheapest = await view("find_cheapest", {
  package: "fire",
  max_price: "4000000000000000000000",
});
assert.equal(cheapest.token.token_id, "brisk");
evidence.cheapest = {
  token_id: cheapest.token.token_id,
  quote: cheapest.quotes[cheapest.packages.indexOf("fire")],
};
const refs = JSON.parse(
  await readFile("crates/game-core/tests/fixtures/winning-logs.json", "utf8"),
);
for (const [token_id, placement] of [
  ["rook", "escort"],
  ["mallow", "infiltration"],
]) {
  const w = await worker(token_id),
    fee = BigInt(w.quotes[0]),
    bond = BigInt(w.job_storage_deposit);
  const fundsBefore = await view("accounting", {}, w.worker_account);
  const balanceBefore = BigInt((await account(w.worker_account)).amount);
  const args = {
    token_id,
    package_option: 0,
    placement,
    setup_id: "dock-fire-intro",
    expected_content_hash: w.content_hash,
    expected_quote: fee.toString(),
  };
  const hire = await record(
    "hire_and_open",
    args,
    `${fee + bond} yoctoNEAR`,
    bob,
  );
  let hired = await worker(token_id),
    job = hired.job;
  if (job.credit_status !== "finalized") {
    await record("reconcile_payment", { job_id: job.job_id }, "0 NEAR", bob);
    hired = await worker(token_id);
    job = hired.job;
  }
  assert.equal(job.status, "active");
  assert.equal(job.credit_status, "finalized");
  assert.equal(hired.status, "active");
  assert.equal(hired.recent_paid_hires[0].job_id, job.job_id);
  assert.equal(
    BigInt((await account(w.worker_account)).amount) - balanceBefore,
    fee - fee / 20n,
  );
  assert.equal(
    BigInt((await view("accounting", {}, w.worker_account)).recognized) -
      BigInt(fundsBefore.recognized),
    fee - fee / 20n,
  );
  const second = await record(
    "hire_and_open",
    { ...args, package_option: 1, expected_quote: hired.quotes[1] },
    `${bond + BigInt(hired.quotes[1])} yoctoNEAR`,
    carol,
    true,
  );
  const transfer = await record(
    "nft_transfer",
    { token_id, receiver_id: carol, approval_id: null, memo: null },
    "1 yoctoNEAR",
    owner,
  );
  assert.equal((await worker(token_id)).token.owner_id, carol);
  assert.deepEqual((await worker(token_id)).job, job);
  const oldClaim = await record(
    "request_claim",
    { token_id, amount: (fee - fee / 20n).toString() },
    "0 NEAR",
    owner,
    true,
  );
  let state = JSON.parse(configure(JSON.stringify(job.config)));
  let log;
  if (placement === "escort") {
    log = { ...refs[0].log, config: job.config };
    state = JSON.parse(replay(JSON.stringify(log))).state;
  } else {
    while (!state.outcome)
      state = JSON.parse(
        apply(JSON.stringify(state.log), JSON.stringify({ kind: "end_phase" })),
      ).state;
    log = state.log;
  }
  assert(state.outcome);
  const saved = await record(
    "settle",
    { job_id: job.job_id, action_log: JSON.stringify(log) },
    "0 NEAR",
    bob,
  );
  const verified = await view("get_job", { job_id: job.job_id });
  assert.equal(verified.record.outcome, state.outcome);
  assert.equal(verified.record.final_hash, hash(state));
  const commitment = Buffer.concat([
    Buffer.from(job.setup_hash, "base64"),
    Buffer.from(canonical(JSON.stringify(log))),
  ]);
  assert.equal(
    verified.record.commitment,
    createHash("sha256").update(commitment).digest("base64"),
  );
  assert.equal(verified.refund_owed, "0");
  const claim = await record(
    "request_claim",
    { token_id, amount: (fee - fee / 20n).toString() },
    "0 NEAR",
    carol,
  );
  await record("reconcile_claim", { token_id }, "0 NEAR", carol);
  assert.equal((await worker(token_id)).claim.status, "paid");
  assert.equal(
    (await view("accounting", {}, w.worker_account)).recognized,
    "0",
  );
  assert.equal(BigInt((await account(w.worker_account)).amount), balanceBefore);
  evidence.jobs.push({
    token_id,
    placement,
    job,
    hire,
    second,
    transfer,
    oldClaim,
    saved,
    claim,
    record: verified.record,
    storage_bytes: verified.storage_bytes,
    final_accounting: await view("accounting", {}, w.worker_account),
  });
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
}
evidence.final_market = await view("get_market");
await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
console.log(
  "Testnet market passed: six keyless workers and 12 offers, exact prices and 95/5 credit, shared capacity, both active-shift title transfers, Bob's verified saves, Alice's rejected claims and Carol's exact payouts.",
);

console.log(`Evidence: ${evidencePath}`);
