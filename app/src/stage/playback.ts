import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { Event, State } from "../game/types";
import { palette as C } from "./palette";
import { cellToScreen } from "./projection";

export type PlaybackCue = Event | { kind: "footstep" };
export type Entity = number | "cart";
export interface EntityView {
  body: Container;
  labels: Container;
  figure?: Sprite;
  picket?: Container;
  selection?: Container;
  busy?: boolean;
  defeated?: boolean;
  poses?: {
    idle?: Texture;
    walk?: Texture;
    action?: Texture;
    refuse?: Texture;
  };
}
export interface HazardView {
  view: Container;
  kind: "fire" | "smoke" | "ember" | "water" | "flag";
  phase: number;
}
export interface StageView {
  entities: Map<Entity, EntityView>;
  hazards: HazardView[];
}
export interface Playback {
  before: State;
  events: Event[];
}
interface Move {
  id: Entity;
  cells: number[];
  at: number;
  duration: number;
}
interface Beat {
  event: Event;
  id: Entity | null;
  cell: number;
  origin: number;
  at: number;
  duration: number;
  damage: number;
}

// Schedule the engine's events in their actual order; this never resolves a rule.
export function planPlayback({ before, events }: Playback) {
  const positions = new Map<Entity, number>(
    before.setup.units.map((u) => [u.id, u.cell]),
  );
  positions.set("cart", before.cart_cell);
  const hp = new Map<Entity, number>(
    before.setup.units.map((u) => [u.id, u.hp]),
  );
  hp.set("cart", before.cart_hp);
  const moves: Move[] = [],
    beats: Beat[] = [];
  let cursor = 0,
    impact: number | null = null;
  function move(id: Entity, cells: number[], duration: number, at = cursor) {
    moves.push({ id, cells: [positions.get(id)!, ...cells], duration, at });
    positions.set(id, cells.at(-1) ?? positions.get(id)!);
  }
  for (const event of events) {
    if (event.kind === "moved") {
      const duration = Math.min(600, event.path.length * 150);
      move(event.unit, event.path, duration);
      cursor += duration;
      impact = null;
      continue;
    }
    if (event.kind === "displaced") {
      move(event.unit, [event.to], 240);
      cursor += 240;
      impact = null;
      continue;
    }
    if (event.kind === "swapped") {
      const a = positions.get(event.unit)!,
        b = positions.get(event.target)!;
      move(event.unit, [b], 260);
      move(event.target, [a], 260);
      cursor += 260;
      impact = null;
      continue;
    }
    if (event.kind === "recovering" || event.kind === "recovered") continue;
    const id: Entity | null =
      "unit" in event
        ? event.unit < 0
          ? "cart"
          : event.unit
        : event.kind === "damaged"
          ? event.target < 0
            ? "cart"
            : event.target
          : event.kind === "pushed" || event.kind === "ended"
            ? "cart"
            : null;
    const origin = id === null ? before.cart_cell : positions.get(id)!;
    const cell =
      "cell" in event
        ? event.cell
        : event.kind === "attacked"
          ? (event.affected[0] ?? origin)
          : origin;
    let at = cursor,
      duration = 280,
      damage = 0;
    if (event.kind === "pushed") {
      duration = 300;
      move("cart", [event.to], duration);
    } else if (event.kind === "attacked") {
      duration = 260;
      impact = cursor + 120;
    } else if (event.kind === "damaged") {
      at = impact ?? Math.max(0, cursor - 80);
      duration = 320;
      damage = Math.max(0, hp.get(id!)! - event.hp);
      hp.set(id!, event.hp);
    } else if (event.kind === "protected") {
      at = impact ?? cursor;
      duration = 300;
    } else if (event.kind === "strike") duration = 540;
    else if (event.kind === "borrowed") duration = 420;
    else if (event.kind === "ended") duration = 350;
    beats.push({ event, id, cell, origin, at, duration, damage });
    cursor = Math.max(cursor, at + duration);
  }
  return { moves, beats, positions, duration: cursor };
}

function caption(root: Container, text: string, fill: number, size = 16) {
  const word = new Text({
    text,
    style: {
      fontFamily: "Atkinson Hyperlegible Next",
      fontSize: size,
      fontWeight: "bold",
      fill,
      stroke: { color: C.chalk, width: 3 },
    },
  });
  word.anchor.set(0.5);
  root.addChild(word);
  return word;
}
function shield(g: Graphics) {
  g.poly([-13, -17, 13, -17, 12, 4, 0, 17, -12, 4])
    .fill({ color: C.chalk, alpha: 0.9 })
    .stroke({ color: C.slate, width: 3 });
}
function beatEffect(root: Container, beat: Beat, before: State) {
  const view = new Container(),
    g = new Graphics();
  const p = cellToScreen(beat.cell),
    from = cellToScreen(beat.origin);
  view.position.set(p.x, p.y);
  view.addChild(g);
  root.addChild(view);
  view.visible = false;
  const event = beat.event;
  let projectile: Graphics | undefined;
  if (event.kind === "attacked") {
    const color =
      before.setup.units[event.unit]!.side === "player" ? C.slate : C.enemy;
    for (const cell of event.affected) {
      const q = cellToScreen(cell);
      g.moveTo(q.x - p.x - 14, q.y - p.y - 12)
        .lineTo(q.x - p.x + 14, q.y - p.y + 12)
        .moveTo(q.x - p.x + 14, q.y - p.y - 12)
        .lineTo(q.x - p.x - 14, q.y - p.y + 12)
        .stroke({ color, width: 4 });
      g.circle(q.x - p.x, q.y - p.y, 22).stroke({ color, width: 2 });
    }
    if (
      before.setup.units[event.unit]!.role === "mage" ||
      event.affected.length > 1 ||
      Math.hypot(from.x - p.x, from.y - p.y) > 90
    ) {
      projectile = new Graphics()
        .circle(0, 0, 5)
        .fill(C.brass)
        .stroke({ color, width: 2 });
      view.addChild(projectile);
    }
  } else if (event.kind === "damaged") {
    if (beat.damage) caption(view, `−${beat.damage}`, C.enemy, 22);
    view.y -= 32;
  } else if (
    event.kind === "guarded" ||
    event.kind === "protected" ||
    event.kind === "certified"
  ) {
    shield(g);
    view.y -= 15;
  } else if (event.kind === "strike") {
    caption(view, "!", C.enemy, 26).position.set(-22, -40);
    for (let i = 0; i < 5; i++)
      g.rect(Math.cos(i * 1.7) * 24, Math.sin(i * 1.7) * 20, 5, 7).fill(
        i % 2 ? C.chalk : C.enemy,
      );
  } else if (event.kind === "borrowed") {
    g.circle(0, 0, 30).stroke({ color: C.slate, width: 3 });
    caption(view, "↔", C.dark, 24).y = -36;
  } else if (event.kind === "pushed") {
    for (let i = 0; i < 6; i++)
      g.circle((i - 2.5) * 7, 15 + (i % 2) * 5, 3 + (i % 3)).fill({
        color: C.clay,
        alpha: 0.7,
      });
  } else if (event.kind === "blocked" || event.kind === "refused") {
    caption(
      view,
      event.kind === "blocked" ? "BLOCKED" : "REFUSED",
      C.ink,
      12,
    ).y = -36;
    g.moveTo(-9, -9)
      .lineTo(9, 9)
      .moveTo(9, -9)
      .lineTo(-9, 9)
      .stroke({ color: C.ink, width: 3 });
  } else if (event.kind === "ignited") {
    for (let i = 0; i < 7; i++)
      g.moveTo(0, 0)
        .lineTo(Math.cos(i) * 28, Math.sin(i) * 28)
        .stroke({ color: C.brass, width: 3 });
  } else if (event.kind === "smoked") {
    g.circle(-12, 0, 17)
      .circle(10, -5, 20)
      .fill({ color: C.chalk, alpha: 0.8 });
  } else if (event.kind === "ended") {
    for (let i = 0; i < 8; i++)
      g.moveTo(
        Math.cos((i * Math.PI) / 4) * 22,
        Math.sin((i * Math.PI) / 4) * 22,
      )
        .lineTo(
          Math.cos((i * Math.PI) / 4) * 37,
          Math.sin((i * Math.PI) / 4) * 37,
        )
        .stroke({
          color: event.outcome === "delivered" ? C.brass : C.enemy,
          width: 3,
        });
  }
  return (t: number) => {
    view.visible = t >= 0 && t < 1;
    if (!view.visible) return;
    view.alpha = 1 - t * t;
    if (event.kind === "attacked") {
      const travel = Math.min(1, t / 0.6);
      projectile?.position.set(
        (from.x - p.x) * (1 - travel),
        (from.y - p.y) * (1 - travel) - Math.sin(travel * Math.PI) * 20,
      );
      if (projectile) projectile.visible = t < 0.65;
      g.alpha = t < 0.45 ? 0 : Math.sin(((t - 0.45) / 0.55) * Math.PI);
    } else if (event.kind === "damaged") view.y = p.y - 32 - t * 23;
    else {
      const scale = 0.75 + t * 0.65;
      view.scale.set(scale);
    }
  };
}

export function playEvents(
  root: Container,
  entities: Map<Entity, EntityView>,
  playback: Playback,
  render: () => void,
  onFinish?: () => void,
  onEvent?: (event: PlaybackCue) => void,
) {
  const plan = planPlayback(playback),
    effects = new Container();
  root.addChild(effects);
  const visuals = plan.beats.map((beat) =>
    beatEffect(effects, beat, playback.before),
  );
  const poses = new Map(
    Array.from(entities, ([id, view]) => [
      id,
      view.figure
        ? {
            x: view.figure.x,
            y: view.figure.y,
            rotation: view.figure.rotation,
            alpha: view.figure.alpha,
            texture: view.figure.texture,
            height: view.figure.height,
          }
        : null,
    ]),
  );
  const reset = () => {
    for (const [id, view] of entities) {
      view.body.position.set(0, 0);
      view.labels.position.set(0, 0);
      view.body.alpha = 1;
      const pose = poses.get(id);
      if (view.figure && pose) {
        view.figure.position.set(pose.x, pose.y);
        view.figure.rotation = pose.rotation;
        view.figure.alpha = pose.alpha;
        view.figure.texture = pose.texture;
        view.figure.scale.set(pose.height / pose.texture.height);
      }
      if (view.picket) {
        view.picket.alpha = 1;
        view.picket.scale.set(1);
      }
    }
  };
  const figureHeights = new Map(
    Array.from(entities, ([id, view]) => [view.figure, poses.get(id)?.height]),
  );
  function setPose(view: EntityView, texture: Texture | undefined) {
    if (!view.figure || !texture) return;
    const height = figureHeights.get(view.figure);
    if (height === undefined) return;
    view.figure.texture = texture;
    view.figure.scale.set(height / texture.height);
  }
  for (const view of entities.values()) view.busy = true;
  let frame = 0,
    disposed = false;
  const start = performance.now(),
    speed = Math.max(1, plan.duration / 2200);
  const finish = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    reset();
    for (const view of entities.values()) view.busy = false;
    effects.destroy({ children: true });
    onFinish?.();
    render();
  };
  const heard = new Set<number>();
  const footsteps = new Set<string>();
  const tick = (now: number) => {
    if (disposed) return;
    const elapsed = (now - start) * speed;
    reset();
    for (const [id, view] of entities) {
      if (
        typeof id === "number" &&
        playback.before.setup.units[id]?.status === "normal" &&
        !playback.before.setup.units[id]?.guard
      )
        setPose(view, view.poses?.idle);
      const cell =
        id === "cart"
          ? playback.before.cart_cell
          : playback.before.setup.units[id]!.cell;
      const a = cellToScreen(cell),
        b = cellToScreen(plan.positions.get(id) ?? cell);
      view.body.position.set(a.x - b.x, a.y - b.y);
      view.labels.position.copyFrom(view.body.position);
      if (
        view.defeated &&
        view.figure &&
        typeof id === "number" &&
        playback.before.setup.units[id]!.hp > 0
      ) {
        view.figure.alpha = 1;
        view.figure.rotation = 0;
      }
    }
    for (const [moveIndex, move] of plan.moves.entries()) {
      if (elapsed < move.at) continue;
      const view = entities.get(move.id);
      if (!view) continue;
      const t = Math.min(1, (elapsed - move.at) / Math.max(1, move.duration));
      const progress = t * (move.cells.length - 1),
        index = Math.min(move.cells.length - 2, Math.floor(progress));
      if (index < 0) continue;
      const a = cellToScreen(move.cells[index]!),
        b = cellToScreen(move.cells[index + 1]!),
        end = cellToScreen(plan.positions.get(move.id)!);
      view.body.position.set(
        a.x + (b.x - a.x) * (progress - index) - end.x,
        a.y + (b.y - a.y) * (progress - index) - end.y,
      );
      view.labels.position.copyFrom(view.body.position);
      const pose = poses.get(move.id);
      if (view.figure && pose && t < 1) {
        if (move.id !== "cart" && view.poses?.walk) {
          setPose(view, view.poses.walk);
          if (b.x !== a.x) view.figure.scale.x *= Math.sign(b.x - a.x);
        }
        const step = `${moveIndex}:${Math.floor(progress)}`;
        if (move.id !== "cart" && !footsteps.has(step)) {
          footsteps.add(step);
          onEvent?.({ kind: "footstep" });
        }
        view.figure.y = pose.y - Math.abs(Math.sin(progress * Math.PI)) * 3.5;
        view.figure.rotation =
          pose.rotation +
          Math.sin(progress * Math.PI * 2) *
            (move.id === "cart" ? 0.045 : 0.035);
      }
    }
    plan.beats.forEach((beat, i) => {
      const t = (elapsed - beat.at) / beat.duration;
      visuals[i]!(t);
      if (t < 0) return;
      if (!heard.has(i)) {
        heard.add(i);
        onEvent?.(beat.event);
      }
      const view = beat.id === null ? undefined : entities.get(beat.id),
        event = beat.event;
      const weight = Math.sin(Math.min(1, t) * Math.PI),
        pose = beat.id === null ? null : poses.get(beat.id);
      if (view?.figure && t < 1) {
        const texture =
          event.kind === "strike" || event.kind === "refused"
            ? view.poses?.refuse
            : event.kind === "attacked" ||
                (event.kind === "guarded" &&
                  playback.before.setup.units[event.unit]?.role ===
                    "shieldbearer")
              ? view.poses?.action
              : undefined;
        setPose(view, texture);
      }
      if (event.kind === "attacked" && view && t < 1) {
        const a = cellToScreen(beat.origin),
          b = cellToScreen(beat.cell),
          distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        view.body.x += ((b.x - a.x) / distance) * weight * 13;
        view.body.y += ((b.y - a.y) / distance) * weight * 13;
        if (view.figure && pose) {
          if (b.x !== a.x)
            view.figure.scale.x =
              Math.abs(view.figure.scale.x) * Math.sign(b.x - a.x);
          view.figure.rotation =
            pose.rotation + Math.sign(b.x - a.x || 1) * weight * 0.1;
        }
      } else if (event.kind === "damaged" && view) {
        if (t < 1) {
          view.body.x += Math.sin(t * Math.PI * 6) * 7 * (1 - t);
          view.body.alpha = 1 - Math.sin(t * Math.PI) * 0.4;
        }
        if (event.hp === 0 && view.figure && pose) {
          view.figure.rotation = pose.rotation * Math.min(1, t);
          view.figure.alpha = 1 + (pose.alpha - 1) * Math.min(1, t);
        }
      } else if (event.kind === "strike" && view) {
        if (t < 1) view.body.x += Math.sin(t * Math.PI * 2) * 8;
        if (view.picket) {
          view.picket.alpha = Math.min(1, t * 4);
          view.picket.scale.set(1 + Math.sin(Math.min(1, t) * Math.PI) * 0.08);
        }
      } else if (event.kind === "borrowed" && view && t < 1)
        view.body.y -= weight * 9;
    });
    // A new strike sign enters with the objection, never before its scheduled event.
    for (const beat of plan.beats)
      if (beat.event.kind === "strike" && elapsed >= beat.at) {
        const entity = entities.get(beat.event.unit);
        if (entity?.figure && entity.poses?.refuse)
          setPose(entity, entity.poses.refuse);
      } else if (beat.event.kind === "strike" && elapsed < beat.at) {
        const sign = entities.get(beat.event.unit)?.picket;
        if (sign) sign.alpha = 0;
      }
    render();
    if (elapsed < plan.duration && !document.hidden)
      frame = requestAnimationFrame(tick);
    else finish();
  };
  tick(start);
  return finish;
}
