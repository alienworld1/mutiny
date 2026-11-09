import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { hashContract } from "near-workspaces";

// Read-only release check. No wallet, keychain, signatures or transfers.
const registry =
  process.env.MUTINY_REGISTRY_ID || "v3.mutiny-company-2026.testnet";
assert.match(registry, /^[a-z0-9._-]+\.testnet$/);
const endpoint =
  process.env.MUTINY_TESTNET_RPC_URL || "https://test.rpc.fastnear.com";
async function rpc(method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "mutiny-release-audit",
      method,
      params,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  assert(response.ok, `RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw Error(JSON.stringify(body.error));
  return body.result;
}
const block = (await rpc("block", { finality: "final" })).header;
const query = (account_id, request_type, extra = {}) =>
  rpc("query", { account_id, request_type, block_id: block.hash, ...extra });
async function view(account, method, args = {}) {
  const result = await query(account, "call_function", {
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(result.result).toString());
}
const expectedRegistry = hashContract(
  (
    await readFile("target/wasm32-unknown-unknown/release/registry.wasm")
  ).toString("base64"),
);
const expectedWorker = hashContract(
  (
    await readFile("target/wasm32-unknown-unknown/release/worker.wasm")
  ).toString("base64"),
);
const account = await query(registry, "view_account");
assert.equal(
  account.code_hash,
  expectedRegistry,
  "Registry bytecode differs from this checkout",
);
assert.equal(
  (await query(registry, "view_access_key_list")).keys.length,
  0,
  "Registry has access keys",
);
const market = await view(registry, "get_market");
assert.equal(market.length, 6);
assert.equal(new Set(market.map((w) => w.worker_account)).size, 6);
assert.deepEqual(
  market.map((w) => w.token.token_id),
  ["rook", "mallow", "nix", "dot", "brisk", "peebles"],
);
const workers = [];
for (const worker of market) {
  const id = worker.worker_account;
  const [state, keys, funds] = await Promise.all([
    query(id, "view_account"),
    query(id, "view_access_key_list"),
    view(id, "accounting"),
  ]);
  assert.equal(state.code_hash, expectedWorker, `${id} bytecode`);
  assert.equal(keys.keys.length, 0, `${id} has access keys`);
  assert.equal(await view(id, "registry_id"), registry);
  assert.equal(worker.job_storage_deposit, "30000000000000000000000");
  assert.equal(worker.lease_blocks, "2400");
  assert.equal(worker.cooldown_blocks, "20");
  assert.equal(
    worker.paid_enabled,
    true,
    `${id} has not passed funding checks`,
  );
  assert.equal(worker.offers.length, 2);
  const balance = BigInt(funds.balance),
    reserve = BigInt(funds.reserve),
    staged = BigInt(funds.staged),
    claimable = BigInt(funds.claimable);
  assert(balance >= reserve + staged, `${id} protected funds`);
  assert(
    claimable <= BigInt(funds.recognized) &&
      claimable <= balance - reserve - staged,
    `${id} claimable bound`,
  );
  workers.push({
    token: worker.token.token_id,
    owner: worker.token.owner_id,
    account: id,
    code_hash: state.code_hash,
    status: worker.status,
    offers: worker.offers,
    quotes: worker.quotes,
    funds,
    recent_paid_hires: worker.recent_paid_hires.map((job) => ({
      job_id: job.job_id,
      renter: job.renter_id,
      status: job.status,
      placement: job.config.placement,
      fee: job.accepted_fee,
      record: job.record,
    })),
  });
}
const economy = await view(registry, "get_economy", { account_id: null });
assert.equal(economy.version, 3);
assert.equal(economy.enabled, true);
assert.equal(economy.project.funded, true);
assert.equal(
  BigInt(economy.project.unreserved) +
    BigInt(economy.project.reserved) +
    BigInt(economy.project.paid),
  500000000000000000000000n,
);
const evidence = {
  registry,
  block_height: block.height,
  block_hash: block.hash,
  registry_code_hash: account.code_hash,
  registry_key_count: 0,
  workers,
  economy,
};
if (process.env.MUTINY_AUDIT_EVIDENCE)
  await writeFile(
    process.env.MUTINY_AUDIT_EVIDENCE,
    JSON.stringify(evidence, null, 2) + "\n",
  );
console.log(
  `Testnet release audit passed at block ${block.height}: matching Registry and six Worker code hashes, seven keyless accounts, funded reserves, bounded claims and public configuration.`,
);
