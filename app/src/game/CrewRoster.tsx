import WorkerPortrait from "../near/WorkerPortrait";
import type { State } from "./types";

export default function CrewRoster({
  state,
  selected,
  locked,
  onSelect,
  highlighted,
}: {
  state: State;
  selected: number | null;
  locked: boolean;
  onSelect: (id: number) => void;
  highlighted?: number;
}) {
  const crew = state.setup.units.filter((u) =>
    state.borrow_pending !== null
      ? u.id === state.borrow_pending
      : u.side === "player",
  );
  return (
    <div
      className={`grid min-w-0 gap-2 ${crew.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}
      aria-label="Your crew"
    >
      {crew.map((u) => {
        const spent = state.activated.includes(u.id);
        return (
          <button
            key={u.id}
            data-guide={highlighted === u.id || undefined}
            disabled={u.hp === 0 || locked}
            aria-pressed={selected === u.id}
            aria-label={`${u.name} ${u.hp} HP${u.hp === 0 ? ", knocked out" : spent ? ", acted" : ", ready"}`}
            onClick={() => onSelect(u.id)}
            className={`data-[guide=true]:outline-2 data-[guide=true]:outline-offset-2 data-[guide=true]:outline-focus group relative flex min-w-0 flex-col items-center gap-1 sm:flex-row sm:gap-2 lg:flex-col lg:gap-1 overflow-hidden !rounded-t-2xl !rounded-b-lg !border-0 !border-b-4 !border-b-slate !bg-[#e8e3d5] !p-2 text-center sm:text-left lg:text-center !text-ink aria-pressed:!border-b-brass aria-pressed:!bg-ink aria-pressed:!text-paper ${spent ? "opacity-65" : ""} ${crew.length === 1 ? "!flex-row !gap-3 !text-left" : ""}`}
          >
            <WorkerPortrait
              token={u.name.toLowerCase()}
              className={
                crew.length === 1
                  ? "w-16 shrink-0 rounded-t-full bg-slate/15"
                  : "w-11 shrink-0 rounded-t-full bg-slate/15 sm:w-14 lg:w-10"
              }
            />
            <span className="min-w-0 max-w-full">
              <span className="block break-words font-display text-base sm:text-lg leading-tight">
                {u.name}
              </span>
              <span
                className="mt-1 flex justify-center gap-1 sm:justify-start lg:justify-center"
                aria-hidden="true"
              >
                {Array.from(
                  {
                    length: u.role === "courier" || u.role === "mage" ? 2 : 3,
                  },
                  (_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-2 rounded-sm ${i < u.hp ? "bg-current" : "bg-current opacity-20"}`}
                    />
                  ),
                )}
              </span>
              <span className="mt-1 block text-xs">
                {u.hp === 0
                  ? "Down"
                  : spent
                    ? "✓ Acted"
                    : state.borrow_pending === u.id
                      ? "Borrowed"
                      : "Ready"}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 font-mono text-[10px] opacity-60"
            >
              {u.id + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}
