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
  });
  it("rejects untrusted job identities and unsupported worker configurations", () => {
    expect(parseJob(job)).toEqual(job);
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
