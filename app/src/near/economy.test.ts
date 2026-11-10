import { describe, it, expect } from "vitest";
import { bookingAmounts, commissionDifference, parseEconomy } from "./economy";
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
