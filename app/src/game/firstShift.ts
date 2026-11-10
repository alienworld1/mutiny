import type { Mode } from "./ActionControls";
import type { Command, Configuration, State } from "./types";

export const firstShiftConfig: Configuration = {
  setup_id: "dock-fire-intro",
  placement: "escort",
  worker: 0,
  package_option: 0,
};

// These are ordinary engine commands. Guidance never creates a rule outcome.
export const firstShiftCommands: Command[] = [
  { kind: "activate", unit: 1, path: [], action: { kind: "push" } },
  { kind: "activate", unit: 0, path: [], action: { kind: "burn", cell: 25 } },
  { kind: "end_phase" },
  {
    kind: "activate",
    unit: 0,
    path: [25],
    action: { kind: "borrow", target: 4 },
  },
  {
    kind: "borrowed_activate",
    unit: 4,
    path: [17],
    action: { kind: "attack", target: 3 },
  },
];

export function sameCommand(a: Command, b: Command): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "end_phase" || b.kind === "end_phase") return true;
  if (a.unit !== b.unit) return false;
  if (a.kind === "skip_borrow" || b.kind === "skip_borrow") return true;
  return (
    a.path.join() === b.path.join() &&
    a.action.kind === b.action.kind &&
    ("target" in a.action ? a.action.target : null) ===
      ("target" in b.action ? b.action.target : null) &&
    ("cell" in a.action ? a.action.cell : null) ===
      ("cell" in b.action ? b.action.cell : null)
  );
}

export function firstShiftStep(state: State): number | null {
  const c = state.log.config;
  if (
    c.setup_id !== firstShiftConfig.setup_id ||
    c.worker !== 0 ||
    c.package_option !== 0 ||
    c.placement !== "escort"
  )
    return null;
  const commands = state.log.commands;
  if (
    !commands
      .slice(0, firstShiftCommands.length)
      .every((command, i) => sameCommand(command, firstShiftCommands[i]!))
  )
    return null;
  return Math.min(commands.length, firstShiftCommands.length);
}

export type GuidePreference = "new" | "pending" | "skipped" | "complete";
export function readGuidePreference(key: string): GuidePreference {
  try {
    const value = localStorage.getItem(key);
    return value === "pending" || value === "skipped" || value === "complete"
      ? value
      : "new";
  } catch {
    return "new";
  }
}
export function saveGuidePreference(key: string, value: GuidePreference) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Guidance remains playable when browser storage is unavailable.
  }
}
export const firstShiftKey = "mutiny-first-shift-v1";

export function guideTarget(
  step: number,
  selected: number | null,
  path: number[],
  mode: Mode,
  state: State,
) {
  if (step === 0) return selected === 1 ? null : state.setup.units[1]!.cell;
  if (step === 1)
    return selected !== 0
      ? state.setup.units[0]!.cell
      : mode === "burn"
        ? 25
        : null;
  if (step === 3)
    return selected !== 0
      ? state.setup.units[0]!.cell
      : path.at(-1) !== 25
        ? 25
        : mode === "borrow"
          ? state.setup.units[4]!.cell
          : null;
  if (step === 4)
    return path.at(-1) !== 17
      ? 17
      : mode === "attack"
        ? state.setup.units[3]!.cell
        : null;
  return null;
}
