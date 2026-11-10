import { describe, it, expect } from "vitest";
import {
  bookingAmounts,
  commissionDifference,
  parseEconomy,
  suggestedDelivery,
} from "./economy";
import type { KingdomEconomy } from "./economy";
const project = {
  batch: "0",
  funded: true,
  restored: false,
  slots: Array(9).fill(0),
  reservations: Array(9).fill(null),
  unreserved: "500000000000000000000000",
  reserved: "0",
  paid: "0",
};
const record = {
  version: 3,
  company: null,
  project,
  stage: 0,
  commissions: [],
  sponsor: "owner.testnet",
  enabled: true,
};
describe("company boundaries", () => {
  it("splits exact hire amounts without spending the storage deposit", () => {
    expect(bookingAmounts("10", "7", true, "30")).toEqual({
      company: "7",
      wallet: "33",
    });
    expect(bookingAmounts("10", "99", true, "30")).toEqual({
      company: "10",
      wallet: "30",
    });
    expect(bookingAmounts("10", "99", false, "30")).toEqual({
      company: "0",
      wallet: "40",
    });
    expect(bookingAmounts("0", "99", true, "30")).toEqual({
      company: "0",
      wallet: "30",
    });
  });
  it("keeps a negative commission difference readable and precise", () => {
    expect(commissionDifference("1", "2")).toBe("−0.000000000000000000000001");
  });
  it("rejects malformed balances, unbounded IDs, slots and dispatches", () => {
    expect(parseEconomy(record)).toEqual(record);
    expect(() =>
      parseEconomy({ ...record, project: { ...project, unreserved: "-1" } }),
    ).toThrow("funding");
    expect(() =>
      parseEconomy({
        ...record,
        project: { ...project, batch: (2n ** 64n).toString() },
      }),
    ).toThrow("funding");
    expect(() =>
      parseEconomy({ ...record, project: { ...project, slots: [0] } }),
    ).toThrow("funding");
    expect(() =>
      parseEconomy({
        ...record,
        company: { account_id: "bob.testnet", deliveries: "2", funds: "-1" },
      }),
    ).toThrow("company");
  });
});

const kingdom = {
  version: 4,
  company: null,
  commissions: [],
  sponsor: "owner.testnet",
  enabled: true,
  timestamp: "1800",
  towns: [0, 1, 2].map((town_id) => ({
    town_id,
    name: ["Docks", "Crossing", "Royal office"][town_id],
    stock: { supplies: 1, updated_at: 1800, deliveries: 0 },
    incoming: [null, null],
    unreserved: "100",
    reserved: "0",
    paid: "0",
    contributed: "100",
  })),
};
describe("kingdom boundaries", () => {
  it("suggests available ordinary work at the lowest-stock town without changing the offers", () => {
    const e = parseEconomy(kingdom) as KingdomEconomy;
    e.towns[0]!.stock.supplies = 3;
    e.towns[1]!.stock.supplies = 1;
    e.commissions = [0, 1, 2].map((town_id) => ({
      town_id,
      commission_id: String(town_id),
      dispatch_id: "0",
      objective: "routine",
      payment: "10",
      setup_ids: ["dock-fire-intro"],
      terms_hash: "terms",
      available: true,
    }));
    expect(suggestedDelivery(e)?.town_id).toBe(1);
    expect(e.commissions.map((c) => c.town_id)).toEqual([0, 1, 2]);
    e.commissions[1]!.available = false;
    e.commissions[2]!.objective = "express";
    expect(suggestedDelivery(e)?.town_id).toBe(0);
    e.commissions[0]!.available = false;
    expect(suggestedDelivery(e)).toBeUndefined();
    e.commissions[0]!.available = true;
    e.enabled = false;
    expect(suggestedDelivery(e)).toBeUndefined();
  });
  it("accepts separate backed town budgets", () =>
    expect(parseEconomy(kingdom)).toEqual(kingdom));
  it("rejects unbacked money, impossible stocks and duplicate destinations", () => {
    for (const town of [
      { ...kingdom.towns[0], paid: "1" },
      {
        ...kingdom.towns[0],
        stock: { supplies: 7, updated_at: 1800, deliveries: 0 },
      },
      { ...kingdom.towns[0], incoming: [null, null, null] },
      { ...kingdom.towns[0], town_id: 2 },
    ]) {
      expect(() =>
        parseEconomy({ ...kingdom, towns: [town, ...kingdom.towns.slice(1)] }),
      ).toThrow();
    }
    expect(() => parseEconomy({ ...kingdom, version: "4" })).toThrow();
  });
});
