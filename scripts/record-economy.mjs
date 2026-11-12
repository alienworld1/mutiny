import assert from "node:assert/strict";
import { format } from "prettier";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Worker, hashContract } from "near-workspaces";
import init, {
  replay,
  project_stock,
  project_quote,
  stock_terms,
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
  const economy = (who = bob) =>
    registry.view("get_economy", { account_id: who.accountId });
  await call(owner, "new", {
    owner_id: owner.accountId,
    worker_account: `rook.${registry.accountId}`,
  });
  for (const token_id of ["rook"]) {
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
  await fund(owner, 0, 130n * 10n ** 21n);
  await fund(owner, 1, 65n * 10n ** 21n);
  await fund(owner, 2, 30n * 10n ** 21n);
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

  await call(owner, "set_economy_enabled", { enabled: true });
  await call(owner, "set_auto_offer", {
    token_id: "rook",
    package_option: 0,
    starting_ask: fee.toString(),
    floor_ask: "4000000000000000000000",
    ceiling_ask: "30000000000000000000000",
    discount_step: "2000000000000000000000",
  });
  const frames = [];
  async function capture(label, delivered = false) {
    const e = await economy();
    const w = await registry.view("get_worker", { token_id: "rook" });
    const prior = frames.at(-1);
    if (prior)
      for (let i = 0; i < 3; i++) {
        assert.deepEqual(
          e.towns[i].stock,
          JSON.parse(
            project_stock(
              JSON.stringify(prior.economy.towns[i].stock),
              BigInt(e.timestamp),
              delivered && i === 0,
            ),
          ),
        );
      }
    const o = w.offers[0];
    assert.equal(
      w.quotes[0],
      project_quote(
        o.starting_ask,
        o.floor_ask,
        o.automatic.ceiling,
        o.discount_step,
        o.automatic.pressure,
        BigInt(o.automatic.updated_at),
        BigInt(w.timestamp),
        (BigInt(w.block_height) - BigInt(o.available_since)) / 120n,
      ),
    );
    for (const town of e.towns) {
      const actual = e.commissions.filter((c) => c.town_id === town.town_id);
      const expected = JSON.parse(
        stock_terms(JSON.stringify(town.stock), town.town_id),
      );
      assert.deepEqual(
        actual.map(({ objective, payment, setup_ids }) => ({
          objective,
          payment,
          setup_ids,
        })),
        expected,
      );
      for (const order of actual)
        assert.equal(
          order.available,
          e.enabled &&
            town.incoming.filter(Boolean).length < 2 &&
            town.stock.supplies + town.incoming.filter(Boolean).length < 6 &&
            BigInt(town.unreserved) >= BigInt(order.payment),
        );
    }
    await conservation();
    const earnings = await chain.rootAccount
      .getAccount(w.worker_account)
      .view("recognized_earnings", {});
    frames.push({ label, economy: e, worker: w, earnings });
    console.log(`Checked frame ${frames.length}: ${label}`);
  }
  await capture("The docks need supplies");
  for (let n = 0; n < 3; n++) {
    if (n) await chain.provider.fastForward(25);
    const before = await economy();
    const w = await registry.view("get_worker", { token_id: "rook" });
    const quote = w.quotes[0];
    const order = await orderFor(bob, 0);
    assert(order.available);
    await call(
      bob,
      "hire_and_open",
      { ...argsFor(order), expected_quote: quote },
      (BigInt(quote) + bond).toString(),
    );
    const job = await jobFor("rook");
    assert.equal(job.status, "active");
    assert.equal(job.accepted_fee, quote);
    await capture("A paid crew takes the job");
    assert.equal(
      frames.at(-1).worker.offers[0].automatic.pressure,
      Math.min(4, w.offers[0].automatic.pressure + 1),
    );
    const earned = BigInt(quote) - BigInt(quote) / 20n;
    assert.equal(
      BigInt(frames.at(-1).earnings) - BigInt(frames.at(-2).earnings),
      earned,
    );
    assert.equal(
      BigInt(frames.at(-1).worker.hall_earned) -
        BigInt(frames.at(-2).worker.hall_earned),
      BigInt(quote) / 20n,
    );
    assert.equal(
      BigInt(frames.at(-1).economy.towns[0].reserved),
      BigInt(order.payment),
    );
    const saved = await settle(bob, job);
    assert.equal(saved.employment.earned, order.payment);
    await capture(
      n === 2
        ? "The docks are restored. Their treasury is spent."
        : "Delivery changes the next offer",
      true,
    );
    const after = frames.at(-1).economy;
    assert.equal(
      BigInt(after.company.funds) - BigInt(before.company?.funds ?? "0"),
      BigInt(order.payment),
    );
    assert.equal(
      BigInt(before.towns[0].unreserved) - BigInt(after.towns[0].unreserved),
      BigInt(order.payment),
    );
  }
  assert.equal((await economy()).towns[0].unreserved, "0");
  await chain.provider.fastForward(150);
  await capture("An idle crew lowers its ask");
  await chain.provider.fastForward(4000);
  await capture("Time consumes supplies. Restoration remains.");
  assert(!(await orderFor(bob, 0)).available);
  assert.equal(frames.at(-1).worker.quotes[0], "4000000000000000000000");
  await fund(carol, 0, 100n * 10n ** 21n);
  await capture("A contribution funds new work");
  assert((await orderFor(bob, 0)).available);
  const artifact = {
    version: 1,
    network: "sandbox",
    generatedAt: new Date().toISOString(),
    registryHash: hashContract(registryCode.toString("base64")),
    workerHash: hashContract(
      (
        await readFile("target/wasm32-unknown-unknown/release/worker.wasm")
      ).toString("base64"),
    ),
    checks: [
      "Rust/WASM stock projection",
      "Rust/WASM worker quotes",
      "Rust/WASM commission terms",
      "Exact worker/Hall split",
      "Exact town conservation",
      "Reserved and paid commissions",
      "Verified delivery replay",
    ],
    frames,
  };
  await mkdir("app/public/demo", { recursive: true });
  await writeFile(
    "app/public/demo/economy.json.tmp",
    await format(JSON.stringify(artifact), { parser: "json" }),
  );
  await rename(
    "app/public/demo/economy.json.tmp",
    "app/public/demo/economy.json",
  );
  console.log(
    `Recorded ${frames.length} checked contract snapshots. Open /?demo=economy`,
  );
} finally {
  await chain.tearDown();
}
