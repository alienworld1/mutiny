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
export const start = (): State => JSON.parse(wasm.start());
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

export const content = (): Setup[] => JSON.parse(wasm.content()).setups;
export const configure = (config: Configuration): State =>
  JSON.parse(wasm.configure(JSON.stringify(config)));
export const canonical = (log: ActionLog): Uint8Array =>
  wasm.canonical(JSON.stringify(log));
