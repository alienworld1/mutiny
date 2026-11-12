import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OfferPrice from "./OfferPrice";
import type { Offer } from "./jobs";

const offer: Offer = {
  package_option: 0,
  starting_ask: "14000000000000000000000",
  floor_ask: "2000000000000000000000",
  discount_step: "2000000000000000000000",
  available_since: "100",
  automatic: {
    ceiling: "30000000000000000000000",
    pressure: 1,
    updated_at: "100",
  },
};

describe("offer price explanation", () => {
  it("separates demand from accumulated idle discounts", () => {
    const html = renderToStaticMarkup(
      <OfferPrice offer={offer} block="1000" />,
    );
    expect(html).toContain(
      "Base 0.014 + demand 0.002 − idle discount 0.008 NEAR",
    );
    expect(html).toContain("Floor 0.002 · Ceiling 0.03 NEAR");
  });
  it("resets the idle component while a shift is reserved through cooldown", () => {
    const html = renderToStaticMarkup(
      <OfferPrice offer={{ ...offer, available_since: "1100" }} block="1000" />,
    );
    expect(html).toContain("demand 0.002 − idle discount 0 NEAR");
    expect(html).toContain("Idle discounts reset after a shift");
  });
  it("limits manual offers to three discount steps", () => {
    const html = renderToStaticMarkup(
      <OfferPrice offer={{ ...offer, automatic: null }} block="1000" />,
    );
    expect(html).toContain("demand 0 − idle discount 0.006 NEAR");
    expect(html).not.toContain("Ceiling");
  });
});
