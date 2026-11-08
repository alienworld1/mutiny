import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import init, { configure, replay } from "../app/src/game/wasm/game_web.js";

const owner = process.env.MUTINY_TESTNET_OWNER;
if (!owner?.endsWith(".testnet"))
  throw new Error(
    "Set MUTINY_TESTNET_OWNER to the authorized testnet NFT owner. This script signs real testnet calls through the CLI keychain.",
  );
const registry = process.env.MUTINY_REGISTRY_ID || `m4.${owner}`;
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
async function change(method, args, deposit = "0 NEAR", signer = owner) {
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
  const txHash = /Transaction ID:\s*([A-Za-z0-9]+)/.exec(output)?.[1];
  if (result.status !== 0 || !txHash) throw new Error(output);
  const tx = await rpc("tx", {
    tx_hash: txHash,
    sender_account_id: signer,
    wait_until: "FINAL",
  });
  assert(!tx.status.Failure, JSON.stringify(tx.status));
  const outcomes = [tx.transaction_outcome, ...tx.receipts_outcome];
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
    gas_tgas: Number(gas) / 1e12,
    block_hash: tx.transaction_outcome.block_hash,
  };
}
await init({
  module_or_path: await readFile("app/src/game/wasm/game_web_bg.wasm"),
});
const refs = JSON.parse(
  await readFile("crates/game-core/tests/fixtures/winning-logs.json", "utf8"),
);
const delivery = refs.find(
  (r) =>
    r.approach === "delivery" && r.log.config.setup_id === "dock-fire-intro",
).log;
const stress = JSON.parse(
  await readFile(
    "crates/game-core/tests/fixtures/contract-stress-logs.json",
    "utf8",
  ),
);
const logs = [
  delivery,
  { ...delivery, config: { ...delivery.config, placement: "infiltration" } },
  ...stress,
];
const market = await view("get_worker");
assert.equal(market.token.owner_id, owner);
const workerKeys = await rpc("query", {
  request_type: "view_access_key_list",
  finality: "final",
  account_id: market.worker_account,
});
const registryKeys = await rpc("query", {
  request_type: "view_access_key_list",
  finality: "final",
  account_id: registry,
});
assert.equal(workerKeys.keys.length, 0);
assert.equal(registryKeys.keys.length, 0);
const workerBefore = await account(market.worker_account);
assert(
  BigInt(workerBefore.amount) >=
    BigInt(workerBefore.storage_usage) * 10n ** 19n,
);
const evidence = {
  registry,
  owner,
  worker: market.worker_account,
  registry_code_hash: (await account(registry)).code_hash,
  worker_code_hash: workerBefore.code_hash,
  worker_balance: workerBefore.amount,
  job_storage_deposit: market.job_storage_deposit,
  lease_blocks: market.lease_blocks,
  cooldown_blocks: market.cooldown_blocks,
  jobs: [],
};
for (const log of process.env.MUTINY_TESTNET_PAID_ONLY
  ? []
  : process.env.MUTINY_TESTNET_FOCUSED
    ? [logs[0], logs[4]]
    : logs) {
  let available = await view("get_worker");
  if (available.status === "cooldown") {
    while (available.status === "cooldown") {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      available = await view("get_worker");
    }
  }
  if (available.status !== "idle")
    throw new Error(
      `Worker ${available.status}; reconcile its existing job before running the benchmark`,
    );
  const before = (await account(registry)).storage_usage;
  const open = await change(
    "open_owned_job",
    {
      token_id: "rook",
      package_option: log.config.package_option,
      placement: log.config.placement,
      setup_id: log.config.setup_id,
      expected_content_hash: available.content_hash,
    },
    `${available.job_storage_deposit} yoctoNEAR`,
  );
  const job = (await view("get_worker")).job;
  assert.equal(job.renter_id, owner);
  assert.equal(job.accepted_fee, "0");
  assert.deepEqual(job.config, log.config);
  const opening = JSON.parse(configure(JSON.stringify(log.config)));
  assert.equal(job.setup_hash, hash(opening.setup));
  assert.deepEqual(await view("get_opening", { job_id: job.job_id }), opening);
  const expected = JSON.parse(replay(JSON.stringify(log))).state;
  const save = await change("settle", {
    job_id: job.job_id,
    action_log: JSON.stringify(log),
  });
  const saved = await view("get_job", { job_id: job.job_id });
  const record = await view("get_job_record", { job_id: job.job_id });
  assert.equal(record.final_hash, hash(expected));
  assert.equal(record.outcome, expected.outcome);
  assert.equal(saved.status, "saved");
  assert.equal(saved.refund_owed, "0");
  assert.equal(saved.refund_in_flight, false);
  const storageDelta = (await account(registry)).storage_usage - before;
  assert.equal(saved.storage_bytes, storageDelta);
  const entry = {
    job_id: job.job_id,
    config: log.config,
    round: record.round,
    commands: log.commands.length,
    strikes: record.strikes,
    borrows: record.borrows,
    storage_bytes: storageDelta,
    storage_cost_yocto: (BigInt(storageDelta) * 10n ** 19n).toString(),
    refund_yocto: (
      BigInt(available.job_storage_deposit) -
      BigInt(storageDelta) * 10n ** 19n
    ).toString(),
    open,
    save,
  };
  evidence.jobs.push(entry);
  console.log(JSON.stringify(entry));
  if (process.env.MUTINY_TESTNET_EVIDENCE)
    await writeFile(
      process.env.MUTINY_TESTNET_EVIDENCE,
      JSON.stringify(evidence, null, 2) + "\n",
    );
}
assert.equal(
  (await account(market.worker_account)).amount,
  workerBefore.amount,
  "Self-use must create no rental earnings",
);
if (evidence.jobs.length)
  console.log(
    `Testnet: ${evidence.jobs.length} real verified jobs; both placements, five-round replay, frozen opening, exact storage refunds and unchanged worker balance passed.`,
  );

const renter = process.env.MUTINY_TESTNET_RENTER;
if (renter) {
  if (!renter.endsWith(".testnet") || renter === owner)
    throw Error("Use a separate testnet renter");
  let available = await view("get_worker");
  while (available.status === "cooldown") {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    available = await view("get_worker");
  }
  assert.equal(available.status, "idle");
  if (!available.paid_enabled) {
    if (process.env.MUTINY_ENABLE_PAID !== "1")
      throw Error(
        "Complete sandbox/resource gates, then set MUTINY_ENABLE_PAID=1",
      );
    evidence.enable = await change("enable_paid_hiring", {});
    assert.equal((await view("get_worker")).paid_enabled, true);
  }
  const fee = 4000000000000000000001n,
    share = fee - fee / 20n;
  evidence.offer = await change("set_offer", {
    package_option: 0,
    starting_ask: fee.toString(),
    floor_ask: fee.toString(),
    discount_step: "0",
  });
  const before = await account(market.worker_account),
    registryBefore = await account(registry),
    priorAccounting = await view("accounting", {}, market.worker_account);
  const priorHall = BigInt((await view("get_worker")).hall_earned);
  const hire = await change(
    "hire_and_open",
    {
      token_id: "rook",
      package_option: 0,
      placement: "escort",
      setup_id: "dock-fire-intro",
      expected_content_hash: available.content_hash,
      expected_quote: fee.toString(),
    },
    `${fee + BigInt(available.job_storage_deposit)} yoctoNEAR`,
    renter,
  );
  const job = (await view("get_worker")).job;
  assert.equal(job.renter_id, renter);
  assert.equal(job.status, "active");
  assert.equal(job.accepted_fee, fee.toString());
  assert.equal(job.credit_status, "finalized");
  assert.equal(
    BigInt((await account(market.worker_account)).amount) -
      BigInt(before.amount),
    share,
  );
  const earned = await view("accounting", {}, market.worker_account);
  assert.equal(
    BigInt(earned.recognized),
    BigInt(priorAccounting.recognized) + share,
  );
  assert.equal(earned.staged, "0");
  assert.equal(
    (await view("get_worker")).hall_earned,
    (priorHall + fee - share).toString(),
  );
  const save = await change(
    "settle",
    { job_id: job.job_id, action_log: JSON.stringify(delivery) },
    "0 NEAR",
    renter,
  );
  const saved = await view("get_job", { job_id: job.job_id });
  assert.equal(
    saved.record.final_hash,
    hash(JSON.parse(replay(JSON.stringify(delivery))).state),
  );
  assert.equal(saved.refund_owed, "0");
  const stored =
    (await account(registry)).storage_usage - registryBefore.storage_usage;
  assert.equal(saved.storage_bytes, stored);
  const beforeClaim = await account(market.worker_account);
  const claim = await change("request_claim", { amount: share.toString() });
  const confirm = await change("reconcile_claim", {});
  assert.equal((await view("get_worker")).claim.status, "paid");
  const afterClaim = await account(market.worker_account);
  assert.equal(BigInt(beforeClaim.amount) - BigInt(afterClaim.amount), share);
  const final = await view("accounting", {}, market.worker_account);
  assert.equal(final.recognized, priorAccounting.recognized);
  assert.equal(BigInt(final.paid), BigInt(priorAccounting.paid) + share);
  evidence.paid = {
    renter,
    job_id: job.job_id,
    fee: fee.toString(),
    worker_credit: share.toString(),
    hall_fee: (fee - share).toString(),
    worker_before: before.amount,
    worker_after_hire: beforeClaim.amount,
    worker_after_claim: afterClaim.amount,
    accounting: final,
    hire,
    save,
    claim,
    confirm,
    storage_bytes: stored,
  };
  if (process.env.MUTINY_TESTNET_EVIDENCE)
    await writeFile(
      process.env.MUTINY_TESTNET_EVIDENCE,
      JSON.stringify(evidence, null, 2) + "\n",
    );
  console.log(JSON.stringify(evidence.paid));
  console.log(
    "Testnet: independent paid renter, exact conserved balances, real saved result, worker payout, reserve and keyless accounts passed.",
  );
}
