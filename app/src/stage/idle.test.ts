import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { expect, it, vi } from "vitest";
import { startIdle } from "./idle";

it("animates figures and hazards without moving logical bases, and cleans up", () => {
  const body = new Container(),
    labels = new Container(),
    figure = new Sprite(Texture.EMPTY),
    fire = new Graphics(),
    flag = new Graphics();
  body.position.set(20, 40);
  figure.scale.set(2);
  fire.position.set(100, 120);
  flag.scale.set(0.2);
  let frame: FrameRequestCallback | undefined;
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (next: FrameRequestCallback) => {
    frame = next;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal("document", { hidden: false });
  vi.spyOn(performance, "now").mockReturnValue(0);
  try {
    const stop = startIdle(
      {
        entities: new Map([[0, { body, labels, figure }]]),
        hazards: [
          { view: fire, kind: "fire", phase: 2 },
          { view: flag, kind: "flag", phase: 1 },
        ],
      },
      vi.fn(),
    );
    frame!(1000);
    expect(figure.scale.y).toBe(2);
    expect(figure.rotation).toBe(0);
    frame!(3350);
    expect(figure.rotation).not.toBe(0);
    expect(figure.scale.y).toBe(2);
    frame!(4000);
    expect(figure.rotation).toBe(0);
    expect(fire.scale.y).not.toBe(1);
    expect(flag.scale.y).toBeGreaterThan(0.18);
    expect(flag.scale.y).toBeLessThan(0.22);
    expect([body.x, body.y]).toEqual([20, 40]);
    stop();
    expect(cancel).toHaveBeenCalledWith(1);
    expect(figure.scale.y).toBe(2);
    expect(fire.scale.y).toBe(1);
    expect(flag.scale.y).toBe(0.2);
    expect([fire.x, fire.y]).toEqual([100, 120]);
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    body.destroy();
    labels.destroy();
    figure.destroy();
    fire.destroy();
    flag.destroy();
  }
});
