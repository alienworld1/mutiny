import { replay } from "./engine";
import type { ActionLog, State, Configuration } from "./types";
export interface Summary {
  outcome: string;
  rounds: number;
  cart: number;
  strikes: number;
  borrowed: boolean;
  crew: string;
  placement: Configuration["placement"];
}
export interface Entry {
  attempts: number;
  completions: number;
  goals: boolean[];
  previous?: Summary;
  best?: Summary;
  latest?: Summary;
  log?: ActionLog;
}
export interface Progress {
  version: 2;
  draft?: { id: string; log: ActionLog };
  ledger: Record<string, Entry>;
  attempts: string[];
  completed: string[];
}
export const emptyProgress = (): Progress => ({
  version: 2,
  ledger: {},
  attempts: [],
  completed: [],
});
export function summarize(s: State): Summary {
  return {
    outcome: s.outcome!,
    rounds: s.round,
    cart: s.cart_hp,
    strikes: s.strikes,
    borrowed: s.setup.units.some((u) => u.borrowed),
    placement: s.log.config.placement,
    crew: s.setup.units
      .filter(
        (u) =>
          u.id < 3 || (s.log.config.placement === "infiltration" && u.id === 4),
      )
      .map((u) => `${u.name}${u.package !== "none" ? ` [${u.package}]` : ""}`)
      .join(", "),
  };
}
export function goals(result: Summary): boolean[] {
  return [
    result.outcome === "delivered" && result.rounds <= 4,
    result.outcome === "delivered" && result.cart === 2,
    result.outcome === "delivered" && !result.borrowed,
  ];
}
export function record(progress: Progress, id: string, state: State): Progress {
  const next = structuredClone(progress);
  const key = state.setup.id;
  const entry = (next.ledger[key] ??= {
    attempts: 0,
    completions: 0,
    goals: [false, false, false],
  });
  if (!next.attempts.includes(id)) {
    entry.attempts = Math.min(9999, entry.attempts + 1);
    next.attempts = [...next.attempts, id].slice(-64);
  }
  if (state.outcome && !next.completed.includes(id)) {
    const summary = summarize(state);
    entry.previous = entry.latest;
    entry.latest = summary;
    entry.completions = Math.min(
      9999,
      entry.completions + Number(summary.outcome === "delivered"),
    );
    entry.goals = goals(summary).map((goal, i) => goal || entry.goals[i]!);
    // "Best" means the fastest clear; cart health breaks a tie. Other
    // dimensions remain visible without assigning a universal score.
    if (
      summary.outcome === "delivered" &&
      (!entry.best ||
        summary.rounds < entry.best.rounds ||
        (summary.rounds === entry.best.rounds &&
          summary.cart > entry.best.cart))
    )
      entry.best = summary;
    entry.log = state.log;
    next.completed = [...next.completed, id].slice(-64);
  }
  next.draft = { id, log: state.log };
  return next;
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mutiny", 2);
    request.onupgradeneeded = () => {
      if (request.result.objectStoreNames.contains("drafts"))
        request.result.deleteObjectStore("drafts");
      request.result.createObjectStore("progress");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close other Mutiny tabs to save this job."));
  });
}
function validate(value: unknown): Progress {
  if (!value) return emptyProgress();
  if (JSON.stringify(value).length > 200_000)
    throw new Error("Local progress is too large");
  // Storage is untrusted. Replay bounded logs and check historical summaries
  // before display. These remain local records, never verified chain results.
  const p = value as Progress;
  if (
    p.version !== 2 ||
    !p.ledger ||
    !Array.isArray(p.attempts) ||
    !Array.isArray(p.completed) ||
    p.attempts.length > 64 ||
    p.completed.length > 64 ||
    ![...p.attempts, ...p.completed].every(
      (id) => typeof id === "string" && id.length <= 64,
    ) ||
    Object.keys(p.ledger).length > 9
  )
    throw new Error("Unsupported local progress");
  for (const [key, e] of Object.entries(p.ledger)) {
    if (
      !Number.isInteger(e.attempts) ||
      e.attempts < 0 ||
      e.attempts > 9999 ||
      !Number.isInteger(e.completions) ||
      e.completions < 0 ||
      e.completions > e.attempts ||
      !Array.isArray(e.goals) ||
      e.goals.length !== 3 ||
      !e.goals.every((g) => typeof g === "boolean")
    )
      throw new Error("Invalid local record");
    for (const result of [e.latest, e.previous, e.best])
      if (
        result &&
        (!Number.isInteger(result.rounds) ||
          result.rounds < 1 ||
          result.rounds > 5 ||
          !Number.isInteger(result.cart) ||
          result.cart < 0 ||
          result.cart > 2 ||
          !Number.isInteger(result.strikes) ||
          result.strikes < 0 ||
          result.strikes > 15 ||
          typeof result.borrowed !== "boolean" ||
          typeof result.crew !== "string" ||
          result.crew.length > 100 ||
          !["escort", "infiltration"].includes(result.placement) ||
          !["delivered", "cart_lost", "captain_lost", "time_up"].includes(
            result.outcome,
          ))
      )
        throw new Error("Invalid result summary");
    if (e.log && replay(e.log).state.setup.id !== key)
      throw new Error("Invalid job log");
  }
  if (p.draft && (typeof p.draft.id !== "string" || p.draft.id.length > 64))
    throw new Error("Invalid draft");
  if (p.draft) replay(p.draft.log);
  return p;
}
export async function readProgress(): Promise<Progress> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("progress")
        .objectStore("progress")
        .get("local");
      request.onsuccess = () => {
        try {
          resolve(validate(request.result));
        } catch (e) {
          reject(e);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function saveProgress(
  id: string,
  state: State,
): Promise<Progress> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("progress", "readwrite");
      const store = tx.objectStore("progress");
      const request = store.get("local");
      let result: Progress;
      request.onsuccess = () => {
        let prior: Progress;
        try {
          prior = validate(request.result);
        } catch {
          prior = emptyProgress();
        }
        result = record(prior, id, state);
        store.put(result, "local");
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const goalNames = [
  "Round to spare",
  "Undamaged cart",
  "No Borrow",
] as const;
