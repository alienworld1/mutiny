import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [registry, worker] = process.argv.slice(2);
if (!registry || !worker)
  throw Error(
    "Usage: pnpm demo:verify-code <registry.testnet> <worker.testnet>",
  );
for (const account of [registry, worker])
  assert(/^[a-z0-9._-]+\.testnet$/.test(account), "Use named testnet accounts");
const recording = JSON.parse(
  await readFile("app/public/demo/economy.json", "utf8"),
);
for (const [account_id, expected] of [
  [registry, recording.registryHash],
  [worker, recording.workerHash],
]) {
  const response = await fetch("https://rpc.testnet.near.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: account_id,
      method: "query",
      params: { request_type: "view_account", finality: "final", account_id },
    }),
    signal: AbortSignal.timeout(20000),
  });
  assert(response.ok, `RPC HTTP ${response.status}`);
  const result = await response.json();
  assert(!result.error, JSON.stringify(result.error));
  assert.equal(
    result.result.code_hash,
    expected,
    `${account_id}: deployed code differs from recording`,
  );
  console.log(
    `${account_id}: code matches at finalized block ${result.result.block_hash}`,
  );
}
