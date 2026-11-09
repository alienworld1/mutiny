import { useEffect, useRef, type ReactNode } from "react";
import WorkerPortrait from "../near/WorkerPortrait";
import * as engine from "./engine";
import { packages, outcomeText } from "./types";
import type { Configuration, Setup } from "./types";
import type { Progress, Summary } from "./storage";
import { goalNames } from "./storage";
export function ResultLine({
  label,
  result,
}: {
  label: string;
  result?: Summary;
}) {
  if (!result) return null;
  return (
    <p className="text-sm text-secondary">
      <strong>{label}:</strong> {outcomeText(result.outcome)} · Round{" "}
      {result.rounds} · Cart {result.cart}/2 · {result.strikes} strikes ·{" "}
      {result.borrowed ? "Borrow" : "No Borrow"}
      <br />
      {result.crew} · {result.placement}
    </p>
  );
}
export default function JobBoard({
  setups,
  progress,
  onPlay,
  config,
  setConfig,
  preparation,
  onPreparation,
  contractPanel,
}: {
  config: Configuration;
  setConfig: (config: Configuration) => void;
  preparation: "free" | "contract";
  onPreparation: (mode: "free" | "contract") => void;
  contractPanel: ReactNode;
  setups: Setup[];
  progress: Progress;
  onPlay: (config: Configuration) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, []);
  const assembled = engine.configure(config);
  const specialist =
    assembled.setup.units[config.placement === "escort" ? 1 : 4]!;
  return (
    <section aria-label="Job Board">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[.2em] text-secondary">
            Royal Payroll Office
          </p>
          <h1 ref={heading} tabIndex={-1} className="text-4xl">
            Choose your shift
          </h1>
        </div>
        {preparation === "contract" && (
          <button onClick={() => onPlay(config)}>Play Free</button>
        )}
        <a
          href="#ledger"
          className="py-3 text-sm underline decoration-border underline-offset-4"
        >
          Captain's Ledger
        </a>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Jobs" className="space-y-3">
          {["Dock Fire", "Bridge Audit", "Friday, Again"].map((name, i) => (
            <article
              key={name}
              className={`overflow-hidden rounded-2xl border bg-paper ${assembled.setup.name === name ? "border-primary shadow-panel" : "border-border"}`}
            >
              <div className="relative h-24 overflow-hidden">
                <img
                  src={`/assets/art/${["dock", "bridge", "town"][i]}.webp`}
                  alt=""
                  className="h-full w-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
                <h2 className="absolute bottom-3 left-4 text-2xl text-white">
                  {name}
                </h2>
              </div>
              <div className="flex flex-wrap gap-1 p-3">
                {setups
                  .filter((s) => s.name === name)
                  .map((s) => (
                    <button
                      key={s.id}
                      className="!min-h-10 !flex-1 !px-2 !py-2 text-sm"
                      aria-pressed={config.setup_id === s.id}
                      onClick={() => setConfig({ ...config, setup_id: s.id })}
                    >
                      {s.variant}
                      {progress.ledger[s.id]?.completions ? " ✓" : ""}
                    </button>
                  ))}
              </div>
            </article>
          ))}
        </nav>
        <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-paper shadow-panel">
          <div className="relative h-40 overflow-hidden sm:h-48">
            <img
              src={`/assets/art/${assembled.setup.name === "Dock Fire" ? "dock" : assembled.setup.name === "Bridge Audit" ? "bridge" : "town"}.webp`}
              alt=""
              className="h-full w-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/20 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 text-white">
              <p className="mb-1 text-xs uppercase tracking-[.2em]">
                {assembled.setup.name}
              </p>
              <h2 className="text-3xl">{assembled.setup.variant}</h2>
            </div>
          </div>
          <div className="border-b border-border px-5 py-4">
            <p>{assembled.setup.description}</p>
            <p className="mt-1 text-sm text-secondary">
              Deliver in 3 pushes. You have 5 rounds.
            </p>
          </div>
          <div
            className="grid grid-cols-2 gap-2 border-b border-border bg-muted p-3"
            aria-label="Job type"
          >
            <button
              aria-label="Free Play"
              aria-pressed={preparation === "free"}
              onClick={() => onPreparation("free")}
            >
              Free Play
              <span className="block text-xs font-normal opacity-80">
                House crew
              </span>
            </button>
            <button
              aria-label="Contract Job"
              aria-pressed={preparation === "contract"}
              onClick={() => onPreparation("contract")}
            >
              Contract Job
              <span className="block text-xs font-normal opacity-80">
                Hire a mercenary · Testnet
              </span>
            </button>
          </div>
          {preparation === "contract" ? (
            contractPanel
          ) : (
            <>
              <section aria-label="House crew setup" className="p-5 sm:p-6">
                <div className="flex items-center gap-4 border-b border-border pb-4">
                  <WorkerPortrait
                    token={specialist.name.toLowerCase()}
                    className="w-16 shrink-0 rounded-xl bg-muted"
                  />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-secondary">
                      House crew
                    </p>
                    <h3 className="text-2xl">Prepare your crew</h3>
                    <p className="text-sm text-secondary">
                      Choose who serves, and on which side.
                    </p>
                  </div>
                </div>
                <div className="my-5 grid gap-3 sm:grid-cols-3">
                  <label className="grid min-w-0 w-full max-w-full gap-1 text-sm sm:w-auto">
                    House worker
                    <select
                      className="min-h-11 min-w-0 w-full max-w-full rounded-lg border border-border bg-paper px-3"
                      value={config.worker}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          worker: Number(e.target.value),
                          package_option: 0,
                        })
                      }
                    >
                      <option value={0}>Rook · Courier</option>
                      <option value={1}>Mallow · Shieldbearer</option>
                      <option value={2}>Wisp · Mage</option>
                    </select>
                  </label>
                  <label className="grid min-w-0 w-full max-w-full gap-1 text-sm sm:w-auto">
                    Fine print
                    <select
                      className="min-h-11 min-w-0 w-full max-w-full rounded-lg border border-border bg-paper px-3"
                      value={config.package_option}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          package_option: Number(e.target.value),
                        })
                      }
                    >
                      {[0, 1].map((option) => {
                        const u = engine.configure({
                          ...config,
                          package_option: option,
                        }).setup.units[config.placement === "escort" ? 1 : 4]!;
                        return (
                          <option key={option} value={option}>
                            {packages[u.package].name}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label className="grid min-w-0 w-full max-w-full gap-1 text-sm sm:w-auto">
                    Placement
                    <select
                      className="min-h-11 min-w-0 w-full max-w-full rounded-lg border border-border bg-paper px-3"
                      value={config.placement}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          placement: e.target
                            .value as Configuration["placement"],
                        })
                      }
                    >
                      <option value="escort">Escort</option>
                      <option value="infiltration">Infiltration</option>
                    </select>
                  </label>
                </div>
                <div className="rounded-xl border-l-[3px] border-brass bg-muted p-4">
                  <p className="font-semibold">
                    {specialist.name}: {packages[specialist.package].special}
                  </p>
                  <p className="text-sm text-secondary">
                    {packages[specialist.package].clause}
                  </p>
                </div>
                {config.placement === "infiltration" && (
                  <p className="mt-2 text-sm text-danger">
                    The enemy commands {specialist.name}. Borrow is possible
                    only after a real strike.
                  </p>
                )}
                <div className="my-4 grid gap-3 sm:grid-cols-2">
                  {["player", "enemy"].map((side) => (
                    <div key={side}>
                      <h4 className="font-semibold">
                        {side === "player" ? "Your crew" : "Opposing crew"}
                      </h4>
                      {assembled.setup.units
                        .filter((u) => u.side === side)
                        .map((u) => (
                          <p key={u.id} className="text-sm">
                            {u.name} · {u.role} · {u.hp} HP
                            {u.package !== "none"
                              ? ` · ${packages[u.package].special}`
                              : ""}
                          </p>
                        ))}
                    </div>
                  ))}
                </div>
                <button
                  className="!border-primary !bg-primary !text-white"
                  onClick={() => onPlay(config)}
                >
                  Play
                </button>
              </section>
            </>
          )}
        </div>
      </div>
      <section
        id="ledger"
        aria-label="Captain's Ledger"
        className="mt-8 border-t border-border pt-6"
      >
        <h2 className="text-3xl">Captain's Ledger</h2>
        <p className="my-2 text-sm text-secondary">Saved in this browser.</p>
        {Object.keys(progress.ledger).length === 0 ? (
          <p className="my-5 text-secondary">A clean ledger. How suspicious.</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {setups
              .filter((s) => progress.ledger[s.id])
              .map((s) => {
                const e = progress.ledger[s.id]!;
                return (
                  <article
                    className="space-y-3 rounded-xl border border-border bg-paper p-4"
                    key={s.id}
                  >
                    <h3 className="text-xl">
                      {s.name} · {s.variant}
                    </h3>
                    <p className="text-sm">
                      {e.attempts} attempts · {e.completions} clears
                    </p>
                    <ul className="flex flex-wrap gap-2 text-xs">
                      {goalNames.map((goal, i) => (
                        <li
                          key={goal}
                          className={`rounded border px-2 py-1 ${e.goals[i] ? "border-primary font-bold text-primary" : "border-border text-secondary"}`}
                        >
                          {e.goals[i] ? "✓ " : "○ "}
                          {goal}
                        </li>
                      ))}
                    </ul>
                    <ResultLine label="Latest" result={e.latest} />
                    <ResultLine label="Previous" result={e.previous} />
                    <ResultLine label="Fastest clear" result={e.best} />
                  </article>
                );
              })}
          </div>
        )}
      </section>
    </section>
  );
}
