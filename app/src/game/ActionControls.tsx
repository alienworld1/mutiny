import WorkerPortrait from "../near/WorkerPortrait";
import type { Action, Choices, State, Unit } from "./types";
import { coordinate, packages } from "./types";
export type Mode = "move" | Action["kind"];
const hints: Partial<Record<Mode, string>> = {
  attack: "Choose an enemy in reach. Deal 1 damage.",
  burn: "Light an empty tile within 2 steps. Fire lasts through this enemy phase.",
  relocate: "Pull an aligned unit 1 tile toward you. Range 2.",
  certify:
    "Choose the cart or a tile within 2 steps. Block its next hit this enemy phase.",
  shove: "Choose an adjacent unit, then an empty tile beside it.",
  smoke:
    "Choose a tile within 2 steps. Put out fire and block sight until phase end.",
  swap: "Trade places with a safe ally within 2 steps.",
  clean_shot:
    "Choose a target within 3 steps. Deal 1 damage through one low barrier.",
  borrow:
    "Command a striker within 2 steps for one action. Uses your captain's action.",
};
interface Props {
  state: State;
  unit: Unit;
  path: number[];
  mode: Mode;
  options: Choices;
  setMode: (mode: Mode) => void;
  propose: (action: Action) => void;
  clearMove: () => void;
}
export default function ActionControls({
  state,
  unit,
  path,
  mode,
  options,
  setMode,
  propose,
  clearMove,
}: Props) {
  function ability(kind: Mode, name: string, detail: string, spent: boolean) {
    return (
      <button
        aria-label={name}
        aria-describedby={`ability-${kind}`}
        disabled={spent}
        aria-pressed={mode === kind}
        onClick={() => setMode(kind)}
        className="!min-h-16 !rounded-xl !border-transparent !bg-muted !px-3 !py-3 text-left aria-pressed:!border-primary aria-pressed:!bg-primary aria-pressed:!text-white"
      >
        <span className="block text-sm leading-tight">{name}</span>
        <span
          id={`ability-${kind}`}
          className="mt-1 block text-xs font-normal opacity-75"
        >
          {spent ? "Spent" : detail}
        </span>
      </button>
    );
  }
  const special =
    unit.package === "fire"
      ? "smoke"
      : unit.package === "shouting"
        ? "swap"
        : "clean_shot";
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <WorkerPortrait
          token={unit.name.toLowerCase()}
          className="w-14 shrink-0 rounded-xl bg-muted"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl">{unit.name}</h2>
          <span className="text-sm capitalize text-secondary">{unit.role}</span>
        </div>
        <span className="text-sm font-semibold tabular-nums">{unit.hp} HP</span>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2 text-sm">
        <button
          className="!min-h-9 !px-3 !py-1"
          aria-pressed={mode === "move"}
          onClick={() => setMode("move")}
        >
          Move
        </button>
        <span className="text-secondary">
          {path.length ? coordinate(path.at(-1)!) : `${unit.movement} tiles`}
        </span>
        {path.length > 0 && (
          <button className="!min-h-9 !px-2 !py-1" onClick={clearMove}>
            Clear
          </button>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,88px),1fr))] gap-2">
        <button
          className={`!px-2 ${options.actions.some((o) => o.action.kind === "push") ? "!border-primary !bg-primary !text-white" : ""}`}
          onClick={() => propose({ kind: "push" })}
        >
          Push Cart
        </button>
        <button
          aria-pressed={mode === "attack"}
          onClick={() => setMode("attack")}
        >
          Attack
        </button>
        <button onClick={() => propose({ kind: "guard" })}>Guard</button>
      </div>
      <div className="mt-5 border-t border-border pt-3">
        <h3 className="mb-2 !font-ui text-xs font-semibold uppercase tracking-wider text-secondary">
          {unit.id === 0 ? "Captain tools" : "Abilities"}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {unit.id === 0 ? (
            <>
              {ability(
                "burn",
                "Burn Notice",
                "Light a tile · 1 use",
                state.burn_used,
              )}
              {ability(
                "relocate",
                "Staff Relocation",
                "Pull a unit · 1 use",
                state.relocate_used,
              )}
              {ability(
                "certify",
                "Safety Certificate",
                "Block a hit · 1 use",
                state.certify_used,
              )}
            </>
          ) : (
            <>
              {unit.package !== "none" &&
                ability(
                  special,
                  packages[unit.package].special,
                  unit.package === "fire"
                    ? "Put out fire · 1 use"
                    : unit.package === "shouting"
                      ? "Trade places · 1 use"
                      : "Long shot · 1 use",
                  unit.special_used,
                )}
              {unit.role === "shieldbearer" &&
                ability("shove", "Shove", "Move another unit", false)}
            </>
          )}
          {unit.id === 0 &&
            options.actions.some((o) => o.action.kind === "borrow") &&
            ability("borrow", "Borrow", "Command a striker", false)}
        </div>
      </div>
      {unit.id === 0 &&
        state.setup.units.some(
          (u) => u.side === "enemy" && u.status === "striking" && !u.borrowed,
        ) &&
        !options.actions.some((o) => o.action.kind === "borrow") && (
          <p className="mt-3 text-sm text-secondary">
            Move within 2 tiles of a striker to Borrow.
          </p>
        )}
      {mode !== "move" && (
        <p
          className="mt-3 border-l-2 border-primary pl-3 text-sm text-secondary"
          role="note"
        >
          {hints[mode]}
        </p>
      )}
      {unit.package !== "none" && (
        <div className="mt-4 rounded-xl border-l-[3px] border-brass bg-muted p-3 text-sm text-secondary">
          <p>
            <strong>{packages[unit.package].name}</strong>
            <br />
            {packages[unit.package].clause}
          </p>
        </div>
      )}
    </>
  );
}
