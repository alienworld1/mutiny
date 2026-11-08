/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Container } from "pixi.js";
import * as engine from "../game/engine";
import { motionTracks, playEvents } from "./playback";

const { default: init } = await import("../game/wasm/game_web");
await init({
  module_or_path: readFileSync(
    new URL("../game/wasm/game_web_bg.wasm", import.meta.url),
  ),
});
await engine.loadEngine();

describe("committed event playback", () => {
  it("keeps intermediate move and cart waypoints without mutating the game", () => {
    const before = engine.start();
    const frozen = JSON.stringify(before);
    const next = engine.apply(before.log, {
      kind: "activate",
      unit: 0,
      path: [31, 38],
      action: { kind: "push" },
    });
    const tracks = motionTracks({ before, events: next.events });
    expect(tracks.get(0)).toEqual([32, 31, 38]);
    expect(tracks.get("cart")).toEqual([37, 30]);
    expect(JSON.stringify(before)).toBe(frozen);
    expect(next.state.pushes).toBe(1);
  });
  it("resolves swap positions after movement and displacement in event order", () => {
    const before = engine.start();
    const tracks = motionTracks({
      before,
      events: [
        { kind: "moved", unit: 0, path: [31] },
        {
          kind: "displaced",
          unit: 1,
          from: before.setup.units[1]!.cell,
          to: 38,
        },
        { kind: "swapped", unit: 0, target: 1 },
      ],
    });
    expect(tracks.get(0)).toEqual([32, 31, 38]);
    expect(tracks.get(1)).toEqual([before.setup.units[1]!.cell, 38, 31]);
  });
  it("never turns a blocked order or refusal into motion or a strike", () => {
    const before = engine.start();
    expect(
      motionTracks({
        before,
        events: [
          { kind: "blocked", unit: 4, reason: "Occupied" },
          { kind: "refused", unit: 1, reason: "Fire" },
          { kind: "strike", unit: 4, cell: 25, reason: "Fire" },
        ],
      }).size,
    ).toBe(0);
  });
  it("cancels an interrupted frame and restores sprites and labels without another game action", () => {
    const before = engine.start();
    const frozen = JSON.stringify(before);
    const root = new Container(),
      body = new Container(),
      labels = new Container();
    root.addChild(body, labels);
    let frame: FrameRequestCallback | undefined;
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", cancel);
    vi.stubGlobal("document", { hidden: false });
    vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      const stop = playEvents(
        root,
        new Map([[0, { body, labels }]]),
        { before, events: [{ kind: "moved", unit: 0, path: [31, 38] }] },
        vi.fn(),
      );
      frame!(150);
      expect(body.y).toBe(-64);
      expect(labels.y).toBe(body.y);
      stop();
      expect(cancel).toHaveBeenCalledWith(1);
      expect([body.x, body.y, labels.x, labels.y]).toEqual([0, 0, 0, 0]);
      expect(root.children).toHaveLength(2);
      expect(JSON.stringify(before)).toBe(frozen);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      root.destroy({ children: true });
    }
  });
});
