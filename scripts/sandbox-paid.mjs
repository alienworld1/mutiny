import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Worker, hashContract } from "near-workspaces";
const binary = process.env.NEAR_SANDBOX_BIN_PATH;
if (!binary)
  throw Error("Set NEAR_SANDBOX_BIN_PATH to an official sandbox executable");
process.env.NEAR_SANDBOX_BINARY_PATH = dirname(resolve(binary));
const chain = await Worker.init();
const gas = "200000000000000";
const registryCode = await readFile(
  "target/wasm32-unknown-unknown/release/registry.wasm",
);
const workerCode = await readFile(
  "target/wasm32-unknown-unknown/release/worker.wasm",
);
// Sandbox-only fault injection: remove precisely one export. The real contract still
// executes its original receipt, but the chosen callback or method fails on-chain.
function withoutExport(code, name) {
  const result = Buffer.from(code);
  let offset = 8;
  const leb = () => {
    let value = 0,
      shift = 0,
      byte;
    do {
      byte = result[offset++];
      value |= (byte & 127) << shift;
      shift += 7;
    } while (byte & 128);
    return value;
  };
  while (offset < result.length) {
    const id = result[offset++],
      size = leb(),
      end = offset + size;
    if (id === 7) {
      const count = leb();
      for (let n = 0; n < count; n++) {
        const len = leb(),
          start = offset;
        offset += len;
        if (result.subarray(start, offset).toString() === name) {
          result[start] = 120;
          return result;
        }
        offset++;
        leb();
      }
    }
    offset = end;
  }
  throw Error("Missing export " + name);
}
async function patchCode(account, code) {
  await account.patchStateRecords({
    records: [
      {
        Account: {
          account_id: account.accountId,
          account: {
            ...(await account.accountView()),
            code_hash: hashContract(code.toString("base64")),
          },
        },
      },
      {
        Contract: {
          account_id: account.accountId,
          code: code.toString("base64"),
        },
      },
    ],
  });
}
try {
  const owner = chain.rootAccount;
  const renter = await owner.createSubAccount("renter");
  const registry = await owner.createSubAccount("paid", {
    initialBalance: "30000000000000000000000000",
  });
  await registry.deploy(registryCode);
  const call = (who, method, args = {}, deposit = "0") =>
    who.call(registry, method, args, { gas, attachedDeposit: deposit });
  const raw = (who, method, args = {}, deposit = "0") =>
    who.callRaw(registry, method, args, { gas, attachedDeposit: deposit });
  const reject = async (who, method, args = {}, deposit = "0") => {
    const tx = await raw(who, method, args, deposit);
    assert(tx.failed, method + " must reject");
  };
  await call(owner, "new", {
    owner_id: owner.accountId,
    worker_account: `rook.${registry.accountId}`,
  });
  await call(owner, "provision_worker", { token_id: "rook" });
  const worker = owner.getAccount(`rook.${registry.accountId}`);
  const view = (method, args = {}) => registry.view(method, args);
  const accounting = () => worker.view("accounting", {});
  const workerBalance = async () => BigInt((await worker.accountView()).amount);
  assert.equal(
    (await chain.provider.viewAccessKeys(worker.accountId)).keys.length,
    0,
  );
  const market = await view("get_worker");
  const bond = BigInt(market.job_storage_deposit),
    fee = 4000000000000000000001n;
  const share = fee - fee / 20n;
  const config = {
    setup_id: "dock-fire-intro",
    placement: "escort",
    worker: 0,
    package_option: 0,
  };
  const args = {
    ...config,
    token_id: "rook",
    expected_content_hash: market.content_hash,
    expected_quote: fee.toString(),
  };
  delete args.worker;
  const offer = {
    package_option: 0,
    starting_ask: fee.toString(),
    floor_ask: fee.toString(),
    discount_step: "0",
  };
  const hire = async () => {
    await call(renter, "hire_and_open", args, (fee + bond).toString());
    return (await view("get_worker")).job;
  };
  const credit = (id) => worker.view("get_credit", { credit_id: id });
  const getJob = (id) => view("get_job", { job_id: id });
  const cool = async () => {
    await chain.provider.fastForward(25);
  };
  const log = JSON.parse(
    await readFile("crates/game-core/tests/fixtures/winning-logs.json", "utf8"),
  )[0].log;
  if (process.argv.includes("--recovery")) {
    await call(owner, "set_offer", offer);
    await call(owner, "enable_paid_hiring");
    // An activated job survives failed finalization; earnings stay unclaimable until lookup/retry.
    await patchCode(worker, withoutExport(workerCode, "finalize_credit"));
    let job = await hire();
    assert.equal(job.status, "active");
    assert.equal((await accounting()).claimable, "0");
    await patchCode(worker, workerCode);
    await call(owner, "reconcile_payment", { job_id: job.job_id });
    assert.equal((await credit(job.job_id)).status, "finalized");
    await chain.provider.fastForward(2400);
    await call(owner, "expire", { job_id: job.job_id });
    await cool();
    // A real failed payout keeps earnings; replaying the ID cannot pay it a second time.
    // Inject a sandbox-only signing key to call the Worker as its actual Registry.
    const key = await owner.getKey();
    await registry.updateAccessKey(key);
    await registry.setKey(key);
    const before = await workerBalance();
    await registry.call(
      worker,
      "payout",
      {
        claim_id: "999",
        recipient: "missing.test.near",
        amount: share.toString(),
      },
      { gas },
    );
    assert.equal(
      (await worker.view("get_claim", { claim_id: "999" })).status,
      "failed",
    );
    assert.equal(await workerBalance(), before);
    await registry.call(
      worker,
      "payout",
      { claim_id: "999", recipient: owner.accountId, amount: share.toString() },
      { gas },
    );
    assert.equal(await workerBalance(), before);
    const duplicate = await registry.callRaw(
      worker,
      "stage_credit",
      { credit_id: job.job_id },
      { gas, attachedDeposit: share.toString() },
    );
    assert(duplicate.failed);
    assert.equal(await workerBalance(), before);
    // Claimable is bounded by the actual balance above storage/reserve, even with recognized earnings.
    const held = await worker.accountView(),
      reserve = (await accounting()).reserve;
    await worker.updateAccount({ ...held, amount: reserve });
    assert.equal((await accounting()).claimable, "0");
    await call(owner, "request_claim", { amount: share.toString() });
    assert.equal((await view("get_worker")).claim.status, "failed");
    await worker.updateAccount(held);
    const failedClaim = (await view("get_worker")).claim;
    await registry.call(
      worker,
      "payout",
      {
        claim_id: failedClaim.claim_id,
        recipient: owner.accountId,
        amount: share.toString(),
      },
      { gas },
    );
    assert.equal(
      (await worker.view("get_claim", { claim_id: failedClaim.claim_id }))
        .status,
      "failed",
    );
    assert.equal(
      await workerBalance(),
      BigInt(held.amount),
      "Rejected IDs must never revive when balance recovers",
    );

    // Registry receives reversal and refunds, while Worker's return callback is lost.
    await patchCode(registry, withoutExport(registryCode, "on_credit"));
    job = await hire();
    await patchCode(registry, registryCode);
    await patchCode(worker, withoutExport(workerCode, "on_reversal"));
    await call(renter, "cancel_pending_hire", { job_id: job.job_id });
    assert.equal((await getJob(job.job_id)).refund_owed, "0");
    assert.equal((await credit(job.job_id)).status, "reversing");
    await patchCode(worker, workerCode);
    await call(owner, "reconcile_payment", { job_id: job.job_id });
    assert.equal((await credit(job.job_id)).status, "reversed");
    assert.equal((await accounting()).staged, "0");
    // A failed reversal cannot trigger a premature refund. Only the failed operation can retry.
    await patchCode(registry, withoutExport(registryCode, "on_credit"));
    job = await hire();
    await patchCode(registry, withoutExport(registryCode, "receive_reversal"));
    await call(renter, "cancel_pending_hire", { job_id: job.job_id });
    assert.equal((await getJob(job.job_id)).status, "recovery_pending");
    assert.equal((await credit(job.job_id)).status, "reverse_failed");
    await patchCode(registry, registryCode);
    await call(owner, "retry_credit_return", { job_id: job.job_id });
    assert.equal((await getJob(job.job_id)).refund_owed, "0");
    // Lost native-refund callback keeps the worker locked; operator attests FINAL success.
    await patchCode(registry, withoutExport(registryCode, "on_credit"));
    job = await hire();
    await patchCode(registry, withoutExport(registryCode, "on_storage_refund"));
    await call(renter, "cancel_pending_hire", { job_id: job.job_id });
    await patchCode(registry, registryCode);
    assert.equal((await getJob(job.job_id)).refund_in_flight, true);
    assert.equal((await view("get_worker")).status, "recovery_pending");
    const refunded = BigInt((await renter.accountView()).amount);
    await call(owner, "repair_native_callback", {
      job_id: job.job_id,
      succeeded: true,
      receipt_id: "b".repeat(44),
    });
    await call(owner, "retry_storage_refund", { job_id: job.job_id });
    assert.equal(BigInt((await renter.accountView()).amount), refunded);
    assert.equal((await getJob(job.job_id)).refund_owed, "0");
    console.log(
      "Recovery sandbox passed: failed finalization, duplicate credit/payout IDs, failed native payout, reserve edge, lost reversal callback, failed reversal, lost refund callback, full refunds and no repeat transfers.",
    );
  } else {
    await reject(renter, "enable_paid_hiring");
    await reject(renter, "set_offer", offer);
    await call(owner, "set_offer", offer);
    await reject(renter, "hire_and_open", args, (fee + bond).toString());
    await call(owner, "enable_paid_hiring");
    assert.equal((await view("get_worker")).paid_enabled, true);
    await reject(owner, "hire_and_open", args, (fee + bond).toString());
    await reject(
      renter,
      "hire_and_open",
      { ...args, expected_quote: (fee + 1n).toString() },
      (fee + bond).toString(),
    );
    await reject(renter, "hire_and_open", args, fee.toString());
    const before = await workerBalance();
    let job = await hire();
    assert.equal(job.status, "active");
    assert.equal(job.credit_status, "finalized");
    assert.equal((await workerBalance()) - before, share);
    assert.equal(BigInt((await accounting()).recognized), share);
    assert.equal((await accounting()).staged, "0");
    assert.equal(BigInt((await view("get_worker")).hall_earned) + share, fee);
    assert.equal(job.accepted_fee, fee.toString());
    await reject(owner, "open_owned_job", args, bond.toString());
    await reject(renter, "hire_and_open", args, (fee + bond).toString());
    await reject(owner, "set_offer", offer);
    await reject(renter, "cancel_pending_hire", { job_id: job.job_id });
    await reject(renter, "on_credit", { job_id: job.job_id });
    await call(renter, "reconcile_payment", { job_id: job.job_id });
    assert.equal((await workerBalance()) - before, share);
    await call(renter, "settle", {
      job_id: job.job_id,
      action_log: JSON.stringify(log),
    });
    job = await getJob(job.job_id);
    assert.equal(job.record.outcome, "delivered");
    assert.equal(job.refund_owed, "0");
    assert.equal(BigInt((await accounting()).recognized), share);
    // Donations and the protected reserve are never earned income.
    await owner.transfer(worker.accountId, "100000000000000000000000");
    assert.equal(BigInt((await accounting()).claimable), share);
    await call(owner, "request_claim", { amount: (share + 1n).toString() });
    assert.equal((await view("get_worker")).claim.status, "failed");
    await reject(renter, "request_claim", { amount: share.toString() });
    const claimBefore = await workerBalance();
    await call(owner, "request_claim", { amount: share.toString() });
    await call(renter, "reconcile_claim");
    let claim = (await view("get_worker")).claim;
    assert.equal(claim.status, "paid");
    assert.equal(claimBefore - (await workerBalance()), share);
    assert.equal((await accounting()).recognized, "0");
    assert.equal(BigInt((await accounting()).paid), share);
    await reject(owner, "reconcile_claim");
    await cool();
    // Real worker credit succeeds; its Registry callback disappears. Lookup activates once.
    await patchCode(registry, withoutExport(registryCode, "on_credit"));
    job = await hire();
    assert.equal(job.status, "payment_pending");
    assert.equal((await credit(job.job_id)).status, "staged");
    assert.equal((await accounting()).claimable, "0");
    await patchCode(registry, registryCode);
    await call(renter, "reconcile_payment", { job_id: job.job_id });
    assert.equal((await getJob(job.job_id)).status, "active");
    assert.equal((await credit(job.job_id)).status, "finalized");
    await chain.provider.fastForward(2400);
    await call(owner, "expire", { job_id: job.job_id });
    await cool();
    // Cancellation wins before a late callback; the entire fee and bond return.
    await patchCode(registry, withoutExport(registryCode, "on_credit"));
    job = await hire();
    await patchCode(registry, registryCode);
    const cancelBalance = await workerBalance();
    await call(renter, "cancel_pending_hire", { job_id: job.job_id });
    assert.equal((await getJob(job.job_id)).status, "cancelled");
    assert.equal((await getJob(job.job_id)).refund_owed, "0");
    assert.equal(cancelBalance - (await workerBalance()), share);
    assert.equal((await credit(job.job_id)).status, "reversed");
    const hall = (await view("get_worker")).hall_earned;
    await call(renter, "reconcile_payment", { job_id: job.job_id });
    assert.equal((await getJob(job.job_id)).status, "cancelled");
    assert.equal((await view("get_worker")).hall_earned, hall);
    await reject(renter, "cancel_pending_hire", { job_id: job.job_id });
    // Absent credit: the original stage failed and its funds returned to Registry.
    await patchCode(worker, withoutExport(workerCode, "stage_credit"));
    job = await hire();
    assert.equal(job.status, "payment_pending");
    assert.equal(await credit(job.job_id), null);
    await patchCode(worker, workerCode);
    await call(renter, "cancel_pending_hire", { job_id: job.job_id });
    assert.equal((await getJob(job.job_id)).refund_owed, "0");
    assert.equal((await credit(job.job_id)).status, "reversed");
    // Claim callback lost: repeated lookup cannot duplicate transfer; title stays locked.
    job = await hire();
    await patchCode(worker, withoutExport(workerCode, "on_payout"));
    const amount = (await accounting()).claimable;
    await call(owner, "request_claim", { amount });
    await patchCode(worker, workerCode);
    const afterPayout = await workerBalance();
    await call(renter, "reconcile_claim");
    assert.equal(await workerBalance(), afterPayout);
    assert.equal((await view("get_worker")).claim.status, "pending");
    await reject(
      owner,
      "nft_transfer",
      { receiver_id: renter.accountId, token_id: "rook" },
      "1",
    );
    await reject(owner, "request_claim", { amount });
    await reject(renter, "repair_native_callback", {
      job_id: null,
      succeeded: true,
      receipt_id: "a".repeat(44),
    });
    await call(owner, "repair_native_callback", {
      job_id: null,
      succeeded: true,
      receipt_id: "a".repeat(44),
    });
    await call(renter, "reconcile_claim");
    assert.equal((await view("get_worker")).claim.status, "paid");
    assert.equal(await workerBalance(), afterPayout);
    console.log(
      "Paid sandbox passed: exact 5/95 balances, quote/deposit checks, global reservation, saved job, outcome-independent fees, donation/reserve exclusion, claims, absent/staged/missing callbacks, full cancellation, late reconciliation, operator authorization and claim/transfer locks.",
    );
  }
} finally {
  await chain.tearDown();
}
