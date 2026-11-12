import TownScene from "./TownScene";
import type { Job } from "./jobs";
import { nearAmount } from "./jobs";
import type { Economy } from "./economy";
import { commissionDifference } from "./economy";

// The caller only mounts this after the controller confirms the saved job.
export default function DeliveryReceipt({
  job,
  economy,
  owner,
  onCompany,
}: {
  job: Job;
  economy: Economy | null;
  owner?: string;
  onCompany?: () => void;
}) {
  const employment = job.employment;
  if (!employment) return null;
  const accepted = employment.earned !== "0";
  const fee = BigInt(job.accepted_fee);
  const hallShare = fee / 20n;
  const storage = BigInt(job.storage_bytes) * 10n ** 19n;
  const town =
    economy?.version === 4 && employment.town_id !== undefined
      ? economy.towns[employment.town_id]
      : undefined;
  return (
    <section
      aria-label="Confirmed company result"
      className={`rounded-xl border bg-muted/40 p-4 sm:p-5 ${accepted ? "border-primary" : "border-border"}`}
    >
      {town && (
        <div className="-mx-4 -mt-4 mb-4 overflow-hidden rounded-t-xl sm:-mx-5 sm:-mt-5">
          <TownScene
            policy={
              (["dock", "bridge", "town"] as const)[town.town_id] ?? "town"
            }
            supplies={town.stock.supplies}
            incoming={town.incoming.filter(Boolean).length}
            restored={town.stock.deliveries >= 3}
          />
        </div>
      )}
      <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
        Confirmed on testnet
      </p>
      <h3 className="mt-1 text-2xl">
        {accepted
          ? "Delivery accepted"
          : job.status === "expired"
            ? "Job expired"
            : job.record?.outcome === "delivered"
              ? "Delivery terms not met"
              : "Delivery unfinished"}
      </h3>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-secondary">Company payment</dt>
          <dd className="mt-1 font-display text-xl tabular-nums">
            {nearAmount(employment.earned)}{" "}
            <span className="font-ui text-xs">testnet NEAR</span>
          </dd>
        </div>
        {town && (
          <>
            <div>
              <dt className="text-xs text-secondary">{town.name}</dt>
              <dd className="mt-1 font-display text-xl">
                {accepted ? "+1 supply" : "No supplies delivered"}
              </dd>
              <p className="mt-1 text-xs text-secondary">
                Current supplies {town.stock.supplies}/6
              </p>
            </div>
            <div>
              <dt className="text-xs text-secondary">Town restoration</dt>
              <dd className="mt-1 font-display text-xl">
                {town.stock.deliveries >= 3
                  ? "Restored"
                  : `${town.stock.deliveries}/3 deliveries`}
              </dd>
              {town.stock.deliveries >= 3 && (
                <p className="mt-1 text-xs text-secondary">
                  Restoration lasts. Supplies are used every 30 minutes.
                </p>
              )}
            </div>
          </>
        )}
      </dl>
      <section
        aria-label="Worker receipt"
        className="mt-4 space-y-2 border-t border-border pt-3 text-sm"
      >
        <h4 className="font-semibold">Worker receipt</h4>
        <p className="break-all">
          NFT: {job.token_id}
          {owner && ` · Current owner: ${owner}`}
        </p>
        <a
          className="block break-all underline"
          href={`https://testnet.nearblocks.io/address/${job.worker_account}`}
          target="_blank"
          rel="noreferrer"
        >
          {job.worker_account}
        </a>
        {fee === 0n ? (
          <p>Owner self-use · No hire fee.</p>
        ) : (
          <>
            <p>
              {job.credit_status === "finalized"
                ? "Credited to worker"
                : "Worker credit pending"}
              : {nearAmount((fee - hallShare).toString())} testnet NEAR
            </p>
            <p className="text-xs text-secondary">
              Hall fee: {nearAmount(hallShare.toString())} NEAR.
            </p>
          </>
        )}
      </section>
      <dl
        aria-label="Delivery costs"
        className="mt-4 space-y-2 border-t border-border pt-3 text-sm tabular-nums"
      >
        <div className="flex flex-wrap justify-between gap-2">
          <dt>Hire fee paid</dt>
          <dd>{nearAmount(job.accepted_fee)} NEAR</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt>Storage retained</dt>
          <dd>{nearAmount(storage.toString())} NEAR</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2 font-semibold">
          <dt>Payment less hire and storage</dt>
          <dd>
            {commissionDifference(
              employment.earned,
              (fee + storage).toString(),
            )}{" "}
            NEAR
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-secondary">
          <dt>Gas and withdrawal costs</dt>
          <dd>Extra · Check your wallet</dd>
        </div>
      </dl>
      <p className="mt-4 border-t border-border pt-3 text-sm">
        {accepted
          ? "Payment added to company funds. Use it for another hire or withdraw it from your company ledger."
          : "No delivery payment. The activated hire fee remains spent."}
      </p>
      <p className="mt-2 text-xs text-secondary">
        Company funds:{" "}
        {economy?.company
          ? `${nearAmount(economy.company.funds)} NEAR`
          : "Unavailable"}
      </p>
      {onCompany && (
        <button
          className="mt-4 !border-primary !bg-primary !text-white"
          onClick={onCompany}
        >
          View company
        </button>
      )}
    </section>
  );
}
