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
  await readFile("crates/game-core/tests/fixtures/kingdom-logs.json", "utf8"),
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

  const dave = await owner.createSubAccount("dave");
  const fund = async (who, town_id, amount) => {
    const town = (await economy()).towns[town_id];
    await call(
      who,
      "fund_town",
      { town_id, expected_contributed: town.contributed },
      amount.toString(),
    );
  };
  const conservation = async () => {
    for (const t of (await economy()).towns) {
      assert.equal(
        BigInt(t.unreserved) + BigInt(t.reserved) + BigInt(t.paid),
        BigInt(t.contributed),
      );
      assert(t.incoming.filter(Boolean).length <= 2);
    }
  };
  assert.equal((await economy()).version, 4);
  assert.equal((await economy()).enabled, false);
  await fund(owner, 0, 10n ** 24n);
  await fund(owner, 1, 65n * 10n ** 21n);
  await fund(owner, 2, 30n * 10n ** 21n);
  await reject(
    owner,
    "fund_town",
    { town_id: 0, expected_contributed: "0" },
    (10n ** 24n).toString(),
  );
  await reject(
    bob,
    "fund_town",
    { town_id: 3, expected_contributed: "0" },
    "1",
  );
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
  const orderFor = async (who, town_id, objective = "routine") =>
    (await economy(who)).commissions.find(
      (c) => c.town_id === town_id && c.objective === objective,
    );
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
    throw Error(
      "No verified winning reference for " + JSON.stringify(job.config),
    );
  };
  const settle = async (who, job, log = winningLog(job)) => {
    const tx = await raw(who, "settle", {
      job_id: job.job_id,
      action_log: JSON.stringify(log),
    });
    assert(!tx.failed, JSON.stringify(tx.result));
    const saved = await registry.view("get_job", { job_id: job.job_id });
    const gasTgas = Number(tx.gas_burnt) / 1e12;
    assert(
      gasTgas < 180,
      "Settlement must have margin under browser's 200 Tgas",
    );
    assert(BigInt(saved.storage_bytes) * 10n ** 19n <= bond);
    benchmarks.push({
      objective: job.employment.objective,
      commands: log.commands.length,
      gasTgas,
      storageBytes: saved.storage_bytes,
    });
    await conservation();
    return saved;
  };
  const first = await orderFor(bob, 0, "express");
  await reject(bob, "hire_and_open", argsFor(first), (fee + bond).toString());
  await call(owner, "set_economy_enabled", { enabled: true });
  if (process.argv.includes("--owned")) {
    const order = await orderFor(owner, 0, "express"),
      args = argsFor(order);
    delete args.expected_quote;
    await call(owner, "open_owned_job", args, bond.toString());
    const saved = await settle(owner, await jobFor("rook"));
    assert.equal(saved.accepted_fee, "0");
    assert.equal(saved.employment.earned, order.payment);
    const w = await registry.view("get_worker", { token_id: "rook" });
    assert.equal(w.recent_paid_hires.length, 0);
    assert.equal(w.hall_earned, "0");
  } else {
    let job = await hire(bob, await orderFor(bob, 0, "express"));
    const carolJob = await hire(
      carol,
      await orderFor(carol, 0, "express"),
      "dot",
    );
    await reject(
      dave,
      "hire_and_open",
      argsFor(await orderFor(dave, 0), "nix"),
      (fee + bond).toString(),
    );
    await reject(
      bob,
      "hire_and_open",
      argsFor(await orderFor(bob, 1), "nix"),
      (fee + bond).toString(),
    );
    await reject(carol, "settle", {
      job_id: job.job_id,
      action_log: JSON.stringify(winningLog(job)),
    });
    const legacyLog = { ...winningLog(job), content_version: 2 };
    await reject(bob, "settle", {
      job_id: job.job_id,
      action_log: JSON.stringify(legacyLog),
    });
    assert.equal((await jobFor("rook")).status, "active");
    const firstPayment = job.employment.payment;
    await settle(bob, job);
    let e = await economy();
    assert.equal(e.towns[0].stock.supplies, 2);
    assert.equal(e.company.funds, firstPayment);
    assert.equal(
      (await orderFor(bob, 0)).payment,
      (40n * 10n ** 21n).toString(),
    );
    assert.equal((await orderFor(bob, 0)).setup_ids[0], "dock-fire-embers");
    await reject(
      dave,
      "hire_and_open",
      argsFor(first, "nix"),
      (fee + bond).toString(),
    );
    assert.equal(carolJob.employment.payment, firstPayment);
    await settle(carol, carolJob);
    await reject(bob, "settle", {
      job_id: job.job_id,
      action_log: JSON.stringify(winningLog(job)),
    });
    await chain.provider.fastForward(25);
    job = await hire(bob, await orderFor(bob, 0), "rook", fee);
    await settle(bob, job);
    e = await economy();
    assert.equal(e.company.deliveries, "2");
    assert(e.towns[0].stock.deliveries >= 3);
    assert.equal(e.company.dispatch.completed, 2);
    // Failed activation returns wallet/company sources and the town reservation.
    const funds = e.company.funds,
      completed = e.company.dispatch.completed;
    await patchCode(registry, withoutExport(registryCode, "on_credit"));
    job = await hire(bob, await orderFor(bob, 0), "nix", fee / 2n);
    assert.equal(job.status, "payment_pending");
    await patchCode(registry, withoutExport(registryCode, "on_storage_refund"));
    await call(bob, "cancel_pending_hire", { job_id: job.job_id });
    await patchCode(registry, registryCode);
    let cancelled = await registry.view("get_job", { job_id: job.job_id });
    assert.equal(cancelled.status, "cancelled");
    assert(cancelled.refund_in_flight);
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
    e = await economy();
    assert.equal(e.company.funds, funds);
    assert.equal(e.company.dispatch.completed, completed);
    assert.equal(e.towns[0].reserved, "0");
    // A loss consumes the dispatch leg but cannot create supplies or money.
    const before = e.towns[0].stock.supplies;
    job = await hire(bob, await orderFor(bob, 0), "peebles", fee);
    let state = JSON.parse(configure(JSON.stringify(job.config)));
    while (!state.outcome)
      state = JSON.parse(
        apply(JSON.stringify(state.log), JSON.stringify({ kind: "end_phase" })),
      ).state;
    const failed = await settle(bob, job, state.log);
    assert.equal(failed.employment.earned, "0");
    e = await economy();
    assert.equal(e.towns[0].stock.supplies, before);
    assert.equal(e.company.dispatch.completed, 3);
    // Anyone can close expiry; elapsed time consumes supplies without removing restoration.
    await chain.provider.fastForward(25);
    job = await hire(bob, await orderFor(bob, 0), "rook", fee);
    await chain.provider.fastForward(2400);
    await call(carol, "expire", { job_id: job.job_id });
    e = await economy();
    assert.equal(e.company.dispatch.dispatch_id, "1");
    assert.equal(e.company.dispatch.completed, 1);
    assert.equal(e.towns[0].reserved, "0");
    assert(e.towns[0].stock.deliveries >= 3);
    assert(e.towns[0].stock.supplies < before);
    // Fully backed premium payment empties a town, then any player can reopen it.
    const premium = await orderFor(carol, 1, "intact");
    // Expiry advanced time, so the town may now be urgent; ordinary payments
    // still debit only the exact frozen quote. Add enough for the chosen premium.
    const chosen = premium ?? (await orderFor(carol, 1, "express"));
    const balance = BigInt((await economy()).towns[1].unreserved);
    if (balance < BigInt(chosen.payment))
      await fund(carol, 1, BigInt(chosen.payment) - balance);
    job = await hire(
      carol,
      await orderFor(carol, 1, chosen.objective),
      "brisk",
    );
    await settle(carol, job);
    e = await economy();
    assert.equal(e.towns[1].unreserved, "0");
    assert(!e.commissions.some((c) => c.town_id === 1 && c.available));
    await fund(dave, 1, 10n ** 23n);
    assert(
      (await economy()).commissions.some((c) => c.town_id === 1 && c.available),
    );
    // Automatic pricing reacts only to actual activation, stays bounded, and decays.
    await chain.provider.fastForward(25);
    await call(owner, "set_auto_offer", {
      token_id: "rook",
      package_option: 0,
      starting_ask: fee.toString(),
      floor_ask: (4n * 10n ** 21n).toString(),
      ceiling_ask: (3n * fee).toString(),
      discount_step: (2n * 10n ** 21n).toString(),
    });
    let w = await registry.view("get_worker", { token_id: "rook" });
    const accepted = w.quotes[0];
    const order = await orderFor(bob, 0);
    await call(
      bob,
      "hire_and_open",
      { ...argsFor(order), expected_quote: accepted },
      (BigInt(accepted) + bond).toString(),
    );
    job = await jobFor("rook");
    w = await registry.view("get_worker", { token_id: "rook" });
    assert.equal(w.offers[0].automatic.pressure, 1);
    assert(BigInt(w.quotes[0]) > BigInt(accepted));
    await settle(bob, job);
    await chain.provider.fastForward(150);
    w = await registry.view("get_worker", { token_id: "rook" });
    assert(BigInt(w.quotes[0]) <= BigInt(accepted));
    await chain.provider.fastForward(4000);
    w = await registry.view("get_worker", { token_id: "rook" });
    assert.equal(w.quotes[0], (4n * 10n ** 21n).toString());
    // Unknown native withdrawal cannot authorize a second payment.
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
    const remaining = e.company.funds;
    await call(owner, "repair_company_withdrawal", repair);
    await call(owner, "repair_company_withdrawal", repair);
    e = await economy();
    assert.equal(e.company.withdrawal.status, "paid");
    assert.equal(e.company.funds, remaining);
    await conservation();
  }
  console.table(benchmarks);
  console.log(
    "Kingdom: shared demand/capacity, frozen terms, conservation, funding CAS, restoration, reinvestment, failure, expiry, auto pricing and callback recovery passed.",
  );
} finally {
  await chain.tearDown();
}
