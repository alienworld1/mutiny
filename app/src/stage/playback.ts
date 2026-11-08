import { Container, Graphics, Text } from "pixi.js";
import type { Event, State } from "../game/types";
import { palette as C } from "./palette";
import { cellToScreen } from "./projection";

export type Entity = number | "cart";
export interface EntityView {
  body: Container;
  labels: Container;
}
export interface Playback {
  before: State;
  events: Event[];
}

// Only presentation data: every waypoint and reaction comes from a committed event.
export function motionTracks({ before, events }: Playback) {
  const tracks = new Map<Entity, number[]>();
  const append = (id: Entity, cells: number[]) => {
    const start =
      id === "cart" ? before.cart_cell : before.setup.units[id]!.cell;
    const track = tracks.get(id) ?? [start];
    track.push(...cells);
    tracks.set(id, track);
  };
  const positions = new Map(before.setup.units.map((u) => [u.id, u.cell]));
  for (const event of events) {
    if (event.kind === "moved") {
      append(event.unit, event.path);
      positions.set(
        event.unit,
        event.path.at(-1) ?? positions.get(event.unit)!,
      );
    } else if (event.kind === "displaced") {
      append(event.unit, [event.to]);
      positions.set(event.unit, event.to);
    } else if (event.kind === "swapped") {
      const a = positions.get(event.unit)!,
        b = positions.get(event.target)!;
      append(event.unit, [b]);
      append(event.target, [a]);
      positions.set(event.unit, b);
      positions.set(event.target, a);
    } else if (event.kind === "pushed") append("cart", [event.to]);
  }
  return tracks;
}

export function playEvents(
  root: Container,
  entities: Map<Entity, EntityView>,
  playback: Playback,
  render: () => void,
) {
  const tracks = motionTracks(playback);
  const reactions = new Map<Entity, "hit" | "strike" | "action" | "borrow">();
  const effects = new Container();
  root.addChild(effects);
  for (const event of playback.events) {
    const cell = "cell" in event ? event.cell : null;
    if (
      cell !== null &&
      ["strike", "ignited", "smoked", "certified"].includes(event.kind)
    ) {
      const point = cellToScreen(cell);
      effects.addChild(
        new Graphics().circle(point.x, point.y, 27).stroke({
          color: event.kind === "strike" ? C.enemy : C.dark,
          width: 3,
        }),
      );
    }
    if (event.kind === "attacked")
      for (const cell of event.affected) {
        const point = cellToScreen(cell);
        effects.addChild(
          new Graphics()
            .moveTo(point.x - 10, point.y - 10)
            .lineTo(point.x + 10, point.y + 10)
            .moveTo(point.x + 10, point.y - 10)
            .lineTo(point.x - 10, point.y + 10)
            .stroke({ color: C.enemy, width: 3 }),
        );
      }
    if (event.kind === "blocked" || event.kind === "refused") {
      const point = cellToScreen(playback.before.setup.units[event.unit]!.cell);
      const text = new Text({
        text: event.kind === "blocked" ? "BLOCKED" : "REFUSED",
        style: {
          fontFamily: "Atkinson Hyperlegible Next",
          fontSize: 11,
          fontWeight: "bold",
          fill: C.ink,
        },
      });
      text.anchor.set(0.5);
      text.position.set(point.x, point.y - 60);
      effects.addChild(text);
    }
  }
  for (const event of playback.events) {
    if (event.kind === "damaged")
      reactions.set(event.target < 0 ? "cart" : event.target, "hit");
    else if (event.kind === "strike") reactions.set(event.unit, "strike");
    else if (event.kind === "borrowed") reactions.set(event.unit, "borrow");
    else if (event.kind === "attacked" && !reactions.has(event.unit))
      reactions.set(event.unit, "action");
  }
  let frame = 0;
  let disposed = false;
  const movementDuration = Math.max(
    0,
    ...Array.from(tracks, ([id, cells]) =>
      id === "cart" ? 270 : Math.min(650, (cells.length - 1) * 150),
    ),
  );
  const reactionDuration = reactions.size || effects.children.length ? 540 : 0;
  const start = performance.now();
  const reset = () => {
    for (const view of entities.values()) {
      for (const entity of [view.body, view.labels]) {
        entity.position.set(0, 0);
        entity.alpha = 1;
      }
    }
  };
  const tick = (now: number) => {
    if (disposed) return;
    reset();
    const elapsed = now - start;
    for (const [id, cells] of tracks) {
      const view = entities.get(id);
      if (!view || cells.length < 2) continue;
      const duration =
        id === "cart" ? 270 : Math.min(650, (cells.length - 1) * 150);
      const progress = Math.min(1, elapsed / duration) * (cells.length - 1);
      const index = Math.min(cells.length - 2, Math.floor(progress));
      const t = progress - index;
      const a = cellToScreen(cells[index]!),
        b = cellToScreen(cells[index + 1]!);
      const end = cellToScreen(cells.at(-1)!);
      for (const entity of [view.body, view.labels])
        entity.position.set(
          a.x + (b.x - a.x) * t - end.x,
          a.y + (b.y - a.y) * t - end.y,
        );
    }
    const t = Math.max(0, Math.min(1, (elapsed - movementDuration) / 540));
    effects.alpha = elapsed < movementDuration ? 0 : 1 - t;
    for (const [id, reaction] of reactions) {
      const view = entities.get(id);
      if (!view) continue;
      const weight = Math.sin(t * Math.PI);
      for (const entity of [view.body, view.labels]) {
        if (reaction === "hit") {
          entity.x += Math.sin(t * Math.PI * 6) * 5 * (1 - t);
          entity.alpha = 1 - weight * 0.35;
        } else if (reaction === "strike")
          entity.x += Math.sin(t * Math.PI * 2) * 5;
        else entity.y -= weight * (reaction === "borrow" ? 9 : 4);
      }
    }
    render();
    if (elapsed < movementDuration + reactionDuration && !document.hidden)
      frame = requestAnimationFrame(tick);
    else {
      reset();
      effects.destroy({ children: true });
      disposed = true;
      render();
    }
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    reset();
    if (!disposed) effects.destroy({ children: true });
    disposed = true;
  };
}
