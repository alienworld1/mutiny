import TownScene from "./TownScene";
import { useState } from "react";
import type { Configuration, Setup } from "../game/types";
import { simulateKingdom } from "../game/engine";
import { nearAmount, yoctoAmount } from "./jobs";
import { objectiveName, objectiveTerms } from "./economy";
import type { KingdomEconomy } from "./economy";
import type { ContractJobController } from "./useContractJob";
import { suggestedDelivery } from "./economy";
import LegacyCompanyHome from "./LegacyCompanyHome";

type Props = {
  controller: ContractJobController;
  config: Configuration;
  setConfig: (value: Configuration) => void;
  setups: Setup[];
  guided?: boolean;
};
export default function CompanyHome(props: Props) {
  const e = props.controller.economy;
  if (!e) return null;
  return e.version === 3 ? (
    <LegacyCompanyHome {...props} />
  ) : (
    <Kingdom {...props} economy={e} />
  );
}

function Kingdom({
  controller: c,
  config,
  setConfig,
  setups,
  economy: e,
  guided = false,
}: Props & { economy: KingdomEconomy }) {
  const [contribution, setContribution] = useState("0.1");
  const [fundingTown, setFundingTown] = useState(0);
  const [fundingError, setFundingError] = useState("");
  const [preview, setPreview] = useState(false);
  const [withDeliveries, setWithDeliveries] = useState(false);
  const [hours, setHours] = useState(6);
  const company = e.company;
  const suggestion = guided ? suggestedDelivery(e) : undefined;
  const deliveries = BigInt(company?.deliveries ?? "0");
  const restored = e.towns.filter((t) => t.stock.deliveries >= 3).length;
  const frames = preview
    ? simulateKingdom(
        {
          stocks: e.towns.map((t) => t.stock),
          treasuries: e.towns.map((t) => t.unreserved),
        },
        hours,
        withDeliveries,
      )
    : null;
  return (
    <section aria-label="Your kingdom" className="space-y-5">
      {!guided && (
        <div className="relative overflow-hidden rounded-xl border-b-4 border-brass bg-muted">
          <img
            src="/assets/art/town.webp"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-paper via-paper/90 to-transparent" />
          <div className="relative p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-secondary">
              The Royal Supply Route · Testnet
            </p>
            <h3 className="mt-2 text-3xl">
              {restored === 3
                ? "A kingdom back on its feet."
                : "The kingdom runs on deliveries."}
            </h3>
            <p className="mt-2 max-w-xl text-sm">
              Deliver supplies. Restore the towns.
            </p>
            <p className="mt-3 text-sm tabular-nums">
              {restored}/3 towns restored
            </p>
          </div>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
          1 · Work
        </p>
        <h3
          data-delivery-heading={guided || undefined}
          tabIndex={guided ? -1 : undefined}
          className="mt-1 text-2xl"
        >
          Choose a delivery
        </h3>
        <p className="mt-1 text-sm text-secondary">
          {guided
            ? "Other players share these towns. Each accepted delivery adds one supply. Three deliveries restore a town."
            : "Fees and payments are in testnet NEAR."}
        </p>
      </div>
      {suggestion && (
        <p className="border-l-2 border-primary pl-3 text-sm">
          Try ordinary work at {e.towns[suggestion.town_id ?? -1]?.name}. It has
          standard delivery terms.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {e.towns.map((town, index) => {
          const stock = town.stock.supplies;
          const incoming = town.incoming.filter(Boolean).length;
          const needs =
            stock <= 1
              ? "Urgent"
              : stock <= 3
                ? "Low supplies"
                : stock < 6
                  ? "Supplied"
                  : "Stores full";
          const orders = e.commissions.filter(
            (order) => order.town_id === town.town_id,
          );
          return (
            <article
              key={town.town_id}
              aria-label={town.name}
              className="overflow-hidden rounded-xl border-x border-b-4 border-brass bg-paper shadow-panel"
            >
              <TownScene
                policy={(["dock", "bridge", "town"] as const)[index] ?? "town"}
                supplies={stock}
                incoming={incoming}
                restored={town.stock.deliveries >= 3}
              />
              <p className="border-b border-brass/40 bg-muted px-4 py-2 text-xs font-semibold">
                {town.stock.deliveries >= 3
                  ? "Restored"
                  : `${town.stock.deliveries}/3 toward restoration`}
              </p>
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xl">{town.name}</h4>
                  <span className="text-xs font-semibold text-primary">
                    {needs}
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-xs tabular-nums text-secondary">
                  <span>
                    Supplies <strong className="text-ink">{stock}/6</strong>
                  </span>
                  <span>
                    Incoming <strong className="text-ink">{incoming}/2</strong>
                  </span>
                </div>
                <div aria-hidden="true" className="flex gap-1">
                  {Array.from({ length: 6 }, (_, i) => (
                    <span
                      key={i}
                      className={`h-2 flex-1 rounded ${i < stock ? "bg-primary" : "bg-border"}`}
                    />
                  ))}
                </div>
                <p className="text-xs text-secondary">
                  {setups.find((s) => s.id === orders[0]?.setup_ids[0])
                    ?.variant ?? "No delivery needed"}
                </p>
                {orders.map((order) => (
                  <button
                    key={order.commission_id}
                    disabled={
                      c.busy || !order.available || !!company?.active_job
                    }
                    aria-pressed={
                      c.commission?.commission_id === order.commission_id
                    }
                    className="!h-auto w-full !p-3 text-left aria-pressed:!border-primary aria-pressed:!bg-muted aria-pressed:!text-ink"
                    onClick={() => {
                      c.selectCommission(order.commission_id);
                      setConfig({ ...config, setup_id: order.setup_ids[0]! });
                    }}
                  >
                    <span className="flex flex-wrap justify-between gap-1">
                      <strong>
                        {objectiveName[order.objective]}
                        {suggestion?.commission_id === order.commission_id && (
                          <span className="ml-2 text-xs font-normal">
                            Suggested
                          </span>
                        )}
                      </strong>
                      <span className="tabular-nums">
                        {nearAmount(order.payment)} NEAR
                      </span>
                    </span>
                    <span className="mt-1 block text-xs font-normal">
                      {objectiveTerms[order.objective]}
                    </span>
                  </button>
                ))}
                {!e.enabled ? (
                  <p className="text-sm">Bookings are not enabled.</p>
                ) : stock === 6 ? (
                  <p className="text-sm">
                    The stores are full. Consumption will create new work.
                  </p>
                ) : incoming === 2 ? (
                  <p className="text-sm">Two crews are on their way.</p>
                ) : !orders.some((o) => o.available) ? (
                  <p className="text-sm">
                    No funded work. A contribution can reopen deliveries.
                  </p>
                ) : null}
                <details className="text-xs text-secondary">
                  <summary className="cursor-pointer py-2">
                    Town treasury
                  </summary>
                  <p>
                    Available {nearAmount(town.unreserved)} NEAR · Reserved{" "}
                    {nearAmount(town.reserved)} · Paid {nearAmount(town.paid)}
                  </p>
                  <p className="mt-1">
                    Contributed {nearAmount(town.contributed)} NEAR. Payments
                    use these finite funds.
                  </p>
                </details>
              </div>
            </article>
          );
        })}
      </div>
      <div hidden={guided} className="space-y-5">
        <details className="text-sm text-secondary">
          <summary className="py-2">How towns change</summary>
          <p className="mt-1">
            Each town uses one supply every 30 minutes. Lower supplies bring
            higher delivery payments. Three accepted deliveries restore a town
            for good. Booked terms stay fixed.
          </p>
        </details>
        <details className="rounded-xl border border-border px-4">
          <summary className="py-3 font-semibold">
            Company ledger{" "}
            <span className="ml-2 text-sm font-normal text-secondary">
              {nearAmount(company?.funds ?? "0")} NEAR · {deliveries.toString()}{" "}
              deliveries
            </span>
          </summary>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <h4 className="text-xl">
                {deliveries >= 2n ? "Chartered company" : "Your company"}
              </h4>
              <p className="mt-2 font-display text-2xl tabular-nums">
                {nearAmount(company?.funds ?? "0")}{" "}
                <span className="font-body text-sm">NEAR</span>
              </p>
              <p className="mt-1 text-sm text-secondary">
                {deliveries.toString()} deliveries
                {deliveries < 2n ? " · Charter at 2" : " · A name on the door"}
              </p>
              {company?.withdrawal.status === "pending" ? (
                <p role="status" className="mt-3 text-sm">
                  Withdrawal pending. Check its transaction before retrying.
                </p>
              ) : (
                <button
                  className="mt-3"
                  disabled={c.busy || !company || company.funds === "0"}
                  onClick={() =>
                    c.moneyAction("withdraw_company_funds", {
                      amount: company!.funds,
                    })
                  }
                >
                  Withdraw {nearAmount(company?.funds ?? "0")} NEAR
                </button>
              )}
              {company?.withdrawal.status === "paid" && (
                <p role="status" className="mt-2 text-sm">
                  Withdrawal confirmed.
                </p>
              )}
              {company?.withdrawal.status === "failed" && (
                <p role="status" className="mt-2 text-sm">
                  Withdrawal failed. Funds returned to your company.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <h4 className="text-xl">
                Dispatch{" "}
                {BigInt(company?.dispatch.dispatch_id ?? "0") + 1n + ""}
              </h4>
              <ol
                aria-label="Dispatch legs"
                className="my-3 grid grid-cols-3 gap-2"
              >
                {[0, 1, 2].map((leg) => (
                  <li
                    key={leg}
                    className="rounded border border-border p-2 text-center text-sm"
                  >
                    Leg {leg + 1}
                    <span className="mt-1 block text-xs">
                      {leg < (company?.dispatch.completed ?? 0)
                        ? "Saved"
                        : leg === (company?.dispatch.completed ?? 0) &&
                            company?.active_job
                          ? "On shift"
                          : "Unbooked"}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-sm text-secondary">
                {company?.dispatch.fulfilled ?? 0} accepted ·{" "}
                {company?.dispatch.completed ?? 0}/3 complete
              </p>
            </div>
          </div>
        </details>
        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer py-1 font-semibold">
            Support a town
          </summary>
          <form
            className="mt-3 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const amount = yoctoAmount(contribution);
                if (amount <= 0n)
                  throw Error("Enter a contribution above zero.");
                setFundingError("");
                c.moneyAction(
                  "fund_town",
                  {
                    town_id: fundingTown,
                    expected_contributed: e.towns[fundingTown]!.contributed,
                  },
                  amount,
                );
              } catch (error) {
                setFundingError(
                  error instanceof Error ? error.message : String(error),
                );
              }
            }}
          >
            <label className="grid gap-1 text-sm">
              Destination
              <select
                value={fundingTown}
                onChange={(event) => setFundingTown(Number(event.target.value))}
                className="min-h-11 rounded border border-border bg-paper px-3"
              >
                {e.towns.map((t) => (
                  <option key={t.town_id} value={t.town_id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Contribution (NEAR)
              <input
                value={contribution}
                inputMode="decimal"
                onChange={(event) => setContribution(event.target.value)}
                className="min-h-11 w-32 rounded border border-border bg-paper px-3"
              />
            </label>
            <button disabled={c.busy || !c.account}>Contribute</button>
          </form>
          <p className="mt-2 text-sm text-secondary">
            This is a nonrefundable gift to fund deliveries. It gives no
            ownership or financial return.
          </p>
          {fundingError && (
            <p role="alert" className="mt-2 text-sm">
              {fundingError}
            </p>
          )}
        </details>
        <details
          className="rounded-xl border border-border p-4"
          onToggle={(event) => setPreview(event.currentTarget.open)}
        >
          <summary className="cursor-pointer py-1 font-semibold">
            Watch a day · Simulation
          </summary>
          {preview && (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-secondary">
                Preview supply use and payments. This simulation uses no live
                funds.
              </p>
              <label className="flex flex-wrap items-center gap-3 text-sm">
                Hours ahead{" "}
                <input
                  aria-label="Hours ahead"
                  type="range"
                  min="1"
                  max="24"
                  value={hours}
                  onChange={(event) => setHours(Number(event.target.value))}
                />
                <span>{hours}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={withDeliveries}
                  onChange={(event) => setWithDeliveries(event.target.checked)}
                />
                One hypothetical delivery per town each hour
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {e.towns.map((town, i) => (
                  <div
                    key={town.town_id}
                    className="rounded border border-border p-3 text-sm"
                  >
                    <strong>{town.name}</strong>
                    <p className="mt-1 tabular-nums">
                      {town.stock.supplies} →{" "}
                      {frames?.at(-1)?.stocks[i]?.supplies}/6 supplies
                    </p>
                    <p className="mt-1 text-xs tabular-nums">
                      Simulated treasury:{" "}
                      {nearAmount(frames?.at(-1)?.treasuries[i] ?? "0")} NEAR
                    </p>
                    <p className="mt-1 text-xs text-secondary">
                      Simulated payments:{" "}
                      {nearAmount(frames?.at(-1)?.paid[i] ?? "0")} NEAR
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </details>
      </div>
    </section>
  );
}
