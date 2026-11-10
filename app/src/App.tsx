import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { coordinate, outcomeText, actionText } from "./game/types";
const PixiStage = lazy(() => import("./stage/PixiStage"));
import type { Playback } from "./stage/playback";
import WorkerPortrait from "./near/WorkerPortrait";
import BattleHud from "./game/BattleHud";
import CrewRoster from "./game/CrewRoster";
import EnemyOrders from "./game/EnemyOrders";
import SoundControls from "./game/SoundControls";
import FirstShift from "./game/FirstShift";
import FieldGuide from "./game/FieldGuide";
import {
  guideTarget,
  firstShiftCommands,
  firstShiftConfig,
  firstShiftKey,
  firstShiftStep,
  readGuidePreference,
  saveGuidePreference,
  sameCommand,
} from "./game/firstShift";
import { createBattleSound } from "./game/sound";
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
  const [sound] = useState(createBattleSound);
  const [playbackBusy, setPlaybackBusy] = useState(false);
  const playbackDone = useCallback(() => setPlaybackBusy(false), []);
  const [contractBattle, setContractBattle] = useState(false);
  const [menu, setMenu] = useState<"title" | "jobs">("title");
  const [preparation, setPreparation] = useState<"free" | "contract">("free");
  const [config, setConfig] = useState<Configuration>({
    setup_id: "dock-fire-intro",
    placement: "escort",
    worker: 0,
    package_option: 0,
  });
  function openJobs(mode: "free" | "contract" = "free") {
    setMenu("jobs");
    setPreparation(mode);
    if (!setups.length)
      void engine
        .loadEngine()
        .then(() => setSetups(engine.content()))
        .catch(() =>
          setScreen({
            kind: "error",
            message: "The job board could not load. Retry to open the game.",
          }),
        );
    if (mode === "contract" && !contract.enabled) contract.show();
  }
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
    sound.cue("select");
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
  const [firstShift, setFirstShift] = useState(false);
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
  function viewCompany() {
    requestId.current++;
    clearSelection();
    setFirstShift(false);
    setContractBattle(false);
    setScreen({ kind: "home" });
    openJobs("contract");
  }
  async function resumeContract() {
    sound.unlock();
    const id = ++requestId.current;
    try {
      const state = await contract.resume();
      if (id !== requestId.current) return;
      setContractBattle(true);
      setFirstShift(false);
      clearSelection();
      setHistory([]);
      setFeedback([]);
      setPlayback(null);
      setPlaybackBusy(false);
      setNotice("");
      setRestart(false);
      if (state.borrow_pending !== null) setSelected(state.borrow_pending);
      setScreen({ kind: "battle", state });
    } catch (error) {
      setStorageWarning(message(error));
    }
  }
  async function play(fresh = false, config?: Configuration, lesson = false) {
    sound.unlock();
    setPlaybackBusy(false);
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
      let newPlayer = false;
      if (!fresh) {
        try {
          const saved = await readProgress();
          if (saved.draft) {
            state = engine.replay(saved.draft.log).state;
            nextId = saved.draft.id;
          }
          setProgress(saved);
          newPlayer = saved.attempts.length === 0;
        } catch {
          newPlayer = true;
          setStorageWarning(
            "Your previous job could not be opened. A new job is ready.",
          );
        }
      }
      if (requestId.current !== id) return;
      const preference = readGuidePreference(firstShiftKey);
      const guided =
        lesson ||
        (firstShiftStep(state) !== null &&
          (preference === "pending" || (newPlayer && preference === "new")));
      setFirstShift(guided);
      if (guided)
        saveGuidePreference(
          firstShiftKey,
          firstShiftStep(state) === firstShiftCommands.length
            ? "complete"
            : "pending",
        );
      attemptId.current = nextId;
      clearSelection();
      if (state.borrow_pending !== null) setSelected(state.borrow_pending);
      setRestart(false);
      setHistory([]);
      setFeedback([]);
      setPlayback(null);
      setPlaybackBusy(false);
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
  const lessonStep = firstShift && state ? firstShiftStep(state) : null;
  const guidedCommand =
    lessonStep !== null ? firstShiftCommands[lessonStep] : undefined;
  const highlightedCell =
    state && lessonStep !== null && !preview
      ? guideTarget(lessonStep, selected, path, mode, state)
      : null;
  const inBattle = screen.kind === "battle";
  useEffect(() => {
    if (
      lessonStep === null ||
      playbackBusy ||
      (lessonStep === 0 && selected === null)
    )
      return;
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>("[data-guide=true]");
      if (!target) return;
      const bounds = target.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > window.innerHeight)
        target.scrollIntoView({ block: "center", behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [lessonStep, selected, mode, highlightedCell, preview, playbackBusy]);
  useEffect(() => {
    const visibility = () => sound.setActive(inBattle && !document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      sound.setActive(false);
    };
  }, [sound, inBattle]);
  useEffect(() => () => sound.dispose(), [sound]);
  const unit = state?.setup.units.find((u) => u.id === selected);
  let options = emptyChoices;
  if (state && selected !== null && !state.outcome) {
    try {
      options = engine.choices(state.log, selected, path);
    } catch {
      /* A spent or knocked-out unit has no commands. */
    }
  }
  function borrow(id: number) {
    const plannedPath = selected === 0 ? path : [];
    clearSelection();
    setSelected(0);
    proposeCommand({
      kind: "activate",
      unit: 0,
      path: plannedPath,
      action: { kind: "borrow", target: id },
    });
  }
  function canBorrow(id: number) {
    if (!state) return false;
    try {
      return engine
        .choices(state.log, 0, selected === 0 ? path : [])
        .actions.some(
          (o) => o.action.kind === "borrow" && o.action.target === id,
        );
    } catch {
      return false;
    }
  }
  function propose(action: Action) {
    if (!state || selected === null || playbackBusy) return;
    proposeCommand({
      kind:
        state.borrow_pending === selected ? "borrowed_activate" : "activate",
      unit: selected,
      path,
      action,
    });
  }
  function proposeCommand(command: Command) {
    if (!state || playbackBusy) return;
    if (guidedCommand && !sameCommand(command, guidedCommand)) {
      setNotice(
        "Follow the highlighted step, or skip the guide to choose your own plan.",
      );
      return;
    }
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
    if (!preview || !state || playbackBusy || commitLock.current) return;
    commitLock.current = true;
    const id = requestId.current;
    // Re-apply against current log, so a stale preview can never commit old state.
    try {
      const next = engine.apply(state.log, preview.command);
      if (guidedCommand && !sameCommand(preview.command, guidedCommand)) return;
      if (contractBattle) await contract.persistLog(next.state.log);
      if (id !== requestId.current) return;
      setScreen({ kind: "battle", state: next.state });
      setPlaybackBusy(next.events.length > 0);
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
      if (firstShift && firstShiftStep(next.state) === 1) setFocusedOrder(4);
      if (
        firstShift &&
        firstShiftStep(next.state) === firstShiftCommands.length
      )
        saveGuidePreference(firstShiftKey, "complete");
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
    if (!state || state.outcome || playbackBusy) return;
    sound.cue("select");
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
    if (!state || state.outcome || preview || playbackBusy) return;
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
      className={
        state
          ? "min-h-svh bg-ink px-2 py-2 sm:px-5 sm:py-3"
          : "mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5"
      }
      onPointerDownCapture={() => {
        if (inBattle) sound.unlock();
      }}
      onKeyDownCapture={(event) => {
        if (inBattle && (event.key === "Enter" || event.key === " "))
          sound.unlock();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && preview) {
          setPreview(null);
          setNotice("Preview cancelled.");
        }
      }}
    >
      {!state && (
        <header className="mb-5 flex items-center justify-between gap-3 border-b border-border pb-3">
          <button
            className="!min-h-0 !rounded-none !border-0 !bg-transparent !p-0 !shadow-none text-left"
            onClick={() => {
              requestId.current++;
              clearSelection();
              setContractBattle(false);
              setMenu("title");
              setScreen({ kind: "home" });
            }}
            aria-label="Mutiny home"
          >
            <img
              src="/assets/brand/mutiny-mark.svg"
              alt=""
              className="mr-2 inline-block h-9 w-9 align-middle"
            />
            <span className="font-display text-2xl font-bold tracking-tight align-middle">
              MUTINY
            </span>
            <span className="ml-3 hidden text-sm font-normal text-secondary sm:inline">
              The Fine Print
            </span>
          </button>
          <span className="text-xs font-semibold uppercase tracking-[.16em] text-secondary">
            Royal Payroll Office
          </span>
        </header>
      )}
      {screen.kind === "home" && menu === "title" && (
        <section
          aria-label="Welcome to Mutiny"
          className="relative isolate min-h-[620px] overflow-hidden rounded-[18px] border-b-8 border-brass bg-muted shadow-panel sm:min-h-[680px]"
        >
          <img
            src="/assets/art/dock.webp"
            alt="A tiny harbor with timber warehouses and a winding quay"
            fetchPriority="high"
            className="absolute inset-0 -z-20 h-full w-full object-cover object-top"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-chalk via-chalk/90 to-chalk/0 max-md:bg-gradient-to-b max-md:from-chalk/95 max-md:via-chalk/85 max-md:to-transparent" />
          <div className="relative z-10 max-w-xl px-6 py-10 sm:px-12 sm:py-16">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[.24em] text-secondary">
              A small kingdom. A difficult shift.
            </p>
            <h1 className="flex items-center gap-3 sm:gap-4">
              <img
                src="/assets/brand/mutiny-mark.svg"
                alt=""
                className="w-16 shrink-0 sm:w-24"
              />
              <span className="font-display text-[clamp(42px,9vw,76px)] leading-[.95] tracking-tight">
                MUTINY
                <span className="mt-2 block text-2xl italic tracking-normal sm:text-3xl">
                  The Fine Print
                </span>
              </span>
            </h1>
            <p className="mt-7 max-w-xs text-lg text-secondary">
              Deliver the payroll. Turn the enemy’s own fine print against them.
            </p>
            <div className="mt-8 grid max-w-64 gap-3">
              <button
                className={`${primary} !min-h-12 text-lg shadow-panel`}
                onClick={() => void play()}
              >
                Play Free
              </button>
              <button onClick={() => openJobs()}>Job Board</button>
              <div className="mt-3 border-t border-border pt-4">
                <button
                  className="w-full !bg-paper/80"
                  onClick={() => openJobs("contract")}
                >
                  Deliver supplies
                </button>
                <p className="mt-2 text-center text-xs text-secondary">
                  Hire a crew. Restore the towns.
                </p>
                <p className="mt-1 text-center text-xs text-secondary">
                  NEAR testnet
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-secondary">
              5 rounds · About 5 minutes
            </p>
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 flex w-[65%] items-end justify-end max-md:w-[55%]"
          >
            <WorkerPortrait
              fullBody
              token="rook"
              className="-mr-8 w-[40%] -rotate-3"
            />
            <WorkerPortrait
              fullBody
              token="captain"
              className="-mr-7 w-[48%]"
            />
            <WorkerPortrait
              fullBody
              token="mallow"
              className="w-[45%] rotate-3"
            />
          </div>
        </section>
      )}
      {screen.kind === "home" && menu === "jobs" && setups.length === 0 && (
        <p role="status" className="py-16 text-center">
          Opening the job board…
        </p>
      )}
      {screen.kind === "home" && menu === "jobs" && setups.length > 0 && (
        <JobBoard
          setups={setups}
          progress={progress}
          config={config}
          setConfig={setConfig}
          preparation={preparation}
          onPreparation={(mode) => {
            setPreparation(mode);
            if (mode === "contract" && !contract.enabled) contract.show();
          }}
          onPlay={(next) => void play(true, next)}
          contractPanel={
            <ContractJobs
              controller={contract}
              setups={setups}
              config={config}
              setConfig={setConfig}
              inBattle={false}
              onResume={() => void resumeContract()}
              onCompany={viewCompany}
              onLearn={() => void play(true, firstShiftConfig, true)}
            />
          }
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
        <div className="mx-auto max-w-[760px] lg:max-w-[min(1040px,max(800px,calc((100svh-220px)*640/680+356px)))]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 text-paper">
            <span className="font-display text-lg">
              MUTINY{" "}
              <span className="ml-2 font-ui text-xs text-paper/70">
                {contractBattle ? "Contract Job" : "Free Play"}
              </span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <SoundControls sound={sound} />
              {!contractBattle && (
                <button
                  className="!min-h-9 !px-3 text-xs !text-ink"
                  onClick={() => setRestart(true)}
                >
                  Restart
                </button>
              )}
              <button
                className="!min-h-9 !px-3 text-xs !text-ink"
                onClick={() => {
                  requestId.current++;
                  clearSelection();
                  setContractBattle(false);
                  setMenu("jobs");
                  setScreen({ kind: "home" });
                }}
              >
                Job Board
              </button>
            </div>
          </div>
          {restart && (
            <div
              role="alertdialog"
              aria-label="Restart this job?"
              className="mb-2 flex flex-wrap items-center gap-3 rounded-lg bg-paper p-3"
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
            <p role="status" className="mb-2 bg-paper p-2 text-sm text-warning">
              {storageWarning}
            </p>
          )}
          {lessonStep !== null && !state.outcome && (
            <FirstShift
              step={lessonStep}
              preview={!!preview}
              busy={playbackBusy}
              onSkip={() => {
                saveGuidePreference(
                  firstShiftKey,
                  lessonStep >= firstShiftCommands.length
                    ? "complete"
                    : "skipped",
                );
                setFirstShift(false);
                setNotice("");
              }}
            />
          )}
          <div className="grid items-start gap-0 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-3">
            <div className="relative overflow-hidden rounded-t-xl border-x border-brass/40 bg-chalk shadow-floating lg:rounded-b-xl">
              <div className="border-b-4 border-brass bg-paper px-2 py-1">
                <BattleHud state={state} headingRef={battleHeading} />
              </div>
              <div className="relative bg-stage-floor">
                <div className="relative mx-auto w-full">
                  {preview && (
                    <p className="absolute inset-x-0 top-0 z-10 bg-ink px-3 py-1 text-center text-xs font-bold text-paper">
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
                      guideCell={highlightedCell}
                      playback={preview ? null : playback}
                      onCell={cellClick}
                      canBorrow={(id) =>
                        !preview && !state.outcome && canBorrow(id)
                      }
                      onBorrow={borrow}
                      disabled={playbackBusy}
                      sound={sound}
                      onPlaybackDone={playbackDone}
                    />
                  </Suspense>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-1">
                  <span className="rounded bg-ink/85 px-3 py-1 text-xs text-paper">
                    Deliver the cart to the flag
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-b-xl border-x border-b-4 border-brass bg-paper px-3 py-3 shadow-floating sm:px-5 lg:rounded-t-xl lg:border-t-4 lg:px-3 lg:max-h-[calc(100svh-72px)] lg:overflow-y-auto">
              <EnemyOrders
                state={state}
                focused={focusedOrder}
                locked={playbackBusy || !!preview}
                onFocus={setFocusedOrder}
                canBorrow={canBorrow}
                onBorrow={borrow}
              />
              {state.outcome && !playbackBusy ? (
                <section
                  aria-label="Job result"
                  className={`result-stamp relative overflow-hidden border-l-4 ${state.outcome === "delivered" ? "border-primary" : "border-danger"} bg-paper p-5 sm:p-6`}
                >
                  <p className="text-xs uppercase tracking-[.16em] text-secondary">
                    {contractBattle
                      ? "Contract Job result"
                      : "Free Play result"}
                  </p>
                  <div className="my-3 flex items-center gap-4">
                    <WorkerPortrait
                      token={
                        state.outcome === "delivered" ? "rook" : "supervisor"
                      }
                      className="w-20 shrink-0 rounded-t-full bg-brass/15"
                    />
                    <h2
                      className={`-rotate-2 border-y-2 px-3 py-1 text-3xl uppercase tracking-wide sm:text-4xl ${state.outcome === "delivered" ? "border-primary text-primary" : "border-danger text-danger"}`}
                    >
                      {outcomeText(state.outcome)}
                    </h2>
                  </div>
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
                    <div className="flex flex-wrap gap-3">
                      <button
                        className={primary}
                        onClick={() => void play(true)}
                      >
                        Play Again
                      </button>
                      <button
                        onClick={() => {
                          clearSelection();
                          setMenu("jobs");
                          setScreen({ kind: "home" });
                        }}
                      >
                        Try Another Route
                      </button>
                      <button onClick={viewCompany}>Deliver supplies</button>
                    </div>
                  )}
                </section>
              ) : (
                <section aria-label="Crew actions" aria-busy={playbackBusy}>
                  <div className="flex flex-wrap items-stretch gap-3">
                    <div className="min-w-0 flex-1 basis-64">
                      <CrewRoster
                        state={state}
                        selected={selected}
                        locked={!!preview || playbackBusy}
                        highlighted={
                          guidedCommand &&
                          "unit" in guidedCommand &&
                          selected !== guidedCommand.unit
                            ? guidedCommand.unit
                            : undefined
                        }
                        onSelect={select}
                      />
                    </div>
                    {!preview &&
                      state.borrow_pending === null &&
                      !state.outcome && (
                        <button
                          className={`${primary} data-[guide=true]:outline-2 data-[guide=true]:outline-offset-2 data-[guide=true]:outline-focus min-w-28 self-stretch !border-b-4 !border-b-primary-hover !px-5 font-display text-lg`}
                          disabled={playbackBusy}
                          data-guide={
                            guidedCommand?.kind === "end_phase" || undefined
                          }
                          onClick={() => proposeCommand({ kind: "end_phase" })}
                        >
                          End Phase
                        </button>
                      )}
                  </div>
                  <fieldset
                    disabled={playbackBusy}
                    className="mt-3 min-w-0 border-0 p-0"
                  >
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
                        highlighted={
                          guidedCommand &&
                          "action" in guidedCommand &&
                          selected === guidedCommand.unit
                            ? guidedCommand.action.kind
                            : undefined
                        }
                      />
                    ) : (
                      !preview && <h2 className="sr-only">Your orders</h2>
                    )}
                    {state.borrow_pending !== null && !preview && (
                      <button
                        className="mt-3"
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
                      <div className="border-l-4 border-primary bg-muted/50 px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-ui text-xs uppercase tracking-wide text-secondary">
                              Preview
                            </h3>
                            <p className="font-display text-lg">
                              {"action" in preview.command
                                ? actionText(preview.command.action, state)
                                : preview.command.kind === "end_phase"
                                  ? "Resolve enemy orders"
                                  : "Skip borrowed action"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              autoFocus
                              data-guide={!!guidedCommand || undefined}
                              className={`${primary} data-[guide=true]:outline-2 data-[guide=true]:outline-offset-2 data-[guide=true]:outline-focus`}
                              onClick={commit}
                            >
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
                        {"action" in preview.command &&
                          preview.command.action.kind === "borrow" && (
                            <p className="mt-2 text-sm font-semibold">
                              One action. Uses your captain’s action.
                            </p>
                          )}
                        <BattleFeedback
                          compact
                          events={preview.result.events.filter(
                            (e) =>
                              ![
                                "moved",
                                "attacked",
                                "recovering",
                                "guarded",
                              ].includes(e.kind),
                          )}
                          state={preview.result.state}
                        />
                        {preview.forecast.length > 0 && (
                          <div className="mt-2 border-l-2 border-oxblood pl-3">
                            <h4 className="text-xs font-semibold text-secondary">
                              If you end now
                            </h4>
                            <BattleFeedback
                              compact
                              events={preview.forecast}
                              state={preview.result.state}
                            />
                          </div>
                        )}
                        {preview.result.events.some(
                          (e) => e.kind === "refused",
                        ) && (
                          <p className="mt-2 text-sm font-semibold text-danger">
                            This command will be refused. Confirm to spend the
                            activation with no effect.
                          </p>
                        )}
                        {preview.command.kind === "end_phase" && (
                          <p className="mt-2 text-xs text-secondary">
                            Unused crew actions will be lost.
                          </p>
                        )}
                      </div>
                    )}
                  </fieldset>
                  <div
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className="mt-2"
                  >
                    {notice ? (
                      <p className="text-sm text-secondary">{notice}</p>
                    ) : !preview && !unit && feedback.length > 0 ? (
                      <div className="border-l-2 border-brass pl-3">
                        <h3 className="sr-only">Last action</h3>
                        <BattleFeedback
                          compact
                          events={
                            feedback.length > 1
                              ? feedback.filter((e) => e.kind !== "guarded")
                              : feedback
                          }
                          state={state}
                        />
                      </div>
                    ) : null}
                  </div>
                </section>
              )}
              {contractBattle &&
                (state.outcome ? (
                  <ContractJobs
                    controller={contract}
                    setups={setups}
                    config={config}
                    setConfig={setConfig}
                    inBattle
                    onResume={() => void resumeContract()}
                    onCompany={viewCompany}
                  />
                ) : (
                  <details className="rounded-xl border border-border bg-paper px-4 py-2 text-sm">
                    <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                      Contract Job ·{" "}
                      {contract.worker?.character ?? "Hired worker"}
                    </summary>
                    <ContractJobs
                      controller={contract}
                      setups={setups}
                      config={config}
                      setConfig={setConfig}
                      inBattle
                      onResume={() => void resumeContract()}
                      onCompany={viewCompany}
                    />
                  </details>
                ))}

              <div className="mt-3 flex flex-wrap gap-x-8 border-t border-border text-sm">
                <FieldGuide
                  onReplay={() => void play(true, firstShiftConfig, true)}
                />
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
            </div>
          </div>
        </div>
      )}
      {!state && (
        <footer className="mt-6 flex justify-between border-t border-border pt-3 text-xs text-secondary">
          MUTINY: The Fine Print · A tactical employment dispute.
        </footer>
      )}
    </main>
  );
}
export default App;
