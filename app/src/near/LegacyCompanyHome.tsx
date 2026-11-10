import type { Configuration, Setup } from "../game/types";
import { nearAmount } from "./jobs";
import { objectiveName, objectiveTerms, projectStages } from "./economy";
import type { ContractJobController } from "./useContractJob";

export default function LegacyCompanyHome({
  controller: c,
  config,
  setConfig,
  setups,
}: {
  controller: ContractJobController;
  config: Configuration;
  setConfig: (value: Configuration) => void;
  setups: Setup[];
}) {
  const e = c.economy;
  if (!e || e.version !== 3) return null;
  const company = e.company;
  const deliveries = BigInt(company?.deliveries ?? "0");
  const chartered = deliveries >= 2n;
  const completed = e.project.slots.filter((s) => s === 2).length;
  const dispatch = company?.dispatch;
  return (
    <section aria-label="Your company" className="space-y-5">
      <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
        <img
          src={`/assets/art/${chartered ? "town" : "dock"}.webp`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-paper via-paper/90 to-transparent" />
        <div className="relative flex min-h-40 flex-col justify-center p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-secondary">
            {chartered ? "Chartered company" : "Provisional company"} · Testnet
          </p>
          <h3 className="mt-1 max-w-lg text-xl sm:text-3xl">
            {deliveries > 0n
              ? "Your company has a name on the door."
              : "A desk. A cart. A promising start."}
          </h3>
          <p className="mt-2 max-w-md text-sm">
            {chartered
              ? "The office is open. More route variants are yours to choose."
              : `${deliveries}/2 deliveries toward your charter.`}
          </p>
        </div>
        {deliveries > 0n && (
          <span
            aria-label={chartered ? "Office improved" : "Company sign earned"}
            className="absolute right-4 top-3 rounded border-2 border-brass bg-paper px-3 py-2 font-display text-sm shadow-panel max-sm:hidden"
          >
            {chartered ? "Royal Charter" : "Open for work"}
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-paper p-4">
          <h4 className="text-lg">Company funds</h4>
          <p className="mt-1 font-display text-2xl tabular-nums">
            {nearAmount(company?.funds ?? "0")}{" "}
            <span className="font-body text-xs">testnet NEAR</span>
          </p>
          <p className="mt-1 text-sm text-secondary">
            Use earnings for your next hire, or withdraw to your wallet.
          </p>
          {company?.withdrawal.status === "pending" ? (
            <p role="status" className="mt-3 text-sm font-semibold">
              Withdrawal pending: {nearAmount(company.withdrawal.amount)} NEAR.
              Check its transaction before retrying.
            </p>
          ) : (
            <>
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
            </>
          )}
        </div>
        <div className="rounded-xl border border-border bg-paper p-4">
          <h4 className="text-lg">
            Dispatch {dispatch ? Number(dispatch.dispatch_id) + 1 : 1}
          </h4>
          <ol
            aria-label="Dispatch legs"
            className="my-3 grid grid-cols-3 gap-2"
          >
            {[0, 1, 2].map((leg) => (
              <li
                key={leg}
                className={`rounded-lg border p-2 text-center text-sm ${leg < (dispatch?.completed ?? 0) ? "border-primary bg-muted" : "border-border"}`}
              >
                Leg {leg + 1}
                <span className="mt-1 block text-xs">
                  {leg < (dispatch?.completed ?? 0)
                    ? "Saved"
                    : leg === (dispatch?.completed ?? 0) &&
                        company?.active_job !== null &&
                        company?.active_job !== undefined
                      ? "On shift"
                      : "Unbooked"}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-secondary">
            {dispatch?.completed === 3
              ? `${dispatch.fulfilled}/3 commissions fulfilled. Choose work to start the next dispatch.`
              : `${dispatch?.completed ?? 0}/3 legs complete. Leave and return after any leg.`}
          </p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-paper p-4">
        <div className="flex flex-wrap justify-between gap-2">
          <h3 className="text-xl">
            {e.project.restored
              ? "Royal Supply Route · Restored"
              : "Restore the Royal Supply Route"}
          </h3>
          <span className="text-sm tabular-nums">{completed}/9 deliveries</span>
        </div>
        <ol className="my-3 grid gap-2 sm:grid-cols-3">
          {projectStages.slice(0, 3).map((stage, index) => (
            <li
              key={stage}
              aria-current={e.stage === index ? "step" : undefined}
              className={`overflow-hidden rounded-lg border text-sm ${e.stage === index ? "border-primary bg-muted font-semibold" : "border-border"}`}
            >
              <img
                src={`/assets/art/${["dock", "bridge", "town"][index]}.webp`}
                alt=""
                className={`h-20 w-full object-cover object-top transition-[filter,opacity] motion-reduce:transition-none ${e.project.restored || index < e.stage ? "" : "opacity-40 grayscale"}`}
              />
              <span className="block p-3">
                {index < e.stage ? "✓ " : ""}
                {stage}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-secondary">
          {e.stage === 3
            ? "Supply route restored. Further work needs a funded supply batch."
            : e.project.restored
              ? "The route is restored. This supply batch keeps it running."
              : "Deliveries open the next stage. Bookings reserve shared work and a worker."}
        </p>
        <details className="mt-3 text-xs text-secondary">
          <summary className="cursor-pointer py-2">Project funding</summary>
          <p>
            Developer-funded testnet batch {Number(e.project.batch) + 1}.
            Available {nearAmount(e.project.unreserved)} NEAR · Reserved{" "}
            {nearAmount(e.project.reserved)} · Paid {nearAmount(e.project.paid)}
            . Sponsor: {e.sponsor}.
          </p>
          <p className="mt-2">
            Local battles can be rehearsed. Commissions pay for verified
            deliveries. Funding is finite.
          </p>
        </details>
      </div>
      <section aria-label="Available commissions">
        <h3 className="mb-3 text-xl">Choose your next work</h3>
        {!e.enabled ? (
          <p className="rounded-xl bg-muted p-4 text-sm">
            Company bookings are not enabled. Check status later, or play free.
          </p>
        ) : !e.project.funded || e.stage === 3 ? (
          <p className="rounded-xl bg-muted p-4 text-sm">
            No funded work. Your company funds and progress are kept. Play free
            or check back after a new batch is funded.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {e.commissions.map((order) => {
              const selected =
                order.commission_id === c.commission?.commission_id;
              return (
                <article
                  key={order.commission_id}
                  className={`rounded-xl border p-4 ${selected ? "border-primary bg-muted" : "border-border bg-paper"}`}
                >
                  <h4 className="text-lg">{objectiveName[order.objective]}</h4>
                  <p className="mt-1 text-sm">
                    {objectiveTerms[order.objective]}
                  </p>
                  <p className="mt-2 text-sm tabular-nums">
                    {nearAmount(order.payment)} testnet NEAR ·{" "}
                    {setups.find((s) => s.id === order.setup_ids[0])?.name}
                  </p>
                  {!order.available && (
                    <p className="mt-2 text-xs text-secondary">
                      Reserved by another company.
                    </p>
                  )}
                  <button
                    className="mt-3"
                    aria-pressed={selected}
                    disabled={
                      c.busy || !order.available || !!company?.active_job
                    }
                    onClick={() => {
                      c.selectCommission(order.commission_id);
                      setConfig({ ...config, setup_id: order.setup_ids[0]! });
                    }}
                  >
                    {selected ? "Selected" : "Choose work"}
                  </button>
                  {selected && (
                    <label className="mt-3 grid gap-1 text-sm">
                      Route
                      <select
                        disabled={c.busy}
                        className="min-h-11 min-w-0 rounded-lg border border-border bg-paper px-2"
                        value={
                          order.setup_ids.includes(config.setup_id)
                            ? config.setup_id
                            : ""
                        }
                        onChange={(event) =>
                          setConfig({ ...config, setup_id: event.target.value })
                        }
                      >
                        <option value="" disabled>
                          Choose a route
                        </option>
                        {order.setup_ids.map((id) => (
                          <option key={id} value={id}>
                            {setups.find((s) => s.id === id)?.variant ?? id}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
