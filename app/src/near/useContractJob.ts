import { useEffect, useRef, useState } from "react";
import * as engine from "../game/engine";
import type { ActionLog, Configuration, State } from "../game/types";
import { createChainClient } from "./chain";
import type { ChainClient } from "./chain";
import {
  openingState,
  parseJob,
  parseWorker,
  parseEarnings,
  readSession,
  sameConfig,
  supportedContentHash,
  registryId,
  legacyMarket,
  verifyRecord,
  writeSession,
  yoctoAmount,
} from "./jobs";
import type { Session, Worker, Earnings } from "./jobs";
import { bookingAmounts, parseEconomy } from "./economy";
import type { Economy } from "./economy";

export function useContractJob() {
  const client = useRef<ChainClient | null>(null);
  const current = useRef<Session | null>(null);
  const lock = useRef(false);
  const viewRevision = useRef(0);
  const [session, setSession] = useState<Session | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [financeTx, setFinanceTx] = useState<{
    hash: string;
    signer: string;
  } | null>(null);
  const selected = useRef("rook");
  const checkedAccount = useRef<string | null>(null);
  const [market, setMarket] = useState<Worker[]>([]);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [economy, setEconomy] = useState<Economy | null>(null);
  const [commissionId, setCommissionId] = useState<string | null>(null);
  const [useCompanyFunds, setUseCompanyFunds] = useState(true);
  const commission =
    economy?.commissions.find((c) => c.commission_id === commissionId) ?? null;
  function chain() {
    return (client.current ??= createChainClient(registryId));
  }
  // Refresh shared opportunities without touching the player's transcript or
  // payment state machine. Wallet prompts and recovery stay explicit actions.
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let inFlight = false;
    async function refreshMarket() {
      if (lock.current || document.hidden || inFlight) return;
      inFlight = true;
      const revision = viewRevision.current;
      const requestedAccount = checkedAccount.current;
      try {
        const [workers, company] = await Promise.all([
          chain().view<unknown[]>("get_market", {}),
          legacyMarket
            ? Promise.resolve(null)
            : chain().view<unknown>("get_economy", {
                account_id: requestedAccount,
              }),
        ]);
        if (
          disposed ||
          revision !== viewRevision.current ||
          lock.current ||
          requestedAccount !== checkedAccount.current
        )
          return;
        const nextMarket = workers.map(parseWorker);
        const nextEconomy = company === null ? null : parseEconomy(company);
        if (
          nextEconomy?.company &&
          nextEconomy.company.account_id !== requestedAccount
        )
          throw Error("Company belongs to another account.");
        setMarket(nextMarket);
        setWorker(
          nextMarket.find((w) => w.token.token_id === selected.current) ?? null,
        );
        setEconomy(nextEconomy);
      } catch {
        if (!disposed && !lock.current && revision === viewRevision.current)
          setNotice("The kingdom could not refresh. Use Check status.");
      } finally {
        inFlight = false;
      }
    }
    const timer = window.setInterval(() => void refreshMarket(), 15_000);
    const visible = () => {
      if (!document.hidden) void refreshMarket();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled]);
  async function persist(next: Session) {
    await writeSession(next);
    current.current = next;
    setSession(next);
  }
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    viewRevision.current += 1;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const rejected = /reject|cancel|denied|declined/i.test(String(error));
      const saved = current.current;
      if (saved && saved.activity !== "Confirmed") {
        await persist({
          ...saved,
          activity: rejected ? "Rejected" : "RecoveryRequired",
        }).catch(() => {});
      }
      setNotice(
        rejected
          ? "Signature cancelled. Your actions are kept."
          : `${error instanceof Error ? error.message : String(error)} Use Check status to try again.`,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function check(selectedByPlayer = false) {
    const c = chain();
    await engine.loadEngine();
    const connected = await c.account();
    setAccount(connected);
    let all: Worker[];
    try {
      const [workers, company] = await Promise.all([
        c.view<unknown[]>("get_market", {}),
        legacyMarket
          ? Promise.resolve(null)
          : c.view<unknown>("get_economy", { account_id: connected }),
      ]);
      all = workers.map(parseWorker);
      const nextEconomy = company === null ? null : parseEconomy(company);
      if (nextEconomy?.company && nextEconomy.company.account_id !== connected)
        throw Error("Company belongs to another account. Reconnect.");
      setEconomy(nextEconomy);
    } catch (error) {
      setMarket([]);
      setWorker(null);
      setEarnings(null);
      setEconomy(null);
      throw error;
    }
    setMarket(all);
    let saved = connected ? await readSession(connected) : null;
    if (
      connected &&
      checkedAccount.current !== connected &&
      !selectedByPlayer
    ) {
      const active = all.filter(
        (w) =>
          w.job?.renter_id === connected &&
          ["active", "payment_pending", "recovery_pending"].includes(
            w.job.status,
          ),
      );
      selected.current =
        active.find((w) => w.token.token_id === saved?.job?.token_id)?.token
          .token_id ??
        active[0]?.token.token_id ??
        saved?.job?.token_id ??
        selected.current;
    }
    checkedAccount.current = connected;
    const market = all.find((w) => w.token.token_id === selected.current);
    if (!market) throw new Error("Selected worker is unavailable");
    setWorker(market);
    if (market.paid_enabled !== undefined)
      setEarnings(
        parseEarnings(await c.view("accounting", {}, market.worker_account)),
      );
    const storedTx = connected
      ? localStorage.getItem(`${registryId}:${connected}:finance`)
      : null;
    setFinanceTx(storedTx ? JSON.parse(storedTx) : null);
    // Keep a separate action log per job when this wallet has several workers.
    if (
      market.job?.renter_id === connected &&
      saved?.job?.job_id !== market.job.job_id &&
      ["active", "payment_pending", "recovery_pending"].includes(
        market.job.status,
      )
    ) {
      saved = connected
        ? await readSession(connected, market.token.token_id)
        : null;
      if (saved?.job?.job_id !== market.job.job_id) saved = null;
    }
    current.current = saved;
    setSession(saved);
    if (!connected) {
      setNotice("Connect a testnet wallet to use your worker.");
      return;
    }
    if (
      !saved &&
      market.job?.renter_id === connected &&
      ["active", "payment_pending", "recovery_pending"].includes(
        market.job.status,
      )
    ) {
      const job = market.job;
      const opening = await openingState(
        job,
        await c.view("get_opening", { job_id: job.job_id }),
      );
      saved = {
        contract: registryId,
        account: connected,
        config: job.config,
        previous_job_id: null,
        job,
        log: opening.log,
        activity: job.status === "active" ? "Confirmed" : "RecoveryRequired",
        operation: "open",
        tx: null,
      };
      await persist(saved);
      setNotice(
        job.status === "active"
          ? "Your reservation is active. No saved moves were found on this browser."
          : "Payment pending. Check payment or cancel before activation.",
      );
      return;
    }
    if (!saved) {
      setNotice(
        market.claim?.status === "pending"
          ? "Claim pending. Check claim status."
          : market.status !== "idle"
            ? `${market.character} is unavailable. Check the current shift.`
            : market.token.owner_id === connected
              ? `${market.character} is ready when you are.`
              : market.offers?.some(Boolean)
                ? `${market.character} has a shift available.`
                : "No shift is advertised.",
      );
      return;
    }
    const jobId =
      saved.job?.job_id ??
      (market.job &&
      market.job.job_id !== saved.previous_job_id &&
      market.job.renter_id === connected
        ? market.job.job_id
        : null);
    await persist({ ...saved, activity: "CheckingChain" });
    if (jobId !== null) {
      const job = parseJob(await c.view("get_job", { job_id: jobId }));
      if (
        job.renter_id !== connected ||
        !sameConfig(job.config, saved.config) ||
        (saved.accepted_fee !== undefined &&
          job.accepted_fee !== saved.accepted_fee)
      )
        throw new Error("The reservation does not match this job");
      if (
        ["payment_pending", "recovery_pending", "cancelled"].includes(
          job.status,
        )
      ) {
        await persist({
          ...saved,
          job,
          activity:
            job.status === "cancelled" && job.refund_owed === "0"
              ? "Confirmed"
              : "RecoveryRequired",
        });
        setNotice(
          job.status === "cancelled"
            ? job.refund_owed === "0"
              ? "Hire cancelled. Fee and storage deposit returned."
              : "Hire cancelled. Your refund is pending."
            : "Hire needs attention. Check payment or cancel before activation.",
        );
        return;
      }
      const opening = await openingState(
        job,
        await c.view("get_opening", { job_id: jobId }),
      );
      const log = saved.log ?? opening.log;
      if (!sameConfig(log.config, job.config))
        throw new Error("Saved actions have a different setup");
      engine.replay(log);
      if (job.status === "saved") {
        await verifyRecord(
          job,
          log,
          await c.view("get_job_record", { job_id: jobId }),
        );
        await persist({
          ...saved,
          job,
          log,
          activity: "Confirmed",
          operation: "save",
        });
        setNotice("Job saved");
        return;
      }
      if (job.status === "expired") {
        await persist({
          ...saved,
          job,
          log,
          activity: "Confirmed",
          operation: "expire",
        });
        setNotice("Lease expired. No battle result was saved.");
        return;
      }
      if (BigInt(market.block_height) >= BigInt(job.expires_at_block)) {
        await persist({ ...saved, job, log, activity: "RecoveryRequired" });
        setNotice(
          "Lease expired. Release the worker to return unused storage funds.",
        );
        return;
      }
      if (saved.operation === "save" && saved.tx) {
        const status = await c.resolve(saved.tx);
        await persist({
          ...saved,
          job,
          log,
          activity: status === "failed" ? "Failed" : "Submitted",
        });
        setNotice(
          status === "failed"
            ? "Save failed. Your actions are kept. You can Retry."
            : "Submitted. Waiting for the Registry to confirm.",
        );
        return;
      }
      await persist({ ...saved, job, log, activity: "Confirmed" });
      setNotice("Reservation confirmed. Your job is ready.");
      return;
    }
    if (saved.tx) {
      const status = await c.resolve(saved.tx);
      await persist({
        ...saved,
        activity: status === "failed" ? "Failed" : "Submitted",
      });
      setNotice(
        status === "failed"
          ? "Reservation failed. You can Retry."
          : "Submitted. Waiting for the Registry to confirm.",
      );
    } else if (
      [
        "AwaitingSignature",
        "RecoveryRequired",
        "Submitted",
        "CheckingChain",
      ].includes(saved.activity)
    ) {
      await persist({ ...saved, activity: "RecoveryRequired" });
      setNotice(
        "No reservation is confirmed. Check your wallet activity before trying again.",
      );
    } else {
      await persist(saved);
      setNotice("Choose your next job.");
    }
  }
  function show() {
    setEnabled(true);
    void run(check);
  }
  async function signer(expected: string) {
    const actual = await chain().account();
    setAccount(actual);
    if (actual !== expected)
      throw new Error(
        `Connect ${expected} to sign this job. Your saved actions are kept.`,
      );
  }
  function connect() {
    void run(async () => {
      await chain().connect();
      await check();
    });
  }
  function disconnect() {
    void run(async () => {
      await chain().disconnect();
      setAccount(null);
      current.current = null;
      setSession(null);
      setEconomy(null);
      setCommissionId(null);
      setNotice("Wallet disconnected. Your saved actions are kept.");
    });
  }
  function open(config: Configuration, acceptedQuote?: string) {
    void run(async () => {
      if (!account) throw new Error("Connect a testnet wallet");
      await signer(account);
      const market = parseWorker(
        await chain().view("get_worker", { token_id: selected.current }),
      );
      setWorker(market);
      const owned = market.token.owner_id === account;
      const fee = owned ? "0" : (acceptedQuote ?? "0");
      let booking;
      const amounts = bookingAmounts(
        fee,
        economy?.company?.funds ?? "0",
        !!economy && useCompanyFunds,
        market.job_storage_deposit,
      );
      if (economy) {
        if (
          !commission?.available ||
          !commission.setup_ids.includes(config.setup_id)
        )
          throw Error("Choose available work for this setup first.");
        if (
          economy.company?.active_job !== null &&
          economy.company?.active_job !== undefined
        )
          throw Error("Finish the current company job first.");
        booking = {
          commission_id: commission.commission_id,
          dispatch_id: commission.dispatch_id,
          expected_terms: commission.terms_hash,
          company_contribution: amounts.company,
        };
      }
      if (market.status !== "idle" || market.claim?.status === "pending")
        throw new Error("This worker is unavailable. Check status.");
      if (
        !owned &&
        (!market.paid_enabled ||
          !market.offers?.[config.package_option] ||
          market.quotes?.[config.package_option] !== acceptedQuote)
      )
        throw new Error(
          "Price or availability changed. Review the current price and Hire again.",
        );
      if (market.content_hash !== (await supportedContentHash()))
        throw new Error(
          "The game content changed. Update this app before reserving a worker.",
        );
      const saved = current.current;
      if (
        saved &&
        [
          "AwaitingSignature",
          "Submitted",
          "CheckingChain",
          "RecoveryRequired",
        ].includes(saved.activity)
      )
        throw new Error(
          "Check the previous request before opening another job",
        );
      const next: Session = {
        contract: registryId,
        account,
        config,
        previous_job_id: market.job?.job_id ?? null,
        accepted_fee: owned ? "0" : acceptedQuote,
        job: null,
        log: null,
        activity: "AwaitingSignature",
        operation: "open",
        tx: null,
      };
      await persist({ ...next, activity: "Draft" });
      await persist(next);
      setNotice(
        owned
          ? "Awaiting signature. Storage deposit only."
          : "Awaiting signature. Hire fee plus storage deposit.",
      );
      const tx = await chain().change(
        owned ? "open_owned_job" : "hire_and_open",
        {
          token_id: market.token.token_id,
          package_option: config.package_option,
          placement: config.placement,
          setup_id: config.setup_id,
          expected_content_hash: market.content_hash,
          ...(!owned ? { expected_quote: acceptedQuote } : {}),
          ...(booking ? { commission: booking } : {}),
        },
        BigInt(amounts.wallet),
        account,
      );
      await persist({ ...next, activity: "Submitted", tx });
      setNotice("Submitted. Checking the Registry.");
      await check();
    });
  }
  function moneyAction(
    method:
      | "nft_transfer"
      | "set_auto_offer"
      | "fund_town"
      | "expire"
      | "set_offer"
      | "withdraw_offer"
      | "request_claim"
      | "reconcile_claim"
      | "reconcile_payment"
      | "cancel_pending_hire"
      | "retry_credit_return"
      | "withdraw_company_funds",
    args: Record<string, unknown> = {},
    deposit = 0n,
  ) {
    void run(async () => {
      if (!account) throw new Error("Connect a testnet wallet");
      await signer(account);
      const tx = await chain().change(
        method,
        { token_id: selected.current, ...args },
        method === "nft_transfer" ? 1n : deposit,
        account,
      );
      localStorage.setItem(
        `${registryId}:${account}:finance`,
        JSON.stringify(tx),
      );
      setFinanceTx(tx);
      await check();
      const market = parseWorker(
        await chain().view("get_worker", { token_id: selected.current }),
      );
      setWorker(market);
      if (method === "fund_town") {
        const status = await chain().resolve(tx);
        setNotice(
          status === "confirmed"
            ? "Contribution confirmed."
            : status === "failed"
              ? "Contribution failed. Check status."
              : "Contribution submitted. Check status before contributing again.",
        );
      } else if (method === "request_claim" || method === "reconcile_claim")
        setNotice(
          market.claim?.status === "paid"
            ? "Earnings claimed"
            : market.claim?.status === "failed"
              ? "Claim failed. Funds remain in the worker account."
              : "Claim pending. Check claim status.",
        );
      else if (method === "nft_transfer") {
        const status = await chain().resolve(tx);
        setNotice(
          status === "confirmed" && market.token.owner_id === args.receiver_id
            ? "New owner confirmed"
            : status === "failed"
              ? "Transfer not completed. Check status."
              : "Transfer pending. Check status.",
        );
      } else if (
        method === "set_offer" ||
        method === "set_auto_offer" ||
        method === "withdraw_offer"
      ) {
        const status = await chain().resolve(tx);
        setNotice(
          status === "confirmed"
            ? method !== "withdraw_offer"
              ? "Offer posted"
              : "Offer withdrawn"
            : status === "failed"
              ? "Offer change failed. Retry."
              : "Offer change submitted. Check status.",
        );
      }
    });
  }
  async function persistLog(log: ActionLog) {
    const saved = current.current;
    if (
      !saved?.job ||
      saved.job.status !== "active" ||
      saved.activity !== "Confirmed" ||
      saved.operation !== "open"
    )
      throw new Error("Check this Contract Job before making another move");
    if (!sameConfig(saved.config, log.config))
      throw new Error("Job configuration mismatch");
    await persist({ ...saved, log });
  }
  function save() {
    void run(async () => {
      const saved = current.current;
      if (!saved?.job || !saved.log || !engine.replay(saved.log).state.outcome)
        throw new Error("Finish the job before saving");
      if (!["Confirmed", "Rejected", "Failed"].includes(saved.activity))
        throw new Error("Check the previous Save Job request first");
      await signer(saved.account);
      const job = parseJob(
        await chain().view("get_job", { job_id: saved.job.job_id }),
      );
      if (job.status !== "active") {
        await check();
        return;
      }
      await persist({
        ...saved,
        activity: "AwaitingSignature",
        operation: "save",
        tx: null,
      });
      setNotice("Awaiting signature. Your local result is kept.");
      const tx = await chain().change(
        "settle",
        { job_id: job.job_id, action_log: JSON.stringify(saved.log) },
        0n,
        saved.account,
      );
      await persist({ ...saved, activity: "Submitted", operation: "save", tx });
      setNotice("Submitted. Checking the Registry.");
      await check();
    });
  }
  function expire() {
    void run(async () => {
      const saved = current.current;
      if (!saved?.job) return;
      await signer(saved.account);
      await persist({
        ...saved,
        activity: "AwaitingSignature",
        operation: "expire",
        tx: null,
      });
      const tx = await chain().change(
        "expire",
        { job_id: saved.job.job_id },
        0n,
        saved.account,
      );
      await persist({
        ...saved,
        activity: "Submitted",
        operation: "expire",
        tx,
      });
      await check();
    });
  }
  function retryRefund() {
    void run(async () => {
      const saved = current.current;
      if (!saved?.job || saved.job.status === "active") return;
      await signer(saved.account);
      await chain().change(
        "retry_storage_refund",
        { job_id: saved.job.job_id },
        0n,
        saved.account,
      );
      await check();
    });
  }
  async function resume(): Promise<State> {
    await check();
    const saved = current.current;
    if (
      !saved?.job ||
      !saved.log ||
      saved.job.status !== "active" ||
      saved.activity !== "Confirmed"
    )
      throw new Error("No active job is ready to resume");
    return engine.replay(saved.log).state;
  }
  return {
    economy,
    commission,
    selectCommission: setCommissionId,
    useCompanyFunds,
    setUseCompanyFunds,
    market,
    selectWorker: (token: string) => {
      if (lock.current) return;
      selected.current = token;
      setEarnings(null);
      void run(() => check(true));
    },
    findCheapest: (
      packageId: string,
      maximum: string,
      onFound: (option: number) => void,
    ) =>
      void run(async () => {
        const found = await chain().view<unknown>("find_cheapest", {
          package: packageId,
          max_price: yoctoAmount(maximum).toString(),
        });
        if (!found) {
          setNotice("No available offer within that fee.");
          return;
        }
        const w = parseWorker(found);
        selected.current = w.token.token_id;
        onFound(w.packages.indexOf(packageId));
        await check(true);
        setNotice(
          `${w.character} selected. Review the package and fee before Hire.`,
        );
      }),
    enabled,
    earnings,
    financeTx,
    moneyAction,
    session,
    worker,
    account,
    busy,
    notice,
    show,
    connect,
    disconnect,
    open,
    save,
    expire,
    resume,
    persistLog,
    retryRefund,
    check: () => void run(check),
  };
}
export type ContractJobController = ReturnType<typeof useContractJob>;
