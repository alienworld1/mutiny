import WorkerPortrait from "../near/WorkerPortrait";
import { packages, type Unit } from "./types";

export default function CrewPreview({ units }: { units: Unit[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-4">
      {(["player", "enemy"] as const).map((side) => (
        <section
          key={side}
          aria-label={side === "player" ? "Your crew" : "Opposing crew"}
        >
          <h4
            className={`mb-2 flex items-center justify-between border-b-2 pb-2 text-sm font-semibold ${side === "player" ? "border-slate" : "border-oxblood"}`}
          >
            {side === "player" ? "Your crew" : "Opposing crew"}
            <span className="font-normal text-secondary">
              {units.filter((u) => u.side === side).length}
            </span>
          </h4>
          <ul className="divide-y divide-border/60">
            {units
              .filter((u) => u.side === side)
              .map((u) => (
                <li
                  key={u.id}
                  className="flex items-center gap-2 py-3 sm:gap-3"
                >
                  <WorkerPortrait
                    token={u.name.toLowerCase()}
                    className="w-8 shrink-0 rounded-lg bg-muted sm:w-10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="break-words font-display text-base leading-tight sm:text-lg">
                        {u.name}
                      </span>
                      <span className="text-xs tabular-nums text-secondary">
                        {u.hp} HP
                      </span>
                    </div>
                    {u.name.toLowerCase() !== u.role && (
                      <p className="text-xs capitalize text-secondary">
                        {u.role}
                      </p>
                    )}
                    {u.package !== "none" && (
                      <p className="mt-1 text-sm">
                        {packages[u.package].special}
                      </p>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
