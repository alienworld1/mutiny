import OwnerControls from "./OwnerControls";
import { useState } from "react";
import * as engine from "../game/engine";
import { packages } from "../game/types";
import type { Configuration, Setup } from "../game/types";
import { nearAmount, registryId } from "./jobs";
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
  if (!c.enabled) return <button onClick={c.show}>Contract Job</button>;
  const config =
    c.worker && c.worker.token.owner_id !== c.account
      ? { ...draftConfig, package_option: c.worker.offer?.package_option ?? 0 }
      : draftConfig;

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
      (c.worker.paid_enabled &&
        c.worker.offer?.package_option === config.package_option)) &&
    !unknown;
  return (
    <section
      aria-label="Contract Job"
      className="my-5 space-y-4 rounded-2xl border border-border bg-paper p-5 sm:p-6"
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
      <p role="status" aria-live="polite" className="font-semibold">
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
      {!inBattle && c.worker && (
        <div className="text-sm text-secondary">
          <p>
            <strong className="text-foreground">Rook · Courier</strong> ·{" "}
            {c.worker.status.replaceAll("_", " ")}
          </p>
          <p className="break-all">Owner: {c.worker.token.owner_id}</p>
          <p className="break-all">Worker: {c.worker.worker_account}</p>
        </div>
      )}
      {!inBattle && c.worker?.offer && (
        <p className="text-sm">
          Not On The Fire · Fee {nearAmount(c.worker.quote!)} testnet NEAR ·
          Floor {nearAmount(c.worker.offer.floor_ask)} · Drops{" "}
          {nearAmount(c.worker.offer.discount_step)} every 120 idle blocks, up
          to 3 times.
        </p>
      )}
      {!inBattle && c.worker && !c.worker.offer && (
        <p className="text-sm text-secondary">No shift is advertised.</p>
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
                Payment pending. Rook is reserved. Play begins after the worker
                receives the fee.
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
      {!inBattle && canOpen && preview && unit && (
        <div className="space-y-4 border-t border-border pt-4">
          <p className="text-secondary">Use your Rook NFT for one shift.</p>
          <div className="flex flex-wrap gap-4">
            <label className="grid min-w-0 max-w-full gap-1 text-sm">
              Job
              <select
                className="min-h-11 max-w-full rounded-lg border border-border bg-paper px-3"
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
            <label className="grid min-w-0 max-w-full gap-1 text-sm">
              Fine print
              <select
                className="min-h-11 max-w-full rounded-lg border border-border bg-paper px-3"
                value={config.package_option}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    package_option: Number(e.target.value),
                  })
                }
              >
                <option value={0}>Not On The Fire</option>
                {c.worker!.token.owner_id === c.account && (
                  <option value={1}>Within Shouting Distance</option>
                )}
              </select>
            </label>
            <label className="grid min-w-0 max-w-full gap-1 text-sm">
              Placement
              <select
                className="min-h-11 max-w-full rounded-lg border border-border bg-paper px-3"
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
              ? "Rook joins your crew."
              : "Rook joins the enemy crew. Enemy orders control him until a strike earns Borrow."}{" "}
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
              : nearAmount(c.worker!.quote!)}{" "}
            testnet NEAR
            <br />
            Storage deposit: {nearAmount(c.worker!.job_storage_deposit)} testnet
            NEAR, plus wallet gas.
          </p>
          {c.worker!.token.owner_id !== c.account && (
            <p className="text-sm text-secondary">
              The Hall receives 5%; Rook receives the rest. The hire fee stays
              paid after activation, whatever the battle result.
            </p>
          )}
          <p className="text-sm text-secondary">
            Unused storage funds return after Save Job or Release worker. The
            worker stays reserved until the job closes, then rests for{" "}
            {c.worker!.cooldown_blocks} blocks.
          </p>
          <button
            disabled={c.busy}
            className="!bg-primary !text-white"
            onClick={() => c.open(config, c.worker?.quote ?? undefined)}
          >
            {c.worker!.token.owner_id === c.account ? "Reserve Rook" : "Hire"}
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
