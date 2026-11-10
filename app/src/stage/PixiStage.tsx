import { useEffect, useRef, useState } from "react";
import { Application, Container } from "pixi.js";
import type { State } from "../game/types";
import { actionText, coordinate } from "../game/types";
import { draw } from "./renderer";
import { loadStageArt, destroyStageArt, type StageArt } from "./art";
import { playEvents, type Playback, type PlaybackCue } from "./playback";
import { startIdle } from "./idle";
import type { BattleSound } from "../game/sound";
import WorkerPortrait from "../near/WorkerPortrait";
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
  guideCell?: number | null;
  playback: Playback | null;
  onCell: (cell: number) => void;
  canBorrow: (id: number) => boolean;
  onBorrow: (id: number) => void;
  disabled: boolean;
  sound: BattleSound;
  onPlaybackDone: () => void;
}
export default function PixiStage(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    grid = useRef<HTMLDivElement>(null);
  const renderer = useRef<{ app: Application; scene: Container } | null>(null);
  const latest = useRef(props);
  const [announcement, setAnnouncement] = useState<{
    name: string;
    detail: string;
    token: string;
    kind: "strike" | "borrowed";
  } | null>(null);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  const [focus, setFocus] = useState(44);
  const [art, setArt] = useState<StageArt>({});
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [highContrast, setHighContrast] = useState(
    () => window.matchMedia("(forced-colors: active)").matches,
  );
  const textBoard = fallback || highContrast;
  const played = useRef<Playback | null>(null);
  const pathKey = props.path.join(",");
  const reachableKey = props.reachable.join(",");
  const targetsKey = props.targets.join(",");
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
      else destroyStageArt(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [props.state.setup.policy]);
  useEffect(
    () => () => {
      destroyStageArt(art);
    },
    [art],
  );
  useEffect(() => {
    latest.current = props;
  }, [props, art]);
  useEffect(() => {
    const p = latest.current;
    const r = renderer.current;
    const playback = p.playback;
    const fresh = playback && playback !== played.current;
    function announce(event: PlaybackCue) {
      if (event.kind === "footstep") p.sound.cue("step");
      else p.sound.event(event);
      if (event.kind === "strike" || event.kind === "borrowed") {
        const actor = p.state.setup.units[event.unit]!;
        setAnnouncement({
          name:
            event.kind === "strike"
              ? `${actor.name} is ON STRIKE`
              : `${actor.name} · Borrowed`,
          detail:
            event.kind === "strike"
              ? event.reason.split(": ").at(-1)!
              : "One action. Make it count.",
          token: actor.name.toLowerCase(),
          kind: event.kind,
        });
      }
    }
    if (!r && fallback && fresh) {
      played.current = playback;
      playback.events.forEach(announce);
      p.onPlaybackDone();
    }
    if (r) {
      const scene = draw(
        r.scene,
        p.state,
        p.selected,
        p.path,
        p.reachable,
        p.targets,
        p.focusedOrder,
        art,
      );
      if (playback) played.current = playback;
      if (fresh) setAnnouncement(null);
      let playing = false;
      let stopIdle = () => {},
        stopPlayback = () => {};
      const idle = () => {
        if (!reduced && !highContrast && !document.hidden)
          stopIdle = startIdle(scene, () => {
            if (!playing) r.app.render();
          });
      };
      idle();
      if (fresh && !reduced && !highContrast && !document.hidden) {
        playing = true;
        stopPlayback = playEvents(
          r.scene,
          scene.entities,
          playback,
          () => r.app.render(),
          () => {
            playing = false;
            if (playback.before.round < p.state.round && !p.state.outcome)
              p.sound.cue("round");
            p.onPlaybackDone();
          },
          announce,
        );
      } else {
        if (fresh) {
          // Reduced motion keeps concise sound and the same committed feedback.
          const salient =
            playback.events.find((e) => e.kind === "ended") ??
            playback.events.find((e) => e.kind === "strike") ??
            playback.events.at(-1);
          if (salient) announce(salient);
          p.onPlaybackDone();
        }
        r.app.render();
      }
      const visibility = () => {
        stopIdle();
        if (document.hidden) {
          stopPlayback();
          r.app.render();
        } else idle();
      };
      document.addEventListener("visibilitychange", visibility);
      return () => {
        stopPlayback();
        stopIdle();
        document.removeEventListener("visibilitychange", visibility);
      };
    }
  }, [
    props.state,
    props.selected,
    props.focusedOrder,
    props.playback,
    pathKey,
    reachableKey,
    targetsKey,
    art,
    reduced,
    highContrast,
    ready,
    fallback,
  ]);
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
        setReady(true);
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
      data-poses={art.poses ? "ready" : "loading"}
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
                    disabled={props.disabled}
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
                    data-guide={props.guideCell === cell || undefined}
                    className={`data-[guide=true]:!border-2 data-[guide=true]:!border-dashed data-[guide=true]:!border-focus data-[guide=true]:!bg-paper/20 battle-cell absolute !min-h-0 !rounded-none !border-0 !bg-transparent !p-0 hover:!bg-white/15 focus-visible:!outline-offset-[-4px] ${textBoard ? "!border !border-border !bg-muted !text-[10px] !leading-tight" : "text-transparent"}`}
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
      {!props.disabled &&
        state.setup.units
          .filter(
            (u) =>
              u.hp > 0 &&
              u.side === "enemy" &&
              u.status === "striking" &&
              !props.targets.includes(u.cell) &&
              !u.borrowed &&
              props.canBorrow(u.id),
          )
          .map((u) => {
            const at = cellToScreen(u.cell);
            return (
              <button
                key={u.id}
                aria-label={`Borrow ${u.name} on battlefield`}
                onClick={() => props.onBorrow(u.id)}
                className="absolute z-10 !min-h-8 -translate-x-1/2 -translate-y-1/2 !rounded !border-brass !bg-primary !px-2 !py-1 text-xs !text-white shadow-panel"
                style={{
                  left: `${(at.x / WIDTH) * 100}%`,
                  top: `${((at.y + 8) / HEIGHT) * 100}%`,
                }}
              >
                Borrow
              </button>
            );
          })}
      {props.playback && announcement && (
        <div
          className={`pointer-events-none absolute inset-x-5 top-2 z-20 mx-auto flex max-w-sm items-center gap-3 rounded-lg border-b-4 ${announcement.kind === "strike" ? "border-oxblood" : "border-slate"} bg-paper/95 px-3 py-2 shadow-floating motion-safe:animate-[stamp_220ms_ease-out]`}
        >
          <WorkerPortrait
            token={announcement.token}
            className="w-10 shrink-0 rounded-t-full bg-brass/15 sm:w-14"
          />
          {announcement.kind === "borrowed" && (
            <WorkerPortrait
              token="captain"
              className="hidden w-12 shrink-0 rounded-t-full bg-slate/15 sm:block"
            />
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-secondary">
              {announcement.kind === "strike"
                ? "Fine print enforced"
                : "Captain’s orders · One action"}
            </p>
            <p className="font-display text-sm font-bold sm:text-lg">
              {announcement.name}
            </p>
            <p className="text-xs text-secondary">{announcement.detail}</p>
          </div>
        </div>
      )}
      {fallback && (
        <p className="absolute bottom-0 text-xs">
          Illustration unavailable. The board controls still work.
        </p>
      )}
    </div>
  );
}
