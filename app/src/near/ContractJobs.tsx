import CrewPreview from "../game/CrewPreview";
import WorkerPortrait from "./WorkerPortrait";
import OwnerControls from "./OwnerControls";
import CompanyHome from "./CompanyHome";
import DeliveryGuide, {
  deliveryGuideKey,
  type DeliveryStep,
} from "./DeliveryGuide";
import DeliveryReceipt from "./DeliveryReceipt";
import OfferPrice from "./OfferPrice";
import { readGuidePreference, saveGuidePreference } from "../game/firstShift";
import {
  bookingAmounts,
  commissionDifference,
  objectiveName,
  objectiveTerms,
} from "./economy";
import { useState } from "react";
import * as engine from "../game/engine";
import { packages } from "../game/types";
import type { Configuration, Setup } from "../game/types";
import {
  nearAmount,
  registryId,
  workerTokens,
  workerIndices,
  legacyMarket,
  previousCompany,
  previousKingdom,
} from "./jobs";
import type { Activity } from "./jobs";
import type { ContractJobController } from "./useContractJob";

const activityLabels: Record<Activity, string> = {
  Draft: "Ready to hire",
  AwaitingSignature: "Confirm in your wallet",
  Submitted: "Submitted",
  CheckingChain: "Checking status",
  Confirmed: "Confirmed",
  Rejected: "Signature cancelled",
  Failed: "Transaction failed",
  RecoveryRequired: "Needs attention",
};

export default function ContractJobs({
  controller: c,
  setups,
  inBattle,
  onResume,
  config: draftConfig,
  setConfig,
  onCompany,
  onLearn,
}: {
  config: Configuration;
  setConfig: (config: Configuration) => void;
  controller: ContractJobController;
  setups: Setup[];
  inBattle: boolean;
  onResume: () => void;
  onCompany?: () => void;
  onLearn?: () => void;
}) {
  const [deliveryStep, setDeliveryStep] = useState<DeliveryStep>("work");
  const [guideDismissed, setGuideDismissed] = useState(
    () => readGuidePreference(deliveryGuideKey) === "skipped",
  );
  const [findPackage, setFindPackage] = useState("fire");
  const [maximum, setMaximum] = useState("0.02");
  if (!c.enabled) return <button onClick={c.show}>Contract Job</button>;
  const config = {
    ...draftConfig,
    worker: c.worker
      ? workerIndices[
          workerTokens.indexOf(
            c.worker.token.token_id as (typeof workerTokens)[number],
          )
        ]
      : 0,
  };
  const offer = c.worker?.offers?.[config.package_option];
  const quote = c.worker?.quotes?.[config.package_option];

  const s = c.session,
    job = s?.job;
  const preview = setups.length ? engine.configure(config) : null;
  const unit = preview?.setup.units[config.placement === "escort" ? 1 : 4];
  const expired =
    !!job &&
    !!c.worker &&
    job.status === "active" &&
    BigInt(c.worker.block_height) >= BigInt(job.expires_at_block);
  const unknown =
    !!s &&
    [
      "AwaitingSignature",
      "Submitted",
      "CheckingChain",
      "RecoveryRequired",
    ].includes(s.activity);
  const hasOpenJob =
    !!job &&
    ["active", "payment_pending", "recovery_pending"].includes(job.status);
  const intro =
    !inBattle &&
    !legacyMarket &&
    !previousCompany &&
    !previousKingdom &&
    !guideDismissed &&
    (!c.economy || c.economy.version === 4) &&
    BigInt(c.economy?.company?.deliveries ?? "0") === 0n;
  const guided = intro && !hasOpenJob && c.economy?.version === 4;
  const guidedJob = intro && hasOpenJob && c.economy?.version === 4;
  const step = c.commission?.available ? deliveryStep : "work";
  const finished = !!s?.log && !!engine.replay(s.log).state.outcome;
  const canOpen =
    c.worker?.status === "idle" &&
    !!c.account &&
    c.worker.claim?.status !== "pending" &&
    (c.worker.token.owner_id === c.account ||
      (c.worker.paid_enabled && !!offer)) &&
    !unknown &&
    (!c.economy ||
      (!!c.commission?.available &&
        c.commission.setup_ids.includes(config.setup_id) &&
        !c.economy.company?.active_job));
  const fee = c.worker?.token.owner_id === c.account ? "0" : (quote ?? "0");
  const amounts = bookingAmounts(
    fee,
    c.economy?.company?.funds ?? "0",
    !!c.economy && c.useCompanyFunds,
    c.worker?.job_storage_deposit ?? "0",
  );
  return (
    <section
      aria-label="Contract Job"
      className={`space-y-4 break-words bg-paper p-4 sm:p-6 ${inBattle ? "rounded-2xl border border-border shadow-panel" : ""}`}
    >
      {(guided || (intro && !c.account && !c.economy)) && (
        <DeliveryGuide
          step={step}
          onLearn={onLearn}
          hasDelivery={!!c.commission?.available}
          onStep={setDeliveryStep}
          onSkip={() => {
            saveGuidePreference(deliveryGuideKey, "skipped");
            setGuideDismissed(true);
          }}
        />
      )}
      {guidedJob && (
        <p className="border-l-2 border-primary pl-3 text-sm">
          Your delivery is booked. Choose Resume Job to play, then Save Job when
          you finish.
        </p>
      )}
      {!inBattle && !hasOpenJob && !intro && onLearn && (
        <button onClick={onLearn}>Learn Strike & Borrow</button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!guided && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[.16em] text-secondary">
              {inBattle
                ? "Contract Job"
                : c.economy
                  ? "Hiring Hall"
                  : "Contract Job"}
            </p>
            <h2 className="text-2xl">
              {inBattle
                ? "Shift record"
                : c.economy
                  ? "Your company"
                  : "Hiring Hall"}
            </h2>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!inBattle &&
            (c.account ? (
              <>
                <span className="self-center break-all text-sm">
                  {c.account}
                </span>
                <button disabled={c.busy} onClick={c.disconnect}>
                  Disconnect
                </button>
              </>
            ) : (
              <button disabled={c.busy} onClick={c.connect}>
                Connect Wallet
              </button>
            ))}
          <button disabled={c.busy} onClick={c.check}>
            Check status
          </button>
        </div>
      </div>
      {guided && !c.account && (
        <p className="text-sm text-secondary">
          Connect a NEAR testnet wallet to book. Fees and payments use test
          tokens.
        </p>
      )}
      <div
        role="status"
        aria-live="polite"
        className={
          c.busy || c.notice
            ? "rounded-lg border-l-4 border-slate bg-muted px-4 py-3 text-sm"
            : ""
        }
      >
        {c.busy ? "Checking… " : ""}
        {c.notice}
      </div>
      {c.financeTx && (
        <p className="text-sm">
          <a
            className="underline"
            target="_blank"
            rel="noreferrer"
            href={`https://testnet.nearblocks.io/txns/${encodeURIComponent(c.financeTx.hash)}`}
          >
            View account transaction
          </a>
        </p>
      )}
      {s?.tx && (
        <p className="text-sm">
          <a
            className="underline"
            href={`https://testnet.nearblocks.io/txns/${encodeURIComponent(s.tx.hash)}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction
          </a>
          <span className="ml-3 text-secondary">
            {activityLabels[s.activity]}
          </span>
        </p>
      )}
      {!inBattle && !guidedJob && (
        <>
          {previousKingdom && (
            <p className="rounded-xl bg-muted p-4 text-sm">
              Earlier test deployment. New bookings are disabled. Your funds and
              claims remain here.{" "}
              <a className="underline" href="/">
                Open the kingdom
              </a>
            </p>
          )}
          {legacyMarket && (
            <p className="rounded-xl bg-muted p-4 text-sm">
              Previous testnet deployment. These workers and earnings stay here.
              Company progress belongs to the replacement deployment.
            </p>
          )}
          {(!guided || step === "work") && (
            <>
              <CompanyHome
                controller={c}
                config={draftConfig}
                setConfig={setConfig}
                setups={setups}
                guided={guided}
              />
              {guided && (
                <button
                  disabled={c.busy || !c.commission?.available}
                  className="!border-primary !bg-primary !text-white"
                  onClick={() => setDeliveryStep("crew")}
                >
                  Choose crew
                </button>
              )}
            </>
          )}
          {(!guided || step === "crew") && (
            <>
              <div className="border-t border-border pt-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                  {c.economy ? "2 · Crew" : "One shift"}
                </p>
                <h3
                  data-delivery-heading={guided || undefined}
                  tabIndex={guided ? -1 : undefined}
                  className="mt-1 text-2xl"
                >
                  Hire your crew
                </h3>
                <p className="mt-1 text-sm text-secondary">
                  Player-owned mercenaries · Fees in testnet NEAR
                </p>
              </div>
              {c.market.length === 0 && (
                <div className="rounded-xl bg-muted p-4 text-sm">
                  <p className="font-semibold">
                    {c.busy ? "Opening the hall…" : "No workers to show"}
                  </p>
                  {!c.busy && (
                    <p className="mt-1 text-secondary">
                      Retry with Check status, or choose Free Play.
                    </p>
                  )}
                </div>
              )}
              {guided && (
                <p className="text-sm">
                  Choose one mercenary for this job. Compare their special
                  action, fine print, and fee. Each worker takes one job at a
                  time.
                </p>
              )}
              <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:grid-cols-3">
                {c.market.map((w) => (
                  <button
                    key={w.token.token_id}
                    aria-label={`${w.character} · ${w.role}`}
                    aria-describedby={`market-${w.token.token_id}`}
                    disabled={c.busy}
                    aria-pressed={w.token.token_id === c.worker?.token.token_id}
                    className="group grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 min-w-0 !h-auto !overflow-hidden !rounded-xl !border-b-4 !border-b-brass !p-3 !text-left !whitespace-normal aria-pressed:!border-primary aria-pressed:!bg-muted aria-pressed:!text-ink"
                    onClick={() => c.selectWorker(w.token.token_id)}
                  >
                    <WorkerPortrait
                      token={w.token.token_id}
                      className="row-span-4 w-16 shrink-0 rounded-t-full bg-brass/15 sm:w-20"
                    />
                    <strong className="block font-display text-xl">
                      {w.character}
                    </strong>
                    <span className="block text-xs font-normal capitalize text-secondary">
                      {w.role}
                    </span>
                    <span className="mt-1 block text-xs">
                      {w.claim?.status === "pending"
                        ? "Claim pending"
                        : w.status === "idle"
                          ? w.offers?.some(Boolean)
                            ? "Available"
                            : "Not advertised"
                          : w.status.replaceAll("_", " ")}
                    </span>
                    <span
                      id={`market-${w.token.token_id}`}
                      className="mt-1 block text-sm font-normal tabular-nums"
                    >
                      {w.offers?.some(Boolean)
                        ? `From ${nearAmount(w.quotes!.filter((q, i): q is string => q !== null && !!w.offers?.[i]).reduce((a, b) => (BigInt(a) < BigInt(b!) ? a : b!))!)} NEAR`
                        : "No offers"}
                    </span>
                  </button>
                ))}
              </div>
              <details className="rounded-xl border border-border bg-muted/50 px-4">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                  Find a lower fee
                </summary>
                <form
                  className="flex flex-wrap items-end gap-3 pb-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    c.findCheapest(findPackage, maximum, (option) =>
                      setConfig({ ...draftConfig, package_option: option }),
                    );
                  }}
                >
                  <label className="grid min-w-0 w-full max-w-full gap-1 text-sm sm:w-auto">
                    Package
                    <select
                      className="min-h-11 min-w-0 w-full max-w-full rounded-lg border border-border bg-paper px-3"
                      value={findPackage}
                      onChange={(e) => setFindPackage(e.target.value)}
                    >
                      {["fire", "shouting", "friendly"].map((p) => (
                        <option key={p} value={p}>
                          {packages[p as keyof typeof packages].name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid min-w-0 w-full max-w-full gap-1 text-sm sm:w-auto">
                    Maximum fee (NEAR)
                    <input
                      className="min-h-11 max-w-full w-36 rounded-lg border border-border bg-paper px-3"
                      inputMode="decimal"
                      value={maximum}
                      onChange={(e) => setMaximum(e.target.value)}
                    />
                  </label>
                  <button disabled={c.busy}>Find Cheapest</button>
                </form>
              </details>
              {c.worker?.status === "expired_pending" && (
                <button
                  disabled={c.busy}
                  onClick={() =>
                    c.moneyAction("expire", { job_id: c.worker!.job!.job_id })
                  }
                >
                  Release expired shift
                </button>
              )}
              {c.worker && (
                <div className="space-y-3 rounded-xl border-x border-b-4 border-brass bg-paper p-4 text-sm">
                  <div className="flex gap-4">
                    <WorkerPortrait
                      token={c.worker.token.token_id}
                      className="w-24 shrink-0 self-start rounded-t-full bg-brass/15 sm:w-32"
                    />
                    <div>
                      <h3 className="font-display text-2xl">
                        {c.worker.character}
                      </h3>
                      <p className="mb-2 text-xs capitalize text-secondary">
                        {c.worker.role}
                      </p>
                      <p>
                        {
                          [
                            "I can deliver anything except a resignation letter.",
                            "I protect the team. The team protects my lunch.",
                            "Fire is my department. Safety is outsourced.",
                            "I'll be somewhere else if you need me.",
                            "This shield is a workplace accommodation.",
                            "We can discuss this after my break.",
                          ][
                            workerTokens.indexOf(
                              c.worker.token
                                .token_id as (typeof workerTokens)[number],
                            )
                          ]
                        }
                      </p>
                      <p className="mt-2 text-xs capitalize text-secondary">
                        {c.worker.status.replaceAll("_", " ")}
                        {c.worker.job?.status === "active"
                          ? ` · Renter: ${c.worker.job.renter_id} · ${c.worker.job.config.placement}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 break-all border-t border-border pt-3 text-xs">
                    <p>NFT: {c.worker.token.token_id}</p>
                    <p>Owner: {c.worker.token.owner_id}</p>
                    <p>
                      Worker account:{" "}
                      <a
                        className="underline"
                        href={`https://testnet.nearblocks.io/address/${c.worker.worker_account}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {c.worker.worker_account}
                      </a>
                    </p>
                    {c.earnings && (
                      <p>
                        Available earnings: {nearAmount(c.earnings.claimable)}{" "}
                        testnet NEAR
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {c.worker.packages.map((p, i) => {
                      const fine = packages[p as keyof typeof packages];
                      return (
                        <button
                          key={p}
                          disabled={c.busy || unknown}
                          aria-pressed={config.package_option === i}
                          onClick={() =>
                            setConfig({ ...draftConfig, package_option: i })
                          }
                          className="!p-3 text-left aria-pressed:!border-primary aria-pressed:!bg-paper aria-pressed:!text-ink"
                        >
                          <span className="block text-xs font-normal text-secondary">
                            {fine.name}
                          </span>
                          <span className="mt-1 block font-display text-lg">
                            {fine.special}
                          </span>
                          <span className="mt-1 block text-sm font-normal text-secondary">
                            {fine.clause}
                          </span>
                          <span className="mt-3 block text-sm tabular-nums">
                            {c.worker!.offers?.[i]
                              ? `${nearAmount(c.worker!.quotes![i]!)} testnet NEAR`
                              : "Not advertised"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {offer && (
                    <OfferPrice offer={offer} block={c.worker.block_height} />
                  )}
                  {c.worker.job && c.worker.job.accepted_fee !== "0" && (
                    <p className="text-xs text-secondary">
                      Last booked fee: {nearAmount(c.worker.job.accepted_fee)}{" "}
                      NEAR. The current quote is for the next hire.
                    </p>
                  )}
                  <details className="border-t border-border pt-1">
                    <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                      Hire details
                    </summary>
                    {c.worker.offers?.map(
                      (o, i) =>
                        o && (
                          <section
                            key={i}
                            className="mt-4 border-t border-border pt-3"
                          >
                            <h4 className="font-semibold">
                              {
                                packages[
                                  c.worker!.packages[i] as keyof typeof packages
                                ].name
                              }
                            </h4>
                            <p className="mt-1 text-xs text-secondary">
                              {o.automatic
                                ? "Automatic pricing"
                                : "Manual pricing"}{" "}
                              · testnet NEAR
                            </p>
                            <dl className="my-3 grid grid-cols-2 gap-3 sm:grid-cols-3 tabular-nums">
                              <div>
                                <dt className="text-xs text-secondary">
                                  Current fee
                                </dt>
                                <dd>{nearAmount(c.worker!.quotes![i]!)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-secondary">
                                  Starting fee
                                </dt>
                                <dd>{nearAmount(o.starting_ask)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-secondary">
                                  Floor
                                </dt>
                                <dd>{nearAmount(o.floor_ask)}</dd>
                              </div>
                              {o.automatic && (
                                <>
                                  <div>
                                    <dt className="text-xs text-secondary">
                                      Ceiling
                                    </dt>
                                    <dd>{nearAmount(o.automatic.ceiling)}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-secondary">
                                      Demand pressure
                                    </dt>
                                    <dd>{o.automatic.pressure}/4</dd>
                                  </div>
                                </>
                              )}
                            </dl>
                            <p className="text-xs text-secondary">
                              Idle discount: {nearAmount(o.discount_step)} every
                              120 blocks, up to {o.automatic ? 4 : 3} times.
                            </p>
                          </section>
                        ),
                    )}
                    {c.earnings && c.worker.token.owner_id !== c.account && (
                      <p>
                        Worker earnings: {nearAmount(c.earnings.claimable)}{" "}
                        testnet NEAR available · Held{" "}
                        {nearAmount(c.earnings.balance)} · Protected reserve{" "}
                        {nearAmount(c.earnings.reserve)} · Pending credit{" "}
                        {nearAmount(c.earnings.staged)}
                      </p>
                    )}
                    <details>
                      <summary>Recent paid hires</summary>
                      {c.worker.recent_paid_hires?.length ? (
                        c.worker.recent_paid_hires.map((j) => (
                          <p key={j.job_id}>
                            Job {j.job_id} · {nearAmount(j.accepted_fee)} NEAR ·{" "}
                            {j.config.setup_id} · {j.config.placement} ·{" "}
                            {
                              packages[
                                c.worker!.packages[
                                  j.config.package_option
                                ] as keyof typeof packages
                              ].name
                            }{" "}
                            · Booked at block {j.created_at_block} · {j.status}
                            {j.record ? ` · ${j.record.outcome}` : ""}
                          </p>
                        ))
                      ) : (
                        <p>No confirmed paid hires.</p>
                      )}
                    </details>
                  </details>
                  {c.worker.job?.accepted_fee === "0" && (
                    <p>Latest shift: owner self-use · {c.worker.job.status}</p>
                  )}
                </div>
              )}
              {guided && (
                <button
                  disabled={c.busy || !c.worker || c.worker.status !== "idle"}
                  className="!border-primary !bg-primary !text-white"
                  onClick={() => setDeliveryStep("review")}
                >
                  Review delivery
                </button>
              )}
            </>
          )}
        </>
      )}
      {!inBattle && c.worker?.token.owner_id === c.account && (
        <details className="rounded-xl border border-border bg-muted/40 px-4">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Owner tools
          </summary>
          <OwnerControls controller={c} />
        </details>
      )}
      {job && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm">
            Job {job.job_id} · {job.config.placement} ·{" "}
            {setups.find((x) => x.id === job.config.setup_id)?.variant ??
              job.config.setup_id}
          </p>
          <p className="text-sm text-secondary">
            Lease ends at testnet block {job.expires_at_block}
            {c.worker ? ` · Current block ${c.worker.block_height}` : ""}
          </p>
          {["payment_pending", "recovery_pending"].includes(job.status) && (
            <div className="flex flex-wrap gap-3">
              <p className="w-full text-sm">
                Payment pending. The worker is reserved. Play begins after the
                worker receives the fee.
              </p>
              <button
                disabled={c.busy}
                onClick={() =>
                  c.moneyAction("reconcile_payment", { job_id: job.job_id })
                }
              >
                Check payment
              </button>
              {job.status === "payment_pending" ? (
                <button
                  disabled={c.busy}
                  onClick={() =>
                    c.moneyAction("cancel_pending_hire", { job_id: job.job_id })
                  }
                >
                  Cancel hire
                </button>
              ) : (
                <button
                  disabled={c.busy}
                  onClick={() =>
                    c.moneyAction("retry_credit_return", { job_id: job.job_id })
                  }
                >
                  Retry credit return
                </button>
              )}
            </div>
          )}
          {!inBattle && job.accepted_fee !== "0" && (
            <p className="text-sm">
              Hire fee: {nearAmount(job.accepted_fee)} testnet NEAR · Worker
              credit: {job.credit_status ?? "checking"}
            </p>
          )}
          {job.accepted_fee !== "0" &&
            job.credit_status !== "finalized" &&
            ["active", "saved", "expired", "cancelled"].includes(
              job.status,
            ) && (
              <button
                disabled={c.busy}
                onClick={() =>
                  c.moneyAction("reconcile_payment", { job_id: job.job_id })
                }
              >
                Check worker credit
              </button>
            )}
          {job.status === "active" && !expired && (
            <div className="flex flex-wrap items-center gap-3">
              {!inBattle && !unknown && (
                <button disabled={c.busy} onClick={onResume}>
                  {finished ? "View result" : "Resume Job"}
                </button>
              )}
              {finished && (
                <>
                  <p className="text-sm text-secondary">
                    Local result. Save Job checks the delivery terms before
                    supplies or payment are sent.
                  </p>
                  <button
                    className="!border-primary !bg-primary !text-white"
                    disabled={c.busy || unknown || c.account !== job.renter_id}
                    onClick={c.save}
                  >
                    {s?.activity === "Failed" ? "Retry Save Job" : "Save Job"}
                  </button>
                </>
              )}
            </div>
          )}
          {expired && (
            <button
              disabled={c.busy || (unknown && s?.operation === "expire")}
              onClick={c.expire}
            >
              Release worker
            </button>
          )}
          {job.status === "cancelled" && (
            <p className="text-sm">
              {job.refund_owed === "0"
                ? "Hire fee and storage deposit returned."
                : job.refund_in_flight
                  ? "Hire fee and storage refund pending."
                  : "Refund failed. Retry the return."}
            </p>
          )}
          {job.status === "saved" &&
            s?.activity === "Confirmed" &&
            s.operation === "save" && (
              <p className="font-semibold text-primary">
                Job saved ·{" "}
                {job.record?.outcome === "delivered" ? "Delivered" : "Defeat"} ·
                Round {job.record?.round}
              </p>
            )}
          {job.employment &&
            ["saved", "expired"].includes(job.status) &&
            s?.activity === "Confirmed" && (
              <DeliveryReceipt
                job={job}
                economy={c.economy}
                owner={
                  c.worker?.token.token_id === job.token_id
                    ? c.worker.token.owner_id
                    : undefined
                }
                onCompany={onCompany}
              />
            )}
          {["saved", "expired"].includes(job.status) && (
            <p className="text-sm text-secondary">
              {(!job.employment || s?.activity !== "Confirmed") && (
                <>
                  Storage used:{" "}
                  {nearAmount(
                    (BigInt(job.storage_bytes) * 10n ** 19n).toString(),
                  )}{" "}
                  testnet NEAR.{" "}
                </>
              )}
              {job.refund_owed === "0"
                ? "Unused deposit returned."
                : job.refund_in_flight
                  ? "Unused deposit return pending."
                  : "Deposit return failed. Retry the return."}
            </p>
          )}
        </div>
      )}
      {!inBattle &&
        !guidedJob &&
        (!guided || step === "review") &&
        c.worker &&
        preview &&
        unit && (
          <div className="space-y-4 border-t border-border pt-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                {c.economy ? "3 · Review" : "Review"}
              </p>
              <h3
                data-delivery-heading={guided || undefined}
                tabIndex={guided ? -1 : undefined}
                className="mt-1 text-2xl"
              >
                Your shift
              </h3>
              {guided && (
                <p className="mt-2 text-sm text-secondary">
                  Your first booking starts your company. The battle uses the
                  same rules as Free Play.
                </p>
              )}
            </div>
            {c.economy &&
              (c.commission ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted p-4">
                  <div>
                    <h4 className="font-semibold">
                      {objectiveName[c.commission.objective]}
                    </h4>
                    <p className="mt-1 text-sm text-secondary">
                      {objectiveTerms[c.commission.objective]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-secondary">Delivery payment</p>
                    <p className="font-display text-xl tabular-nums">
                      {nearAmount(c.commission.payment)}{" "}
                      <span className="font-ui text-xs">testnet NEAR</span>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-semibold">
                  Choose funded work above before hiring.
                </p>
              ))}
            <p className="text-sm font-semibold">
              {preview.setup.name} · {preview.setup.variant}
            </p>
            {guided && (
              <div className="flex items-center gap-3 border-l-2 border-brass pl-3">
                <WorkerPortrait
                  token={c.worker.token.token_id}
                  className="w-10 shrink-0"
                />
                <div>
                  <h4 className="font-display text-lg">
                    {c.worker.character} · {packages[unit.package].special}
                  </h4>
                  <p className="text-sm text-secondary">
                    {packages[unit.package].clause}
                  </p>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              <label className="grid min-w-0 w-full max-w-full gap-1 text-sm sm:w-auto">
                Placement
                <select
                  disabled={c.busy || unknown}
                  className="min-h-11 min-w-0 w-full max-w-full rounded-lg border border-border bg-paper px-3"
                  value={config.placement}
                  onChange={(e) =>
                    setConfig({
                      ...draftConfig,
                      placement: e.target.value as Configuration["placement"],
                    })
                  }
                >
                  <option value="escort">Escort</option>
                  <option value="infiltration">Infiltration</option>
                </select>
              </label>
            </div>
            <p className="text-sm">
              {config.placement === "escort"
                ? `You command ${c.worker!.character}.`
                : `${c.worker!.character} follows enemy orders. To command them, cause a strike, then use your captain to Borrow them for one activation.`}
            </p>
            {guided ? (
              <details className="text-sm">
                <summary className="min-h-11 cursor-pointer py-3">
                  View crews
                </summary>
                <CrewPreview units={preview.setup.units} />
              </details>
            ) : (
              <CrewPreview units={preview.setup.units} />
            )}
            <div className="rounded-xl border border-border bg-paper p-4">
              <dl className="space-y-2 text-sm tabular-nums">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-secondary">Hire fee</dt>
                  <dd className="font-semibold">
                    {c.worker.token.owner_id === c.account
                      ? "0"
                      : quote
                        ? nearAmount(quote)
                        : "Unavailable"}{" "}
                    testnet NEAR
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-secondary">Storage deposit</dt>
                  <dd>
                    {nearAmount(c.worker.job_storage_deposit)} testnet NEAR
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-secondary">
                Wallet gas is extra.
              </p>
              {c.economy && (
                <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={c.useCompanyFunds}
                      disabled={c.busy}
                      onChange={(event) =>
                        c.setUseCompanyFunds(event.target.checked)
                      }
                    />
                    Use company funds for this hire
                  </label>
                  <p>
                    Company funds used: {nearAmount(amounts.company)} NEAR
                    <br />
                    Wallet payment: {nearAmount(amounts.wallet)} NEAR, including
                    the storage deposit, plus gas.
                  </p>
                  {!guided && c.commission && (
                    <p>
                      Commission less hire fee:{" "}
                      {commissionDifference(c.commission.payment, fee)} NEAR,
                      before gas and retained storage.
                    </p>
                  )}
                  <p className="text-secondary">
                    Save Job checks your delivery before payment. Once the hire
                    activates, its fee stays spent if you lose or miss the
                    terms.
                  </p>
                </div>
              )}
            </div>
            {!guided && c.worker!.token.owner_id !== c.account && (
              <p className="text-sm text-secondary">
                The worker receives 95% of the fee; the Hall receives 5%.
                {!c.economy && " The hire fee stays paid if you lose."}
              </p>
            )}
            <details className="text-sm text-secondary">
              <summary className="min-h-11 cursor-pointer py-3">
                {guided ? "Fee & deposit details" : "Deposit & release"}
              </summary>
              {guided && c.commission && (
                <p className="mb-2">
                  Commission less hire fee:{" "}
                  {commissionDifference(c.commission.payment, fee)} NEAR, before
                  gas and retained storage.{" "}
                  {c.worker.token.owner_id !== c.account &&
                    "The worker receives 95% of the hire fee; the Hall receives 5%."}
                </p>
              )}
              <p>
                Unused storage funds return after Save Job or Release worker.
                The worker stays reserved until the job closes, then rests for{" "}
                {c.worker!.cooldown_blocks} blocks.
              </p>
            </details>
            {guided && !c.busy && c.account && c.worker.status !== "idle" && (
              <p className="text-sm text-danger">
                This worker is unavailable. Choose another crew member.
              </p>
            )}
            {guided &&
              !c.busy &&
              c.account &&
              c.worker.status === "idle" &&
              c.worker.token.owner_id !== c.account &&
              !offer && (
                <p className="text-sm text-danger">
                  This fine print is not advertised. Choose another offer.
                </p>
              )}
            <button
              disabled={c.busy || !canOpen}
              className="w-full !min-h-12 !border-primary !bg-primary !text-white hover:!bg-primary-hover"
              onClick={() => c.open(config, quote ?? undefined)}
            >
              {c.worker!.token.owner_id === c.account
                ? `Reserve ${c.worker!.character}`
                : "Hire"}
            </button>
          </div>
        )}
      {job &&
        ["saved", "expired", "cancelled"].includes(job.status) &&
        job.refund_owed !== "0" &&
        !job.refund_in_flight && (
          <button disabled={c.busy} onClick={c.retryRefund}>
            Retry deposit return
          </button>
        )}
      {!inBattle && (
        <details className="border-t border-border pt-2 text-xs text-secondary">
          <summary className="py-3">Testnet & previous deployments</summary>
          <div className="space-y-3 pb-3">
            <p className="break-all">NEAR testnet · {registryId}</p>
            <p className="text-sm">
              <a
                className="underline"
                href={legacyMarket ? "/" : "/?market=legacy"}
              >
                {legacyMarket
                  ? "Open the company economy"
                  : "Previous deployment: jobs and claims"}
              </a>
            </p>
            {!legacyMarket && !previousCompany && !previousKingdom && (
              <p className="text-xs text-secondary">
                <a className="underline" href="?market=company-v3">
                  Previous company: funds, jobs and claims
                </a>
              </p>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
