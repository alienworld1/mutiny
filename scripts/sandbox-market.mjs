import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { readFile } from "node:fs/promises";
import init, { configure, apply } from "../app/src/game/wasm/game_web.js";
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
await init({
  module_or_path: await readFile("app/src/game/wasm/game_web_bg.wasm"),
});
try {
  const alice = chain.rootAccount;
  const bob = await alice.createSubAccount("bob");
  const carol = await alice.createSubAccount("carol");
  const registry = await alice.createSubAccount("market", {
    initialBalance: "40000000000000000000000000",
  });
  await registry.deploy(registryCode);
  const call = (who, method, args = {}, deposit = "0") =>
    who.call(registry, method, args, { gas, attachedDeposit: deposit });
  const raw = (who, method, args = {}, deposit = "0") =>
    who.callRaw(registry, method, args, { gas, attachedDeposit: deposit });
  const reject = async (...args) =>
    assert((await raw(...args)).failed, args[1] + " must reject");
  const view = (method, args = {}) => registry.view(method, args);
  const worker = (token_id) => view("get_worker", { token_id });
  const tokens = ["rook", "mallow", "nix", "dot", "brisk", "peebles"];
  const fee = 4000000000000000000000n;
  await call(alice, "new", {
    owner_id: alice.accountId,
    worker_account: `rook.${registry.accountId}`,
  });
  assert.equal(await view("nft_total_supply"), "6");
  for (const token_id of tokens) {
    assert.equal((await worker(token_id)).status, "unavailable");
    await reject(bob, "provision_worker", { token_id });
    await call(alice, "provision_worker", { token_id });
    await reject(alice, "provision_worker", { token_id });
    const w = await worker(token_id);
    assert.equal(w.status, "idle");
    assert.equal(
      (await chain.provider.viewAccessKeys(w.worker_account)).keys.length,
      0,
    );
    const account = alice.getAccount(w.worker_account);
    assert.equal((await account.view("accounting", {})).recognized, "0");
    for (let package_option = 0; package_option < 2; package_option++) {
      await call(alice, "set_offer", {
        token_id,
        package_option,
        starting_ask: (
          fee +
          BigInt(package_option) * 1000000000000000000000n
        ).toString(),
        floor_ask: "1000000000000000000000",
        discount_step: "0",
      });
    }
    await call(alice, "enable_paid_hiring", { token_id });
    assert((await worker(token_id)).paid_enabled);
  }
  const market = await view("get_market");
  assert.equal(new Set(market.map((w) => w.worker_account)).size, 6);
  assert.deepEqual(
    market.map((w) => w.character),
    ["Rook", "Mallow", "Nix", "Dot", "Brisk", "Peebles"],
  );
  const testHistory = async () => {
    const initial = (await worker("brisk")).recent_paid_hires.length;
    const confirmed = [];
    for (let i = 0; i < 11; i++) {
      const w = await worker("brisk"),
        option = i % 2,
        quote = BigInt(w.quotes[option]);
      const args = {
        token_id: "brisk",
        package_option: option,
        placement: i % 2 ? "infiltration" : "escort",
        setup_id: "dock-fire-intro",
        expected_content_hash: w.content_hash,
        expected_quote: quote.toString(),
      };
      await call(
        bob,
        "hire_and_open",
        args,
        (quote + BigInt(w.job_storage_deposit)).toString(),
      );
      const active = await worker("brisk");
      assert.equal(active.job.status, "active");
      confirmed.push(active.job.job_id);
      assert.equal(active.recent_paid_hires[0].job_id, active.job.job_id);
      assert.equal(
        active.recent_paid_hires.length,
        Math.min(10, initial + i + 1),
      );
      await chain.provider.fastForward(2400);
      await call(bob, "expire", { job_id: active.job.job_id });
      await chain.provider.fastForward(25);
    }
    const history = (await worker("brisk")).recent_paid_hires;
    assert.deepEqual(
      history.map((j) => j.job_id),
      confirmed.slice(-10).reverse(),
    );
    assert(
      history.every(
        (j) =>
          j.accepted_fee !== "0" &&
          j.status === "expired" &&
          j.renter_id === bob.accountId,
      ),
    );
    console.log(
      "Paid history cap passed: 11 real confirmed hires retain exactly the newest 10, with fees, packages, placements and provenance.",
    );
  };
  if (process.argv.includes("--history-only")) {
    await testHistory();
  } else {
    assert.equal(
      (
        await view("find_cheapest", {
          package: "fire",
          max_price: fee.toString(),
        })
      ).token.token_id,
      "brisk",
    );
    assert.equal(
      await view("find_cheapest", { package: "fire", max_price: "1" }),
      null,
    );
    assert.equal(
      await view("find_cheapest", {
        package: "unknown",
        max_price: fee.toString(),
      }),
      null,
    );
    const terms = {
      token_id: "rook",
      package_option: 0,
      starting_ask: fee.toString(),
      floor_ask: "1000000000000000000000",
      discount_step: "1000000000000000000000",
    };
    await call(alice, "set_offer", terms);
    let rook = await worker("rook"),
      otherClock = rook.offers[1].available_since;
    // Sandbox produces extra blocks while servicing RPC. Check the observed chain
    // block against the rule; native tests cover every exact threshold.
    for (const elapsed of [119, 120, 239, 240, 359, 360, 480]) {
      const w = await worker("rook");
      const delta =
        BigInt(w.offers[0].available_since) +
        BigInt(elapsed) -
        BigInt(w.block_height);
      if (delta > 0n) await chain.provider.fastForward(Number(delta));
      const current = await worker("rook"),
        o = current.offers[0];
      const steps =
        (BigInt(current.block_height) - BigInt(o.available_since)) / 120n;
      const bounded = steps > 3n ? 3n : steps;
      assert.equal(
        BigInt(current.quotes[0]),
        fee - 1000000000000000000000n * bounded,
      );
      assert.equal(current.offers[1].available_since, otherClock);
    }
    await call(alice, "set_offer", terms);
    rook = await worker("rook");
    assert.equal(rook.offers[1].available_since, otherClock);
    assert.equal(rook.quotes[0], fee.toString());
    await call(alice, "withdraw_offer", {
      token_id: "rook",
      package_option: 1,
    });
    assert.equal((await worker("rook")).offers[1], null);
    await call(alice, "set_offer", { ...terms, discount_step: "0" });
    await call(alice, "set_offer", {
      ...terms,
      package_option: 1,
      starting_ask: "5000000000000000000000",
      discount_step: "0",
    });
    const bond = BigInt(rook.job_storage_deposit);
    const argsFor = async (
      token_id,
      package_option = 0,
      placement = "escort",
    ) => {
      const w = await worker(token_id);
      return {
        token_id,
        package_option,
        placement,
        setup_id: "dock-fire-intro",
        expected_content_hash: w.content_hash,
        expected_quote: w.quotes[package_option],
      };
    };
    await reject(
      bob,
      "hire_and_open",
      { ...(await argsFor("rook")), expected_quote: "1" },
      (bond + fee).toString(),
    );
    // Different packages and signers compete for the same atomic worker capacity.
    const races = await Promise.all([
      raw(bob, "hire_and_open", await argsFor("rook"), (bond + fee).toString()),
      raw(
        carol,
        "hire_and_open",
        await argsFor("rook", 1),
        (bond + 5000000000000000000000n).toString(),
      ),
    ]);
    assert.equal(races.filter((tx) => !tx.failed).length, 1);
    rook = await worker("rook");
    assert.equal(rook.status, "active");
    assert.equal(rook.recent_paid_hires.length, 1);
    await reject(alice, "set_offer", terms);
    await reject(
      bob,
      "hire_and_open",
      await argsFor("rook", 1),
      (bond + 5000000000000000000000n).toString(),
    );
    assert.notEqual(
      (
        await view("find_cheapest", {
          package: "fire",
          max_price: fee.toString(),
        })
      ).token.token_id,
      "rook",
    );
    await chain.provider.fastForward(2400);
    await call(alice, "expire", { job_id: rook.job.job_id });
    assert.equal((await worker("rook")).status, "cooldown");
    await chain.provider.fastForward(25);
    rook = await worker("rook");
    assert(
      rook.offers.every((o) => o.available_since === rook.job.cooldown_until),
    );
    // Self-use permits withdrawn packages and creates no paid history or earnings.
    await call(alice, "withdraw_offer", { token_id: "dot", package_option: 0 });
    await call(alice, "withdraw_offer", { token_id: "dot", package_option: 1 });
    const dot = await worker("dot");
    await call(
      alice,
      "open_owned_job",
      { ...(await argsFor("dot", 1, "infiltration")) },
      bond.toString(),
    );
    assert.equal((await worker("dot")).recent_paid_hires.length, 0);
    assert.equal(
      (await alice.getAccount(dot.worker_account).view("accounting", {}))
        .recognized,
      "0",
    );
    // Alice -> Carol preserves Bob's frozen paid rights for BOTH placements.
    for (const placement of ["escort", "infiltration"]) {
      const token_id = placement === "escort" ? "nix" : "peebles";
      const args = await argsFor(token_id);
      await call(
        bob,
        "hire_and_open",
        { ...args, placement },
        (bond + BigInt(args.expected_quote)).toString(),
      );
      const before = await worker(token_id),
        job = before.job;
      const work = alice.getAccount(before.worker_account);
      const accountBefore = await work.view("accounting", {});
      await call(
        alice,
        "nft_approve",
        { token_id, account_id: bob.accountId, msg: null },
        "10000000000000000000000",
      );
      const approval = (await view("nft_token", { token_id }))
        .approved_account_ids[bob.accountId];
      await call(
        alice,
        "nft_transfer",
        { token_id, receiver_id: carol.accountId },
        "1",
      );
      await reject(
        bob,
        "nft_transfer",
        { token_id, receiver_id: bob.accountId, approval_id: approval },
        "1",
      );
      assert.equal((await worker(token_id)).token.owner_id, carol.accountId);
      assert.deepEqual((await worker(token_id)).job, job);
      await reject(alice, "request_claim", {
        token_id,
        amount: accountBefore.claimable,
      });
      // Complete deterministically through the real engine; no claimed browser outcome is trusted.
      let state = JSON.parse(configure(JSON.stringify(job.config)));
      while (!state.outcome)
        state = JSON.parse(
          apply(
            JSON.stringify(state.log),
            JSON.stringify({ kind: "end_phase" }),
          ),
        ).state;
      await call(bob, "settle", {
        job_id: job.job_id,
        action_log: JSON.stringify(state.log),
      });
      assert.equal(
        (await view("get_job", { job_id: job.job_id })).record.outcome,
        state.outcome,
      );
      await alice.transfer(work.accountId, "100000000000000000000000");
      assert.equal(
        (await work.view("accounting", {})).claimable,
        accountBefore.claimable,
      );
      await call(carol, "request_claim", {
        token_id,
        amount: accountBefore.claimable,
      });
      await call(carol, "reconcile_claim", { token_id });
      assert.equal((await worker(token_id)).claim.status, "paid");
      assert.equal((await work.view("accounting", {})).recognized, "0");
    }
    // Standard rejection/failure rollback restores title and original approval IDs.
    await call(
      alice,
      "nft_approve",
      { token_id: "mallow", account_id: bob.accountId, msg: null },
      "10000000000000000000000",
    );
    const prior = await view("nft_token", { token_id: "mallow" });
    await raw(
      bob,
      "nft_transfer_call",
      {
        token_id: "mallow",
        receiver_id: carol.accountId,
        approval_id: prior.approved_account_ids[bob.accountId],
        msg: "reject",
      },
      "1",
    );
    assert.deepEqual(await view("nft_token", { token_id: "mallow" }), prior);
    assert.equal((await worker("mallow")).status, "idle");
    // Receivers that explicitly return true roll back; false retains title.
    const receiver = await alice.createSubAccount("receiver");
    for (const accept of [false, true]) {
      const artifact = resolve(
        tmpdir(),
        `mutiny-market-receiver-${process.pid}.wasm`,
      );
      execFileSync("rustc", [
        "--edition=2024",
        "--target=wasm32-unknown-unknown",
        "--crate-type=cdylib",
        "-C",
        "panic=abort",
        "-O",
        ...(accept ? ["--cfg", "accept"] : []),
        "tests/fixtures/nft-receiver.rs",
        "-o",
        artifact,
      ]);
      await receiver.deploy(await readFile(artifact));
      await call(
        bob,
        "nft_transfer_call",
        {
          token_id: "mallow",
          receiver_id: receiver.accountId,
          approval_id: prior.approved_account_ids[bob.accountId],
          msg: "",
        },
        "1",
      );
      assert.equal(
        (await view("nft_token", { token_id: "mallow" })).owner_id,
        accept ? receiver.accountId : alice.accountId,
      );
      if (!accept)
        assert.deepEqual(
          await view("nft_token", { token_id: "mallow" }),
          prior,
        );
      assert.equal((await worker("mallow")).status, "idle");
    }
    // A provisional transfer-call recipient cannot take earnings before rollback.
    {
      const artifact = resolve(
        tmpdir(),
        `mutiny-market-receiver-claim-${process.pid}.wasm`,
      );
      execFileSync("rustc", [
        "--edition=2024",
        "--target=wasm32-unknown-unknown",
        "--crate-type=cdylib",
        "-C",
        "panic=abort",
        "-O",
        "--cfg",
        "claim",
        "tests/fixtures/nft-receiver.rs",
        "-o",
        artifact,
      ]);
      await receiver.deploy(await readFile(artifact));
      const work = alice.getAccount((await worker("rook")).worker_account);
      const held = (await work.accountView()).amount;
      await raw(
        alice,
        "nft_transfer_call",
        { token_id: "rook", receiver_id: receiver.accountId, msg: "claim" },
        "1",
      );
      assert.equal((await worker("rook")).token.owner_id, alice.accountId);
      assert.equal((await worker("rook")).claim, null);
      assert.equal((await work.accountView()).amount, held);
    }
    // An unresolved payout on ONE worker blocks both transfer entrypoints, not other workers.
    const w = await worker("rook"),
      work = alice.getAccount(w.worker_account);
    await patchCode(work, withoutExport(workerCode, "on_payout"));
    const amount = (await work.view("accounting", {})).claimable;
    await call(alice, "request_claim", { token_id: "rook", amount });
    await reject(
      alice,
      "nft_transfer",
      { token_id: "rook", receiver_id: carol.accountId },
      "1",
    );
    await reject(
      alice,
      "nft_transfer_call",
      { token_id: "rook", receiver_id: carol.accountId, msg: "" },
      "1",
    );
    await call(
      alice,
      "nft_transfer",
      { token_id: "brisk", receiver_id: carol.accountId },
      "1",
    );
    await patchCode(work, workerCode);
    const paid = (await work.accountView()).amount;
    await call(bob, "reconcile_claim", { token_id: "rook" });
    assert.equal((await work.accountView()).amount, paid);
    assert.equal((await worker("rook")).claim.status, "pending");
    await call(alice, "repair_native_callback", {
      token_id: "rook",
      job_id: null,
      succeeded: true,
      receipt_id: "a".repeat(44),
    });
    await call(bob, "reconcile_claim", { token_id: "rook" });
    assert.equal((await worker("rook")).claim.status, "paid");
    await call(
      alice,
      "nft_transfer",
      { token_id: "rook", receiver_id: carol.accountId },
      "1",
    );
    console.log(
      "Market sandbox passed: six keyless identities, two offers, exact independent clocks, stable cheapest, shared hire race, stale price, withdrawn owner self-use, cooldown, paid history, both active-transfer placements and saved replay, stale approvals, former-owner rejection/current-owner claim, rollback, per-token claim locks and donation exclusion.",
    );
    await testHistory();
  }
} finally {
  await chain.tearDown();
}
