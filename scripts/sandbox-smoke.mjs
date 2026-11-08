import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Worker } from "near-workspaces";
import { dirname, resolve } from "node:path";
import { access, constants, readFile } from "node:fs/promises";
import init, { configure, replay } from "../app/src/game/wasm/game_web.js";
const binary = process.env.NEAR_SANDBOX_BIN_PATH;
if (!binary)
  throw new Error(
    "Set NEAR_SANDBOX_BIN_PATH to an official near-sandbox executable.",
  );
await access(binary, constants.X_OK);
process.env.NEAR_SANDBOX_BINARY_PATH = dirname(resolve(binary));
await init({
  module_or_path: await readFile("app/src/game/wasm/game_web_bg.wasm"),
});
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("base64");
const refs = JSON.parse(
  await readFile("crates/game-core/tests/fixtures/winning-logs.json", "utf8"),
);
const worker = await Worker.init();
const gas = "200000000000000";
try {
  const root = worker.rootAccount;
  const other = await root.createSubAccount("other");
  const registry = await root.createSubAccount("registry", {
    initialBalance: "30000000000000000000000000",
  });
  await registry.deploy("target/wasm32-unknown-unknown/release/registry.wasm");
  await root.call(
    registry,
    "new",
    { owner_id: root.accountId, worker_account: `rook.${registry.accountId}` },
    { gas },
  );
  await root.call(registry, "provision_worker", { token_id: "rook" }, { gas });
  let market = await registry.view("get_worker", {});
  const bond = market.job_storage_deposit;
  const workerId = market.worker_account;
  assert.equal((await worker.provider.viewAccessKeys(workerId)).keys.length, 0);
  assert.equal(
    JSON.parse(
      Buffer.from(
        (await worker.provider.viewCall(workerId, "recognized_earnings", {}))
          .result,
      ).toString(),
    ),
    "0",
  );
  assert.equal(await registry.view("nft_total_supply", {}), "6");
  assert.equal(
    (
      await registry.view("nft_tokens_for_owner", {
        account_id: root.accountId,
      })
    )[0].token_id,
    "rook",
  );
  const openArgs = (config, content = market.content_hash) => ({
    token_id: "rook",
    package_option: config.package_option,
    placement: config.placement,
    setup_id: config.setup_id,
    expected_content_hash: content,
  });
  const open = async (config) =>
    root.call(registry, "open_owned_job", openArgs(config), {
      attachedDeposit: bond,
      gas,
    });
  const reject = async (account, method, args, options, reason) => {
    const tx = await account.callRaw(registry, method, args, options);
    assert.equal(tx.failed, true, `${method} should fail: ${reason}`);
    assert(
      tx.receiptFailureMessages.length > 0,
      "Failure must have a chain receipt",
    );
  };
  const defaultConfig = {
    setup_id: "dock-fire-intro",
    placement: "escort",
    worker: 0,
    package_option: 0,
  };
  await reject(
    other,
    "open_owned_job",
    openArgs(defaultConfig),
    { attachedDeposit: bond, gas },
    /current owner/,
  );
  await reject(
    root,
    "open_owned_job",
    openArgs(defaultConfig),
    { gas },
    /storage deposit/,
  );
  await reject(
    root,
    "open_owned_job",
    openArgs(defaultConfig, Buffer.alloc(32).toString("base64")),
    { attachedDeposit: bond, gas },
    /Content changed/,
  );
  const fixtures = [];
  for (const placement of ["escort", "infiltration"]) {
    const config = { ...defaultConfig, placement };
    const source = refs.find(
      (r) =>
        r.approach === "delivery" &&
        r.log.config.setup_id === "dock-fire-intro",
    ).log;
    const log = { ...source, config };
    assert.equal(
      JSON.parse(replay(JSON.stringify(log))).state.outcome,
      "delivered",
    );
    fixtures.push(log);
  }
  fixtures.push(
    ...JSON.parse(
      await readFile(
        "crates/game-core/tests/fixtures/contract-stress-logs.json",
        "utf8",
      ),
    ),
  );
  const benchmarks = [];
  for (const [index, log] of (process.argv.includes("--lifecycle")
    ? fixtures.slice(0, 1)
    : fixtures
  ).entries()) {
    const job = await open(log.config);
    assert.equal(job.accepted_fee, "0");
    assert.equal(job.unit_slot, log.config.placement === "escort" ? 1 : 4);
    assert.equal(
      job.setup_hash,
      hash(JSON.parse(configure(JSON.stringify(log.config))).setup),
    );
    assert.deepEqual(
      await registry.view("get_opening", { job_id: job.job_id }),
      JSON.parse(configure(JSON.stringify(log.config))),
    );
    await reject(
      root,
      "open_owned_job",
      openArgs(log.config),
      { attachedDeposit: bond, gas },
      /occupied/,
    );
    const settleArgs = (action_log) => ({
      job_id: job.job_id,
      action_log: JSON.stringify(action_log),
    });
    await reject(other, "settle", settleArgs(log), { gas }, /frozen renter/);
    await reject(
      root,
      "expire",
      { job_id: job.job_id },
      { gas },
      /still active/,
    );
    const forgeries = [
      { ...log, outcome: "delivered" },
      { ...log, config: { ...log.config, worker: 2 } },
      { ...log, rules_version: 999 },
      {
        ...log,
        commands: [
          { kind: "activate", unit: 4, path: [], action: { kind: "guard" } },
        ],
      },
      {
        ...log,
        commands: [
          { kind: "activate", unit: 0, path: [0], action: { kind: "guard" } },
        ],
      },
      { ...log, commands: [...log.commands, { kind: "end_phase" }] },
      { ...log, commands: [] },
      { ...log, commands: Array(33).fill({ kind: "end_phase" }) },
    ];
    for (const forged of index < 2 && !process.argv.includes("--lifecycle")
      ? forgeries
      : []) {
      const tx = await root.callRaw(registry, "settle", settleArgs(forged), {
        gas,
      });
      assert.equal(tx.failed, true, "Forged log must fail atomically");
      assert.equal(
        await registry.view("get_job_record", { job_id: job.job_id }),
        null,
      );
      assert.equal(
        (await registry.view("get_job", { job_id: job.job_id })).status,
        "active",
      );
    }
    await reject(
      root,
      "settle",
      { job_id: job.job_id, action_log: " ".repeat(4097) },
      { gas },
      /Oversized/,
    );
    const tx = await root.callRaw(registry, "settle", settleArgs(log), { gas });
    assert.equal(tx.succeeded, true, tx.summary());
    const record = await registry.view("get_job_record", {
      job_id: job.job_id,
    });
    const expected = JSON.parse(replay(JSON.stringify(log))).state;
    assert.equal(record.outcome, expected.outcome);
    assert.equal(record.final_hash, hash(expected));
    const closed = await registry.view("get_job", { job_id: job.job_id });
    assert.equal(closed.refund_owed, "0");
    assert.equal(closed.refund_in_flight, false);
    assert(BigInt(closed.storage_bytes) * 10n ** 19n < BigInt(bond));
    assert.equal((await registry.view("get_worker", {})).status, "cooldown");
    await reject(root, "settle", settleArgs(log), { gas }, /already closed/);
    await reject(
      other,
      "expire",
      { job_id: job.job_id },
      { gas },
      /already closed/,
    );
    await root.call(
      registry,
      "retry_storage_refund",
      { job_id: job.job_id },
      { gas },
    );
    await reject(
      other,
      "on_storage_refund",
      { job_id: job.job_id },
      { gas },
      /private/,
    );
    benchmarks.push({
      placement: log.config.placement,
      rounds: expected.round,
      commands: log.commands.length,
      gasTgas: Number(tx.gas_burnt) / 1e12,
      storageBytes: closed.storage_bytes,
    });
    await worker.provider.fastForward(25);
    assert.equal((await registry.view("get_worker", {})).status, "idle");
  }
  const abandoned = await open(defaultConfig);
  await worker.provider.fastForward(2400);
  assert.equal(
    (await registry.view("get_worker", {})).status,
    "expired_pending",
  );
  await reject(
    root,
    "settle",
    { job_id: abandoned.job_id, action_log: JSON.stringify(fixtures[0]) },
    { gas },
    /expired/,
  );
  await other.call(registry, "expire", { job_id: abandoned.job_id }, { gas });
  const expired = await registry.view("get_job", { job_id: abandoned.job_id });
  assert.equal(expired.status, "expired");
  assert.equal(expired.record, null);
  assert.equal(expired.refund_owed, "0");
  await reject(
    other,
    "expire",
    { job_id: abandoned.job_id },
    { gas },
    /already closed/,
  );
  // NFT title changes do not rewrite the frozen renter or record.
  await root.call(
    registry,
    "nft_transfer",
    { receiver_id: other.accountId, token_id: "rook" },
    { attachedDeposit: "1", gas },
  );
  assert.equal(
    (await registry.view("nft_token", { token_id: "rook" })).owner_id,
    other.accountId,
  );
  assert.equal(
    (await registry.view("get_job", { job_id: abandoned.job_id })).renter_id,
    root.accountId,
  );
  assert.equal(
    JSON.parse(
      Buffer.from(
        (await worker.provider.viewCall(workerId, "recognized_earnings", {}))
          .result,
      ).toString(),
    ),
    "0",
  );

  // Standard transfer-call failure rolls back title and releases its reservation lock.
  await other.call(
    registry,
    "nft_transfer_call",
    { receiver_id: root.accountId, token_id: "rook", msg: "" },
    { attachedDeposit: "1", gas },
  );
  assert.equal(
    (await registry.view("nft_token", { token_id: "rook" })).owner_id,
    other.accountId,
  );
  await worker.provider.fastForward(25);
  const active = await other.call(
    registry,
    "open_owned_job",
    openArgs(fixtures[1].config),
    { attachedDeposit: bond, gas },
  );
  await other.call(
    registry,
    "nft_transfer",
    { receiver_id: root.accountId, token_id: "rook" },
    { attachedDeposit: "1", gas },
  );
  await other.call(
    registry,
    "settle",
    { job_id: active.job_id, action_log: JSON.stringify(fixtures[1]) },
    { gas },
  );
  assert.equal(
    (await registry.view("get_job", { job_id: active.job_id })).renter_id,
    other.accountId,
  );
  assert.equal(
    (await registry.view("get_job_record", { job_id: active.job_id })).outcome,
    "delivered",
  );
  // A failed native refund remains owed and can be retried once the account exists again.
  await worker.provider.fastForward(25);
  await root.call(
    registry,
    "nft_transfer",
    { receiver_id: other.accountId, token_id: "rook" },
    { attachedDeposit: "1", gas },
  );
  const refundable = await other.call(
    registry,
    "open_owned_job",
    openArgs(defaultConfig),
    { attachedDeposit: bond, gas },
  );
  await other.batch(other).deleteAccount(root.accountId).transact();
  await worker.provider.fastForward(2400);
  await root.call(registry, "expire", { job_id: refundable.job_id }, { gas });
  const owed = await registry.view("get_job", { job_id: refundable.job_id });
  assert(BigInt(owed.refund_owed) > 0n);
  assert.equal(owed.refund_in_flight, false);
  const recreated = await root.createSubAccount("other");
  const beforeRefund = BigInt((await recreated.accountView()).amount);
  await root.call(
    registry,
    "retry_storage_refund",
    { job_id: refundable.job_id },
    { gas },
  );
  assert.equal(
    BigInt((await recreated.accountView()).amount) - beforeRefund,
    BigInt(owed.refund_owed),
  );
  assert.equal(
    (await registry.view("get_job", { job_id: refundable.job_id })).refund_owed,
    "0",
  );
  const afterRefund = BigInt((await recreated.accountView()).amount);
  await root.call(
    registry,
    "retry_storage_refund",
    { job_id: refundable.job_id },
    { gas },
  );
  assert.equal(BigInt((await recreated.accountView()).amount), afterRefund);
  console.log(
    "Sandbox: real NFT, keyless funded worker, both placements, replay parity, invalid logs, reservation, expiry, cooldown and storage refunds passed.",
  );
  console.table(benchmarks);
} finally {
  await worker.tearDown();
}
