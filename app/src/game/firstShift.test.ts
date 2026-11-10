/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as engine from "./engine";
import {
  firstShiftCommands,
  firstShiftConfig,
  firstShiftStep,
  sameCommand,
} from "./firstShift";
import type { Command } from "./types";

const { default: init } = await import("./wasm/game_web");
await init({
  module_or_path: readFileSync(
    new URL("./wasm/game_web_bg.wasm", import.meta.url),
  ),
});
await engine.loadEngine();

describe("First Shift uses the real battle rules", () => {
  it("causes a strike, borrows next round, deals damage and leaves a winnable delivery", () => {
    let state = engine.configure(firstShiftConfig);
    const events = [];
    for (const [index, command] of firstShiftCommands.entries()) {
      expect(firstShiftStep(state)).toBe(index);
      const next = engine.apply(state.log, command);
      events.push(...next.events);
      state = next.state;
      if (index === 2) {
        expect(state.round).toBe(2);
        expect(state.setup.units[4]!.status).toBe("striking");
      }
    }
    expect(firstShiftStep(state)).toBe(5);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "strike", unit: 4 }),
    );
    expect(events).toContainEqual({ kind: "borrowed", unit: 4 });
    expect(state.setup.units[3]!.hp).toBe(2);
    const finish: Command[] = [
      { kind: "activate", unit: 1, path: [37], action: { kind: "push" } },
      { kind: "end_phase" },
      { kind: "activate", unit: 1, path: [30], action: { kind: "push" } },
    ];
    for (const command of finish)
      state = engine.apply(state.log, command).state;
    expect(state.outcome).toBe("delivered");
    expect(state.cart_hp).toBe(2);
    expect(state.setup.units[4]!.side).toBe("enemy");
    expect(engine.replay(state.log).state).toEqual(state);
  });

  it("only resumes the lesson for the matching crew and command prefix", () => {
    const state = engine.configure(firstShiftConfig);
    expect(
      firstShiftStep(engine.apply(state.log, { kind: "end_phase" }).state),
    ).toBeNull();
    expect(
      firstShiftStep(engine.configure({ ...firstShiftConfig, worker: 1 })),
    ).toBeNull();
    expect(
      firstShiftStep(
        engine.configure({ ...firstShiftConfig, placement: "infiltration" }),
      ),
    ).toBeNull();
    expect(
      sameCommand(firstShiftCommands[3]!, {
        kind: "activate",
        unit: 0,
        path: [],
        action: { kind: "borrow", target: 4 },
      }),
    ).toBe(false);
    expect(
      sameCommand(firstShiftCommands[1]!, {
        kind: "activate",
        unit: 0,
        path: [],
        action: { kind: "burn", cell: 24 },
      }),
    ).toBe(false);
  });
});
