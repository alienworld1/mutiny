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
  const [config, setConfig] = useState<Configuration>({
    setup_id: "dock-fire-intro",
    placement: "escort",
    worker: 0,
    package_option: 0,
  });
  if (!c.enabled) return <button onClick={c.show}>Contract Job</button>;
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
    c.worker.token.owner_id === c.account &&
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
          {job.status === "saved" &&
            s?.activity === "Confirmed" &&
            s.operation === "save" && (
              <p className="font-semibold text-primary">
                Job saved ·{" "}
                {job.record?.outcome === "delivered" ? "Delivered" : "Defeat"} ·
                Round {job.record?.round}
              </p>
            )}
          {job.status !== "active" && (
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
                <option value={1}>Within Shouting Distance</option>
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
            Hire fee: 0 testnet NEAR
            <br />
            Storage deposit: {nearAmount(c.worker!.job_storage_deposit)} testnet
            NEAR, plus wallet gas.
          </p>
          <p className="text-sm text-secondary">
            Unused storage funds return after Save Job or Release worker. The
            worker stays reserved until the job closes, then rests for{" "}
            {c.worker!.cooldown_blocks} blocks.
          </p>
          <button
            disabled={c.busy}
            className="!bg-primary !text-white"
            onClick={() => c.open(config)}
          >
            Reserve Rook
          </button>
        </div>
      )}
      {job &&
        job.status !== "active" &&
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
