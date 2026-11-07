import { useEffect, useRef, useState } from "react";
import * as engine from "./game/engine";
import { readDraft, saveDraft } from "./game/storage";
import type {
  Action,
  ActionLog,
  Choices,
  Command,
  State,
  Transition,
} from "./game/types";
import { coordinate, eventText, outcomeText } from "./game/types";
import PixiStage from "./stage/PixiStage";

const primary =
  "!border-primary !bg-primary !text-white hover:!bg-primary-hover";
const emptyChoices: Choices = {
  moves: [],
  attacks: [],
  burns: [],
  push: false,
};
type Screen =
  | { kind: "home" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "battle"; state: State };
type Preview = { command: Command; result: Transition; forecast: string[] };
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [selected, setSelected] = useState<number | null>(null);
  const [path, setPath] = useState<number[]>([]);
  const [mode, setMode] = useState<"move" | "attack" | "burn">("move");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState(
    "Select a crew member. Read the posted orders before you move.",
  );
  const [history, setHistory] = useState<string[]>([]);
  const [storageWarning, setStorageWarning] = useState("");
  const [focusedOrder, setFocusedOrder] = useState<number | null>(null);
  const [restart, setRestart] = useState(false);
  const saveQueue = useRef(Promise.resolve());
  const requestId = useRef(0);
  useEffect(
    () => () => {
      requestId.current++;
    },
    [],
  );
  function persist(log: ActionLog) {
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => saveDraft(log))
      .catch(() =>
        setStorageWarning(
          "This browser could not save your progress. You can keep playing.",
        ),
      );
  }
  function clearSelection() {
    setSelected(null);
    setPath([]);
    setMode("move");
    setPreview(null);
    setFocusedOrder(null);
  }
  async function play(fresh = false) {
    const id = ++requestId.current;
    setScreen({ kind: "loading" });
    try {
      await engine.loadEngine();
      let state = engine.start();
      if (!fresh) {
        try {
          const draft = await readDraft();
          if (draft) state = engine.replay(draft as ActionLog).state;
        } catch {
          setStorageWarning(
            "Your previous job could not be opened. A new job is ready.",
          );
        }
      }
      if (requestId.current !== id) return;
      clearSelection();
      setRestart(false);
      setHistory([]);
      setNotice(
        state.log.commands.length
          ? "Your job is ready to continue."
          : "Three pushes. Five rounds. Try Burn Notice on Dot's posted path.",
      );
      setScreen({ kind: "battle", state });
      persist(state.log);
    } catch (error) {
      if (requestId.current === id)
        setScreen({
          kind: "error",
          message: `The game could not load. ${message(error)}`,
        });
    }
  }
  const state = screen.kind === "battle" ? screen.state : null;
  const unit = state?.setup.units.find((u) => u.id === selected);
  let options = emptyChoices;
  if (state && selected !== null && !state.outcome) {
    try {
      options = engine.choices(state.log, selected, path);
    } catch {
      /* A spent or knocked-out unit has no commands. */
    }
  }
  function propose(action: Action) {
    if (!state || selected === null) return;
    proposeCommand({ kind: "activate", unit: selected, path, action });
  }
  function proposeCommand(command: Command) {
    if (!state) return;
    try {
      const result = engine.apply(state.log, command);
      const forecast =
        command.kind === "end_phase" || result.state.outcome
          ? []
          : engine
              .apply(result.state.log, { kind: "end_phase" })
              .events.filter((e) => e.kind === "strike" || e.kind === "blocked")
              .map((e) => `If you end now: ${eventText(e, result.state)}`);
      setPreview({ command, result, forecast });
      setNotice("");
    } catch (error) {
      setPreview(null);
      setNotice(message(error));
    }
  }
  function commit() {
    if (!preview || !state) return;
    // Re-apply against current log, so a stale preview can never commit old state.
    try {
      const next = engine.apply(state.log, preview.command);
      const lines = next.events.map((e) => eventText(e, next.state));
      setScreen({ kind: "battle", state: next.state });
      setHistory((h) => [...lines, ...h].slice(0, 24));
      setNotice(lines.join(" ") || "Phase complete.");
      clearSelection();
      persist(next.state.log);
    } catch (error) {
      setNotice(message(error));
      setPreview(null);
    }
  }
  function select(id: number) {
    if (!state || state.outcome) return;
    clearSelection();
    setSelected(id);
    const u = state.setup.units[id]!;
    setNotice(
      state.activated.includes(id)
        ? `${u.name} has acted. Choose another crew member or end the phase.`
        : `${u.name}: choose a destination, then an action. You can also act here.`,
    );
  }
  function cellClick(cell: number) {
    if (!state || state.outcome || preview) return;
    const target = state.setup.units.find((u) => u.hp > 0 && u.cell === cell);
    if (mode === "burn") {
      propose({ kind: "burn", cell });
      return;
    }
    if (mode === "attack") {
      if (target) propose({ kind: "attack", target: target.id });
      else setNotice("Choose an opposing unit in reach.");
      return;
    }
    if (target?.side === "player") {
      select(target.id);
      return;
    }
    if (selected === null) {
      setNotice(
        target
          ? `${target.name}: ${target.hp} HP. Read their posted order below.`
          : `${coordinate(cell)}. Select a crew member first.`,
      );
      return;
    }
    const move = options.moves.find((move) => move.cell === cell);
    if (move) {
      setPath(move.path);
      setNotice(`Move to ${coordinate(cell)}, then choose an action.`);
    } else setNotice("That cell is out of reach or blocked.");
  }
  return (
    <main className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8">
      <header className="mb-6 flex items-baseline justify-between gap-4 border-b border-border pb-4">
        <a href="./" className="font-display text-xl font-bold tracking-tight">
          MUTINY{" "}
          <span className="font-ui text-sm font-normal text-secondary">
            The Fine Print
          </span>
        </a>
        <span className="text-xs uppercase tracking-[.18em] text-secondary">
          The Little Kingdom Theatre
        </span>
      </header>
      {screen.kind === "home" && (
        <section className="mx-auto grid max-w-5xl items-center gap-8 py-8 md:grid-cols-[1fr_1.1fr] md:py-16">
          <div>
            <p className="mb-4 text-sm uppercase tracking-[.2em] text-secondary">
              A small kingdom. A difficult shift.
            </p>
            <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl">
              Orders are orders.
              <br />
              <em className="text-primary">Terms apply.</em>
            </h1>
            <p className="my-6 max-w-md text-lg text-secondary">
              Escort the payroll cart. Read the enemy's orders. Give their
              workers a reason to object.
            </p>
            <button
              className={`${primary} min-w-40 !min-h-12`}
              onClick={() => void play()}
            >
              Play Free
            </button>
            <p className="mt-3 text-sm text-secondary">
              Dock Fire · 7 × 7 tactics · about 5 minutes
            </p>
          </div>
          <div className="relative overflow-hidden rounded-[18px] bg-muted p-6 sm:p-9">
            <div
              aria-hidden="true"
              className="mb-6 border-b-4 border-clay pb-8 text-center font-display text-6xl text-primary"
            >
              ♜ <span className="text-oxblood">⚑</span> ♜
            </div>
            <p className="text-xs uppercase tracking-[.2em] text-secondary">
              Your first job
            </p>
            <h2 className="my-2 text-3xl">Dock Fire</h2>
            <p className="max-w-sm text-secondary">
              Three pushes to deliver the cart. Five rounds before the office
              closes.
            </p>
            <p className="mt-6 border-l-2 border-oxblood pl-4 font-display text-xl italic">
              “Safety is in the contract.
              <br />
              Reading it is apparently optional.”
            </p>
          </div>
        </section>
      )}
      {screen.kind === "loading" && (
        <p role="status" className="py-16 text-center text-lg">
          Opening the quay…
        </p>
      )}
      {screen.kind === "error" && (
        <section role="alert" className="rounded-2xl bg-paper p-8">
          <h1 className="text-2xl">The quay is closed for a moment.</h1>
          <p className="my-4">{screen.message}</p>
          <button onClick={() => void play()}>Retry</button>
        </section>
      )}
      {state && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[.16em] text-secondary">
                Free Play · Payroll quay
              </p>
              <h1 className="text-3xl">Dock Fire</h1>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm tabular-nums">
              <div>
                <dt className="text-secondary">Round</dt>
                <dd className="font-bold" data-testid="round">
                  {state.round} / 5
                </dd>
              </div>
              <div>
                <dt className="text-secondary">Cart HP</dt>
                <dd className="font-bold" data-testid="cart-hp">
                  {state.cart_hp} / 2
                </dd>
              </div>
              <div>
                <dt className="text-secondary">Pushes</dt>
                <dd className="font-bold" data-testid="pushes">
                  {state.pushes} / 3
                </dd>
              </div>
              <div>
                <dt className="text-secondary">Crew ready</dt>
                <dd className="font-bold">
                  {
                    state.setup.units.filter(
                      (u) =>
                        u.side === "player" &&
                        u.hp > 0 &&
                        !state.activated.includes(u.id),
                    ).length
                  }{" "}
                  / 3
                </dd>
              </div>
            </dl>
            <button onClick={() => setRestart(true)}>Restart</button>
          </div>
          {restart && (
            <div
              role="alertdialog"
              aria-label="Restart this job?"
              className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-paper p-4"
            >
              <p className="mr-auto">Restart this job?</p>
              <button
                autoFocus
                className={primary}
                onClick={() => void play(true)}
              >
                Restart Job
              </button>
              <button onClick={() => setRestart(false)}>Keep Playing</button>
            </div>
          )}
          {storageWarning && (
            <p role="status" className="mb-3 text-sm text-warning">
              {storageWarning}
            </p>
          )}
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(300px,1fr)]">
            <div>
              {preview && (
                <p className="rounded-t-xl bg-ink px-4 py-2 text-center text-sm font-bold text-white">
                  PREVIEW · Confirm to apply
                </p>
              )}
              <PixiStage
                state={preview?.result.state ?? state}
                selected={selected}
                path={path}
                reachable={preview ? [] : options.moves.map((m) => m.cell)}
                targets={
                  preview
                    ? []
                    : mode === "burn"
                      ? options.burns
                      : mode === "attack"
                        ? options.attacks.map(
                            (id) => state.setup.units[id]!.cell,
                          )
                        : []
                }
                focusedOrder={focusedOrder}
                onCell={cellClick}
              />
              <p className="mt-2 text-sm text-secondary">
                Solid rings: your crew · Banners: enemies · Dashed lines: posted
                moves
              </p>
              <details className="mt-4 border-t border-border pt-3">
                <summary className="cursor-pointer py-2 font-semibold">
                  How to play
                </summary>
                <p className="mt-2 text-sm text-secondary">
                  Select a crew member, choose an optional move, then one
                  action. Confirm the preview. Push the cart once per round
                  along the marked route. End Phase runs the posted enemy
                  orders. Deliver in five rounds and keep your captain and cart
                  alive.
                </p>
                <p className="mt-2 text-sm text-secondary">
                  Burn Notice lights one empty cell for the enemy phase. Dot
                  refuses a posted path through new fire. An occupied path is an
                  ordinary block. Arrow keys move board focus; Enter selects.
                </p>
              </details>
              {history.length > 0 && (
                <details className="mt-3 border-t border-border pt-3">
                  <summary className="cursor-pointer py-2 font-semibold">
                    Recent events
                  </summary>
                  <ul className="space-y-2 text-sm text-secondary">
                    {history.map((line, i) => (
                      <li key={`${i}-${line}`}>{line}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <aside className="space-y-4">
              {state.outcome ? (
                <section
                  aria-label="Job result"
                  className="rounded-2xl border-2 border-primary bg-paper p-6"
                >
                  <p className="text-xs uppercase tracking-[.16em] text-secondary">
                    Free Play result
                  </p>
                  <h2 className="my-2 text-4xl">
                    {outcomeText(state.outcome)}
                  </h2>
                  <p className="text-secondary">
                    {state.outcome === "delivered"
                      ? "The wages arrived. Morale remains under review."
                      : "The paperwork survived. Try another plan."}
                  </p>
                  <p className="my-5">
                    Round {state.round} · Cart {state.cart_hp}/2 HP ·{" "}
                    {state.strikes} {state.strikes === 1 ? "strike" : "strikes"}
                  </p>
                  <button className={primary} onClick={() => void play(true)}>
                    Play Again
                  </button>
                </section>
              ) : (
                <section
                  aria-label="Crew actions"
                  className="rounded-2xl border border-border bg-paper p-4 sm:p-5"
                >
                  <div className="mb-4 flex flex-wrap gap-2">
                    {state.setup.units
                      .filter((u) => u.side === "player")
                      .map((u) => (
                        <button
                          key={u.id}
                          disabled={u.hp === 0 || !!preview}
                          aria-pressed={selected === u.id}
                          onClick={() => select(u.id)}
                          className="!px-3 text-sm"
                        >
                          {u.name}{" "}
                          {u.hp === 0
                            ? "×"
                            : state.activated.includes(u.id)
                              ? "✓"
                              : `${u.hp} HP`}
                        </button>
                      ))}
                  </div>
                  {unit ? (
                    <>
                      <h2 className="text-2xl">{unit.name}</h2>
                      <p className="mb-3 text-sm capitalize text-secondary">
                        {unit.role} · Move {unit.movement} ·{" "}
                        {path.length
                          ? `To ${coordinate(path.at(-1)!)}`
                          : `At ${coordinate(unit.cell)}`}
                      </p>
                      {!state.activated.includes(unit.id) && !preview && (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => {
                                setMode("move");
                                setNotice(
                                  "Choose a highlighted destination, then an action.",
                                );
                              }}
                              aria-pressed={mode === "move"}
                            >
                              Move
                            </button>
                            <button onClick={() => propose({ kind: "guard" })}>
                              Guard
                            </button>
                            <button onClick={() => propose({ kind: "push" })}>
                              Push Cart
                            </button>
                            <button
                              onClick={() => {
                                setMode("attack");
                                setNotice(
                                  options.attacks.length
                                    ? "Choose a marked enemy."
                                    : "No enemy is adjacent. Choose a move first.",
                                );
                              }}
                              aria-pressed={mode === "attack"}
                            >
                              Attack
                            </button>
                            {unit.id === 0 && (
                              <button
                                disabled={state.burn_used}
                                className="col-span-2"
                                aria-pressed={mode === "burn"}
                                onClick={() => {
                                  setMode("burn");
                                  setNotice(
                                    "Choose a marked empty cell. Fire lasts through this enemy phase.",
                                  );
                                }}
                              >
                                Burn Notice{state.burn_used ? " · spent" : ""}
                              </button>
                            )}
                          </div>
                          {path.length > 0 && (
                            <button
                              className="mt-2 w-full"
                              onClick={() => {
                                setPath([]);
                                setPreview(null);
                              }}
                            >
                              Clear Move
                            </button>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <h2 className="text-xl">Your orders</h2>
                  )}
                  {preview && (
                    <div className="mt-4 border-t border-border pt-4">
                      <h3 className="text-xl">Preview</h3>
                      <ul className="my-3 space-y-2 text-sm">
                        {preview.result.events.map((e, i) => (
                          <li key={i}>{eventText(e, preview.result.state)}</li>
                        ))}
                        {preview.forecast.map((line) => (
                          <li key={line} className="font-semibold text-warning">
                            {line}
                          </li>
                        ))}
                      </ul>
                      {preview.command.kind === "end_phase" && (
                        <p className="mb-3 text-sm text-secondary">
                          Unused crew actions will be lost.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button autoFocus className={primary} onClick={commit}>
                          Confirm
                        </button>
                        <button
                          onClick={() => {
                            setPreview(null);
                            setNotice("Preview cancelled.");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  <p
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className="mt-4 text-sm leading-relaxed"
                  >
                    {notice}
                  </p>
                  {!preview && (
                    <button
                      className={`${primary} mt-4 w-full`}
                      onClick={() => proposeCommand({ kind: "end_phase" })}
                    >
                      End Phase
                    </button>
                  )}
                </section>
              )}
              <section
                aria-label="Posted enemy orders"
                className="rounded-2xl bg-muted p-4 sm:p-5"
              >
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h2 className="text-2xl">Posted orders</h2>
                  <span className="text-xs text-secondary">
                    Fixed this round
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {state.orders.map((order) => {
                    const u = state.setup.units[order.unit]!;
                    return (
                      <div key={order.unit} className="py-3 first:pt-0">
                        <button
                          aria-pressed={focusedOrder === u.id}
                          className="mb-2 !min-h-11 !w-full !bg-transparent text-left text-sm"
                          onClick={() =>
                            setFocusedOrder(focusedOrder === u.id ? null : u.id)
                          }
                        >
                          {u.name} · {u.hp} HP{u.guard ? " · Guard" : ""}
                        </button>
                        <p className="text-sm">
                          {[order.start, ...order.path]
                            .map(coordinate)
                            .join(" → ")}
                        </p>
                        <p className="text-sm text-secondary">
                          {order.action.kind === "attack"
                            ? `Attack ${order.action.target === 6 ? "Cart" : state.setup.units[order.action.target]!.name} · ${order.affected.map(coordinate).join(", ")} · 1 damage`
                            : "Guard · blocks one hit"}
                        </p>
                        {u.fire_clause && (
                          <p className="mt-2 border-l-2 border-oxblood pl-2 text-sm">
                            <strong>NOT ON THE FIRE</strong>
                            <br />
                            Refuses a posted path through new fire.
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {state.setup.units
                    .filter(
                      (u) =>
                        u.side === "enemy" && u.hp > 0 && u.status !== "normal",
                    )
                    .map((u) => (
                      <p
                        key={u.id}
                        className="py-3 text-sm font-semibold text-danger"
                      >
                        {u.name} · ON STRIKE
                        <br />
                        <span className="font-normal">
                          Refused your fire. Skips the next enemy phase.
                        </span>
                      </p>
                    ))}
                  {state.orders.length === 0 && !state.outcome && (
                    <p className="text-sm">No enemy orders this round.</p>
                  )}
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
      <footer className="mt-8 border-t border-border pt-4 text-xs text-secondary">
        MUTINY: The Fine Print · A tactical employment dispute.
      </footer>
    </main>
  );
}
export default App;
