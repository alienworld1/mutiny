export type Action =
  | { kind: "guard" | "push" }
  | {
      kind: "attack" | "relocate" | "swap" | "clean_shot" | "borrow";
      target: number;
    }
  | { kind: "burn" | "smoke" | "certify" | "blast"; cell: number }
  | { kind: "shove"; target: number; cell: number };
export type Command =
  | {
      kind: "activate" | "borrowed_activate";
      unit: number;
      path: number[];
      action: Action;
    }
  | { kind: "skip_borrow"; unit: number }
  | { kind: "end_phase" };
export interface Configuration {
  setup_id: string;
  placement: "escort" | "infiltration";
  worker: number;
  package_option: number;
}
export interface ActionLog {
  rules_version: number;
  content_version: number;
  config: Configuration;
  commands: Command[];
}
export interface Unit {
  id: number;
  name: string;
  role: string;
  side: "player" | "enemy";
  cell: number;
  hp: number;
  movement: number;
  package: "none" | "fire" | "shouting" | "friendly";
  special_used: boolean;
  borrowed: boolean;
  guard: boolean;
  status: "normal" | "striking" | "recovering";
}
export interface Setup {
  rules_version: number;
  content_version: number;
  id: string;
  name: string;
  variant: string;
  description: string;
  route: number[];
  walls: number[];
  cover: number[];
  walkable_cover: number[];
  fire: number[];
  smoke: number[];
  policy: string;
  blast: number[];
  units: Unit[];
}
export interface Order {
  unit: number;
  start: number;
  path: number[];
  endpoint: number;
  action: Action;
  affected: number[];
  original_violation: boolean;
}
export interface State {
  setup: Setup;
  round: number;
  phase: "player" | "enemy" | "ended";
  cart_cell: number;
  cart_hp: number;
  pushes: number;
  pushed: boolean;
  burn_used: boolean;
  relocate_used: boolean;
  certify_used: boolean;
  fire: number[];
  persistent_fire: number[];
  smoke: number[];
  certificates: number[];
  activated: number[];
  borrow_pending: number | null;
  borrowed_unit: number | null;
  orders: Order[];
  outcome: string | null;
  strikes: number;
  log: ActionLog;
}
export type Event =
  | { kind: "moved"; unit: number; path: number[] }
  | { kind: "guarded" | "recovered" | "recovering" | "borrowed"; unit: number }
  | { kind: "protected"; unit: number; source: string }
  | { kind: "refused"; unit: number; reason: string }
  | { kind: "pushed"; from: number; to: number }
  | { kind: "ignited" | "smoked" | "certified"; cell: number }
  | { kind: "damaged"; target: number; hp: number }
  | { kind: "strike"; unit: number; cell: number; reason: string }
  | { kind: "blocked"; unit: number; reason: string }
  | { kind: "displaced"; unit: number; from: number; to: number }
  | { kind: "swapped"; unit: number; target: number }
  | { kind: "attacked"; unit: number; affected: number[] }
  | { kind: "ended"; outcome: string };
export interface Transition {
  state: State;
  events: Event[];
}
export interface Choices {
  moves: { cell: number; path: number[] }[];
  actions: { action: Action; cells: number[] }[];
}
export const coordinate = (cell: number) =>
  `${"ABCDEFG"[cell % 7]}${Math.floor(cell / 7) + 1}`;
export const packages = {
  none: { name: "", special: "", clause: "" },
  fire: {
    name: "NOT ON THE FIRE",
    special: "Smoke Break",
    clause: "Refuses a path through fire.",
  },
  shouting: {
    name: "WITHIN SHOUTING DISTANCE",
    special: "Desk Swap",
    clause: "Refuses a move that ends over 2 steps from every ally.",
  },
  friendly: {
    name: "ABSOLUTELY NO FRIENDLY FIRE",
    special: "Clean Shot",
    clause: "Refuses an attack that would hit an ally.",
  },
};
export function actionText(action: Action, state: State): string {
  const target =
    "target" in action
      ? (state.setup.units[action.target]?.name ?? "Cart")
      : "";
  const cell = "cell" in action ? coordinate(action.cell) : "";
  switch (action.kind) {
    case "guard":
      return "Guard";
    case "push":
      return "Push Cart";
    case "attack":
      return `Attack ${target}`;
    case "burn":
      return `Burn Notice · ${cell}`;
    case "certify":
      return `Safety Certificate · ${cell}`;
    case "relocate":
      return `Staff Relocation · ${target}`;
    case "shove":
      return `Shove ${target} to ${cell}`;
    case "smoke":
      return `Smoke Break · ${cell}`;
    case "swap":
      return `Desk Swap · ${target}`;
    case "clean_shot":
      return `Clean Shot · ${target}`;
    case "borrow":
      return `Borrow ${target}`;
    case "blast":
      return `Blast · ${cell} and adjacent cells · 1 damage`;
  }
}
export function outcomeText(outcome: string): string {
  return (
    {
      delivered: "Job Done",
      cart_lost: "Cart Lost",
      captain_lost: "Captain Down",
      time_up: "Time Up",
    }[outcome] ?? "Job ended"
  );
}
