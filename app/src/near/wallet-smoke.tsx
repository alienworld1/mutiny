import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createChainClient } from "./chain";
import type { TxSubmission } from "./chain";
import "../index.css";
const contract = "mutiny-dev-2026.testnet";
const client = import.meta.env.DEV ? createChainClient(contract) : null;
async function probeStatus(submission: TxSubmission): Promise<string> {
  const result = await client!.resolve(submission);
  if (result !== "confirmed")
    return result === "failed"
      ? "The method call failed. Inspect the receipt."
      : "Submitted. Waiting for final confirmation.";
  const count = await client!.view<unknown>("smoke_calls", {});
  if (typeof count !== "number" || count < 1)
    throw new Error("The contract did not confirm the call.");
  return `Confirmed. Registry smoke calls: ${count}.`;
}
export function Probe() {
  const [tx, setTx] = useState<TxSubmission | null>(() => {
    try {
      const saved: unknown = JSON.parse(
        sessionStorage.getItem("mutiny-probe") ?? "null",
      );
      return saved &&
        typeof saved === "object" &&
        "hash" in saved &&
        typeof saved.hash === "string" &&
        "signer" in saved &&
        typeof saved.signer === "string"
        ? { hash: saved.hash, signer: saved.signer }
        : null;
    } catch {
      return null;
    }
  });
  const [account, setAccount] = useState<string | null>(null),
    [status, setStatus] = useState(
      tx ? "Submitted. Checking final execution." : "Connect a testnet wallet.",
    ),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!tx || !client) return;
    let cancelled = false;
    void probeStatus(tx).then(
      (message) => {
        if (!cancelled) setStatus(message);
      },
      (error) => {
        if (!cancelled)
          setStatus(`${String(error)} Select Check Status to try again.`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tx]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      setStatus(
        `${String(error)} Check your wallet and transaction status before retrying.`,
      );
    } finally {
      setBusy(false);
    }
  }
  if (!client) return <p>Development probe only.</p>;
  return (
    <main className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-3xl">Testnet compatibility probe</h1>
      <p
        role="status"
        className="rounded-xl border border-border bg-muted p-4 text-lg font-bold"
      >
        {status}
      </p>
      <p>Registry: {contract}</p>
      <p>
        Calls <code>smoke</code> with zero deposit and 30 Tgas. Testnet gas
        only.
      </p>
      <p>{account}</p>
      <button
        disabled={busy}
        onClick={() =>
          void action(async () => {
            await client.connect();
            setAccount(await client.account());
            setStatus("Ready for a no-deposit smoke call.");
          })
        }
      >
        Connect
      </button>{" "}
      <button
        disabled={busy || !account || !!tx}
        onClick={() =>
          void action(async () => {
            setStatus("Awaiting signature.");
            const submission = await client.change("smoke", {}, 0n);
            setTx(submission);
            sessionStorage.setItem("mutiny-probe", JSON.stringify(submission));
            setStatus("Submitted. Checking final execution.");
          })
        }
      >
        Call Smoke
      </button>
      {tx && (
        <>
          <p>
            <a
              className="underline"
              href={`https://testnet.nearblocks.io/txns/${encodeURIComponent(tx.hash)}`}
              target="_blank"
              rel="noreferrer"
            >
              Transaction receipt
            </a>
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => setStatus(await probeStatus(tx)))
            }
          >
            Check Status
          </button>
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Probe />);
