import { useEffect, useRef, useState } from "react";
import { Application, Container } from "pixi.js";
import type { State } from "../game/types";
import { actionText, coordinate } from "../game/types";
import { draw } from "./renderer";
import { loadStageArt, type StageArt } from "./art";
import { playEvents, type Playback } from "./playback";
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
  playback: Playback | null;
  onCell: (cell: number) => void;
}
export default function PixiStage(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    grid = useRef<HTMLDivElement>(null);
  const renderer = useRef<{ app: Application; scene: Container } | null>(null);
  const latest = useRef(props);
  const [fallback, setFallback] = useState(false);
  const [focus, setFocus] = useState(44);
  const [art, setArt] = useState<StageArt>({});
  const latestArt = useRef(art);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [highContrast, setHighContrast] = useState(
    () => window.matchMedia("(forced-colors: active)").matches,
  );
  const textBoard = fallback || highContrast;
  const played = useRef<Playback | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(forced-colors: active)");
    const change = () => setHighContrast(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadStageArt(props.state.setup.policy).then((loaded) => {
      if (!cancelled) setArt(loaded);
      else
        [...(loaded.characters ?? []), ...(loaded.props ?? [])].forEach(
          (texture) => texture.destroy(false),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [props.state.setup.policy]);
  useEffect(
    () => () => {
      [...(art.characters ?? []), ...(art.props ?? [])].forEach((texture) =>
        texture.destroy(false),
      );
    },
    [art],
  );
  useEffect(() => {
    latest.current = props;
    latestArt.current = art;
    const r = renderer.current;
    if (r) {
      const entities = draw(
        r.scene,
        props.state,
        props.selected,
        props.path,
        props.reachable,
        props.targets,
        props.focusedOrder,
        art,
      );
      r.app.render();
      const playback = props.playback;
      if (playback && playback !== played.current) {
        played.current = playback;
        if (!reduced && !document.hidden) {
          const stop = playEvents(r.scene, entities, playback, () =>
            r.app.render(),
          );
          const finish = () => {
            if (document.hidden) {
              stop();
              r.app.render();
            }
          };
          document.addEventListener("visibilitychange", finish);
          return () => {
            stop();
            document.removeEventListener("visibilitychange", finish);
          };
        }
      }
    }
  }, [props, art, reduced]);
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
          latestArt.current,
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
      data-motion={reduced ? "reduced" : "full"}
      data-art={
        art.environment && art.characters && art.props ? "ready" : "loading"
      }
      style={{ aspectRatio: `${WIDTH}/${HEIGHT}` }}
    >
      <div
        ref={host}
        aria-hidden="true"
        className={`absolute inset-0 ${highContrast ? "invisible" : ""}`}
      />
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
                  ? `Cart route, ${state.setup.route.indexOf(cell) === 0 ? "start" : `push ${state.setup.route.indexOf(cell)} of 3`}${cell === state.setup.route[3] ? ", exit" : ""}`
                  : "",
                state.setup.walls.includes(cell) ? "Obstacle, impassable" : "",
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
                ...state.orders
                  .filter((o) => o.unit === u?.id)
                  .map(
                    (o) =>
                      `Posted route ${[o.start, ...o.path].map(coordinate).join(" to ")}. ${actionText(o.action, state)}${o.affected.length ? `. Affects ${o.affected.map(coordinate).join(", ")}` : ""}`,
                  ),
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
                    className={`battle-cell absolute !min-h-0 !rounded-none !border-0 !bg-transparent !p-0 hover:!bg-white/15 focus-visible:!outline-offset-[-4px] ${textBoard ? "!border !border-border !bg-muted !text-[10px] !leading-tight" : "text-transparent"}`}
                    style={{
                      left: `${((p.x - TILE_WIDTH / 2) / WIDTH) * 100}%`,
                      top: `${((p.y - TILE_HEIGHT / 2) / HEIGHT) * 100}%`,
                      width: `${(TILE_WIDTH / WIDTH) * 100}%`,
                      height: `${(TILE_HEIGHT / HEIGHT) * 100}%`,
                    }}
                  >
                    {textBoard
                      ? `${coordinate(cell)} ${u ? `${u.name} ${u.hp}HP` : state.cart_cell === cell ? `Cart ${state.cart_hp}HP` : state.fire.includes(cell) ? "Fire" : state.setup.walls.includes(cell) ? "Obstacle" : state.setup.route.includes(cell) ? `Push ${state.setup.route.indexOf(cell)}` : ""}`
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
