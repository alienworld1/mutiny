import { useState } from "react";
import { packages } from "../game/types";
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
  const [automatic, setAutomatic] = useState(false);
  const [ceiling, setCeiling] = useState("0.03");
  const [option, setOption] = useState(0);
  const [receiver, setReceiver] = useState("");
  const [error, setError] = useState("");
  const w = c.worker;
  if (!w || w.token.owner_id !== c.account) return null;
  const locked = c.busy || w.status !== "idle" || w.claim?.status === "pending";
  const e = c.earnings;
  return (
    <div className="space-y-4 border-t border-border pt-4">
      <h3 className="text-xl">{w.character}’s terms</h3>
      <label className="grid min-w-0 w-full max-w-full gap-1 text-sm sm:w-auto">
        Offer
        <select
          className="min-h-11 min-w-0 w-full max-w-full rounded-lg border border-border bg-paper px-3"
          value={option}
          disabled={locked}
          onChange={(e) => setOption(Number(e.target.value))}
        >
          {w.packages.map((p, i) => (
            <option key={p} value={i}>
              {packages[p as keyof typeof packages].name}
            </option>
          ))}
        </select>
      </label>
      {locked && (
        <p className="text-sm">
          Offer changes wait until the worker is idle and claims are resolved.
        </p>
      )}
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
            const maximum = automatic ? yoctoAmount(ceiling) : starting;
            if (maximum < starting || maximum > 10n ** 24n)
              throw Error("Use a ceiling between the starting fee and 1 NEAR.");
            setError("");
            c.moneyAction(automatic ? "set_auto_offer" : "set_offer", {
              ...(automatic ? { ceiling_ask: maximum.toString() } : {}),
              package_option: option,
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
          <label
            key={label}
            className="grid min-w-0 w-full max-w-full gap-1 text-sm sm:w-auto"
          >
            {label}
            <input
              className="min-h-11 max-w-full w-40 rounded-lg border border-border bg-paper px-3"
              inputMode="decimal"
              value={value}
              disabled={locked}
              onChange={(event) => setter(event.target.value)}
            />
          </label>
        ))}
        {c.economy?.version === 4 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={automatic}
              disabled={locked}
              onChange={(e) => setAutomatic(e.target.checked)}
            />
            Automatic pricing
          </label>
        )}
        {automatic && (
          <label className="grid gap-1 text-sm">
            Ceiling (NEAR)
            <input
              className="min-h-11 w-32 rounded border border-border bg-paper px-3"
              inputMode="decimal"
              value={ceiling}
              disabled={locked}
              onChange={(e) => setCeiling(e.target.value)}
            />
          </label>
        )}
        <button disabled={locked}>Post offer</button>
        {w.offers?.[option] && (
          <button
            type="button"
            disabled={locked}
            onClick={() =>
              c.moneyAction("withdraw_offer", { package_option: option })
            }
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
        Prices in testnet NEAR. Automatic offers rise after paid hires and fall
        with idle time. Pressure decays every 30 minutes. Your floor and ceiling
        apply. Manual offers keep their idle discounts.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !/^(?=.{2,64}$)([a-z0-9]+[-_])*[a-z0-9]+(\.([a-z0-9]+[-_])*[a-z0-9]+)*$/.test(
              receiver,
            ) ||
            receiver === w.token.owner_id
          ) {
            setError("Enter the new owner's NEAR account.");
            return;
          }
          setError("");
          c.moneyAction("nft_transfer", {
            receiver_id: receiver,
            approval_id: null,
            memo: null,
          });
        }}
      >
        <label className="grid min-w-0 w-full max-w-full gap-1 text-sm sm:w-auto">
          New owner
          <input
            className="min-h-11 min-w-0 w-full max-w-full rounded-lg border border-border bg-paper px-3"
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            required
          />
        </label>
        <button
          disabled={
            c.busy ||
            w.status === "transfer_pending" ||
            w.claim?.status === "pending"
          }
        >
          Transfer NFT
        </button>
        <p className="w-full text-sm text-secondary">
          The new owner receives title and future earnings rights. An active
          renter keeps the shift. Wallet gas plus 1 yoctoNEAR.
        </p>
      </form>
      {e && (
        <div className="space-y-2 break-words text-sm">
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
              Claim
            </button>
          )}
          {w.claim?.status === "paid" && (
            <p>
              Earnings claimed · {nearAmount(w.claim.amount)} testnet NEAR ·
              Paid to {w.claim.recipient}
            </p>
          )}
          {w.claim?.status === "failed" && (
            <p>Claim failed. Check available earnings, then Retry.</p>
          )}
        </div>
      )}
    </div>
  );
}
