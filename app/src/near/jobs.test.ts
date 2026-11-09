/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as engine from "../game/engine";
import type { ActionLog } from "../game/types";
import {
  digest,
  nearAmount,
  yoctoAmount,
  parseEarnings,
  openingState,
  parseJob,
  parseWorker,
  workerTokens,
  workerIndices,
  sameConfig,
  verifyRecord,
} from "./jobs";
import type { Job } from "./jobs";
const { default: init } = await import("../game/wasm/game_web");
await init({
  module_or_path: readFileSync(
    new URL("../game/wasm/game_web_bg.wasm", import.meta.url),
  ),
});
await engine.loadEngine();
const refs = JSON.parse(
  readFileSync("../crates/game-core/tests/fixtures/winning-logs.json", "utf8"),
) as { log: ActionLog }[];
const log = refs[0]!.log;
const opening = engine.configure(log.config);
const job: Job = {
  job_id: "1",
  renter_id: "owner.testnet",
  token_id: "rook",
  worker_account: "rook.registry.testnet",
  config: log.config,
  unit_slot: 1,
  rules_version: opening.log.rules_version,
  content_version: opening.log.content_version,
  content_hash: "content",
  setup_hash: await digest(
    new TextEncoder().encode(JSON.stringify(opening.setup)),
  ),
  accepted_fee: "0",
  created_at_block: "10",
  expires_at_block: "2410",
  status: "active",
  cooldown_until: "0",
  record: null,
  bond: "30000000000000000000000",
  storage_bytes: 500,
  refund_owed: "0",
  refund_in_flight: false,
};
describe("Contract Job trust boundaries", () => {
  it("requires the exact frozen opening and supported local rules", async () => {
    expect(await openingState(job, opening)).toEqual(opening);
    const sorted = JSON.parse(
      JSON.stringify(opening),
      (_key, value: unknown) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
            )
          : value,
    );
    expect(await openingState(job, sorted)).toEqual(opening);
    await expect(
      openingState({ ...job, unit_slot: 4 }, opening),
    ).rejects.toThrow("frozen job");
    await expect(
      openingState({ ...job, rules_version: 999 }, opening),
    ).rejects.toThrow("frozen job");
    await expect(
      openingState(job, { ...opening, cart_hp: 99 }),
    ).rejects.toThrow("frozen job");
  });
  it("accepts only a record committed to the complete canonical actions and final state", async () => {
    const bytes = engine.canonical(log),
      setup = Uint8Array.from(atob(job.setup_hash), (c) => c.charCodeAt(0));
    const combined = new Uint8Array(setup.length + bytes.length);
    combined.set(setup);
    combined.set(bytes, setup.length);
    const state = engine.replay(log).state;
    const record = {
      outcome: state.outcome,
      round: state.round,
      cart_hp: state.cart_hp,
      strikes: state.strikes,
      commitment: await digest(combined),
      final_hash: await digest(new TextEncoder().encode(JSON.stringify(state))),
    };
    expect(await verifyRecord(job, log, record)).toEqual(record);
    await expect(
      verifyRecord(job, log, { ...record, commitment: "invented" }),
    ).rejects.toThrow("does not match");
    await expect(
      verifyRecord(job, log, { ...record, final_hash: "invented" }),
    ).rejects.toThrow("does not match");
    await expect(verifyRecord(job, log, null)).rejects.toThrow("not confirmed");
    await expect(
      verifyRecord(job, log, { ...record, cart_hp: 99 }),
    ).rejects.toThrow("does not match");
  });
  it("rejects untrusted job identities and unsupported worker configurations", () => {
    expect(parseJob(job)).toEqual(job);
    expect(() =>
      parseJob({
        ...job,
        employment: {
          commission_id: "0",
          dispatch_id: "0",
          leg: 0,
          objective: "routine",
          payment: "50000000000000000000000",
          company_contribution: "1",
          earned: "0",
          closed: false,
        },
      }),
    ).toThrow("Invalid commission");
    expect(() => parseJob({ ...job, accepted_fee: "-1" })).toThrow(
      "Invalid job",
    );
    expect(() =>
      parseJob({ ...job, config: { ...log.config, worker: 2 } }),
    ).toThrow("Invalid job");
    expect(() => parseJob({ ...job, expires_at_block: 4 })).toThrow(
      "Invalid job",
    );
  });
  it("compares configuration values independently of JSON key ordering", () => {
    expect(
      sameConfig(log.config, {
        setup_id: log.config.setup_id,
        placement: log.config.placement,
        worker: log.config.worker,
        package_option: log.config.package_option,
      }),
    ).toBe(true);
    expect(
      sameConfig(log.config, { ...log.config, placement: "infiltration" }),
    ).toBe(false);
  });
  it("formats storage funds exactly without floating point", () => {
    expect(nearAmount(job.bond)).toBe("0.03");
    expect(nearAmount("1000000000000000000000001")).toBe(
      "1.000000000000000000000001",
    );
  });
});

it("parses exact NEAR values and rejects imprecise or untrusted amounts", () => {
  expect(yoctoAmount("0.004000000000000000000001")).toBe(
    4000000000000000000001n,
  );
  for (const invalid of ["-1", "1e5", "0.0000000000000000000000001", "NaN"])
    expect(() => yoctoAmount(invalid)).toThrow();
  expect(() => parseEarnings({ claimable: "100" })).toThrow();
  expect(
    parseJob({
      ...job,
      accepted_fee: "4000000000000000000001",
      status: "payment_pending",
    }).status,
  ).toBe("payment_pending");
});

describe("six-worker market boundaries", () => {
  function worker(index: number) {
    const token = workerTokens[index]!,
      cfg = { ...log.config, worker: workerIndices[index]! };
    const opening = engine.configure(cfg),
      unit = opening.setup.units[1]!;
    const offer = {
      package_option: 0,
      starting_ask: "4000000000000000000000",
      floor_ask: "1000000000000000000000",
      discount_step: "0",
      available_since: "1",
    };
    return {
      token: { token_id: token, owner_id: "alice.testnet" },
      worker_account: `${token}.registry.testnet`,
      character: unit.name,
      role: unit.role,
      packages: [0, 1].map(
        (package_option) =>
          engine.configure({ ...cfg, package_option }).setup.units[1]!.package,
      ),
      visual_identity: token,
      status: "idle",
      block_height: "2",
      job_storage_deposit: job.bond,
      content_hash: "content",
      offers: [offer, null],
      quotes: [offer.starting_ask, null],
      recent_paid_hires: [],
    };
  }
  it("accepts all six immutable identities and rejects mismatched packages and frozen worker IDs", () => {
    for (let i = 0; i < 6; i++) {
      const w = worker(i);
      expect(parseWorker(w).token.token_id).toBe(workerTokens[i]);
      expect(() => parseWorker({ ...w, packages: ["none", "fire"] })).toThrow(
        "identity",
      );
      expect(() =>
        parseJob({
          ...job,
          token_id: workerTokens[i],
          config: { ...job.config, worker: 99 },
        }),
      ).toThrow("Invalid job");
    }
  });
  it("rejects malformed offers, self-use advertised as paid history and cross-token history", () => {
    const w = worker(0);
    expect(() => parseWorker({ ...w, quotes: ["invented", null] })).toThrow(
      "offer",
    );
    expect(() => parseWorker({ ...w, offers: [w.offers[0]] })).toThrow(
      "offers",
    );
    expect(() => parseWorker({ ...w, recent_paid_hires: [job] })).toThrow(
      "paid hire history",
    );
    expect(() =>
      parseWorker({
        ...worker(1),
        recent_paid_hires: [{ ...job, accepted_fee: "1" }],
      }),
    ).toThrow("paid hire history");
    expect(() =>
      parseWorker({
        ...w,
        recent_paid_hires: Array.from({ length: 11 }, () => ({
          ...job,
          accepted_fee: "1",
        })),
      }),
    ).toThrow("history");
  });
});
