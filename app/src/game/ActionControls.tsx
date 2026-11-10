import type { Action, Choices, State, Unit } from "./types";
import { coordinate, packages } from "./types";
import WorkerPortrait from "../near/WorkerPortrait";
import GameIcon, { type IconName } from "./GameIcon";
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
  highlighted?: Action["kind"];
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
  highlighted,
}: Props) {
  function ability(
    kind: Mode & IconName,
    name: string,
    detail: string,
    spent: boolean,
  ) {
    if (highlighted && kind !== highlighted) return null;
    return (
      <button
        data-guide={highlighted === kind || undefined}
        aria-label={name}
        aria-describedby={`ability-${kind}`}
        disabled={spent}
        aria-pressed={mode === kind}
        onClick={() => setMode(kind)}
        className="data-[guide=true]:outline-2 data-[guide=true]:outline-offset-2 data-[guide=true]:outline-focus flex min-w-0 flex-1 basis-28 items-center gap-2 !rounded-lg !border-brass/40 !bg-[#e8e3d5] !px-3 !py-2 text-left aria-pressed:!border-primary aria-pressed:!bg-primary aria-pressed:!text-white"
      >
        <GameIcon name={kind} className="h-6 w-6 shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm leading-tight">{name}</span>
          <span
            id={`ability-${kind}`}
            className="mt-1 block text-xs font-normal"
          >
            {spent ? "Spent" : detail}
          </span>
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
  const pushAvailable = options.actions.some((o) => o.action.kind === "push");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          <WorkerPortrait
            token={unit.name.toLowerCase()}
            className="w-12 shrink-0 rounded-t-full lg:hidden bg-slate/15"
          />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-secondary">
              {state.borrow_pending === unit.id
                ? "One borrowed action"
                : "Your order"}
            </p>
            <h2 className="text-xl">
              {unit.name}{" "}
              <span className="font-ui text-xs font-normal capitalize text-secondary">
                {unit.name.toLowerCase() !== unit.role && <>{unit.role} · </>}
                {unit.hp} HP
              </span>
            </h2>
          </div>
        </div>
        <span className="text-xs text-secondary">
          {path.length
            ? `Move to ${coordinate(path.at(-1)!)}`
            : `Move up to ${unit.movement} tiles`}
          {path.length > 0 && (
            <button
              className="ml-2 !min-h-0 !border-0 !bg-transparent !p-0 !shadow-none text-xs underline"
              onClick={clearMove}
            >
              Clear
            </button>
          )}
        </span>
      </div>
      <div className="grid min-w-0 gap-3">
        <div
          className={`grid grid-cols-2 gap-2 ${highlighted ? "" : "sm:grid-cols-4"}`}
        >
          <button
            aria-pressed={mode === "move"}
            onClick={() => setMode("move")}
            className="data-[guide=true]:outline-2 data-[guide=true]:outline-offset-2 data-[guide=true]:outline-focus flex flex-col items-center justify-center gap-1 !px-2 !py-2 text-sm"
          >
            <GameIcon name="move" />
            Move
          </button>
          {(!highlighted || highlighted === "attack") && (
            <button
              data-guide={highlighted === "attack" || undefined}
              aria-pressed={mode === "attack"}
              onClick={() => setMode("attack")}
              className="data-[guide=true]:outline-2 data-[guide=true]:outline-offset-2 data-[guide=true]:outline-focus flex flex-col items-center justify-center gap-1 !px-2 !py-2 text-sm"
            >
              <GameIcon name="attack" />
              Attack
            </button>
          )}
          {(!highlighted || highlighted === "push") && (
            <button
              data-guide={highlighted === "push" || undefined}
              onClick={() => propose({ kind: "push" })}
              className={`data-[guide=true]:outline-2 data-[guide=true]:outline-offset-2 data-[guide=true]:outline-focus flex flex-col items-center justify-center gap-1 !px-2 !py-2 text-sm ${pushAvailable ? "!border-primary !bg-primary !text-white" : ""}`}
            >
              <GameIcon name="push" />
              Push Cart
            </button>
          )}
          {!highlighted && (
            <button
              onClick={() => propose({ kind: "guard" })}
              className="data-[guide=true]:outline-2 data-[guide=true]:outline-offset-2 data-[guide=true]:outline-focus flex flex-col items-center justify-center gap-1 !px-2 !py-2 text-sm"
            >
              <GameIcon name="guard" />
              Guard
            </button>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          {unit.id === 0 ? (
            <>
              {ability("burn", "Burn Notice", "1 use", state.burn_used)}
              {ability(
                "relocate",
                "Staff Relocation",
                "1 use",
                state.relocate_used,
              )}
              {ability(
                "certify",
                "Safety Certificate",
                "1 use",
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
            ability("borrow", "Borrow", "One action · Captain acts", false)}
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
        <p className="mt-3 border-l-2 border-brass pl-3 text-xs text-secondary">
          <strong>{packages[unit.package].name}</strong> ·{" "}
          {packages[unit.package].clause}
        </p>
      )}
    </div>
  );
}
