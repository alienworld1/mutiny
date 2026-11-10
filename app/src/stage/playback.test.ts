/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Container, Sprite, Texture, TextureSource } from "pixi.js";
import * as engine from "../game/engine";
import { planPlayback, playEvents } from "./playback";

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
    const plan = planPlayback({ before, events: next.events });
    expect(plan.moves.find((move) => move.id === 0)?.cells).toEqual([
      32, 31, 38,
    ]);
    expect(plan.moves.find((move) => move.id === "cart")?.cells).toEqual([
      37, 30,
    ]);
    expect(JSON.stringify(before)).toBe(frozen);
    expect(next.state.pushes).toBe(1);
  });
  it("resolves swap positions after movement and displacement in event order", () => {
    const before = engine.start();
    const plan = planPlayback({
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
    expect(
      plan.moves.filter((move) => move.id === 0).map((move) => move.cells),
    ).toEqual([
      [32, 31],
      [31, 38],
    ]);
    expect(
      plan.moves.filter((move) => move.id === 1).map((move) => move.cells),
    ).toEqual([
      [before.setup.units[1]!.cell, 38],
      [38, 31],
    ]);
  });
  it("never turns a blocked order or refusal into motion or a strike", () => {
    const before = engine.start();
    expect(
      planPlayback({
        before,
        events: [
          { kind: "blocked", unit: 4, reason: "Occupied" },
          { kind: "refused", unit: 1, reason: "Fire" },
          { kind: "strike", unit: 4, cell: 25, reason: "Fire" },
        ],
      }).moves.length,
    ).toBe(0);
  });
  it("gives the objection and Borrow exchange bounded, distinct beats", () => {
    const plan = planPlayback({
      before: engine.start(),
      events: [
        { kind: "strike", unit: 4, cell: 25, reason: "Fire" },
        { kind: "borrowed", unit: 4 },
      ],
    });
    expect(plan.beats.map((beat) => [beat.at, beat.duration])).toEqual([
      [0, 600],
      [600, 450],
    ]);
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
        new Map([[0, { body, labels, depth: 482 }]]),
        { before, events: [{ kind: "moved", unit: 0, path: [31, 38] }] },
        vi.fn(),
      );
      frame!(150);
      expect(body.y).toBe(-64);
      expect(body.zIndex).toBe(418);
      expect(labels.y).toBe(body.y);
      stop();
      expect(cancel).toHaveBeenCalledWith(1);
      expect([body.x, body.y, labels.x, labels.y]).toEqual([0, 0, 0, 0]);
      expect(body.zIndex).toBe(482);
      expect(root.children).toHaveLength(2);
      expect(JSON.stringify(before)).toBe(frozen);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      root.destroy({ children: true });
    }
  });
  it("shows movement before a push and an attack before its real damage", () => {
    const plan = planPlayback({
      before: engine.start(),
      events: [
        { kind: "moved", unit: 0, path: [31, 38] },
        { kind: "pushed", from: 37, to: 30 },
        { kind: "attacked", unit: 0, affected: [24] },
        { kind: "damaged", target: 3, hp: 2 },
        { kind: "strike", unit: 4, cell: 25, reason: "Fire" },
      ],
    });
    expect(plan.moves.map((move) => move.at)).toEqual([0, 300]);
    expect(plan.beats.find((beat) => beat.event.kind === "attacked")?.at).toBe(
      600,
    );
    const hit = plan.beats.find((beat) => beat.event.kind === "damaged")!;
    expect(hit.at).toBe(720);
    expect(hit.damage).toBe(1);
    expect(
      plan.beats.find((beat) => beat.event.kind === "strike")!.at,
    ).toBeGreaterThanOrEqual(hit.at + hit.duration);
  });
  it("keeps an earlier knockout down during another unit's animation", () => {
    const before = engine.start();
    before.setup.units[3]!.hp = 0;
    const root = new Container(),
      body = new Container(),
      labels = new Container(),
      figure = new Sprite(Texture.EMPTY);
    figure.alpha = 0.35;
    figure.rotation = -1.1;
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("document", { hidden: false });
    vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      const stop = playEvents(
        root,
        new Map([[3, { body, labels, figure, defeated: true }]]),
        { before, events: [{ kind: "moved", unit: 0, path: [31, 38] }] },
        vi.fn(),
      );
      frame!(150);
      expect(figure.alpha).toBe(0.35);
      expect(figure.rotation).toBe(-1.1);
      stop();
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      root.destroy({ children: true });
      body.destroy();
      labels.destroy();
      figure.destroy();
    }
  });
  it("anchors cart protection feedback to the cart rather than a missing unit", () => {
    const before = engine.start();
    const plan = planPlayback({
      before,
      events: [{ kind: "protected", unit: -1, source: "certificate" }],
    });
    expect(plan.beats[0]?.id).toBe("cart");
    expect(plan.beats[0]?.cell).toBe(before.cart_cell);
  });
  it("normalizes square action frames to the same height and emits each cue once", () => {
    const before = engine.start();
    const root = new Container(),
      body = new Container(),
      labels = new Container();
    const idle = new Texture({
      source: new TextureSource({ width: 384, height: 512 }),
    });
    const walk = new Texture({
      source: new TextureSource({ width: 256, height: 256 }),
    });
    const figure = new Sprite(idle);
    figure.height = 84;
    figure.scale.x = figure.scale.y;
    const cues = vi.fn();
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (next: FrameRequestCallback) => {
      frame = next;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("document", { hidden: false });
    vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      const stop = playEvents(
        root,
        new Map([[0, { body, labels, figure, poses: { idle, walk } }]]),
        {
          before,
          events: [
            { kind: "moved", unit: 0, path: [31, 38] },
            { kind: "pushed", from: 37, to: 30 },
          ],
        },
        vi.fn(),
        undefined,
        cues,
      );
      frame!(150);
      expect(figure.texture).toBe(walk);
      expect(figure.height).toBe(84);
      expect(figure.width).toBe(84);
      frame!(150);
      frame!(310);
      expect(cues.mock.calls.map(([event]) => event.kind)).toEqual([
        "footstep",
        "footstep",
        "pushed",
      ]);
      stop();
      expect(figure.texture).toBe(idle);
      expect(figure.height).toBe(84);
      expect(figure.width).toBe(63);
      frame!(500);
      expect(cues).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      root.destroy({ children: true });
      body.destroy();
      labels.destroy();
      figure.destroy();
      idle.destroy(true);
      walk.destroy(true);
    }
  });
});
