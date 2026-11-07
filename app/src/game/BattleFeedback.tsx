import type { Event, State } from "./types";
import { coordinate, outcomeText } from "./types";
function describe(event: Event, state: State): [string, string] {
  const name = (id: number) => state.setup.units[id]?.name ?? "Cart";
  switch (event.kind) {
    case "moved":
      return [name(event.unit), `Moved to ${coordinate(event.path.at(-1)!)}`];
    case "guarded":
      return [name(event.unit), "Guard · blocks one hit"];
    case "pushed":
      return ["Cart pushed", coordinate(event.to)];
    case "ignited":
      return ["Fire", `${coordinate(event.cell)} · until phase end`];
    case "smoked":
      return ["Smoke", `${coordinate(event.cell)} · fire out, sight blocked`];
    case "certified":
      return [
        "Safety Certificate",
        `${coordinate(event.cell)} · next hit blocked`,
      ];
    case "damaged":
      return [`${name(event.target)}: ${event.hp} HP left`, ""];
    case "protected":
      return [name(event.unit), `Hit blocked · ${event.source}`];
    case "strike":
      return [
        `ON STRIKE: ${name(event.unit)}`,
        event.reason.split(": ").at(-1)!,
      ];
    case "blocked":
      return [`Order blocked: ${name(event.unit)}`, event.reason];
    case "refused":
      return [
        `${name(event.unit)} refused the command`,
        `${event.reason.split(": ").at(-1)!} · action spent`,
      ];
    case "borrowed":
      return [`Borrowed ${name(event.unit)}`, "One action · captain spent"];
    case "recovering":
      return [name(event.unit), "Recovering · no enemy order"];
    case "recovered":
      return [`${name(event.unit)} returns to enemy orders`, ""];
    case "displaced":
      return [
        name(event.unit),
        `${coordinate(event.from)} → ${coordinate(event.to)}`,
      ];
    case "swapped":
      return ["Desk Swap", `${name(event.unit)} ↔ ${name(event.target)}`];
    case "attacked":
      return [
        name(event.unit),
        `Hit area: ${event.affected.map(coordinate).join(", ")}`,
      ];
    case "ended":
      return [outcomeText(event.outcome), ""];
  }
}
export default function BattleFeedback({
  events,
  state,
}: {
  events: Event[];
  state: State;
}) {
  return (
    <ul className="divide-y divide-border/60">
      {events
        .filter((e) => e.kind !== "attacked" && e.kind !== "recovering")
        .map((event, i) => {
          const [label, detail] = describe(event, state);
          return (
            <li
              key={`${i}-${event.kind}`}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
            >
              <span
                className={`text-sm font-semibold ${event.kind === "strike" || event.kind === "refused" ? "text-danger" : ""}`}
              >
                {label}
              </span>
              {detail && (
                <span className="text-xs text-secondary">{detail}</span>
              )}
            </li>
          );
        })}
    </ul>
  );
}
