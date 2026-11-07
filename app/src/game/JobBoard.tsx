import { useState } from "react";
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
}: {
  setups: Setup[];
  progress: Progress;
  onPlay: (config: Configuration) => void;
}) {
  const [config, setConfig] = useState<Configuration>({
    setup_id: "dock-fire-intro",
    placement: "escort",
    worker: 0,
    package_option: 0,
  });
  const assembled = engine.configure(config);
  const specialist =
    assembled.setup.units[config.placement === "escort" ? 1 : 4]!;
  return (
    <section aria-label="Job Board" className="border-t border-border py-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-3xl">Job Board</h2>
        <a
          href="#ledger"
          className="underline decoration-border underline-offset-4"
        >
          Captain's Ledger
        </a>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {["Dock Fire", "Bridge Audit", "Friday, Again"].map((name, i) => (
          <article
            key={name}
            className="rounded-2xl border border-border bg-paper p-5"
          >
            <p className="mb-3 font-mono text-sm text-secondary">
              0{i + 1} / PAYROLL OFFICE
            </p>
            <h3 className="mb-3 text-2xl">{name}</h3>
            <div className="space-y-2">
              {setups
                .filter((s) => s.name === name)
                .map((s) => (
                  <button
                    key={s.id}
                    className="w-full text-left"
                    aria-pressed={config.setup_id === s.id}
                    onClick={() => setConfig({ ...config, setup_id: s.id })}
                  >
                    {s.variant}
                    {progress.ledger[s.id]?.completions ? " · Cleared" : ""}
                  </button>
                ))}
            </div>
          </article>
        ))}
      </div>
      <section
        aria-label="House crew setup"
        className="my-5 rounded-2xl bg-muted p-5"
      >
        <h3 className="text-2xl">{assembled.setup.variant}</h3>
        <p className="my-2 text-secondary">{assembled.setup.description}</p>
        <div className="my-4 flex flex-wrap gap-4">
          <label className="grid min-w-0 max-w-full gap-1 text-sm">
            House worker
            <select
              className="min-h-11 max-w-full rounded-lg border border-border bg-paper px-3"
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
          <label className="grid min-w-0 max-w-full gap-1 text-sm">
            Fine print
            <select
              className="min-h-11 max-w-full rounded-lg border border-border bg-paper px-3"
              value={config.package_option}
              onChange={(e) =>
                setConfig({ ...config, package_option: Number(e.target.value) })
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
        <p className="font-semibold">
          {specialist.name}: {packages[specialist.package].special}
        </p>
        <p className="text-sm text-secondary">
          {packages[specialist.package].clause}
        </p>
        {config.placement === "infiltration" && (
          <p className="mt-2 text-sm text-danger">
            The enemy commands {specialist.name}. Borrow is possible only after
            a real strike.
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
      <section id="ledger" aria-label="Captain's Ledger" className="pt-5">
        <h2 className="text-3xl">Captain's Ledger</h2>
        <p className="my-2 text-sm text-secondary">
          Local to this browser. Progress is lost if browser data is cleared or
          you change devices.
        </p>
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
