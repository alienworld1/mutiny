import WorkerPortrait from "../near/WorkerPortrait";
import type { State } from "./types";

export default function CrewRoster({
  state,
  selected,
  locked,
  onSelect,
}: {
  state: State;
  selected: number | null;
  locked: boolean;
  onSelect: (id: number) => void;
}) {
  const crew = state.setup.units.filter(
    (u) => u.side === "player" || state.borrow_pending === u.id,
  );
  return (
    <div
      className={`grid min-w-0 gap-2 ${crew.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}
      aria-label="Your crew"
    >
      {crew.map((u) => {
        const spent = state.activated.includes(u.id);
        return (
          <button
            key={u.id}
            disabled={u.hp === 0 || locked}
            aria-pressed={selected === u.id}
            aria-label={`${u.name} ${u.hp} HP${u.hp === 0 ? ", knocked out" : spent ? ", acted" : ", ready"}`}
            onClick={() => onSelect(u.id)}
            className={`group relative flex min-w-0 flex-col items-center gap-1 sm:flex-row sm:gap-2 overflow-hidden !rounded-t-2xl !rounded-b-lg !border-0 !border-b-4 !border-b-slate !bg-paper !p-2 text-center sm:text-left !text-ink aria-pressed:!border-b-brass aria-pressed:!bg-ink aria-pressed:!text-paper ${spent ? "opacity-65" : ""}`}
          >
            <WorkerPortrait
              token={u.name.toLowerCase()}
              className="w-9 shrink-0 sm:w-10"
            />
            <span className="min-w-0 max-w-full">
              <span className="block break-words font-display text-base sm:text-lg leading-tight">
                {u.name}
              </span>
              <span
                className="mt-1 flex justify-center gap-1 sm:justify-start"
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
