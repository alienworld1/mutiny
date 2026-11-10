import { Container, Graphics, Sprite, Text } from "pixi.js";
import { characterSlots } from "./assets";
import type { StageArt } from "./art";
import type { Entity, EntityView, HazardView } from "./playback";
import type { State } from "../game/types";
import {
  cellToScreen,
  TILE_WIDTH as TW,
  TILE_HEIGHT as TH,
  HEIGHT,
  ORIGIN_Y,
} from "./projection";
import { palette as C } from "./palette";

function label(
  root: Container,
  text: string,
  x: number,
  y: number,
  size = 14,
  fill = C.ink,
) {
  const t = new Text({
    text,
    style: {
      fontFamily: "Atkinson Hyperlegible Next, sans-serif",
      fontSize: size,
      fill,
      fontWeight: "bold",
    },
  });
  t.anchor.set(0.5);
  t.position.set(x, y);
  root.addChild(t);
}
export function draw(
  root: Container,
  state: State,
  selected: number | null,
  path: number[],
  reachable: number[],
  targets: number[],
  focusedOrder: number | null,
  art: StageArt = {},
) {
  const entities = new Map<Entity, EntityView>();
  const hazards: HazardView[] = [];
  const labelsLayer = new Container();
  for (const child of root.removeChildren()) child.destroy({ children: true });
  if (art.environment) {
    const background = new Sprite(art.environment);
    background.width = 640;
    background.height = HEIGHT;
    root.addChild(background);
  }
  const g = new Graphics();
  root.addChild(g);
  if (!art.environment)
    g.roundRect(0, 0, 640, HEIGHT, 22).fill(
      state.setup.policy === "dock"
        ? C.water
        : state.setup.policy === "bridge"
          ? C.slate
          : C.green,
    );
  if (!art.environment)
    for (let y = 12; y < HEIGHT; y += 23)
      for (let x = (y % 3) * 18; x < 640; x += 67)
        g.moveTo(x, y)
          .bezierCurveTo(x + 8, y - 3, x + 22, y + 3, x + 32, y)
          .stroke({ color: C.chalk, width: 1, alpha: 0.23 });
  g.roundRect(32, ORIGIN_Y - 5, 576, 460, 8).fill({
    color: C.ink,
    alpha: art.environment ? 0.05 : 0.22,
  });
  g.roundRect(37, ORIGIN_Y - 4, 566, 456, 5).fill({
    color: state.setup.policy === "dock" ? C.clay : C.stone,
    alpha: art.environment ? 0.12 : 1,
  });
  for (let c = 0; c < 49; c++) {
    const { x, y } = cellToScreen(c);
    g.rect(x - TW / 2 + 1, y - TH / 2 + 1, TW - 2, TH - 2)
      .fill({
        color:
          state.setup.policy === "dock"
            ? c % 3 === 0
              ? 0xc2a38a
              : 0xd7c2a6
            : c % 3 === 0
              ? C.stone
              : C.chalk,
        alpha: art.environment ? 0.24 : 1,
      })
      .stroke({ color: C.ink, alpha: 0.18, width: 1 });
    if (!art.environment && state.setup.policy === "dock")
      for (let offset = -21; offset < 25; offset += 16)
        g.moveTo(x - 37, y + offset)
          .lineTo(x + 37, y + offset + (c % 2))
          .stroke({ color: C.clay, alpha: 0.45, width: 1 });
    if (state.setup.route.includes(c))
      g.roundRect(x - 25, y - 20, 50, 40, 5)
        .fill({ color: C.chalk, alpha: 0.65 })
        .stroke({ color: C.brass, width: 2 });
    if (reachable.includes(c))
      g.roundRect(x - 32, y - 25, 64, 50, 5)
        .fill({ color: C.green, alpha: 0.3 })
        .stroke({ color: C.dark, width: 1 });
    if (targets.includes(c)) {
      g.circle(x, y, 20).stroke({ color: C.enemy, width: 3 });
      g.moveTo(x - 10, y)
        .lineTo(x + 10, y)
        .moveTo(x, y - 10)
        .lineTo(x, y + 10)
        .stroke({ color: C.enemy, width: 2 });
    }
    if (state.setup.route.includes(c) && c !== state.cart_cell) {
      const step = state.setup.route.indexOf(c);
      label(root, step === 0 ? "START" : String(step), x, y, 13, C.dark);
    }
    if (state.setup.cover.includes(c)) {
      if (art.props) {
        const cover = new Sprite(art.props[2]);
        cover.anchor.set(0.5, 0.85);
        cover.width = 70;
        cover.height = 54;
        cover.position.set(x, y + 19);
        root.addChild(cover);
      } else {
        g.roundRect(x - 29, y - 8, 58, 25, 4)
          .fill(C.stone)
          .stroke({ color: C.ink, width: 2 });
      }
      label(
        root,
        state.setup.walkable_cover.includes(c) ? "LOW / STEP" : "LOW",
        x,
        y + 4,
        10,
      );
    }
    if (state.certificates.includes(c)) {
      g.circle(x, y, 24).stroke({ color: C.dark, width: 3 });
      label(root, "✓", x + 22, y - 17, 15, C.dark);
    }
    if (state.setup.walls.includes(c)) {
      if (art.props) {
        const crate = new Sprite(art.props[1]);
        crate.anchor.set(0.5, 0.85);
        crate.width = 70;
        crate.height = 64;
        crate.position.set(x, y + 22);
        root.addChild(crate);
      } else {
        g.ellipse(x, y + 12, 32, 12).fill({ color: C.ink, alpha: 0.12 });
        g.poly([
          x - 29,
          y - 17,
          x + 19,
          y - 23,
          x + 30,
          y - 14,
          x - 18,
          y - 7,
        ]).fill(0xc4a477);
        g.poly([
          x - 29,
          y - 17,
          x - 18,
          y - 7,
          x - 18,
          y + 22,
          x - 29,
          y + 12,
        ]).fill(0x8f7058);
        g.poly([x - 18, y - 7, x + 30, y - 14, x + 30, y + 15, x - 18, y + 22])
          .fill(0xa68662)
          .stroke({ color: C.ink, width: 1, alpha: 0.3 });
        g.moveTo(x - 13, y - 3)
          .lineTo(x + 26, y + 12)
          .moveTo(x + 24, y - 9)
          .lineTo(x - 13, y + 18)
          .stroke({ color: 0xd5bb95, width: 3 });
      }
    }
  }
  // A continuous route connects the three authored push milestones.
  for (let i = 1; i < state.setup.route.length; i++) {
    const a = cellToScreen(state.setup.route[i - 1]!),
      b = cellToScreen(state.setup.route[i]!);
    const dx = Math.sign(b.x - a.x),
      dy = Math.sign(b.y - a.y);
    g.moveTo(a.x + dx * 22, a.y + dy * 22)
      .lineTo(b.x - dx * 22, b.y - dy * 22)
      .stroke({ color: C.dark, width: 3, alpha: 0.7 });
    g.poly([
      b.x - dx * 27 - dy * 5,
      b.y - dy * 27 + dx * 5,
      b.x - dx * 20,
      b.y - dy * 20,
      b.x - dx * 27 + dy * 5,
      b.y - dy * 27 - dx * 5,
    ]).fill(C.dark);
  }
  if (state.setup.policy === "dock" || state.setup.policy === "bridge") {
    for (let i = 0; i < 8; i++) {
      const ripple = new Graphics()
        .moveTo(-12, 0)
        .quadraticCurveTo(0, -3, 12, 0)
        .stroke({ color: C.chalk, width: 1.4, alpha: 0.4 });
      ripple.position.set(48 + i * 76, HEIGHT - 13 - (i % 3) * 5);
      root.addChild(ripple);
      hazards.push({ view: ripple, kind: "water", phase: i });
    }
  }
  const exit = cellToScreen(state.setup.route[3]!);
  g.moveTo(exit.x + 23, exit.y - 17)
    .lineTo(exit.x + 23, exit.y + 17)
    .stroke({ color: C.ink, width: 3 });
  const flag = new Graphics().poly([0, 0, 19, 4, 0, 12]).fill(C.dark);
  flag.position.set(exit.x + 24, exit.y - 17);
  root.addChild(flag);
  hazards.push({ view: flag, kind: "flag", phase: 1 });
  label(root, "EXIT", exit.x - 4, exit.y + 19, 11);
  // Posted paths and targets are projected directly from engine orders.
  for (const order of state.orders) {
    if (focusedOrder !== null && order.unit !== focusedOrder) continue;
    const points = [order.start, ...order.path].map(cellToScreen);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!;
      for (let n = 0; n < 6; n += 2)
        g.moveTo(a.x + ((b.x - a.x) * n) / 6, a.y + ((b.y - a.y) * n) / 6)
          .lineTo(
            a.x + ((b.x - a.x) * (n + 1)) / 6,
            a.y + ((b.y - a.y) * (n + 1)) / 6,
          )
          .stroke({
            color: C.enemy,
            width: focusedOrder === order.unit ? 3 : 2,
            alpha: focusedOrder === order.unit ? 0.95 : 0.55,
          });
    }
    const end = cellToScreen(order.endpoint);
    g.circle(end.x, end.y, 7).stroke({ color: C.enemy, width: 2 });
    label(root, `${order.unit + 1}`, end.x + 12, end.y - 12, 11, C.enemy);
    for (const cell of order.affected) {
      const p = cellToScreen(cell);
      g.rect(p.x - 34, p.y - 26, 68, 52).stroke({
        color: C.enemy,
        width: 2,
        alpha: focusedOrder === order.unit ? 0.8 : 0.32,
      });
      for (let offset = -24; offset <= 24; offset += 12)
        g.moveTo(p.x + offset - 4, p.y - 21)
          .lineTo(p.x + offset + 4, p.y - 13)
          .stroke({ color: C.enemy, width: 1, alpha: 0.45 });
    }
  }
  if (selected !== null && path.length) {
    const points = [state.setup.units[selected]!.cell, ...path].map(
      cellToScreen,
    );
    g.moveTo(points[0]!.x, points[0]!.y);
    for (const p of points.slice(1)) g.lineTo(p.x, p.y);
    g.stroke({ color: C.dark, width: 4 });
    const end = points.at(-1)!;
    g.circle(end.x, end.y, 6).fill(C.dark);
  }
  const objects = [
    ...state.setup.units.map((u) => ({ cell: u.cell, unit: u })),
    { cell: state.cart_cell, unit: null },
  ].sort((a, b) => a.cell - b.cell);
  for (const object of objects) {
    const { x, y } = cellToScreen(object.cell);
    const u = object.unit;
    const entity = new Container();
    const hud = new Container();
    labelsLayer.addChild(hud);
    root.addChild(entity);
    const view: EntityView = { body: entity, labels: hud };
    entities.set(u ? u.id : "cart", view);
    if (u && u.hp <= 0) {
      const fallen = new Graphics()
        .ellipse(x, y + 15, 22, 8)
        .fill({ color: C.ink, alpha: 0.12 });
      fallen
        .moveTo(x - 7, y + 10)
        .lineTo(x + 7, y + 20)
        .moveTo(x + 7, y + 10)
        .lineTo(x - 7, y + 20)
        .stroke({ color: C.ink, width: 2, alpha: 0.5 });
      entity.addChild(fallen);
      const texture = art.characters?.[characterSlots[u.name] ?? 0];
      if (texture) {
        const figure = new Sprite(texture);
        figure.anchor.set(0.5, 0.96);
        figure.height = 70;
        figure.scale.x = figure.scale.y;
        figure.position.set(x, y + 15);
        figure.rotation = -1.1;
        figure.alpha = 0.35;
        entity.addChild(figure);
        view.figure = figure;
        view.defeated = true;
      }
      continue;
    }
    const p = new Graphics();
    entity.addChild(p);
    p.ellipse(x, y + 17, 26, 10).fill({ color: C.ink, alpha: 0.2 });
    if (!u) {
      if (art.props) {
        const cart = new Sprite(art.props[0]);
        cart.anchor.set(0.5, 0.85);
        cart.width = 80;
        cart.height = 80;
        cart.position.set(x, y + 19);
        if (state.cart_hp === 0) {
          cart.tint = C.stone;
          cart.alpha = 0.65;
        }
        entity.addChild(cart);
        view.figure = cart;
        if (state.cart_hp < 2)
          label(
            hud,
            state.cart_hp === 0 ? "LOST" : "1 HP",
            x,
            y - 49,
            12,
            C.enemy,
          );
      } else {
        p.circle(x - 18, y + 12, 8)
          .fill(C.ink)
          .circle(x + 19, y + 12, 8)
          .fill(C.ink);
        p.roundRect(x - 27, y - 17, 54, 30, 4)
          .fill(0x9a795a)
          .stroke({ color: C.ink, width: 2 });
        p.rect(x - 23, y - 12, 46, 5)
          .fill(C.brass)
          .rect(x - 23, y, 46, 4)
          .fill(C.brass);
        p.roundRect(x - 14, y - 31, 28, 18, 6)
          .fill(C.chalk)
          .stroke({ color: C.ink, width: 1 });
        label(hud, "¤", x, y - 23, 17);
      }
      const health = new Graphics();
      hud.addChild(health);
      for (let h = 0; h < 2; h++)
        health
          .roundRect(x + 23 + h * 8, y - 9, 6, 6, 1)
          .fill(h < state.cart_hp ? C.ink : C.chalk)
          .stroke({ color: C.chalk, width: 1 });
      continue;
    }
    const color = u.side === "player" ? C.slate : C.enemy;
    if (u.side === "player")
      p.ellipse(x, y + 16, 28, 11).stroke({ color, width: 3 });
    else
      p.poly([x - 27, y + 11, x, y + 28, x + 27, y + 11]).stroke({
        color,
        width: 3,
      });
    if (u.id === selected) {
      const selection = new Graphics()
        .ellipse(0, 0, 34, 15)
        .stroke({ color: C.ink, width: 3 });
      selection.position.set(x, y + 16);
      entity.addChild(selection);
      view.selection = selection;
    }
    const slot =
      characterSlots[u.name] ??
      (u.role === "mage" ? 2 : u.role === "shieldbearer" ? 1 : 0);
    view.poses = art.poses
      ? {
          idle: art.characters?.[slot],
          walk: art.poses.walk[slot],
          action: art.poses.action[slot],
          refuse: art.poses.refuse[slot],
        }
      : undefined;
    const texture =
      (u.status === "striking"
        ? view.poses?.refuse
        : u.guard && u.role === "shieldbearer"
          ? view.poses?.action
          : undefined) ?? art.characters?.[slot];
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.96);
      sprite.height = u.role === "captain" || u.role === "supervisor" ? 92 : 84;
      sprite.scale.x = sprite.scale.y;
      sprite.position.set(x, y + 19);
      entity.addChild(sprite);
      view.figure = sprite;
    } else {
      p.roundRect(x - 10, y - 8, 20, 24, 6)
        .fill(color)
        .stroke({ color: C.ink, width: 1 });
      p.moveTo(x - 5, y + 12)
        .lineTo(x - 9, y + 22)
        .moveTo(x + 5, y + 12)
        .lineTo(x + 10, y + 22)
        .stroke({ color: C.ink, width: 5 });
      p.circle(x, y - 18, 10)
        .fill(0xe2c4a2)
        .stroke({ color: C.ink, width: 1 });
      if (u.role === "captain" || u.role === "supervisor") {
        p.poly([
          x - 18,
          y - 25,
          x - 12,
          y - 30,
          x - 5,
          y - 25,
          x + 8,
          y - 31,
          x + 19,
          y - 24,
          x + 12,
          y - 17,
          x - 12,
          y - 17,
        ]).fill(C.ink);
        p.poly([
          x + 2,
          y - 28,
          x + 4,
          y - 43,
          x + 10,
          y - 36,
          x + 6,
          y - 25,
        ]).fill(C.brass);
      } else if (u.role === "courier") {
        p.roundRect(x - 13, y - 29, 24, 10, 5).fill(color);
        p.moveTo(x - 10, y - 6)
          .lineTo(x + 11, y + 10)
          .stroke({ color: C.brass, width: 4 });
        p.roundRect(x + 5, y + 4, 13, 12, 3).fill(0x8f7058);
      } else if (u.role === "mage") {
        p.poly([x - 13, y - 23, x, y - 43, x + 13, y - 23])
          .fill(color)
          .stroke({ color: C.ink, width: 1 });
        p.moveTo(x + 21, y + 17)
          .lineTo(x + 21, y - 30)
          .stroke({ color: 0x8f7058, width: 4 });
        p.circle(x + 21, y - 31, 6)
          .fill(C.brass)
          .stroke({ color: C.ink, width: 1 });
      } else {
        p.roundRect(x - 11, y - 29, 23, 12, 5).fill(0x8d9790);
        p.poly([
          x - 25,
          y - 6,
          x - 7,
          y - 8,
          x - 9,
          y + 11,
          x - 18,
          y + 18,
          x - 26,
          y + 8,
        ])
          .fill(color)
          .stroke({ color: C.chalk, width: 2 });
      }
      // Equipment distinguishes the authored workers while allegiance keeps its color.
      if (u.name === "Dot")
        p.poly([x + 4, y - 28, x + 23, y - 33, x + 14, y - 20]).fill(C.brass);
      if (u.name === "Rook") p.rect(x + 8, y + 7, 7, 5).fill(C.chalk);
      if (u.name === "Mallow")
        p.roundRect(x + 12, y + 8, 12, 9, 2).fill(C.brass);
      if (u.name === "Brisk") {
        p.rect(x - 27, y - 10, 21, 26)
          .fill(C.stone)
          .stroke({ color: C.ink, width: 2 });
        p.moveTo(x - 23, y - 4)
          .lineTo(x - 10, y - 4)
          .moveTo(x - 23, y + 2)
          .lineTo(x - 10, y + 2)
          .stroke({ color: C.ink, width: 1 });
      }
      if (u.name === "Nix")
        p.rect(x - 7, y - 22, 6, 5)
          .rect(x + 2, y - 22, 6, 5)
          .stroke({ color: C.ink, width: 1 });
      if (u.name === "Peebles")
        p.poly([x - 2, y - 37, x + 14, y - 39, x + 9, y - 31]).fill(C.brass);
      p.circle(x + 4, y - 19, 1.5).fill(C.ink);
    }
    const status = new Graphics();
    hud.addChild(status);
    if (u.guard) {
      status
        .poly([
          x + 15,
          y - 7,
          x + 28,
          y - 7,
          x + 27,
          y + 4,
          x + 21,
          y + 10,
          x + 15,
          y + 4,
        ])
        .fill(C.chalk)
        .stroke({ color: C.ink, width: 2 });
    }
    if (u.status === "striking") {
      const picket = new Container(),
        board = new Graphics();
      hud.addChild(picket);
      picket.addChild(board);
      view.picket = picket;
      const side = state.setup.units.some(
        (other) => other.hp > 0 && other.cell === u.cell + 1 && u.cell % 7 < 6,
      )
        ? -1
        : 1;
      const signX = x + side * 34;
      picket.pivot.set(signX, y + 15);
      picket.position.set(signX, y + 15);
      board
        .moveTo(signX, y + 15)
        .lineTo(signX, y - 16)
        .stroke({ color: 0x8f7058, width: 3 });
      board
        .roundRect(signX - 26, y - 22, 52, 17, 2)
        .fill(C.chalk)
        .stroke({ color: C.enemy, width: 2 });
      label(picket, "ON STRIKE", signX, y - 13, 9, C.enemy);
    }
    if (u.status === "recovering") {
      status
        .circle(x + 31, y + 12, 7)
        .fill(C.chalk)
        .stroke({ color: C.ink, width: 1 });
      status
        .moveTo(x + 31, y + 7)
        .lineTo(x + 31, y + 12)
        .lineTo(x + 35, y + 14)
        .stroke({ color: C.ink, width: 1.5 });
    }
    if (state.borrow_pending === u.id)
      status
        .circle(x + 28, y + 12, 5)
        .circle(x + 34, y + 12, 5)
        .stroke({ color: C.dark, width: 2 });
    // Keep the center clear: a full name here covers the next row's figure.
    status
      .roundRect(x - 39, y + 8, 16, 18, 4)
      .fill(C.chalk)
      .stroke({ color: C.ink, width: 1 });
    label(hud, String(u.id + 1), x - 31, y + 17, 12);
    for (let h = 0; h < u.hp; h++)
      status
        .roundRect(x - u.hp * 4 + h * 8, y - 58, 6, 5, 1)
        .fill(C.ink)
        .stroke({ color: C.chalk, width: 1 });
    if (state.activated.includes(u.id))
      label(hud, "✓", x - 26, y - 18, 16, C.dark);
  }
  for (const c of state.fire) {
    const { x, y } = cellToScreen(c);
    const f = new Graphics();
    root.addChild(f);
    f.pivot.set(x, y + 12);
    f.position.set(x, y + 12);
    hazards.push({ view: f, kind: "fire", phase: c });
    f.ellipse(x, y + 8, 23, 9).fill({ color: 0x8d3a45, alpha: 0.25 });
    f.poly([
      x - 16,
      y + 6,
      x - 18,
      y - 10,
      x - 8,
      y - 4,
      x - 2,
      y - 29,
      x + 8,
      y - 14,
      x + 12,
      y - 21,
      x + 19,
      y + 6,
      x + 10,
      y + 13,
      x - 6,
      y + 14,
    ])
      .fill(0xb65d39)
      .stroke({ color: 0x79502a, width: 1 });
    f.poly([
      x - 7,
      y + 7,
      x - 6,
      y - 6,
      x,
      y - 1,
      x + 6,
      y - 15,
      x + 11,
      y + 7,
      x + 3,
      y + 12,
    ]).fill(0xe9b762);
    for (let i = 0; i < 3; i++) {
      const ember = new Graphics().circle(0, 0, 1.4).fill(0xe9b762);
      ember.position.set(x + (i - 1) * 9, y - 10);
      root.addChild(ember);
      hazards.push({ view: ember, kind: "ember", phase: c * 3 + i });
    }
  }
  for (const c of state.smoke) {
    const { x, y } = cellToScreen(c);
    const cloud = new Graphics();
    root.addChild(cloud);
    cloud.pivot.set(x, y);
    cloud.position.set(x, y);
    hazards.push({ view: cloud, kind: "smoke", phase: c });
    cloud
      .ellipse(x, y - 4, 31, 18)
      .fill({ color: C.stone, alpha: 0.88 })
      .stroke({ color: C.ink, width: 1 });
    label(root, "SMOKE", x, y - 4, 10);
  }
  for (let n = 0; n < 7; n++) {
    g.roundRect(71 + n * 80, ORIGIN_Y - 21, 18, 18, 3).fill(C.chalk);
    g.roundRect(11, ORIGIN_Y + 23 + n * 64, 18, 18, 3).fill(C.chalk);
    label(root, "ABCDEFG"[n]!, 80 + n * 80, ORIGIN_Y - 12, 13);
    label(root, `${n + 1}`, 20, ORIGIN_Y + 32 + n * 64, 13);
  }
  root.addChild(labelsLayer);
  return { entities, hazards };
}
