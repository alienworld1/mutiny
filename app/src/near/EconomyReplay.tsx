import { useEffect, useState } from "react";
import { objectiveName } from "./economy";
import EconomyStory from "./EconomyStory";
import TownScene from "./TownScene";
import { parseRecording, type Recording } from "./economyRecording";
import { nearAmount } from "./jobs";

export default function EconomyReplay() {
  const [recording, setRecording] = useState<Recording>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}demo/economy.json`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok)
          throw Error("Recording unavailable. Run pnpm demo:record first.");
        return parseRecording(await r.json());
      })
      .then(setRecording)
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Could not load recording.",
          );
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!playing || !recording) return;
    const timer = window.setTimeout(() => {
      if (index === recording.frames.length - 1) setPlaying(false);
      else setIndex(index + 1);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [playing, index, recording]);
  const frame = recording?.frames[index];
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-5 sm:p-10">
      <a href="/">Back to Mutiny</a>
      <header>
        <p className="text-sm font-semibold text-secondary">
          Accelerated local contract replay · Simulation
        </p>
        <h1 className="font-display text-4xl">A kingdom runs on deliveries.</h1>
        <p className="mt-2">
          Recorded Sandbox execution with controlled accounts. No live funds.
        </p>
      </header>
      {error && (
        <div role="alert">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              setAttempt(attempt + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {!frame && !error && <p role="status">Loading recording…</p>}
      {frame && recording && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                if (index === recording.frames.length - 1) setIndex(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setIndex(0);
              }}
            >
              Restart
            </button>
            <input
              className="min-h-11 flex-1"
              aria-label="Recorded event"
              type="range"
              min="0"
              max={recording.frames.length - 1}
              value={index}
              onChange={(e) => {
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
            />
            <span>
              {index + 1}/{recording.frames.length}
            </span>
          </div>
          <h2 aria-live="polite" className="font-display text-2xl">
            {frame.label}
          </h2>
          <p className="text-sm text-secondary">
            Chain time +
            {Math.floor(
              (Number(frame.economy.timestamp) -
                Number(recording.frames[0]!.economy.timestamp)) /
                60,
            )}{" "}
            min
          </p>
          <EconomyStory recording={recording} index={index} />
          <details className="rounded-xl border border-border p-4">
            <summary className="cursor-pointer font-semibold">
              Town records
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {frame.economy.towns.map((t, i) => (
                <article
                  key={t.town_id}
                  className="overflow-hidden rounded-xl border border-border bg-paper shadow-panel"
                >
                  <TownScene
                    policy={(["dock", "bridge", "town"] as const)[i]!}
                    supplies={t.stock.supplies}
                    incoming={t.incoming.filter(Boolean).length}
                    restored={t.stock.deliveries >= 3}
                  />
                  <div className="space-y-2 p-4">
                    <h3 className="font-display text-xl">{t.name}</h3>
                    <p>
                      {t.stock.supplies}/6 supplies · {t.stock.deliveries}{" "}
                      deliveries
                    </p>
                    <p>Treasury {nearAmount(t.unreserved)} NEAR</p>
                    <p>
                      Reserved {nearAmount(t.reserved)} · Paid{" "}
                      {nearAmount(t.paid)}
                    </p>
                    <p>
                      {frame.economy.commissions
                        .filter((c) => c.town_id === i && c.available)
                        .map(
                          (c) =>
                            `${objectiveName[c.objective]}: ${nearAmount(c.payment)} NEAR`,
                        )
                        .join(" · ") || "No funded work available"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <div className="grid gap-3 rounded-xl border border-border bg-paper p-5 sm:grid-cols-3">
              <p>
                Rook’s ask <strong>{nearAmount(frame.quote)} NEAR</strong>
                <br />
                Demand pressure {frame.pressure}/4
                <br />
                Worker earnings {nearAmount(frame.earnings)} NEAR
              </p>
              <p>
                Company funds{" "}
                <strong>
                  {nearAmount(frame.economy.company?.funds ?? "0")} NEAR
                </strong>
              </p>
              <p>
                Hall earnings <strong>{nearAmount(frame.hall)} NEAR</strong>
              </p>
            </div>
          </details>
          <details className="break-all text-sm">
            <summary>Recording evidence</summary>
            <p>
              Stock and worker quotes checked against shared Rust/WASM policies.
              Town funding conserved; delivery payments checked against verified
              settlement. This checks this scenario.
            </p>
            <p>Registry code: {recording.registryHash}</p>
            <p>Worker code: {recording.workerHash}</p>
            <a href="/demo/economy.json" download>
              Download execution snapshots
            </a>
          </details>
        </>
      )}
    </main>
  );
}
