import type { State } from "./types";
import { actionText, coordinate, packages } from "./types";
import WorkerPortrait from "../near/WorkerPortrait";

export default function EnemyOrders({
  state,
  focused,
  locked,
  onFocus,
  canBorrow,
  onBorrow,
}: {
  state: State;
  focused: number | null;
  locked: boolean;
  onFocus: (id: number | null) => void;
  canBorrow: (id: number) => boolean;
  onBorrow: (id: number) => void;
}) {
  const inspected = state.orders.find((order) => order.unit === focused);
  return (
    <section
      aria-label="Posted enemy orders"
      className="min-w-0 border-t border-oxblood/30 bg-oxblood/5 px-3 py-3 sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="w-full shrink-0 sm:w-auto">
          <h2 className="text-lg">Enemy orders</h2>
          <p className="text-xs text-secondary">Fixed this round</p>
        </div>
        <div className="flex w-full min-w-0 flex-1 flex-wrap gap-2 sm:w-auto">
          {state.orders.map((order) => {
            const u = state.setup.units[order.unit]!;
            return (
              <button
                key={u.id}
                disabled={locked}
                aria-pressed={focused === u.id}
                onClick={() => onFocus(focused === u.id ? null : u.id)}
                className="flex min-w-0 flex-1 basis-32 items-center gap-2 !rounded-lg !border-0 !border-l-2 !border-l-oxblood !bg-paper/80 !px-2 !py-1 text-left !shadow-none aria-pressed:!bg-ink aria-pressed:!text-paper"
              >
                <WorkerPortrait
                  token={u.name.toLowerCase()}
                  className="w-7 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block break-words text-sm">
                    <span aria-hidden="true" className="mr-1 font-mono text-xs">
                      {u.id + 1}
                    </span>
                    {u.name}{" "}
                    <span className="text-xs font-normal">{u.hp} HP</span>
                  </span>
                  <span className="block break-words text-xs font-normal">
                    {actionText(order.action, state)}
                  </span>
                </span>
              </button>
            );
          })}
          {state.orders.length === 0 && !state.outcome && (
            <p className="text-sm">No enemy orders this round.</p>
          )}
        </div>
        {focused !== null && (
          <button
            className="!min-h-9 !px-3 text-xs"
            onClick={() => onFocus(null)}
          >
            Show all orders
          </button>
        )}
      </div>
      {inspected && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-l-2 border-oxblood pl-3 text-sm">
          <p>
            {[inspected.start, ...inspected.path].map(coordinate).join(" → ")}
          </p>
          {inspected.affected.length > 0 && (
            <p>Affects {inspected.affected.map(coordinate).join(", ")}</p>
          )}
          {state.setup.units[inspected.unit]!.package !== "none" && (
            <p>
              <strong>
                {packages[state.setup.units[inspected.unit]!.package].name}
              </strong>{" "}
              · {packages[state.setup.units[inspected.unit]!.package].clause}
            </p>
          )}
        </div>
      )}
      {state.setup.units
        .filter((u) => u.side === "enemy" && u.hp > 0 && u.status !== "normal")
        .map((u) => (
          <div
            key={u.id}
            className="mt-3 flex flex-wrap items-center gap-3 border-l-4 border-oxblood bg-paper px-3 py-2 text-sm"
          >
            <WorkerPortrait
              token={u.name.toLowerCase()}
              className="w-8 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-danger">
                {u.name} ·{" "}
                {u.status === "striking" ? "ON STRIKE" : "Recovering"}
              </p>
              <p className="text-xs text-secondary">
                {u.status === "striking"
                  ? "Skips the next enemy phase."
                  : "Returns after the enemy phase."}{" "}
                {u.status === "striking" && !u.borrowed && !canBorrow(u.id)
                  ? state.activated.includes(0)
                    ? "Your captain has acted."
                    : "Borrow needs your captain within 2 tiles."
                  : ""}
              </p>
            </div>
            {u.status === "striking" && !u.borrowed && canBorrow(u.id) && (
              <button
                disabled={locked}
                onClick={() => onBorrow(u.id)}
                className="!border-primary !bg-primary !text-white"
              >
                Borrow {u.name}
              </button>
            )}
          </div>
        ))}
    </section>
  );
}
