import init, * as wasm from "./wasm/game_web";
import type {
  ActionLog,
  Choices,
  Command,
  Configuration,
  Setup,
  State,
  Transition,
} from "./types";
let ready: Promise<unknown> | undefined;
export const loadEngine = () =>
  (ready ??= init().catch((error: unknown) => {
    ready = undefined;
    throw error;
  }));
const legacy =
  typeof location !== "undefined" &&
  ["legacy", "company-v3"].includes(
    new URLSearchParams(location.search).get("market") ?? "",
  );
export const start = (): State =>
  configure({
    setup_id: "dock-fire-intro",
    placement: "escort",
    worker: 0,
    package_option: 0,
  });
export const replay = (log: ActionLog): Transition =>
  JSON.parse(wasm.replay(JSON.stringify(log)));
export const apply = (log: ActionLog, command: Command): Transition =>
  JSON.parse(wasm.apply(JSON.stringify(log), JSON.stringify(command)));
export const choices = (
  log: ActionLog,
  unit: number,
  path: number[],
): Choices =>
  JSON.parse(wasm.choices(JSON.stringify(log), unit, JSON.stringify(path)));

export const content = (): Setup[] =>
  JSON.parse(wasm.content_version(legacy ? 2 : 3)).setups;
export const configure = (config: Configuration): State =>
  JSON.parse(wasm.configure_version(JSON.stringify(config), legacy ? 2 : 3));
export const canonical = (log: ActionLog): Uint8Array =>
  wasm.canonical(JSON.stringify(log));

export const simulateKingdom = (
  snapshot: {
    stocks: { supplies: number; updated_at: number; deliveries: number }[];
    treasuries: string[];
  },
  hours: number,
  deliveries: boolean,
): {
  stocks: { supplies: number; updated_at: number; deliveries: number }[];
  treasuries: string[];
  paid: string[];
}[] =>
  JSON.parse(
    wasm.simulate_kingdom(JSON.stringify(snapshot), hours, deliveries),
  );
