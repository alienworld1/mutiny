import assert from "node:assert/strict";
import { Worker } from "near-workspaces";
import { dirname, resolve } from "node:path";
import { access, constants } from "node:fs/promises";
const binary = process.env.NEAR_SANDBOX_BIN_PATH;
if (!binary)
  throw new Error(
    "Set NEAR_SANDBOX_BIN_PATH to an official near-sandbox executable.",
  );
await access(binary, constants.X_OK);
process.env.NEAR_SANDBOX_BINARY_PATH = dirname(resolve(binary));
const worker = await Worker.init();
try {
  const root = worker.rootAccount;
  const registry = await root.createSubAccount("registry");
  await registry.deploy("target/wasm32-unknown-unknown/release/registry.wasm");
  await registry.call(registry, "new", {});
  assert.equal(await registry.view("rules_version", {}), 1);
  assert.equal(await root.call(registry, "smoke", {}), 1);
  assert.equal(await registry.view("smoke_calls", {}), 1);
  console.log(
    "Sandbox: deployed Registry, initialized, linked shared game-core and confirmed method call.",
  );
} finally {
  await worker.tearDown();
}
