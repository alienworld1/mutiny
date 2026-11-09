import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Worker, hashContract } from "near-workspaces";
import init, {
  replay,
  configure,
  apply,
} from "../app/src/game/wasm/game_web.js";
const binary = process.env.NEAR_SANDBOX_BIN_PATH;
if (!binary)
  throw Error("Set NEAR_SANDBOX_BIN_PATH to the official sandbox binary");
process.env.NEAR_SANDBOX_BINARY_PATH = dirname(resolve(binary));
await init({
  module_or_path: await readFile("app/src/game/wasm/game_web_bg.wasm"),
});
const references = JSON.parse(
  await readFile("crates/game-core/tests/fixtures/winning-logs.json", "utf8"),
);
const registryCode = await readFile(
  "target/wasm32-unknown-unknown/release/registry.wasm",
);
const chain = await Worker.init(),
  gas = "200000000000000",
  fee = 10n ** 22n;
const benchmarks = [];
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
  const owner = chain.rootAccount,
    bob = await owner.createSubAccount("bob"),
    carol = await owner.createSubAccount("carol");
  const registry = await owner.createSubAccount("company", {
    initialBalance: "36000000000000000000000000",
  });
  await registry.deploy(registryCode);
  const call = (who, method, args = {}, deposit = "0") =>
    who.call(registry, method, args, { gas, attachedDeposit: deposit });
  const raw = (who, method, args = {}, deposit = "0") =>
    who.callRaw(registry, method, args, { gas, attachedDeposit: deposit });
  const reject = async (who, method, args = {}, deposit = "0") =>
    assert(
      (await raw(who, method, args, deposit)).failed,
      method + " must reject",
    );
  const economy = (who = bob) =>
    registry.view("get_economy", { account_id: who.accountId });
  await call(owner, "new", {
    owner_id: owner.accountId,
    worker_account: `rook.${registry.accountId}`,
  });
  for (const token_id of ["rook", "mallow", "nix", "dot", "brisk", "peebles"]) {
    await call(owner, "provision_worker", { token_id });
    await call(owner, "enable_paid_hiring", { token_id });
    for (const package_option of [0, 1])
      await call(owner, "set_offer", {
        token_id,
        package_option,
        starting_ask: fee.toString(),
        floor_ask: fee.toString(),
        discount_step: "0",
      });
  }
  assert.equal((await economy()).enabled, false);
  await reject(bob, "fund_project", {}, (5n * 10n ** 23n).toString());
  await call(owner, "fund_project", {}, (5n * 10n ** 23n).toString());
  await reject(owner, "fund_project", {}, (5n * 10n ** 23n).toString());
  const market = await registry.view("get_market", {}),
    bond = BigInt(market[0].job_storage_deposit);
  const argsFor = (order, token = "rook", contribution = 0n) => ({
    token_id: token,
    package_option: 0,
    placement: "escort",
    setup_id: order.setup_ids[0],
    expected_content_hash: market[0].content_hash,
    expected_quote: fee.toString(),
    commission: {
      commission_id: order.commission_id,
      dispatch_id: order.dispatch_id,
      expected_terms: order.terms_hash,
      company_contribution: contribution.toString(),
    },
  });
  const jobFor = (token) =>
    registry.view("get_worker", { token_id: token }).then((w) => w.job);
  const hire = async (who, order, token = "rook", contribution = 0n) => {
    await call(
      who,
      "hire_and_open",
      argsFor(order, token, contribution),
      (fee - contribution + bond).toString(),
    );
    return jobFor(token);
  };
  const winningLog = (job) => {
    for (const reference of references) {
      if (reference.log.config.setup_id !== job.config.setup_id) continue;
      const log = { ...reference.log, config: job.config };
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
    throw Error("No reference win for " + JSON.stringify(job.config));
  };
  const settle = async (who, job, log = winningLog(job)) => {
    const tx = await raw(who, "settle", {
      job_id: job.job_id,
      action_log: JSON.stringify(log),
    });
    assert(!tx.failed, JSON.stringify(tx.result));
    const saved = await registry.view("get_job", { job_id: job.job_id });
    benchmarks.push({
      objective: job.employment.objective,
      commands: log.commands.length,
      gasTgas: Number(tx.gas_burnt) / 1e12,
      storageBytes: saved.storage_bytes,
    });
    assert(BigInt(saved.storage_bytes) * 10n ** 19n <= bond);
    return saved;
  };
  if (process.argv.includes("--owned")) {
    await call(owner, "set_economy_enabled", { enabled: true });
    const order = (await economy(owner)).commissions[0];
    const args = argsFor(order);
    delete args.expected_quote;
    await call(owner, "open_owned_job", args, bond.toString());
    const owned = await jobFor("rook");
    assert.equal(owned.accepted_fee, "0");
    assert.equal(owned.status, "active");
    const closed = await settle(owner, owned);
    assert.equal(closed.employment.earned, order.payment);
    assert.equal((await economy(owner)).company.funds, order.payment);
    const w = await registry.view("get_worker", { token_id: "rook" });
    assert.equal(w.recent_paid_hires.length, 0);
    assert.equal(w.hall_earned, "0");
    await reject(owner, "settle", {
      job_id: owned.job_id,
      action_log: JSON.stringify(winningLog(owned)),
    });
    console.log(
      "Owned company commission: free reservation, verified payment, no rental income and no duplicate settlement passed.",
    );
  } else {
    const first = (await economy()).commissions[0];
    await reject(bob, "hire_and_open", argsFor(first), (fee + bond).toString());
    await call(owner, "set_economy_enabled", { enabled: true });
    let job = await hire(bob, first);
    assert.equal((await economy()).project.reserved, first.payment);
    await reject(
      carol,
      "hire_and_open",
      argsFor(first, "dot"),
      (fee + bond).toString(),
    );
    await reject(
      bob,
      "hire_and_open",
      argsFor((await economy()).commissions[1], "dot"),
      (fee + bond).toString(),
    );
    await reject(carol, "settle", {
      job_id: job.job_id,
      action_log: JSON.stringify(winningLog(job)),
    });
    let saved = await settle(bob, job);
    assert.equal(saved.employment.earned, first.payment);
    assert.equal((await economy()).company.funds, first.payment);
    await reject(bob, "settle", {
      job_id: job.job_id,
      action_log: JSON.stringify(winningLog(job)),
    });
    await call(bob, "withdraw_company_funds", { amount: fee.toString() });
    let e = await economy();
    assert.equal(e.company.withdrawal.status, "paid");
    assert.equal(e.company.funds, (BigInt(first.payment) - fee).toString());
    // Lost activation callback: staged fee returns to its original company source.
    const second = e.commissions.find((c) => c.available);
    await patchCode(registry, withoutExport(registryCode, "on_credit"));
    job = await hire(bob, second, "dot", fee / 2n);
    assert.equal(job.status, "payment_pending");
    await patchCode(registry, withoutExport(registryCode, "on_storage_refund"));
    await call(bob, "cancel_pending_hire", { job_id: job.job_id });
    await patchCode(registry, registryCode);
    let cancelled = await registry.view("get_job", { job_id: job.job_id });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.refund_in_flight, true);
    assert.equal(
      BigInt(cancelled.refund_owed),
      fee / 2n + bond - BigInt(cancelled.storage_bytes) * 10n ** 19n,
    );
    await reject(bob, "retry_storage_refund", { job_id: job.job_id });
    await call(owner, "repair_native_callback", {
      job_id: job.job_id,
      succeeded: true,
      receipt_id: "1".repeat(44),
    });
    cancelled = await registry.view("get_job", { job_id: job.job_id });
    assert.equal(cancelled.refund_owed, "0");
    e = await economy();
    assert.equal(e.company.funds, (BigInt(first.payment) - fee).toString());
    assert.equal(e.company.dispatch.completed, 1);
    assert.equal(e.company.active_job, null);
    assert.equal(e.project.reserved, "0");
    // Reinvest, then another account finishes the phase and changes Bob's choices.
    await chain.provider.fastForward(25);
    job = await hire(
      bob,
      e.commissions.find((c) => c.available),
      "rook",
      fee,
    );
    saved = await settle(bob, job);
    e = await economy();
    assert.equal(e.company.deliveries, "2");
    assert.equal(e.company.dispatch.completed, 2);
    const remainder = (await economy(carol)).commissions.find(
      (c) => c.available,
    );
    job = await hire(carol, remainder, "brisk");
    await settle(carol, job);
    e = await economy();
    assert.equal(e.stage, 1);
    assert.equal(e.commissions[2].objective, "intact");
    await reject(
      carol,
      "hire_and_open",
      {
        ...argsFor((await economy(carol)).commissions[2], "nix"),
        setup_id: "friday-again-crossed",
      },
      (fee + bond).toString(),
    );
    // A provisional company can take premium work: shared demand cannot strand
    // five first-time captains behind the old two-delivery charter gate.
    const provisionalOrder = (await economy(carol)).commissions[2];
    assert.equal(provisionalOrder.setup_ids.length, 1);
    assert.equal(e.commissions[2].setup_ids.length, 2);
    job = await hire(carol, provisionalOrder, "nix");
    let failedPremium = JSON.parse(configure(JSON.stringify(job.config)));
    while (!failedPremium.outcome)
      failedPremium = JSON.parse(
        apply(
          JSON.stringify(failedPremium.log),
          JSON.stringify({ kind: "end_phase" }),
        ),
      ).state;
    await settle(carol, job, failedPremium.log);
    assert.equal((await economy(carol)).company.deliveries, "1");
    await chain.provider.fastForward(25);
    await chain.provider.fastForward(25);
    // Third leg ends a dispatch; the next leg starts a new one.
    job = await hire(bob, e.commissions[2], "nix", fee);
    saved = await settle(bob, job);
    e = await economy();
    assert.equal(saved.employment.earned, e.commissions[2].payment);
    assert.equal(e.company.dispatch.completed, 3);
    assert.equal(e.commissions[0].dispatch_id, "1");
    // An active loss consumes a leg but returns the commission budget.
    job = await hire(
      bob,
      e.commissions.find((c) => c.available),
      "peebles",
      fee,
    );
    let state = JSON.parse(configure(JSON.stringify(job.config)));
    while (!state.outcome)
      state = JSON.parse(
        apply(JSON.stringify(state.log), JSON.stringify({ kind: "end_phase" })),
      ).state;
    saved = await settle(bob, job, state.log);
    assert.equal(saved.employment.earned, "0");
    e = await economy();
    assert.equal(e.company.dispatch.dispatch_id, "1");
    assert.equal(e.company.dispatch.completed, 1);
    // Expiry is independently closable and cannot pay.
    await chain.provider.fastForward(25);
    job = await hire(
      bob,
      e.commissions.find((c) => c.available),
      "rook",
      fee,
    );
    await chain.provider.fastForward(2400);
    await call(carol, "expire", { job_id: job.job_id });
    e = await economy();
    assert.equal(e.company.dispatch.completed, 2);
    assert.equal(e.project.reserved, "0");
    // Finish the remaining finite work and verify repeat batches require fresh funding.
    while ((await economy()).stage < 3) {
      await chain.provider.fastForward(25);
      e = await economy();
      job = await hire(
        bob,
        e.commissions.find((c) => c.available),
        "rook",
        fee,
      );
      await settle(bob, job);
    }
    e = await economy();
    assert.equal(e.project.paid, (5n * 10n ** 23n).toString());
    assert.equal(e.project.unreserved, "0");
    assert.equal(e.project.reserved, "0");
    assert(e.project.restored);
    await reject(bob, "hire_and_open", argsFor(first), (fee + bond).toString());
    await call(owner, "fund_project", {}, (5n * 10n ** 23n).toString());
    e = await economy();
    assert.equal(e.project.batch, "1");
    assert.equal(e.stage, 0);
    assert(e.project.restored);
    assert.equal(e.commissions[0].commission_id, "9");
    await reject(bob, "hire_and_open", argsFor(first), (fee + bond).toString());
    // Uncertain withdrawal remains locked; no second native transfer is attempted.
    const stressLogs = JSON.parse(
      await readFile(
        "crates/game-core/tests/fixtures/contract-stress-logs.json",
        "utf8",
      ),
    );
    for (const log of stressLogs) {
      await chain.provider.fastForward(25);
      e = await economy();
      const order = e.commissions.find(
        (c) => c.available && c.setup_ids.includes(log.config.setup_id),
      );
      assert(order);
      await call(
        bob,
        "hire_and_open",
        {
          ...argsFor(order, "rook", fee),
          setup_id: log.config.setup_id,
          placement: log.config.placement,
          package_option: log.config.package_option,
        },
        bond.toString(),
      );
      job = await jobFor("rook");
      saved = await settle(bob, job, log);
      assert.equal(saved.employment.earned, "0");
      assert(
        benchmarks.at(-1).gasTgas < 180,
        "Settlement needs margin below the 200 Tgas browser budget",
      );
    }
    await patchCode(
      registry,
      withoutExport(registryCode, "on_company_withdrawal"),
    );
    await call(bob, "withdraw_company_funds", { amount: fee.toString() });
    await patchCode(registry, registryCode);
    e = await economy();
    assert.equal(e.company.withdrawal.status, "pending");
    await reject(bob, "withdraw_company_funds", { amount: fee.toString() });
    const repair = {
      account_id: bob.accountId,
      withdrawal_id: e.company.withdrawal.withdrawal_id,
      succeeded: true,
      receipt_id: "1".repeat(44),
    };
    await reject(carol, "repair_company_withdrawal", repair);
    const funds = e.company.funds;
    await call(owner, "repair_company_withdrawal", repair);
    await call(owner, "repair_company_withdrawal", repair);
    e = await economy();
    assert.equal(e.company.withdrawal.status, "paid");
    assert.equal(e.company.funds, funds);
    console.table(benchmarks);
    console.log(
      "Company economy: shared capacity, charter, dispatch, reinvestment, withdrawals, cancellation, failure, expiry, finite funding and callback recovery passed.",
    );
  }
} finally {
  await chain.tearDown();
}
