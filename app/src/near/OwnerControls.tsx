import { useState } from "react";
import { nearAmount, yoctoAmount } from "./jobs";
import type { ContractJobController } from "./useContractJob";

export default function OwnerControls({
  controller: c,
}: {
  controller: ContractJobController;
}) {
  const [start, setStart] = useState("0.004");
  const [floor, setFloor] = useState("0.001");
  const [step, setStep] = useState("0");
  const [error, setError] = useState("");
  const w = c.worker;
  if (!w || w.token.owner_id !== c.account) return null;
  const locked = c.busy || w.status !== "idle" || w.claim?.status === "pending";
  const e = c.earnings;
  return (
    <div className="space-y-4 border-t border-border pt-4">
      <h3 className="text-xl">Rook’s terms</h3>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const starting = yoctoAmount(start),
              minimum = yoctoAmount(floor),
              discount = yoctoAmount(step);
            if (
              minimum < 10n ** 21n ||
              starting > 10n ** 24n ||
              minimum > starting ||
              discount > 10n ** 24n
            )
              throw new Error(
                "Use a floor from 0.001 NEAR up to the starting fee, and a maximum of 1 NEAR.",
              );
            setError("");
            c.moneyAction("set_offer", {
              package_option: 0,
              starting_ask: starting.toString(),
              floor_ask: minimum.toString(),
              discount_step: discount.toString(),
            });
          } catch (cause) {
            setError(String(cause instanceof Error ? cause.message : cause));
          }
        }}
      >
        {(
          [
            ["Starting fee", start, setStart],
            ["Floor", floor, setFloor],
            ["Discount per 120 blocks", step, setStep],
          ] as const
        ).map(([label, value, setter]) => (
          <label key={label} className="grid gap-1 text-sm">
            {label}
            <input
              className="min-h-11 w-40 rounded-lg border border-border bg-paper px-3"
              inputMode="decimal"
              value={value}
              disabled={locked}
              onChange={(event) => setter(event.target.value)}
            />
          </label>
        ))}
        <button disabled={locked}>Post offer</button>
        {w.offer && (
          <button
            type="button"
            disabled={locked}
            onClick={() => c.moneyAction("withdraw_offer")}
          >
            Withdraw
          </button>
        )}
      </form>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <p className="text-sm text-secondary">
        Not On The Fire · Prices in testnet NEAR. At most 3 discounts. Terms can
        change while Rook is idle.
      </p>
      {e && (
        <div className="space-y-2 text-sm">
          <p>
            Available earnings:{" "}
            <strong>{nearAmount(e.claimable)} testnet NEAR</strong>
          </p>
          <p className="text-secondary">
            Held: {nearAmount(e.balance)} · Protected reserve:{" "}
            {nearAmount(e.reserve)} · Pending credit: {nearAmount(e.staged)} ·
            Recognized earnings: {nearAmount(e.recognized)} · Paid:{" "}
            {nearAmount(e.paid)}
          </p>
          {w.claim?.status === "pending" ? (
            <>
              <p>Claim pending · {nearAmount(w.claim.amount)} testnet NEAR</p>
              <button
                disabled={c.busy}
                onClick={() => c.moneyAction("reconcile_claim")}
              >
                Check claim
              </button>
            </>
          ) : (
            <button
              disabled={
                c.busy ||
                BigInt(e.claimable) === 0n ||
                w.status === "transfer_pending"
              }
              onClick={() =>
                c.moneyAction("request_claim", { amount: e.claimable })
              }
            >
              Claim {nearAmount(e.claimable)} NEAR
            </button>
          )}
          {w.claim?.status === "paid" && (
            <p>Earnings claimed · {nearAmount(w.claim.amount)} testnet NEAR</p>
          )}
          {w.claim?.status === "failed" && (
            <p>Claim failed. Check available earnings, then Retry.</p>
          )}
        </div>
      )}
    </div>
  );
}
