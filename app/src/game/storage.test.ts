/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { emptyProgress, record, goals } from "./storage";
import { loadEngine, replay } from "./engine";
import type { ActionLog } from "./types";
// Use the same real Rust engine and fixed logs as native/parity verification.
const { default: init } = await import("./wasm/game_web");
await init({
  module_or_path: readFileSync(
    new URL("./wasm/game_web_bg.wasm", import.meta.url),
  ),
});
await loadEngine();
const refs = JSON.parse(
  readFileSync("../crates/game-core/tests/fixtures/winning-logs.json", "utf8"),
) as { log: ActionLog }[];
describe("bounded local Ledger", () => {
  it("records completion once across refresh and retains independent goal stamps", () => {
    const state = replay(refs[0]!.log).state;
    const first = record(emptyProgress(), "one", state);
    const duplicate = record(first, "one", state);
    expect(duplicate.ledger[state.setup.id]).toEqual(
      first.ledger[state.setup.id],
    );
    const slower = { ...state, round: 5, cart_hp: 1 };
    const second = record(duplicate, "two", slower);
    const entry = second.ledger[state.setup.id]!;
    expect(entry.attempts).toBe(2);
    expect(entry.completions).toBe(2);
    expect(entry.goals).toEqual([true, true, true]);
    expect(entry.previous?.rounds).toBe(3);
    expect(entry.latest?.rounds).toBe(5);
    expect(entry.best?.rounds).toBe(3);
    expect(first.ledger[state.setup.id]?.attempts).toBe(1);
  });
  it("keeps 64 attempt IDs and one raw log per variant", () => {
    const state = replay(refs[0]!.log).state;
    let progress = emptyProgress();
    for (let i = 0; i < 100; i++) progress = record(progress, String(i), state);
    expect(progress.attempts).toHaveLength(64);
    expect(progress.completed).toHaveLength(64);
    expect(Object.keys(progress.ledger)).toHaveLength(1);
    expect(progress.ledger[state.setup.id]?.attempts).toBe(100);
  });
  it("awards no goals for a loss", () => {
    expect(
      goals({
        outcome: "cart_lost",
        rounds: 2,
        cart: 0,
        strikes: 0,
        borrowed: false,
        crew: "Rook",
        placement: "escort",
      }),
    ).toEqual([false, false, false]);
  });
});
