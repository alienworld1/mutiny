import { useEffect, useRef, useState } from "react";
import { Application, Container } from "pixi.js";
import type { State } from "../game/types";
import { coordinate } from "../game/types";
import { draw } from "./renderer";
import {
  cellToScreen,
  WIDTH,
  HEIGHT,
  TILE_WIDTH,
  TILE_HEIGHT,
} from "./projection";
interface Props {
  state: State;
  selected: number | null;
  path: number[];
  reachable: number[];
  targets: number[];
  focusedOrder: number | null;
  onCell: (cell: number) => void;
}
export default function PixiStage(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    grid = useRef<HTMLDivElement>(null);
  const renderer = useRef<{ app: Application; scene: Container } | null>(null);
  const latest = useRef(props);
  const [fallback, setFallback] = useState(false);
  const [focus, setFocus] = useState(44);
  useEffect(() => {
    latest.current = props;
    const r = renderer.current;
    if (r) {
      draw(
        r.scene,
        props.state,
        props.selected,
        props.path,
        props.reachable,
        props.targets,
        props.focusedOrder,
      );
      r.app.render();
    }
  }, [props]);
  useEffect(() => {
    let cancelled = false;
    const app = new Application();
    void app
      .init({
        width: WIDTH,
        height: HEIGHT,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        preference: "webgl",
      })
      .then(() => {
        if (cancelled) {
          app.destroy(true, { children: true });
          return;
        }
        app.canvas.style.width = "100%";
        app.canvas.style.height = "100%";
        host.current?.appendChild(app.canvas);
        const scene = new Container();
        app.stage.addChild(scene);
        renderer.current = { app, scene };
        app.stop();
        const p = latest.current;
        draw(
          scene,
          p.state,
          p.selected,
          p.path,
          p.reachable,
          p.targets,
          p.focusedOrder,
        );
        app.render();
      })
      .catch(() => {
        if (!cancelled) setFallback(true);
      });
    return () => {
      cancelled = true;
      if (renderer.current?.app === app) {
        renderer.current = null;
        app.destroy(true, { children: true });
      }
    };
  }, []);
  const { state } = props;
  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${WIDTH}/${HEIGHT}` }}
    >
      <div ref={host} aria-hidden="true" className="absolute inset-0" />
      <div
        ref={grid}
        role="grid"
        aria-label={`${state.setup.name} battlefield`}
        aria-rowcount={7}
        aria-colcount={7}
        className="absolute inset-0"
      >
        {Array.from({ length: 7 }, (_, row) => (
          <div role="row" key={row}>
            {Array.from({ length: 7 }, (_, col) => {
              const cell = row * 7 + col,
                p = cellToScreen(cell),
                u = state.setup.units.find((u) => u.hp > 0 && u.cell === cell);
              const description = [
                coordinate(cell),
                u
                  ? `${u.name}, ${u.side}, ${u.role}, ${u.hp} HP, ${u.status}${state.activated.includes(u.id) ? ", acted" : ""}`
                  : "",
                state.cart_cell === cell ? `Cart, ${state.cart_hp} HP` : "",
                state.setup.route.includes(cell)
                  ? `Cart route${cell === state.setup.route[3] ? ", exit" : ""}`
                  : "",
                state.setup.walls.includes(cell) ? "Cargo, impassable" : "",
                state.fire.includes(cell) ? "Fire, 1 damage on entry" : "",
                state.smoke.includes(cell)
                  ? "Smoke, opaque until phase end"
                  : "",
                state.setup.cover.includes(cell)
                  ? `Low cover, blocks ranged shots, ${state.setup.walkable_cover.includes(cell) ? "walkable" : "impassable"}`
                  : "",
                state.certificates.includes(cell)
                  ? "Safety Certificate, blocks the next enemy-phase hit"
                  : "",
                state.orders.some((o) => o.affected.includes(cell))
                  ? "Posted action area"
                  : "",
                props.reachable.includes(cell) ? "Reachable" : "",
                props.targets.includes(cell) ? "Legal target" : "",
              ]
                .filter(Boolean)
                .join(". ");
              return (
                <div
                  role="gridcell"
                  key={cell}
                  aria-colindex={col + 1}
                  aria-rowindex={row + 1}
                >
                  <button
                    type="button"
                    data-cell={cell}
                    tabIndex={focus === cell ? 0 : -1}
                    aria-label={description}
                    aria-pressed={u?.id === props.selected}
                    onFocus={() => setFocus(cell)}
                    onKeyDown={(e) => {
                      const next = {
                        ArrowLeft: col > 0 ? cell - 1 : cell,
                        ArrowRight: col < 6 ? cell + 1 : cell,
                        ArrowUp: row > 0 ? cell - 7 : cell,
                        ArrowDown: row < 6 ? cell + 7 : cell,
                        Home: row * 7,
                        End: row * 7 + 6,
                      }[e.key];
                      if (next !== undefined) {
                        e.preventDefault();
                        setFocus(next);
                        grid.current
                          ?.querySelector<HTMLButtonElement>(
                            `[data-cell="${next}"]`,
                          )
                          ?.focus();
                      }
                    }}
                    onClick={() => props.onCell(cell)}
                    className={`absolute !min-h-0 !rounded-none !border-0 !bg-transparent !p-0 hover:!bg-white/15 focus-visible:!outline-offset-[-4px] ${fallback ? "!border !border-border !bg-muted !text-xs" : "text-transparent"}`}
                    style={{
                      left: `${((p.x - TILE_WIDTH / 2) / WIDTH) * 100}%`,
                      top: `${((p.y - TILE_HEIGHT / 2) / HEIGHT) * 100}%`,
                      width: `${(TILE_WIDTH / WIDTH) * 100}%`,
                      height: `${(TILE_HEIGHT / HEIGHT) * 100}%`,
                    }}
                  >
                    {fallback
                      ? `${coordinate(cell)} ${u?.name ?? (state.cart_cell === cell ? "Cart" : state.setup.walls.includes(cell) ? "Cargo" : "")}`
                      : coordinate(cell)}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {fallback && (
        <p className="absolute bottom-0 text-xs">
          Illustration unavailable. The board controls still work.
        </p>
      )}
    </div>
  );
}
