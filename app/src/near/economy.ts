import { nearAmount } from "./jobs";
export type Objective = "routine" | "intact" | "express";
export interface Commission {
  town_id?: number;
  commission_id: string;
  dispatch_id: string;
  objective: Objective;
  payment: string;
  setup_ids: string[];
  terms_hash: string;
  available: boolean;
}
export interface Company {
  account_id: string;
  deliveries: string;
  funds: string;
  active_job: string | null;
  dispatch: {
    dispatch_id: string;
    completed: number;
    fulfilled: number;
    jobs: (string | null)[];
  };
  withdrawal: {
    withdrawal_id: string;
    amount: string;
    status: "none" | "pending" | "paid" | "failed";
  };
}
export interface LegacyEconomy {
  version: 3;
  company: Company | null;
  project: {
    batch: string;
    funded: boolean;
    restored: boolean;
    slots: number[];
    reservations: (string | null)[];
    unreserved: string;
    reserved: string;
    paid: string;
  };
  stage: number;
  commissions: Commission[];
  sponsor: string;
  enabled: boolean;
}
export interface Town {
  town_id: number;
  name: string;
  stock: { supplies: number; updated_at: number; deliveries: number };
  incoming: (string | null)[];
  unreserved: string;
  reserved: string;
  paid: string;
  contributed: string;
}
export interface KingdomEconomy {
  version: 4;
  company: Company | null;
  towns: Town[];
  commissions: Commission[];
  sponsor: string;
  enabled: boolean;
  timestamp: string;
}
export type Economy = LegacyEconomy | KingdomEconomy;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const amount = (v: unknown): v is string =>
  typeof v === "string" && /^\d{1,39}$/.test(v) && BigInt(v) < 2n ** 128n;
const id = (v: unknown) => amount(v) && BigInt(v) < 2n ** 64n;
const optionalId = (v: unknown) => v === null || id(v);
export function parseEconomy(value: unknown): Economy {
  if (
    !object(value) ||
    (value.version !== 3 && value.version !== 4) ||
    typeof value.enabled !== "boolean" ||
    typeof value.sponsor !== "string" ||
    !Array.isArray(value.commissions) ||
    value.commissions.length > 6
  )
    throw Error("Company records could not be read. Check status.");
  if (value.version === 3) {
    const p = value.project;
    if (!object(p) || ![0, 1, 2, 3].includes(Number(value.stage)))
      throw Error("Invalid project funding record.");
    if (
      !id(p.batch) ||
      typeof p.funded !== "boolean" ||
      typeof p.restored !== "boolean" ||
      ![p.unreserved, p.reserved, p.paid].every(amount) ||
      !Array.isArray(p.slots) ||
      p.slots.length !== 9 ||
      !p.slots.every((s) => [0, 1, 2].includes(s)) ||
      !Array.isArray(p.reservations) ||
      p.reservations.length !== 9 ||
      !p.reservations.every(optionalId)
    )
      throw Error("Invalid project funding record.");
  } else {
    if (
      !id(value.timestamp) ||
      !Array.isArray(value.towns) ||
      value.towns.length !== 3
    )
      throw Error("Invalid kingdom record.");
    value.towns.forEach((t, i) => {
      if (
        !object(t) ||
        t.town_id !== i ||
        typeof t.name !== "string" ||
        !object(t.stock) ||
        !Number.isInteger(t.stock.supplies) ||
        Number(t.stock.supplies) < 0 ||
        Number(t.stock.supplies) > 6 ||
        !Number.isSafeInteger(t.stock.updated_at) ||
        Number(t.stock.updated_at) < 0 ||
        !Number.isSafeInteger(t.stock.deliveries) ||
        Number(t.stock.deliveries) < 0 ||
        !Array.isArray(t.incoming) ||
        t.incoming.length !== 2 ||
        !t.incoming.every(optionalId) ||
        ![t.unreserved, t.reserved, t.paid, t.contributed].every(amount) ||
        BigInt(String(t.unreserved)) +
          BigInt(String(t.reserved)) +
          BigInt(String(t.paid)) !==
          BigInt(String(t.contributed))
      )
        throw Error("Invalid town funding or supply record.");
    });
  }
  for (const c of value.commissions) {
    if (
      !object(c) ||
      (value.version === 4 &&
        (!Number.isInteger(c.town_id) ||
          Number(c.town_id) < 0 ||
          Number(c.town_id) > 2)) ||
      !id(c.commission_id) ||
      !id(c.dispatch_id) ||
      !["routine", "intact", "express"].includes(String(c.objective)) ||
      !amount(c.payment) ||
      typeof c.terms_hash !== "string" ||
      !Array.isArray(c.setup_ids) ||
      c.setup_ids.length < 1 ||
      c.setup_ids.length > 9 ||
      !c.setup_ids.every((s) => typeof s === "string" && s.length <= 64) ||
      typeof c.available !== "boolean"
    )
      throw Error("Invalid commission terms.");
  }
  const c = value.company;
  if (
    c !== null &&
    (!object(c) ||
      typeof c.account_id !== "string" ||
      !id(c.deliveries) ||
      !amount(c.funds) ||
      !optionalId(c.active_job) ||
      !object(c.dispatch) ||
      !id(c.dispatch.dispatch_id) ||
      typeof c.dispatch.completed !== "number" ||
      ![0, 1, 2, 3].includes(Number(c.dispatch.completed)) ||
      !Number.isInteger(c.dispatch.fulfilled) ||
      Number(c.dispatch.fulfilled) < 0 ||
      Number(c.dispatch.fulfilled) > Number(c.dispatch.completed) ||
      !Array.isArray(c.dispatch.jobs) ||
      c.dispatch.jobs.length !== 3 ||
      !c.dispatch.jobs.every(optionalId) ||
      !object(c.withdrawal) ||
      !id(c.withdrawal.withdrawal_id) ||
      !amount(c.withdrawal.amount) ||
      !["none", "pending", "paid", "failed"].includes(
        String(c.withdrawal.status),
      ))
  )
    throw Error("Invalid company record.");
  return value as unknown as Economy;
}
export const objectiveName: Record<Objective, string> = {
  routine: "Routine delivery",
  intact: "Intact cart",
  express: "Express delivery",
};
export const objectiveTerms: Record<Objective, string> = {
  routine: "Deliver the cart.",
  intact: "Deliver with 2 cart health.",
  express: "Deliver by round 4.",
};
export const projectStages = [
  "Supply the docks",
  "Repair the crossing",
  "Restore payroll",
  "Supply route restored",
];
export function bookingAmounts(
  fee: string,
  funds: string,
  useFunds: boolean,
  deposit: string,
) {
  const hire = BigInt(fee),
    balance = useFunds ? BigInt(funds) : 0n;
  const company = balance < hire ? balance : hire;
  return {
    company: company.toString(),
    wallet: (hire - company + BigInt(deposit)).toString(),
  };
}
export function commissionDifference(payment: string, fee: string) {
  const difference = BigInt(payment) - BigInt(fee);
  return `${difference < 0n ? "−" : ""}${nearAmount((difference < 0n ? -difference : difference).toString())}`;
}
