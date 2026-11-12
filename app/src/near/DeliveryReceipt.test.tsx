import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DeliveryReceipt from "./DeliveryReceipt";
import { firstShiftConfig } from "../game/firstShift";
import type { Job } from "./jobs";
import type { KingdomEconomy } from "./economy";

const job: Job = {
  job_id: "1",
  renter_id: "captain.testnet",
  token_id: "rook",
  worker_account: "rook.registry.testnet",
  config: firstShiftConfig,
  unit_slot: 1,
  rules_version: 2,
  content_version: 3,
  content_hash: "hash",
  setup_hash: "hash",
  accepted_fee: "1000000000000000000000",
  created_at_block: "1",
  expires_at_block: "2401",
  status: "saved",
  cooldown_until: "110",
  bond: "30000000000000000000000",
  storage_bytes: 100,
  refund_owed: "0",
  refund_in_flight: false,
  record: {
    outcome: "delivered",
    round: 5,
    cart_hp: 1,
    strikes: 0,
    borrows: 0,
    clauses: [],
    commitment: "hash",
    final_hash: "hash",
    confirmed_block: "100",
  },
  employment: {
    town_id: 0,
    commission_id: "1",
    dispatch_id: "0",
    leg: 0,
    objective: "express",
    payment: "75000000000000000000000",
    company_contribution: "0",
    earned: "0",
    closed: true,
  },
};
const economy: KingdomEconomy = {
  version: 4,
  company: null,
  commissions: [],
  sponsor: "sponsor.testnet",
  enabled: true,
  timestamp: "100",
  towns: [
    {
      town_id: 0,
      name: "Docks",
      stock: { supplies: 2, deliveries: 2, updated_at: 100 },
      incoming: [null, null],
      unreserved: "0",
      reserved: "0",
      paid: "0",
      contributed: "0",
    },
  ],
};

describe("confirmed delivery receipt", () => {
  it("does not call a delivered cart an accepted commission when its terms were missed", () => {
    const html = renderToStaticMarkup(
      <DeliveryReceipt job={job} economy={economy} />,
    );
    expect(html).toContain("Delivery terms not met");
    expect(html).toContain("No supplies delivered");
    expect(html).not.toContain("Delivery accepted");
    expect(html).not.toContain("+1 supply");
  });
  it("reports the frozen earned amount and current town state without inventing a before balance", () => {
    const html = renderToStaticMarkup(
      <DeliveryReceipt
        job={{
          ...job,
          employment: { ...job.employment!, earned: "75000000000000000000000" },
        }}
        economy={economy}
      />,
    );
    expect(html).toContain("Delivery accepted");
    expect(html).toContain("0.075");
    expect(html).toContain("+1 supply");
    expect(html).toContain("2/3 deliveries");
    expect(html).toContain("Unavailable");
  });
  it("keeps expired work distinct from a saved defeat", () => {
    const html = renderToStaticMarkup(
      <DeliveryReceipt
        job={{ ...job, status: "expired", record: null }}
        economy={economy}
      />,
    );
    expect(html).toContain("Job expired");
    expect(html).not.toContain("Delivery accepted");
  });

  it("shows the paid worker receipt and costs without calling the subtotal profit", () => {
    const html = renderToStaticMarkup(
      <DeliveryReceipt
        job={{
          ...job,
          accepted_fee: "6000000000000000000000",
          credit_status: "finalized",
          storage_bytes: 535,
          employment: { ...job.employment!, earned: "50000000000000000000000" },
        }}
        owner="owner.testnet"
        economy={{
          ...economy,
          towns: [
            {
              ...economy.towns[0]!,
              stock: { supplies: 1, deliveries: 3, updated_at: 100 },
            },
          ],
        }}
      />,
    );
    expect(html).toContain("Current owner: owner.testnet");
    expect(html).toContain("rook.registry.testnet");
    expect(html).toContain("Credited to worker: 0.0057");
    expect(html).toContain("Hall fee: 0.0003");
    expect(html).toContain("0.00535 NEAR");
    expect(html).toContain("0.03865 NEAR");
    expect(html).toContain("Gas and withdrawal costs");
    expect(html).toContain("Restoration lasts.");
    expect(html).toContain("Current supplies 1/6");
  });

  it.each([undefined, "staged", "unknown"])(
    "does not confirm %s worker credit after settlement",
    (credit_status) => {
      const html = renderToStaticMarkup(
        <DeliveryReceipt job={{ ...job, credit_status }} economy={economy} />,
      );
      expect(html).toContain("Worker credit pending");
      expect(html).not.toContain("Credited to worker");
    },
  );

  it("shows self-use and negative costs for unpaid delivery", () => {
    const html = renderToStaticMarkup(
      <DeliveryReceipt job={{ ...job, accepted_fee: "0" }} economy={economy} />,
    );
    expect(html).toContain("Owner self-use");
    expect(html).toContain("−0.001 NEAR");
    expect(html).not.toContain("Credited to worker");
  });
});
