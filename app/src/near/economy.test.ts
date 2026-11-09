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
