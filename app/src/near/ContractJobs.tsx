import WorkerPortrait from "./WorkerPortrait";
import OwnerControls from "./OwnerControls";
import { useState } from "react";
import * as engine from "../game/engine";
import { packages } from "../game/types";
import type { Configuration, Setup } from "../game/types";
import { nearAmount, registryId, workerTokens, workerIndices } from "./jobs";
import type { ContractJobController } from "./useContractJob";

export default function ContractJobs({
  controller: c,
  setups,
  inBattle,
  onResume,
}: {
  controller: ContractJobController;
  setups: Setup[];
  inBattle: boolean;
  onResume: () => void;
}) {
  const [draftConfig, setConfig] = useState<Configuration>({
    setup_id: "dock-fire-intro",
    placement: "escort",
    worker: 0,
    package_option: 0,
  });
  const [findPackage, setFindPackage] = useState("fire");
  const [maximum, setMaximum] = useState("0.004");
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
  const finished = !!s?.log && !!engine.replay(s.log).state.outcome;
  const canOpen =
    c.worker?.status === "idle" &&
    !!c.account &&
    c.worker.claim?.status !== "pending" &&
    (c.worker.token.owner_id === c.account ||
      (c.worker.paid_enabled && !!offer)) &&
    !unknown;
  return (
    <section
      aria-label="Contract Job"
      className="my-5 space-y-4 break-words rounded-2xl border border-border bg-paper p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">Contract Job</h2>
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
      <p role="status" aria-live="polite" className="break-words font-semibold">
        {c.busy ? "Checking… " : ""}
        {c.notice}
      </p>
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
          <span className="ml-3 text-secondary">{s.activity}</span>
        </p>
      )}
      {!inBattle && (
        <>
          <h3 className="text-xl">Hiring Hall</h3>
          <p className="text-sm text-secondary">
            Six seeded testnet workers. Activity is demonstration data.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {c.market.map((w) => (
              <button
                key={w.token.token_id}
                disabled={c.busy}
                aria-pressed={w.token.token_id === c.worker?.token.token_id}
                className="min-w-0 !h-auto !text-left !whitespace-normal [overflow-wrap:anywhere]"
                onClick={() => c.selectWorker(w.token.token_id)}
              >
                <WorkerPortrait token={w.token.token_id} />
                <strong>
                  {w.character} · {w.role}
                </strong>
                <br />
                <span>
                  {w.claim?.status === "pending"
                    ? "Claim pending"
                    : w.status === "idle"
                      ? w.offers?.some(Boolean)
                        ? "Available"
                        : "Not advertised"
                      : w.status.replaceAll("_", " ")}
                </span>
                {w.packages.map((p, i) => (
                  <span className="mt-2 block text-sm" key={p}>
                    {packages[p as keyof typeof packages].name}:{" "}
                    {w.offers?.[i]
                      ? `${nearAmount(w.quotes![i]!)} NEAR`
                      : "Not advertised"}
                  </span>
                ))}
              </button>
            ))}
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              c.findCheapest(findPackage, maximum, (option) =>
                setConfig((current) => ({
                  ...current,
                  package_option: option,
                })),
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
          {c.worker && (
            <div className="space-y-2 text-sm">
              <WorkerPortrait token={c.worker.token.token_id} />
              <h3 className="text-xl">
                {c.worker.character} · {c.worker.role}
              </h3>
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
                      c.worker.token.token_id as (typeof workerTokens)[number],
                    )
                  ]
                }
              </p>
              <p>
                {c.worker.status.replaceAll("_", " ")}
                {c.worker.job?.status === "active"
                  ? ` · Renter: ${c.worker.job.renter_id} · ${c.worker.job.config.placement}`
                  : ""}
              </p>
              <p className="break-all">Owner: {c.worker.token.owner_id}</p>
              <p className="break-all">
                Worker:{" "}
                <a
                  className="underline"
                  href={`https://testnet.nearblocks.io/address/${c.worker.worker_account}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.worker.worker_account}
                </a>
              </p>
              {c.worker.offers?.map(
                (o, i) =>
                  o && (
                    <p key={i}>
                      {
                        packages[c.worker!.packages[i] as keyof typeof packages]
                          .name
                      }{" "}
                      · Current fee {nearAmount(c.worker!.quotes![i]!)} testnet
                      NEAR · Starts {nearAmount(o.starting_ask)} · Floor{" "}
                      {nearAmount(o.floor_ask)} · Drops{" "}
                      {nearAmount(o.discount_step)} every 120 idle blocks, at
                      most 3 times.
                    </p>
                  ),
              )}
              {c.earnings && c.worker.token.owner_id !== c.account && (
                <p>
                  Worker earnings: {nearAmount(c.earnings.claimable)} testnet
                  NEAR available · Held {nearAmount(c.earnings.balance)} ·
                  Protected reserve {nearAmount(c.earnings.reserve)} · Pending
                  credit {nearAmount(c.earnings.staged)}
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
              {c.worker.job?.accepted_fee === "0" && (
                <p>Latest shift: owner self-use · {c.worker.job.status}</p>
              )}
            </div>
          )}
        </>
      )}
      {!inBattle && <OwnerControls controller={c} />}
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
                    Local result. Ready to save on testnet.
                  </p>
                  <button
                    className="!bg-primary !text-white"
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
          {["saved", "expired"].includes(job.status) && (
            <p className="text-sm text-secondary">
              Storage used:{" "}
              {nearAmount((BigInt(job.storage_bytes) * 10n ** 19n).toString())}{" "}
              testnet NEAR.{" "}
              {job.refund_owed === "0"
                ? "Unused deposit returned."
                : job.refund_in_flight
                  ? "Unused deposit return pending."
                  : "Deposit return failed. Retry the return."}
            </p>
          )}
        </div>
      )}
      {!inBattle && c.worker && preview && unit && (
        <div className="space-y-4 border-t border-border pt-4">
          <p className="text-secondary">Choose one worker for one shift.</p>
          <div className="flex flex-wrap gap-4">
            <label className="grid min-w-0 w-full max-w-full gap-1 text-sm sm:w-auto">
              Job
              <select
                disabled={c.busy || unknown}
                className="min-h-11 min-w-0 w-full max-w-full rounded-lg border border-border bg-paper px-3"
                value={config.setup_id}
                onChange={(e) =>
                  setConfig({ ...config, setup_id: e.target.value })
                }
              >
                {setups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.variant}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 w-full max-w-full gap-1 text-sm sm:w-auto">
              Fine print
              <select
                disabled={c.busy || unknown}
                className="min-h-11 min-w-0 w-full max-w-full rounded-lg border border-border bg-paper px-3"
                value={config.package_option}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    package_option: Number(e.target.value),
                  })
                }
              >
                {c.worker!.packages.map((p, i) => (
                  <option key={p} value={i}>
                    {packages[p as keyof typeof packages].name}
                    {!c.worker!.offers?.[i] &&
                    c.worker!.token.owner_id !== c.account
                      ? " · Not advertised"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 w-full max-w-full gap-1 text-sm sm:w-auto">
              Placement
              <select
                disabled={c.busy || unknown}
                className="min-h-11 min-w-0 w-full max-w-full rounded-lg border border-border bg-paper px-3"
                value={config.placement}
                onChange={(e) =>
                  setConfig({
                    ...config,
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
              ? `${c.worker!.character} joins your crew.`
              : `${c.worker!.character} joins the enemy crew. Enemy orders control this worker until a strike earns Borrow.`}{" "}
            {packages[unit.package].special} · {packages[unit.package].clause}
          </p>
          <p className="text-sm text-secondary">
            Crew:{" "}
            {preview.setup.units
              .filter((u) => u.side === "player")
              .map((u) => `${u.name} (${u.hp} HP)`)
              .join(", ")}
            . Enemies:{" "}
            {preview.setup.units
              .filter((u) => u.side === "enemy")
              .map((u) => `${u.name} (${u.hp} HP)`)
              .join(", ")}
            .
          </p>
          <p>
            Hire fee:{" "}
            {c.worker!.token.owner_id === c.account
              ? "0"
              : quote
                ? nearAmount(quote)
                : "Unavailable"}{" "}
            testnet NEAR
            <br />
            Storage deposit: {nearAmount(c.worker!.job_storage_deposit)} testnet
            NEAR, plus wallet gas.
          </p>
          {c.worker!.token.owner_id !== c.account && (
            <p className="text-sm text-secondary">
              The Hall receives 5%; the worker receives the rest. The hire fee
              stays paid after activation, whatever the battle result.
            </p>
          )}
          <p className="text-sm text-secondary">
            Unused storage funds return after Save Job or Release worker. The
            worker stays reserved until the job closes, then rests for{" "}
            {c.worker!.cooldown_blocks} blocks.
          </p>
          <button
            disabled={c.busy || !canOpen}
            className="!bg-primary !text-white"
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
        <p className="break-all text-xs text-secondary">
          NEAR testnet · {registryId}
        </p>
      )}
    </section>
  );
}
