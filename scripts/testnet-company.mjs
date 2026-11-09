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
  resolve(tmpdir(), "mutiny-company-testnet-evidence.json");
const owner = process.env.MUTINY_TESTNET_OWNER;
if (!owner?.endsWith(".testnet"))
  throw new Error(
    "Set MUTINY_TESTNET_OWNER to the authorized testnet NFT owner. This script signs real testnet calls through the CLI keychain.",
  );
const registry = process.env.MUTINY_REGISTRY_ID || `v3.${owner}`;
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
  process.env.MUTINY_ENABLE_COMPANY !== "1"
)
  throw Error(
    "Set three distinct testnet role accounts and MUTINY_ENABLE_COMPANY=1. This script signs offers, commissions, transfers, claims and company withdrawals.",
  );
await init({
  module_or_path: await readFile("app/src/game/wasm/game_web_bg.wasm"),
});
const refs = JSON.parse(
  await readFile("crates/game-core/tests/fixtures/winning-logs.json", "utf8"),
);
const tokens = ["rook", "mallow", "nix", "dot", "brisk", "peebles"],
  fee = 10n ** 22n;
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
const native = (yocto) => yocto.toString() + " yoctoNEAR";
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
const initial = await view("get_market");
assert.equal(initial.length, 6);
for (const token_id of tokens) {
  let w = await worker(token_id);
  if (!w.paid_enabled) await record("enable_paid_hiring", { token_id });
  if (
    !w.offers?.every(
      (o) =>
        o &&
        o.starting_ask === fee.toString() &&
        o.floor_ask === fee.toString() &&
        o.discount_step === "0",
    )
  ) {
    assert.equal(w.status, "idle");
    assert.equal(w.token.owner_id, owner);
    for (const package_option of [0, 1])
      await record("set_offer", {
        token_id,
        package_option,
        starting_ask: fee.toString(),
        floor_ask: fee.toString(),
        discount_step: "0",
      });
  }
}
let e = await economy(bob);
assert(e.project.funded);
if (!e.enabled) await record("set_economy_enabled", { enabled: true });
// Resume an interrupted ownership demonstration without another hire or claim.
const priorRook = await worker("rook");
if (
  priorRook.token.owner_id === carol &&
  evidence.transactions.some((t) => t.method === "nft_transfer")
) {
  if (priorRook.claim?.status === "pending")
    await record("reconcile_claim", { token_id: "rook" }, "0 NEAR", carol);
  assert.equal((await worker("rook")).claim?.status, "paid");
  await record(
    "nft_transfer",
    { token_id: "rook", receiver_id: owner },
    "1 yoctoNEAR",
    carol,
  );
}
const waitIdle = async (token) => {
  for (let i = 0; i < 50; i++) {
    const w = await worker(token);
    if (w.status === "idle") return w;
    assert.equal(w.status, "cooldown");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw Error("Worker cooldown did not finish");
};
while ((e = await economy(bob)).stage < 3) {
  const who =
    e.stage === 0 && e.project.slots.filter((s) => s === 2).length === 2
      ? carol
      : bob;
  let work = await economy(who),
    job;
  if (work.company?.active_job) {
    job = await view("get_job", { job_id: work.company.active_job });
    assert.equal(job.status, "active");
  } else {
    const order = work.commissions.find((c) => c.available);
    assert(order, "No available funded commission");
    const token = order.setup_ids[0].startsWith("friday") ? "nix" : "rook";
    const w = await waitIdle(token),
      funds = BigInt(work.company?.funds || "0"),
      contribution = funds < fee ? funds : fee;
    const args = {
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
    };
    const tx = await record(
      "hire_and_open",
      args,
      native(fee - contribution + BigInt(w.job_storage_deposit)),
      who,
    );
    job = (await worker(token)).job;
    assert.equal(job.status, "active");
    assert.equal(job.renter_id, who);
    const after = await economy(who);
    assert.equal(BigInt(after.company.funds), funds - contribution);
    assert(BigInt(after.project.reserved) >= BigInt(order.payment));
    evidence.snapshots.push({
      event: "booked",
      account: who,
      job_id: job.job_id,
      economy: after,
      tx: tx.hash,
    });
    await persist();
  }
  const before = await economy(who);
  let log;
  for (const r of refs) {
    if (r.log.config.setup_id !== job.config.setup_id) continue;
    const candidate = { ...r.log, config: job.config };
    try {
      const s = JSON.parse(replay(JSON.stringify(candidate))).state;
      if (
        s.outcome === "delivered" &&
        (job.employment.objective !== "intact" || s.cart_hp === 2) &&
        (job.employment.objective !== "express" || s.round <= 4)
      ) {
        log = candidate;
        break;
      }
    } catch {}
  }
  assert(log, "Missing verified reference");
  const transferDemo =
    job.token_id === "rook" &&
    !evidence.transactions.some((t) => t.method === "nft_transfer");
  if (transferDemo)
    await record(
      "nft_transfer",
      { token_id: "rook", receiver_id: carol },
      "1 yoctoNEAR",
    );
  const tx = await record(
    "settle",
    { job_id: job.job_id, action_log: JSON.stringify(log) },
    "0 NEAR",
    who,
  );
  const saved = await view("get_job", { job_id: job.job_id }),
    after = await economy(who),
    state = JSON.parse(replay(JSON.stringify(log))).state;
  assert.equal(saved.status, "saved");
  assert.equal(saved.employment.earned, saved.employment.payment);
  assert.equal(
    BigInt(after.company.funds),
    BigInt(before.company.funds) + BigInt(saved.employment.payment),
  );
  assert.equal(after.company.dispatch.completed, job.employment.leg + 1);
  assert.equal(saved.record.final_hash, hash(state));
  const commitment = createHash("sha256")
    .update(
      Buffer.concat([
        Buffer.from(job.setup_hash, "base64"),
        Buffer.from(canonical(JSON.stringify(log))),
      ]),
    )
    .digest("base64");
  assert.equal(saved.record.commitment, commitment);
  assert(tx.gas_tgas < 180);
  evidence.jobs.push(saved);
  evidence.snapshots.push({
    event: "settled",
    account: who,
    job_id: job.job_id,
    economy: after,
    tx: tx.hash,
  });
  await persist();
  if (transferDemo) {
    const earnings = await view("accounting", {}, job.worker_account);
    await record(
      "request_claim",
      { token_id: "rook", amount: earnings.claimable },
      "0 NEAR",
      owner,
      true,
    );
    await record(
      "request_claim",
      { token_id: "rook", amount: earnings.claimable },
      "0 NEAR",
      carol,
    );
    await record("reconcile_claim", { token_id: "rook" }, "0 NEAR", carol);
    assert.equal((await worker("rook")).claim.status, "paid");
    await record(
      "nft_transfer",
      { token_id: "rook", receiver_id: owner },
      "1 yoctoNEAR",
      carol,
    );
  }
  console.log(
    JSON.stringify({
      job: job.job_id,
      account: who,
      objective: job.employment.objective,
      earned: saved.employment.earned,
      stage: after.stage,
      gasTgas: tx.gas_tgas,
    }),
  );
}
e = await economy(bob);
assert(BigInt(e.company.deliveries) >= 2n);
assert.equal(e.stage, 3);
assert.equal(e.project.reserved, "0");
assert.equal(e.project.unreserved, "0");
assert.equal(e.project.paid, "500000000000000000000000");
if (!evidence.transactions.some((t) => t.method === "withdraw_company_funds")) {
  const amount = 2n * 10n ** 22n,
    before = BigInt(e.company.funds);
  await record(
    "withdraw_company_funds",
    { amount: amount.toString() },
    "0 NEAR",
    bob,
  );
  e = await economy(bob);
  assert.equal(e.company.withdrawal.status, "paid");
  assert.equal(BigInt(e.company.funds), before - amount);
}
evidence.final = { bob: await economy(bob), carol: await economy(carol) };
await persist();
console.log("Live company verification passed. Evidence: " + evidencePath);
