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
  resolve(tmpdir(), "mutiny-kingdom-testnet-evidence.json");
const owner = process.env.MUTINY_TESTNET_OWNER;
if (!owner?.endsWith(".testnet"))
  throw new Error(
    "Set MUTINY_TESTNET_OWNER to the authorized testnet NFT owner. This script signs real testnet calls through the CLI keychain.",
  );
const registry = process.env.MUTINY_REGISTRY_ID || `v4r1.${owner}`;
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

const bob = process.env.MUTINY_TESTNET_RENTER,
  carol = process.env.MUTINY_TESTNET_CAROL;
if (
  !bob?.endsWith(".testnet") ||
  !carol?.endsWith(".testnet") ||
  new Set([owner, bob, carol]).size !== 3 ||
  process.env.MUTINY_ENABLE_KINGDOM !== "1"
)
  throw Error(
    "Set three distinct testnet roles and MUTINY_ENABLE_KINGDOM=1. Signs real testnet offers, hires, deliveries, NFT transfers, claims and a company withdrawal.",
  );
await init({
  module_or_path: await readFile("app/src/game/wasm/game_web_bg.wasm"),
});
const refs = JSON.parse(
  await readFile("crates/game-core/tests/fixtures/kingdom-logs.json", "utf8"),
);
const tokens = ["rook", "mallow", "nix", "dot", "brisk", "peebles"];
const native = (n) => n.toString() + " yoctoNEAR";
let evidence;
try {
  evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  assert.equal(evidence.registry, registry);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  evidence = {
    registry,
    owner,
    bob,
    carol,
    transactions: [],
    jobs: [],
    snapshots: [],
  };
}
const persist = () =>
  writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
const record = async (...args) => {
  const tx = await change(...args);
  evidence.transactions.push({
    method: args[0],
    signer: args[3] || owner,
    ...tx,
  });
  await persist();
  return tx;
};
const economy = (who) => view("get_economy", { account_id: who });
const worker = (token_id) => view("get_worker", { token_id });
const codeHash = (await import("near-workspaces")).hashContract;
assert.equal(
  (await account(registry)).code_hash,
  codeHash(
    (
      await readFile("target/wasm32-unknown-unknown/release/registry.wasm")
    ).toString("base64"),
  ),
);
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
const bases = [
  [14, 18],
  [12, 16],
  [20, 18],
  [10, 14],
  [16, 20],
  [18, 12],
];
for (const [index, token] of tokens.entries()) {
  let w = await worker(token);
  assert.equal(
    (await account(w.worker_account)).code_hash,
    codeHash(
      (
        await readFile("target/wasm32-unknown-unknown/release/worker.wasm")
      ).toString("base64"),
    ),
  );
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
  if (!w.paid_enabled) await record("enable_paid_hiring", { token_id: token });
  for (const package_option of [0, 1])
    if (!w.offers[package_option]?.automatic) {
      assert.equal(
        w.token.owner_id,
        owner,
        "Seed policies before distributing title",
      );
      await record("set_auto_offer", {
        token_id: token,
        package_option,
        starting_ask: String(BigInt(bases[index][package_option]) * 10n ** 21n),
        floor_ask: String(4n * 10n ** 21n),
        ceiling_ask: String(30n * 10n ** 21n),
        discount_step: String(2n * 10n ** 21n),
      });
    }
}
if (!(await economy(bob)).enabled)
  await record("set_economy_enabled", { enabled: true });
const idle = async (token) => {
  for (let n = 0; n < 90; n++) {
    const w = await worker(token);
    if (w.status === "idle") return w;
    if (w.status !== "cooldown") return w;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error("Worker remains unavailable");
};
const win = (job) => {
  for (const reference of refs) {
    const log = { ...reference.log, config: job.config };
    if (reference.log.config.setup_id !== job.config.setup_id) continue;
    try {
      const s = JSON.parse(replay(JSON.stringify(log))).state;
      if (
        s.outcome === "delivered" &&
        (job.employment.objective !== "intact" || s.cart_hp === 2) &&
        (job.employment.objective !== "express" || s.round <= 4)
      )
        return log;
    } catch {}
  }
  throw Error("No reference for frozen job");
};
async function deliver(
  label,
  renter,
  token,
  town_id,
  preferred,
  reinvest = false,
) {
  let entry = evidence.jobs.find((j) => j.label === label),
    w = await idle(token),
    job;
  if (entry) job = await view("get_job", { job_id: entry.job_id });
  else if (w.job?.renter_id === renter && w.job?.status === "active")
    job = w.job;
  else {
    const e = await economy(renter),
      order =
        e.commissions.find(
          (c) =>
            c.town_id === town_id && c.objective === preferred && c.available,
        ) ??
        e.commissions.find(
          (c) =>
            c.town_id === town_id && c.objective === "routine" && c.available,
        );
    assert(order, "No funded work for the demonstration");
    const fee = BigInt(w.quotes[0]),
      contribution = reinvest
        ? BigInt(e.company?.funds ?? "0") < fee
          ? BigInt(e.company?.funds ?? "0")
          : fee
        : 0n;
    evidence.snapshots.push({ label: label + ":before", economy: e });
    await persist();
    await record(
      "hire_and_open",
      {
        token_id: token,
        package_option: 0,
        placement: "escort",
        setup_id: order.setup_ids[0],
        expected_content_hash: w.content_hash,
        expected_quote: fee.toString(),
        commission: {
          commission_id: order.commission_id,
          dispatch_id: order.dispatch_id,
          expected_terms: order.terms_hash,
          company_contribution: contribution.toString(),
        },
      },
      native(fee - contribution + BigInt(w.job_storage_deposit)),
      renter,
    );
    job = (await worker(token)).job;
    assert.equal(job.status, "active");
    assert.equal((await worker(token)).status, "active");
  }
  if (!entry) {
    entry = { label, job_id: job.job_id, token, renter };
    evidence.jobs.push(entry);
    await persist();
  }
  if (
    label === "first-delivery" &&
    job.status === "active" &&
    !evidence.titleTest
  ) {
    if ((await worker(token)).token.owner_id === owner)
      await record(
        "nft_transfer",
        { token_id: token, receiver_id: carol, approval_id: null, memo: null },
        "1 yoctoNEAR",
      );
    assert.equal((await worker(token)).job.renter_id, renter);
    await record(
      "request_claim",
      { token_id: token, amount: "1" },
      "0 NEAR",
      owner,
      true,
    );
    const earnings = await view("accounting", {}, job.worker_account);
    if (BigInt(earnings.claimable) > 0n) {
      await record(
        "request_claim",
        { token_id: token, amount: earnings.claimable },
        "0 NEAR",
        carol,
      );
      for (
        let n = 0;
        n < 3 && (await worker(token)).claim?.status === "pending";
        n++
      )
        await record("reconcile_claim", { token_id: token }, "0 NEAR", carol);
      assert.equal((await worker(token)).claim.status, "paid");
    }
    if ((await worker(token)).token.owner_id === carol)
      await record(
        "nft_transfer",
        { token_id: token, receiver_id: owner, approval_id: null, memo: null },
        "1 yoctoNEAR",
        carol,
      );
    evidence.titleTest = true;
    await persist();
  }
  if (job.status === "active")
    await record(
      "settle",
      { job_id: job.job_id, action_log: JSON.stringify(win(job)) },
      "0 NEAR",
      renter,
    );
  job = await view("get_job", { job_id: job.job_id });
  assert.equal(job.status, "saved");
  assert.equal(job.employment.earned, job.employment.payment);
  const e = await economy(renter);
  evidence.snapshots.push({ label: label + ":after", economy: e });
  entry.job = job;
  await persist();
  return job;
}
await deliver("first-delivery", bob, "rook", 0, "express");
await deliver("reinvestment", bob, "nix", 0, "intact", true);
assert(BigInt((await economy(bob)).company.deliveries) >= 2n);
await deliver("second-company", carol, "brisk", 1, "intact");
if (!evidence.transactions.some((t) => t.method === "withdraw_company_funds")) {
  const before = (await economy(bob)).company.funds;
  await record(
    "withdraw_company_funds",
    { amount: String(20n * 10n ** 21n) },
    "0 NEAR",
    bob,
  );
  const e = await economy(bob);
  assert.equal(e.company.withdrawal.status, "paid");
  assert.equal(BigInt(e.company.funds), BigInt(before) - 20n * 10n ** 21n);
}
for (const [token, receiver] of [
  ["nix", bob],
  ["dot", bob],
  ["brisk", carol],
  ["peebles", carol],
])
  if ((await worker(token)).token.owner_id !== receiver)
    await record(
      "nft_transfer",
      { token_id: token, receiver_id: receiver, approval_id: null, memo: null },
      "1 yoctoNEAR",
    );
const final = await economy(bob);
for (const town of final.towns)
  assert.equal(
    BigInt(town.unreserved) + BigInt(town.reserved) + BigInt(town.paid),
    BigInt(town.contributed),
  );
evidence.final = {
  bob: final,
  carol: await economy(carol),
  workers: await Promise.all(tokens.map(worker)),
};
await persist();
console.log("Live kingdom verification passed. Evidence: " + evidencePath);
