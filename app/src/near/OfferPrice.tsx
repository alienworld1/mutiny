import { nearAmount } from "./jobs";
import type { Offer } from "./jobs";

// The quote remains authoritative. These terms explain its components only.
export default function OfferPrice({
  offer,
  block,
}: {
  offer: Offer;
  block: string;
}) {
  const elapsed = BigInt(block) - BigInt(offer.available_since);
  const steps = elapsed > 0n ? elapsed / 120n : 0n;
  const limit = offer.automatic ? 4n : 3n;
  const idle = BigInt(offer.discount_step) * (steps < limit ? steps : limit);
  const pressure =
    BigInt(offer.discount_step) * BigInt(offer.automatic?.pressure ?? 0);
  return (
    <div className="mt-2 space-y-1 text-xs text-secondary tabular-nums">
      <p>
        Base {nearAmount(offer.starting_ask)} + demand{" "}
        {nearAmount(pressure.toString())} − idle discount{" "}
        {nearAmount(idle.toString())} NEAR.
      </p>
      <p>
        Floor {nearAmount(offer.floor_ask)}
        {offer.automatic &&
          ` · Ceiling ${nearAmount(offer.automatic.ceiling)}`}{" "}
        NEAR. Idle discounts reset after a shift.
      </p>
    </div>
  );
}
