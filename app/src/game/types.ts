export type Action =
  | { kind: "guard" }
  | { kind: "push" }
  | { kind: "attack"; target: number }
  | { kind: "burn"; cell: number };
export type Command =
  | { kind: "activate"; unit: number; path: number[]; action: Action }
  | { kind: "end_phase" };
export interface ActionLog {
  rules_version: number;
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
  fire_clause: boolean;
  guard: boolean;
  status: "normal" | "striking" | "recovering";
}
export interface Order {
  unit: number;
  start: number;
  path: number[];
  endpoint: number;
  action: Action;
  affected: number[];
  original_fire_violation: boolean;
}
export interface State {
  setup: {
    rules_version: number;
    content_version: number;
    id: string;
    name: string;
    route: number[];
    walls: number[];
    fire: number[];
    units: Unit[];
  };
  round: number;
  phase: "player" | "enemy" | "ended";
  cart_cell: number;
  cart_hp: number;
  pushes: number;
  pushed: boolean;
  burn_used: boolean;
  fire: number[];
  activated: number[];
  orders: Order[];
  outcome: string | null;
  strikes: number;
  log: ActionLog;
}
export type Event =
  | { kind: "moved"; unit: number; path: number[] }
  | { kind: "guarded" | "protected" | "refused" | "recovered"; unit: number }
  | { kind: "pushed"; from: number; to: number }
  | { kind: "ignited"; cell: number }
  | { kind: "damaged"; target: number; hp: number }
  | { kind: "strike"; unit: number; cell: number }
  | { kind: "blocked"; unit: number; reason: string }
  | { kind: "ended"; outcome: string };
export interface Transition {
  state: State;
  events: Event[];
}
export interface Choices {
  moves: { cell: number; path: number[] }[];
  attacks: number[];
  burns: number[];
  push: boolean;
}
export const coordinate = (cell: number) =>
  `${"ABCDEFG"[cell % 7]}${Math.floor(cell / 7) + 1}`;
export function eventText(event: Event, state: State): string {
  const name = (id: number) => state.setup.units[id]?.name ?? "Cart";
  switch (event.kind) {
    case "moved":
      return `${name(event.unit)} moved to ${coordinate(event.path.at(-1)!)}.`;
    case "guarded":
      return `${name(event.unit)} guards against one hit.`;
    case "pushed":
      return `Cart pushed to ${coordinate(event.to)}.`;
    case "ignited":
      return `Burn Notice: fire at ${coordinate(event.cell)} until phase end.`;
    case "damaged":
      return `${name(event.target)}: ${event.hp} HP left.`;
    case "protected":
      return `${name(event.unit)} blocked a hit with Guard.`;
    case "strike":
      return `ON STRIKE: ${name(event.unit)} refuses the route through your fire at ${coordinate(event.cell)}. NOT ON THE FIRE.`;
    case "blocked":
      return `Order blocked: ${name(event.unit)}. ${event.reason}. Guard instead.`;
    case "refused":
      return `${name(event.unit)} refused the command. Activation spent.`;
    case "recovered":
      return `${name(event.unit)} returns to enemy orders.`;
    case "ended":
      return outcomeText(event.outcome);
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
