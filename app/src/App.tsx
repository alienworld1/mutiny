import { lazy, Suspense, useEffect, useRef, useState } from "react";
import * as engine from "./game/engine";
import {
  readProgress,
  saveProgress,
  emptyProgress,
  goals,
  summarize,
  goalNames,
} from "./game/storage";
import JobBoard, { ResultLine } from "./game/JobBoard";
import ActionControls from "./game/ActionControls";
import BattleFeedback from "./game/BattleFeedback";
import type { Mode } from "./game/ActionControls";
import type {
  Action,
  Configuration,
  Setup,
  Choices,
  Command,
  State,
  Transition,
  Event,
} from "./game/types";
import { coordinate, outcomeText, actionText, packages } from "./game/types";
const PixiStage = lazy(() => import("./stage/PixiStage"));
import type { Playback } from "./stage/playback";
import WorkerPortrait from "./near/WorkerPortrait";
import ContractJobs from "./near/ContractJobs";
import { useContractJob } from "./near/useContractJob";

const primary =
  "!border-primary !bg-primary !text-white hover:!bg-primary-hover";
const emptyChoices: Choices = {
  moves: [],
  actions: [],
};
type Screen =
  | { kind: "home" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "battle"; state: State };
type Preview = { command: Command; result: Transition; forecast: Event[] };
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const contract = useContractJob();
  const [contractBattle, setContractBattle] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const battleHeading = useRef<HTMLHeadingElement>(null);
  const battleSetup = screen.kind === "battle" ? screen.state.setup.id : null;
  useEffect(() => {
    window.scrollTo(0, 0);
    if (screen.kind === "battle")
      battleHeading.current?.focus({ preventScroll: true });
  }, [screen.kind, battleSetup]);
  const [selected, setSelected] = useState<number | null>(null);
  const [path, setPath] = useState<number[]>([]);
  const [mode, updateMode] = useState<Mode>("move");
  const [shoveTarget, setShoveTarget] = useState<number | null>(null);
  const [setups, setSetups] = useState<Setup[]>([]);
  const [progress, setProgress] = useState(emptyProgress);
  const attemptId = useRef<string>(crypto.randomUUID());
  const commitLock = useRef(false);
  function setMode(next: Mode) {
    updateMode(next);
    setShoveTarget(null);
    setNotice("");
  }
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState(
    "Select a crew member. Read the posted orders before you move.",
  );
  const [history, setHistory] = useState<{ label: string; events: Event[] }[]>(
    [],
  );
  const [feedback, setFeedback] = useState<Event[]>([]);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [storageWarning, setStorageWarning] = useState("");
  const [focusedOrder, setFocusedOrder] = useState<number | null>(null);
  const [restart, setRestart] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void engine
      .loadEngine()
      .then(async () => {
        if (!cancelled) setSetups(engine.content());
        try {
          const saved = await readProgress();
          if (!cancelled) setProgress(saved);
        } catch {
          if (!cancelled)
            setStorageWarning(
              "Local progress could not be read. You can keep playing.",
            );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const saveQueue = useRef(Promise.resolve());
  const requestId = useRef(0);
  useEffect(
    () => () => {
      requestId.current++;
    },
    [],
  );
  function persist(state: State) {
    const id = attemptId.current;
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(async () => {
        const saved = await saveProgress(id, state);
        setProgress(saved);
      })
      .catch(() =>
        setStorageWarning(
          "This browser could not save your progress. You can keep playing.",
        ),
      );
  }
  function clearSelection() {
    setSelected(null);
    setPath([]);
    updateMode("move");
    setShoveTarget(null);
    setPreview(null);
    setFocusedOrder(null);
  }
  async function resumeContract() {
    const id = ++requestId.current;
    try {
      const state = await contract.resume();
      if (id !== requestId.current) return;
      setContractBattle(true);
      clearSelection();
      setHistory([]);
      setFeedback([]);
      setPlayback(null);
      setNotice("");
      setRestart(false);
      if (state.borrow_pending !== null) setSelected(state.borrow_pending);
      setScreen({ kind: "battle", state });
    } catch (error) {
      setStorageWarning(message(error));
    }
  }
  async function play(fresh = false, config?: Configuration) {
    setContractBattle(false);
    const id = ++requestId.current;
    setScreen({ kind: "loading" });
    try {
      await engine.loadEngine();
      let nextId: string = crypto.randomUUID();
      let state = engine.configure(
        config ??
          (screen.kind === "battle"
            ? screen.state.log.config
            : engine.start().log.config),
      );
      if (!fresh) {
        try {
          const saved = await readProgress();
          if (saved.draft) {
            state = engine.replay(saved.draft.log).state;
            nextId = saved.draft.id;
          }
          setProgress(saved);
        } catch {
          setStorageWarning(
            "Your previous job could not be opened. A new job is ready.",
          );
        }
      }
      if (requestId.current !== id) return;
      attemptId.current = nextId;
      clearSelection();
      if (state.borrow_pending !== null) setSelected(state.borrow_pending);
      setRestart(false);
      setHistory([]);
      setFeedback([]);
      setPlayback(null);
      setNotice(
        state.borrow_pending !== null
          ? "Finish or skip the borrowed action."
          : "Select a crew member.",
      );
      setScreen({ kind: "battle", state });
      persist(state);
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
  function canBorrow(id: number) {
    if (!state) return false;
    try {
      return engine
        .choices(state.log, 0, [])
        .actions.some(
          (o) => o.action.kind === "borrow" && o.action.target === id,
        );
    } catch {
      return false;
    }
  }
  function propose(action: Action) {
    if (!state || selected === null) return;
    proposeCommand({
      kind:
        state.borrow_pending === selected ? "borrowed_activate" : "activate",
      unit: selected,
      path,
      action,
    });
  }
  function proposeCommand(command: Command) {
    if (!state) return;
    try {
      const result = engine.apply(state.log, command);
      const forecast =
        command.kind === "end_phase" ||
        result.state.outcome ||
        result.state.borrow_pending !== null
          ? []
          : engine
              .apply(result.state.log, { kind: "end_phase" })
              .events.filter(
                (e) => e.kind === "strike" || e.kind === "blocked",
              );
      setPreview({ command, result, forecast });
      setNotice("");
    } catch (error) {
      setPreview(null);
      setNotice(message(error));
    }
  }
  async function commit() {
    if (!preview || !state || commitLock.current) return;
    commitLock.current = true;
    const id = requestId.current;
    // Re-apply against current log, so a stale preview can never commit old state.
    try {
      const next = engine.apply(state.log, preview.command);
      if (contractBattle) await contract.persistLog(next.state.log);
      if (id !== requestId.current) return;
      setScreen({ kind: "battle", state: next.state });
      setPlayback({ before: state, events: next.events });
      const actor =
        "unit" in preview.command
          ? state.setup.units[preview.command.unit]!.name
          : "Enemy phase";
      setHistory((h) =>
        [
          { label: `Round ${state.round} · ${actor}`, events: next.events },
          ...h,
        ].slice(0, 12),
      );
      setFeedback(
        next.events.filter(
          (e) => !["moved", "attacked", "recovering"].includes(e.kind),
        ),
      );
      setNotice("");
      clearSelection();
      if (next.state.borrow_pending !== null)
        setSelected(next.state.borrow_pending);
      if (!contractBattle) persist(next.state);
    } catch (error) {
      setNotice(message(error));
      setPreview(null);
    } finally {
      queueMicrotask(() => {
        commitLock.current = false;
      });
    }
  }
  function select(id: number) {
    if (!state || state.outcome) return;
    if (state.borrow_pending !== null && id !== state.borrow_pending) {
      setNotice("Finish or skip the borrowed action first.");
      return;
    }
    clearSelection();
    setSelected(id);
    const u = state.setup.units[id]!;
    setNotice(
      state.activated.includes(id)
        ? `${u.name} has acted. Choose another crew member or end the phase.`
        : "",
    );
  }
  function cellClick(cell: number) {
    if (!state || state.outcome || preview) return;
    const target = state.setup.units.find((u) => u.hp > 0 && u.cell === cell);
    if (
      mode === "move" &&
      target?.side === "enemy" &&
      state.borrow_pending !== target.id
    ) {
      setFocusedOrder(target.id);
      setNotice(`${target.name}: ${target.hp} HP. Posted order selected.`);
      return;
    }
    if (mode !== "move") {
      if (mode === "shove") {
        if (target && shoveTarget === null) {
          setShoveTarget(target.id);
          setNotice(`Choose where to shove ${target.name}.`);
          return;
        }
        if (shoveTarget !== null)
          propose({ kind: "shove", target: shoveTarget, cell });
        else setNotice("Choose an adjacent unit first.");
      } else if (mode === "burn" || mode === "smoke" || mode === "certify")
        propose({ kind: mode, cell });
      else if (
        target &&
        (mode === "attack" ||
          mode === "clean_shot" ||
          mode === "relocate" ||
          mode === "swap" ||
          mode === "borrow")
      )
        propose({ kind: mode, target: target.id });
      else setNotice("Choose a unit on the board.");
      return;
    }
    if (
      target &&
      (target.side === "player" || state.borrow_pending === target.id)
    ) {
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
    <main
      className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8"
      onKeyDown={(event) => {
        if (event.key === "Escape" && preview) {
          setPreview(null);
          setNotice("Preview cancelled.");
        }
      }}
    >
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
          <div className="relative overflow-hidden rounded-[18px] bg-muted shadow-sm">
            <div aria-hidden="true" className="relative aspect-[4/3]">
              <img
                src="/assets/art/dock.webp"
                alt=""
                fetchPriority="high"
                className="absolute h-full w-full object-cover"
              />
              <div className="absolute bottom-[10%] left-[6%] w-[29%] -rotate-6">
                <WorkerPortrait token="captain" className="w-full" />
              </div>
              <div className="absolute bottom-[13%] left-[36%] w-[25%]">
                <WorkerPortrait token="rook" className="w-full" />
              </div>
              <div className="absolute bottom-[10%] right-[5%] w-[31%] rotate-3">
                <WorkerPortrait token="mallow" className="w-full" />
              </div>
            </div>
            <div className="bg-paper p-5 sm:p-6">
              <p className="text-xs uppercase tracking-[.2em] text-secondary">
                Your first job
              </p>
              <h2 className="my-2 text-3xl">Dock Fire</h2>
              <p className="max-w-sm text-secondary">
                Three pushes to deliver the cart. Five rounds before the office
                closes.
              </p>
            </div>
          </div>
        </section>
      )}
      {(screen.kind === "home" || contractBattle) && (
        <ContractJobs
          controller={contract}
          setups={setups}
          inBattle={contractBattle && screen.kind === "battle"}
          onResume={() => void resumeContract()}
        />
      )}
      {screen.kind === "home" && setups.length > 0 && (
        <JobBoard
          setups={setups}
          progress={progress}
          onPlay={(config) => void play(true, config)}
        />
      )}
      {screen.kind === "home" && storageWarning && (
        <p role="status">{storageWarning}</p>
      )}
      {screen.kind === "loading" && (
        <p role="status" className="py-16 text-center text-lg">
          Opening the job…
        </p>
      )}
      {screen.kind === "error" && (
        <section role="alert" className="rounded-2xl bg-paper p-8">
          <h1 className="text-2xl">The office is closed for a moment.</h1>
          <p className="my-4">{screen.message}</p>
          <button onClick={() => void play()}>Retry</button>
        </section>
      )}
      {state && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[.16em] text-secondary">
                {contractBattle ? "Contract Job" : "Free Play"} ·{" "}
                {state.setup.variant} · {state.log.config.placement}
              </p>
              <h1 ref={battleHeading} tabIndex={-1} className="text-3xl">
                {state.setup.name}
              </h1>
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
            <div className="flex flex-wrap gap-2">
              {!contractBattle && (
                <button
                  className="inline-flex items-center gap-2"
                  onClick={() => setRestart(true)}
                >
                  <img
                    src="/assets/icons/arrow-counter-clockwise.svg"
                    alt=""
                    aria-hidden="true"
                    className="h-4 w-4"
                  />
                  Restart
                </button>
              )}
              <button
                className="inline-flex items-center gap-2"
                onClick={() => {
                  requestId.current++;
                  clearSelection();
                  setContractBattle(false);
                  setScreen({ kind: "home" });
                }}
              >
                <img
                  src="/assets/icons/list.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-4 w-4"
                />
                Job Board
              </button>
            </div>
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
              <Suspense
                fallback={
                  <p
                    role="status"
                    className="flex aspect-square items-center justify-center rounded-2xl bg-muted"
                  >
                    Opening the stage…
                  </p>
                }
              >
                <PixiStage
                  state={preview?.result.state ?? state}
                  selected={selected}
                  path={path}
                  reachable={
                    preview || mode !== "move"
                      ? []
                      : options.moves.map((m) => m.cell)
                  }
                  targets={
                    preview
                      ? []
                      : options.actions
                          .filter(
                            (o) =>
                              o.action.kind === mode &&
                              (mode !== "shove" ||
                                shoveTarget === null ||
                                ("target" in o.action &&
                                  o.action.target === shoveTarget)),
                          )
                          .flatMap((o) =>
                            mode === "shove" &&
                            shoveTarget === null &&
                            "target" in o.action
                              ? [state.setup.units[o.action.target]!.cell]
                              : o.cells,
                          )
                  }
                  focusedOrder={focusedOrder}
                  playback={preview ? null : playback}
                  onCell={cellClick}
                />
              </Suspense>
              <p className="mt-2 text-sm text-secondary">
                ● Your crew · ⚑ Enemies · ⋯ Posted moves
              </p>
              <details className="mt-4 border-t border-border pt-3">
                <summary className="cursor-pointer py-2 font-semibold">
                  How to play
                </summary>
                <p className="mt-2 text-sm text-secondary">
                  Push the cart to the flag in five rounds. Keep the cart and
                  captain alive. Each unit can move, then act once per round.
                </p>
                <p className="mt-2 text-sm text-secondary">
                  Enemy orders are fixed for the round. A new breach of their
                  fine print causes a strike. An ordinary blocked order does
                  not.
                </p>
                <p className="mt-2 text-sm text-secondary">
                  Guard blocks one hit this enemy phase. Arrow keys move board
                  focus; Enter selects.
                </p>
              </details>
              {history.length > 0 && (
                <details className="mt-3 border-t border-border pt-3">
                  <summary className="cursor-pointer py-2 text-sm text-secondary">
                    Battle log
                  </summary>
                  <div className="max-h-80 space-y-5 overflow-y-auto py-3">
                    {history.map((batch, i) => (
                      <section key={i}>
                        <h3 className="mb-2 !font-ui text-xs font-semibold uppercase tracking-wide text-secondary">
                          {batch.label}
                        </h3>
                        <BattleFeedback events={batch.events} state={state} />
                      </section>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <aside className="space-y-4">
              {state.outcome ? (
                <section
                  aria-label="Job result"
                  className="result-stamp rounded-2xl border-2 border-primary bg-paper p-6"
                >
                  <p className="text-xs uppercase tracking-[.16em] text-secondary">
                    {contractBattle
                      ? "Contract Job result"
                      : "Free Play result"}
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
                    {state.strikes} {state.strikes === 1 ? "strike" : "strikes"}{" "}
                    ·{" "}
                    {state.setup.units.some((u) => u.borrowed)
                      ? "Borrow"
                      : "No Borrow"}
                  </p>
                  <ul className="mb-4 flex flex-wrap gap-2 text-sm">
                    {goals(summarize(state)).map((earned, i) => (
                      <li
                        key={goalNames[i]}
                        className={
                          earned ? "font-bold text-primary" : "text-secondary"
                        }
                      >
                        {earned ? "✓ " : "○ "}
                        {goalNames[i]}
                      </li>
                    ))}
                  </ul>
                  {!contractBattle && (
                    <div className="mb-4 space-y-3">
                      <ResultLine
                        label="Previous"
                        result={progress.ledger[state.setup.id]?.previous}
                      />
                      <ResultLine
                        label="Fastest clear"
                        result={progress.ledger[state.setup.id]?.best}
                      />
                    </div>
                  )}
                  {!contractBattle && (
                    <button className={primary} onClick={() => void play(true)}>
                      Play Again
                    </button>
                  )}
                </section>
              ) : (
                <section
                  aria-label="Crew actions"
                  className="rounded-2xl border border-border bg-paper p-4 sm:p-5"
                >
                  <div className="mb-4 flex flex-wrap gap-2">
                    {state.setup.units
                      .filter(
                        (u) =>
                          u.side === "player" || state.borrow_pending === u.id,
                      )
                      .map((u) => (
                        <button
                          key={u.id}
                          disabled={u.hp === 0 || !!preview}
                          aria-pressed={selected === u.id}
                          onClick={() => select(u.id)}
                          className="!px-3 text-sm"
                        >
                          <span
                            aria-hidden="true"
                            className="mr-1 font-mono text-xs"
                          >
                            {u.id + 1}
                          </span>
                          {u.name}{" "}
                          {u.hp === 0
                            ? "×"
                            : state.activated.includes(u.id)
                              ? "✓"
                              : `${u.hp} HP`}
                        </button>
                      ))}
                  </div>
                  {unit && !state.activated.includes(unit.id) && !preview ? (
                    <ActionControls
                      state={state}
                      unit={unit}
                      path={path}
                      mode={mode}
                      options={options}
                      setMode={setMode}
                      propose={propose}
                      clearMove={() => setPath([])}
                    />
                  ) : (
                    <h2 className="text-xl">Your orders</h2>
                  )}
                  {state.borrow_pending !== null && !preview && (
                    <button
                      className="mt-3 w-full"
                      onClick={() =>
                        proposeCommand({
                          kind: "skip_borrow",
                          unit: state.borrow_pending!,
                        })
                      }
                    >
                      Skip Borrow
                    </button>
                  )}
                  {preview && (
                    <div
                      className="mt-4 border-t border-border pt-4"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setPreview(null);
                          setNotice("Preview cancelled.");
                        }
                      }}
                    >
                      <h3 className="text-xl">Preview</h3>
                      <div className="my-3">
                        <BattleFeedback
                          events={preview.result.events}
                          state={preview.result.state}
                        />
                      </div>
                      {preview.forecast.length > 0 && (
                        <div className="my-3 border-l-2 border-oxblood pl-3">
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-secondary">
                            If you end now
                          </h4>
                          <BattleFeedback
                            events={preview.forecast}
                            state={preview.result.state}
                          />
                        </div>
                      )}
                      {preview.result.events.some(
                        (e) => e.kind === "refused",
                      ) && (
                        <p className="mb-3 font-semibold text-danger">
                          This command will be refused. Confirm to spend the
                          activation with no effect.
                        </p>
                      )}
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
                  <div
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className="mt-4"
                  >
                    {notice ? (
                      <p className="text-sm text-secondary">{notice}</p>
                    ) : !preview && !unit && feedback.length > 0 ? (
                      <div className="rounded-xl bg-muted/60 p-3">
                        <h3 className="mb-3 !font-ui text-xs font-semibold uppercase tracking-wide text-secondary">
                          Last action
                        </h3>
                        <BattleFeedback events={feedback} state={state} />
                      </div>
                    ) : null}
                  </div>
                  {!preview && state.borrow_pending === null && (
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
                  <h2 className="text-2xl">Enemy orders</h2>
                  <span className="text-xs text-secondary">
                    Fixed this round
                  </span>
                </div>
                {focusedOrder !== null && (
                  <button
                    className="mb-3 !min-h-9 !py-1 text-sm"
                    onClick={() => setFocusedOrder(null)}
                  >
                    Show all orders
                  </button>
                )}
                <div className="divide-y divide-border">
                  {state.orders.map((order) => {
                    const u = state.setup.units[order.unit]!;
                    return (
                      <div key={order.unit} className="py-3 first:pt-0">
                        <button
                          aria-pressed={focusedOrder === u.id}
                          className="!min-h-11 !w-full !rounded-lg !border-transparent !bg-transparent !px-2 text-left hover:!bg-paper/60"
                          onClick={() =>
                            setFocusedOrder(focusedOrder === u.id ? null : u.id)
                          }
                        >
                          <span className="flex items-center justify-between gap-2 text-sm">
                            <span>
                              <span
                                aria-hidden="true"
                                className="mr-2 font-mono text-xs text-danger"
                              >
                                {u.id + 1}
                              </span>
                              {u.name}
                            </span>
                            <span className="text-xs font-normal text-secondary">
                              {u.hp} HP {focusedOrder === u.id ? "▴" : "▾"}
                            </span>
                          </span>
                          <span className="mt-1 block text-xs font-normal text-secondary">
                            {actionText(order.action, state)}
                          </span>
                        </button>
                        {focusedOrder === u.id && (
                          <div className="mt-2 space-y-2 border-l-2 border-oxblood pl-3 text-sm text-secondary">
                            <p>
                              {[order.start, ...order.path]
                                .map(coordinate)
                                .join(" → ")}
                            </p>
                            {order.affected.length > 0 && (
                              <p>
                                Affects{" "}
                                {order.affected.map(coordinate).join(", ")}
                              </p>
                            )}
                            {u.package !== "none" && (
                              <p>
                                <strong>{packages[u.package].name}</strong>
                                <br />
                                {packages[u.package].clause}
                              </p>
                            )}
                          </div>
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
                        {u.name} ·{" "}
                        {u.status === "striking" ? "ON STRIKE" : "Recovering"}
                        <br />
                        <span className="font-normal">
                          {u.status === "striking"
                            ? "Skips the next enemy phase."
                            : "Returns after the enemy phase."}
                        </span>
                        {u.status === "striking" &&
                          !u.borrowed &&
                          !canBorrow(u.id) && (
                            <span className="mt-1 block font-normal text-secondary">
                              {state.activated.includes(0)
                                ? "Your captain has acted."
                                : "Borrow needs your captain within 2 tiles."}
                            </span>
                          )}
                        {u.status === "striking" &&
                          !u.borrowed &&
                          canBorrow(u.id) && (
                            <button
                              className="mt-2 block"
                              disabled={!!preview}
                              onClick={() => {
                                clearSelection();
                                setSelected(0);
                                proposeCommand({
                                  kind: "activate",
                                  unit: 0,
                                  path: [],
                                  action: { kind: "borrow", target: u.id },
                                });
                              }}
                            >
                              Borrow {u.name}
                            </button>
                          )}
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
