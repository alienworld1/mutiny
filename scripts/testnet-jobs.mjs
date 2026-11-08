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
const registry = `m3.${owner}`;
const rpcUrl = "https://rpc.testnet.near.org";
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
async function view(method, args = {}) {
  const result = await rpc("query", {
    request_type: "call_function",
    finality: "final",
    account_id: registry,
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
async function change(method, args, deposit = "0 NEAR") {
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
      owner,
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
    sender_account_id: owner,
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
for (const log of logs) {
  let available = await view("get_worker");
  if (available.status === "cooldown") {
    while (available.status === "cooldown") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
console.log(
  `Testnet: ${evidence.jobs.length} real verified jobs; both placements, five-round replay, frozen opening, exact storage refunds and unchanged worker balance passed.`,
);
