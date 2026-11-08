import * as engine from "../game/engine";
import type { ActionLog, Configuration, State } from "../game/types";

export const registryId =
  import.meta.env.VITE_REGISTRY_ID || "m3.mutiny-dev-2026.testnet";
export type Activity =
  | "Draft"
  | "AwaitingSignature"
  | "Submitted"
  | "CheckingChain"
  | "Confirmed"
  | "Rejected"
  | "Failed"
  | "RecoveryRequired";
export interface JobRecord {
  outcome: string;
  round: number;
  cart_hp: number;
  strikes: number;
  borrows: number;
  clauses: string[];
  commitment: string;
  final_hash: string;
  confirmed_block: string;
}
export interface Job {
  job_id: string;
  renter_id: string;
  token_id: string;
  worker_account: string;
  config: Configuration;
  unit_slot: number;
  rules_version: number;
  content_version: number;
  content_hash: string;
  setup_hash: string;
  accepted_fee: string;
  created_at_block: string;
  expires_at_block: string;
  status: "active" | "saved" | "expired";
  cooldown_until: string;
  record: JobRecord | null;
  bond: string;
  storage_bytes: number;
  refund_owed: string;
  refund_in_flight: boolean;
}
export interface Worker {
  token: { token_id: string; owner_id: string };
  worker_account: string;
  character: string;
  role: string;
  packages: string[];
  visual_identity: string;
  status: string;
  job: Job | null;
  block_height: string;
  job_storage_deposit: string;
  lease_blocks: string;
  cooldown_blocks: string;
  content_hash: string;
}
export interface Session {
  contract: string;
  account: string;
  config: Configuration;
  previous_job_id: string | null;
  job: Job | null;
  log: ActionLog | null;
  activity: Activity;
  operation: "open" | "save" | "expire";
  tx: { hash: string; signer: string } | null;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const integerString = (v: unknown): v is string =>
  typeof v === "string" && /^\d{1,39}$/.test(v);
export function parseJob(value: unknown): Job {
  if (
    !object(value) ||
    !integerString(value.job_id) ||
    !integerString(value.expires_at_block) ||
    !integerString(value.refund_owed) ||
    !integerString(value.bond) ||
    typeof value.renter_id !== "string" ||
    typeof value.worker_account !== "string" ||
    value.token_id !== "rook" ||
    typeof value.setup_hash !== "string" ||
    typeof value.content_hash !== "string" ||
    value.accepted_fee !== "0" ||
    !["active", "saved", "expired"].includes(String(value.status)) ||
    !object(value.config) ||
    value.config.worker !== 0 ||
    ![0, 1].includes(Number(value.config.package_option)) ||
    !["escort", "infiltration"].includes(String(value.config.placement))
  )
    throw new Error("Invalid job response. Check status again.");
  const job = value as unknown as Job;
  engine.configure(job.config);
  return job;
}
export function parseWorker(value: unknown): Worker {
  if (
    !object(value) ||
    !object(value.token) ||
    value.token.token_id !== "rook" ||
    typeof value.token.owner_id !== "string" ||
    !integerString(value.job_storage_deposit) ||
    !integerString(value.block_height) ||
    typeof value.content_hash !== "string" ||
    ![
      "idle",
      "active",
      "expired_pending",
      "cooldown",
      "transfer_pending",
    ].includes(String(value.status))
  )
    throw new Error("Invalid worker response. Check status again.");
  if (value.job) parseJob(value.job);
  return value as unknown as Worker;
}
export function sameConfig(a: Configuration, b: Configuration): boolean {
  return (
    a.setup_id === b.setup_id &&
    a.placement === b.placement &&
    a.worker === b.worker &&
    a.package_option === b.package_option
  );
}
export function nearAmount(yocto: string): string {
  const n = BigInt(yocto),
    scale = 10n ** 24n;
  const fraction = (n % scale).toString().padStart(24, "0").replace(/0+$/, "");
  return `${n / scale}${fraction ? `.${fraction}` : ""}`;
}
export async function digest(bytes: Uint8Array): Promise<string> {
  const buffer = new Uint8Array(bytes).buffer;
  return btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
    ),
  );
}
export async function supportedContentHash(): Promise<string> {
  const log = engine.start().log;
  return digest(
    new TextEncoder().encode(
      JSON.stringify({
        rules_version: log.rules_version,
        content_version: log.content_version,
        setups: engine.content(),
      }),
    ),
  );
}
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (object(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, ordered(value[key])]),
    );
  return value;
}
export async function openingState(job: Job, value: unknown): Promise<State> {
  const state = engine.configure(job.config);
  if (
    job.rules_version !== state.log.rules_version ||
    job.content_version !== state.log.content_version ||
    job.unit_slot !== (job.config.placement === "escort" ? 1 : 4) ||
    JSON.stringify(ordered(value)) !== JSON.stringify(ordered(state)) ||
    (await digest(new TextEncoder().encode(JSON.stringify(state.setup)))) !==
      job.setup_hash
  )
    throw new Error(
      "This app cannot play the frozen job. Keep your saved actions and use the matching game version.",
    );
  return state;
}
export async function verifyRecord(
  job: Job,
  log: ActionLog,
  record: unknown,
): Promise<JobRecord> {
  const state = engine.replay(log).state;
  if (
    !object(record) ||
    typeof record.commitment !== "string" ||
    typeof record.final_hash !== "string" ||
    !state.outcome
  )
    throw new Error("The Registry has not confirmed this result.");
  const setup = Uint8Array.from(atob(job.setup_hash), (c) => c.charCodeAt(0));
  const canonical = engine.canonical(log);
  const combined = new Uint8Array(setup.length + canonical.length);
  combined.set(setup);
  combined.set(canonical, setup.length);
  if (
    record.commitment !== (await digest(combined)) ||
    record.final_hash !==
      (await digest(new TextEncoder().encode(JSON.stringify(state)))) ||
    record.outcome !== state.outcome
  )
    throw new Error(
      "The saved result does not match these actions. Keep the local job and check status.",
    );
  return record as unknown as JobRecord;
}
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mutiny-contract-jobs", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("sessions");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close other Mutiny tabs, then Retry."));
  });
}
export async function writeSession(session: Session): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put(
        session,
        `${session.contract}:${session.account}`,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function readSession(account: string): Promise<Session | null> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("sessions")
        .objectStore("sessions")
        .get(`${registryId}:${account}`);
      request.onsuccess = () => {
        const v: unknown = request.result;
        if (!v) return resolve(null);
        if (
          !object(v) ||
          v.account !== account ||
          v.contract !== registryId ||
          !object(v.config) ||
          ![
            "Draft",
            "AwaitingSignature",
            "Submitted",
            "CheckingChain",
            "Confirmed",
            "Rejected",
            "Failed",
            "RecoveryRequired",
          ].includes(String(v.activity)) ||
          !["open", "save", "expire"].includes(String(v.operation))
        )
          return reject(
            new Error(
              "Saved job could not be read. Keep browser data and check the Registry.",
            ),
          );
        try {
          if (v.job) parseJob(v.job);
          if (v.log) engine.replay(v.log as unknown as ActionLog);
          resolve(v as unknown as Session);
        } catch (error) {
          reject(error);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
