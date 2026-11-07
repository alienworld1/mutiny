import { Container, Graphics, Text } from "pixi.js";
import type { State } from "../game/types";
import { coordinate } from "../game/types";
import {
  cellToScreen,
  TILE_WIDTH as TW,
  TILE_HEIGHT as TH,
} from "./projection";
const C = {
  ink: 0x2d3432,
  stone: 0xd8d5ca,
  clay: 0xb78b76,
  brass: 0xb9a273,
  slate: 0x67899b,
  enemy: 0x994d57,
  chalk: 0xf3f1e9,
  water: 0x87a5a8,
  green: 0x71896c,
  dark: 0x3e604d,
};
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
) {
  for (const child of root.removeChildren()) child.destroy({ children: true });
  const g = new Graphics();
  root.addChild(g);
  g.roundRect(0, 0, 640, 560, 22).fill(C.water);
  for (let y = 12; y < 560; y += 23)
    for (let x = (y % 3) * 18; x < 640; x += 67)
      g.moveTo(x, y)
        .bezierCurveTo(x + 8, y - 3, x + 22, y + 3, x + 32, y)
        .stroke({ color: C.chalk, width: 1, alpha: 0.23 });
  g.roundRect(32, 59, 576, 468, 8).fill({ color: C.ink, alpha: 0.22 });
  g.roundRect(37, 60, 566, 456, 5).fill(C.clay);
  for (let c = 0; c < 49; c++) {
    const { x, y } = cellToScreen(c);
    g.rect(x - TW / 2 + 1, y - TH / 2 + 1, TW - 2, TH - 2).fill(
      c % 3 === 0 ? 0xc2a38a : c % 2 === 0 ? 0xceb59a : 0xd7c2a6,
    );
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
    if (state.setup.walls.includes(c)) {
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
  const exit = cellToScreen(state.setup.route[3]!);
  g.moveTo(exit.x + 23, exit.y - 17)
    .lineTo(exit.x + 23, exit.y + 17)
    .stroke({ color: C.ink, width: 3 });
  g.poly([
    exit.x + 24,
    exit.y - 17,
    exit.x + 42,
    exit.y - 13,
    exit.x + 24,
    exit.y - 5,
  ]).fill(C.dark);
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
          .stroke({ color: C.enemy, width: 3, alpha: 0.85 });
    }
    for (const cell of order.affected) {
      const p = cellToScreen(cell);
      g.rect(p.x - 34, p.y - 26, 68, 52).stroke({
        color: C.enemy,
        width: 2,
        alpha: 0.6,
      });
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
    ...state.setup.units
      .filter((u) => u.hp > 0)
      .map((u) => ({ cell: u.cell, unit: u })),
    { cell: state.cart_cell, unit: null },
  ].sort((a, b) => a.cell - b.cell);
  for (const object of objects) {
    const { x, y } = cellToScreen(object.cell);
    const u = object.unit;
    const p = new Graphics();
    root.addChild(p);
    p.ellipse(x, y + 17, 26, 10).fill({ color: C.ink, alpha: 0.2 });
    if (!u) {
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
      label(root, "¤", x, y - 23, 17);
      label(root, `Cart ${state.cart_hp}/2`, x, y + 29, 12);
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
    if (u.id === selected)
      p.ellipse(x, y + 16, 34, 15).stroke({ color: C.ink, width: 3 });
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
    p.circle(x + 4, y - 19, 1.5).fill(C.ink);
    if (u.guard) {
      p.poly([
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
      p.moveTo(x + 23, y + 15)
        .lineTo(x + 23, y - 35)
        .stroke({ color: 0x8f7058, width: 3 });
      p.roundRect(x + 2, y - 45, 54, 22, 2)
        .fill(C.chalk)
        .stroke({ color: C.enemy, width: 2 });
      label(root, "STRIKE", x + 29, y - 34, 10, C.enemy);
    }
    label(root, u.name, x, y + 34, 12);
    for (let h = 0; h < u.hp; h++)
      p.roundRect(x - u.hp * 4 + h * 8, y - 43, 6, 5, 1).fill(C.ink);
    if (state.activated.includes(u.id))
      label(root, "✓", x - 22, y - 15, 16, C.dark);
  }
  for (const c of state.fire) {
    const { x, y } = cellToScreen(c);
    const f = new Graphics();
    root.addChild(f);
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
  }
  for (let n = 0; n < 7; n++) {
    label(root, "ABCDEFG"[n]!, 80 + n * 80, 34, 13);
    label(root, `${n + 1}`, 20, 96 + n * 64, 13);
  }
  label(root, `PAYROLL QUAY · ${coordinate(state.cart_cell)}`, 320, 540, 12);
}
