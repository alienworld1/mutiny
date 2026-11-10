import type { Ref } from "react";
import type { State } from "./types";
import GameIcon from "./GameIcon";

export default function BattleHud({
  state,
  headingRef,
}: {
  state: State;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-5 gap-y-3 px-1 py-2 sm:px-3 lg:py-0">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[.12em] text-secondary">
          {state.setup.variant}
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl leading-tight sm:text-3xl"
        >
          {state.setup.name}
        </h1>
      </div>
      <dl className="flex max-w-full flex-wrap items-center gap-x-5 gap-y-2 text-sm tabular-nums">
        <div className="border-l-4 border-oxblood pl-3">
          <dt className="text-xs text-secondary">Round</dt>
          <dd data-testid="round" className="font-display text-xl">
            {state.round} / 5
          </dd>
        </div>
        <div>
          <dt className="text-xs text-secondary">Cart</dt>
          <dd className="flex items-center gap-2">
            <span aria-hidden="true" className="flex gap-1">
              {[0, 1].map((i) => (
                <span
                  key={i}
                  className={`h-3 w-3 rotate-45 rounded-sm ${i < state.cart_hp ? "bg-primary" : "bg-danger/25"}`}
                />
              ))}
            </span>
            <span data-testid="cart-hp">{state.cart_hp} / 2</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-secondary">Delivery</dt>
          <dd className="flex items-center gap-2">
            <span aria-hidden="true" className="flex items-center gap-1">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className={`h-2.5 w-2.5 rounded-full ${n <= state.pushes ? "bg-primary" : "bg-ink/20"}`}
                />
              ))}
              <GameIcon name="flag" className="h-4 w-4" />
            </span>
            <span data-testid="pushes">{state.pushes} / 3</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
