import type { Recording } from "./economyRecording";
import TownScene from "./TownScene";
import { nearAmount } from "./jobs";

// Chart coordinates are display values only. Settlement amounts stay as integers.
const displayNear = (amount: string) => Number(BigInt(amount)) / 1e24;
const colors = ["#276454", "#a05a2c"];

function HistoryChart({
  title,
  series,
  index,
  maximum,
  unit,
}: {
  title: string;
  series: { label: string; values: number[]; exact: string[] }[];
  index: number;
  maximum: number;
  unit: string;
}) {
  const x = (i: number) =>
    40 + (i * 360) / Math.max(1, series[0]!.values.length - 1);
  const y = (n: number) => 132 - (n / (maximum || 1)) * 104;
  return (
    <figure className="rounded-xl border border-border bg-paper p-4">
      <figcaption className="font-display text-lg">{title}</figcaption>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {series.map((s, i) => (
          <span key={s.label}>
            <span
              aria-hidden="true"
              className="mr-1 inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: colors[i] }}
            />
            {s.label}{" "}
            <strong>
              {s.exact[index]} {unit}
            </strong>
          </span>
        ))}
      </div>
      <svg
        viewBox="0 0 430 166"
        role="img"
        aria-label={`${title}, through event ${index + 1}. ${series.map((s) => `${s.label}: ${s.exact[0]} to ${s.exact[index]} ${unit}`).join(". ")}`}
        className="mt-2 w-full"
      >
        {[0, maximum / 2, maximum].map((n, i) => (
          <g key={i}>
            <line
              x1="40"
              x2="400"
              y1={y(n)}
              y2={y(n)}
              stroke="currentColor"
              opacity="0.12"
            />
            <text
              x="32"
              y={y(n) + 4}
              textAnchor="end"
              fontSize="11"
              fill="currentColor"
            >
              {Number(n.toPrecision(3))}
            </text>
          </g>
        ))}
        <line
          x1={x(index)}
          x2={x(index)}
          y1="24"
          y2="132"
          stroke="currentColor"
          strokeDasharray="3 4"
          opacity="0.35"
        />
        {series.map((s, k) => (
          <g key={s.label}>
            <path
              d={s.values
                .slice(0, index + 1)
                .map((n, i) =>
                  i === 0 ? `M ${x(i)} ${y(n)}` : `H ${x(i)} V ${y(n)}`,
                )
                .join(" ")}
              fill="none"
              stroke={colors[k]}
              strokeWidth="3"
              strokeLinejoin="round"
            />
            {s.values.slice(0, index + 1).map((n, i) => (
              <circle
                key={i}
                cx={x(i)}
                cy={y(n)}
                r={i === index ? 5 : 2.5}
                fill={colors[k]}
                stroke="var(--color-paper, #faf7ef)"
                strokeWidth="1.5"
              />
            ))}
          </g>
        ))}
        <text x="40" y="156" fontSize="11" fill="currentColor">
          Start
        </text>
        <text
          x="400"
          y="156"
          textAnchor="end"
          fontSize="11"
          fill="currentColor"
        >
          Event {series[0]!.values.length}
        </text>
      </svg>
    </figure>
  );
}

export default function EconomyStory({
  recording,
  index,
}: {
  recording: Recording;
  index: number;
}) {
  const frames = recording.frames;
  const current = frames[index]!;
  const prior = frames[Math.max(0, index - 1)]!;
  const town = current.economy.towns[0]!;
  const previous = prior.economy.towns[0]!;
  const supplied = town.stock.supplies - previous.stock.supplies;
  const payment = BigInt(town.paid) - BigInt(previous.paid);
  const contribution = BigInt(town.contributed) - BigInt(previous.contributed);
  const hire = BigInt(current.earnings) - BigInt(prior.earnings);
  const hall = BigInt(current.hall) - BigInt(prior.hall);
  const minutes = Math.floor(
    (Number(current.economy.timestamp) - Number(prior.economy.timestamp)) / 60,
  );
  const nodes =
    payment > 0n
      ? [
          {
            label: "Verified delivery",
            detail: "Cart accepted",
          },
          {
            label: "Your company",
            detail: `+${nearAmount(payment.toString())} NEAR`,
          },
          { label: "Docks supplies", detail: `+${supplied} supply` },
        ]
      : hire > 0n
        ? [
            {
              label: "Paid hire",
              detail: `${nearAmount((hire + hall).toString())} NEAR`,
            },
            {
              label: "Rook earns",
              detail: `${nearAmount(hire.toString())} NEAR · 95%`,
            },
            {
              label: "Hall earns",
              detail: `${nearAmount(hall.toString())} NEAR · 5%`,
            },
          ]
        : contribution > 0n
          ? [
              {
                label: "Contributor",
                detail: `${nearAmount(contribution.toString())} NEAR`,
              },
              { label: "Docks treasury", detail: "Funded again" },
              { label: "Delivery work", detail: "Open" },
            ]
          : supplied < 0
            ? [
                { label: "Time passes", detail: `${minutes} minutes` },
                {
                  label: "Town uses supplies",
                  detail: `${Math.abs(supplied)} supplies used`,
                },
                { label: "Shortage returns", detail: "More urgent work" },
              ]
            : index > 0
              ? [
                  { label: "Crew waits", detail: "No paid hire" },
                  {
                    label: "Rook’s ask falls",
                    detail: `${nearAmount(prior.quote)} → ${nearAmount(current.quote)} NEAR`,
                  },
                ]
              : [
                  { label: "Docks need supplies", detail: "Urgent work" },
                  { label: "Hire a crew", detail: "Deliver a cart" },
                  { label: "Earn the payment", detail: "Replenish the town" },
                ];
  const explanation =
    payment > 0n
      ? "A verified delivery pays the company and replenishes the town."
      : hire > 0n
        ? "A confirmed hire pays Rook and the Hall. Demand raises the next ask."
        : contribution > 0n
          ? "New funding backs new deliveries. The town can pay again."
          : supplied < 0
            ? "Supplies run down over time. Restoration stays, but delivery work needs funding."
            : index > 0
              ? "Idle availability lowers the crew’s ask."
              : "Deliveries change the town’s supply, its next offer, and who earns.";
  const series = (label: string, values: string[]) => ({
    label,
    exact: values.map(nearAmount),
    values: values.map(displayNear),
  });
  const funds = [
    series(
      "Available treasury",
      frames.map((f) => f.economy.towns[0]!.unreserved),
    ),
    series(
      "Company funds",
      frames.map((f) => f.economy.company?.funds ?? "0"),
    ),
  ];
  const quote = series(
    "Rook’s ask",
    frames.map((f) => f.quote),
  );
  const scarcity =
    town.stock.supplies <= 1
      ? "Urgent"
      : town.stock.supplies <= 3
        ? "Low supplies"
        : "Supplied";
  return (
    <section aria-label="The economy in motion" className="space-y-4">
      <div className="grid overflow-hidden rounded-xl border border-border bg-paper shadow-panel lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <TownScene
            policy="dock"
            supplies={town.stock.supplies}
            incoming={town.incoming.filter(Boolean).length}
            restored={town.stock.deliveries >= 3}
          />
          <div className="flex items-center justify-between gap-3 p-4">
            <strong className="font-display text-xl">Docks · {scarcity}</strong>
            <span className="text-sm">{town.stock.supplies}/6 supplies</span>
          </div>
          <div
            aria-label={`${town.stock.supplies} of 6 supplies`}
            className="mx-4 mb-4 flex gap-1"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <span
                key={i}
                className={`h-4 flex-1 rounded-sm ${i < town.stock.supplies ? "bg-primary" : "bg-clay/20"}`}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-center gap-4 border-t border-border p-5 lg:border-l lg:border-t-0">
          <p className="text-sm text-secondary">{explanation}</p>
          <div
            aria-label="This event’s effects"
            className="grid grid-cols-[1fr_auto_1.2fr] items-center gap-3"
          >
            <div className="rounded-lg border border-border bg-paper p-3">
              <span className="block text-sm">{nodes[0]!.label}</span>
              <strong className="mt-1 block">{nodes[0]!.detail}</strong>
            </div>
            <span aria-hidden="true" className="text-2xl text-secondary">
              →
            </span>
            <ul className="space-y-2">
              {nodes.slice(1).map((node) => (
                <li
                  key={node.label}
                  className="rounded-lg border border-border bg-paper p-3"
                >
                  <span className="block text-sm">{node.label}</span>
                  <strong className="mt-1 block">{node.detail}</strong>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm font-semibold">
            {BigInt(town.unreserved) === 0n
              ? "Treasury empty · new work is closed"
              : town.incoming.some(Boolean)
                ? "Payment reserved · delivery in progress"
                : "Funded delivery work is open"}
          </p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <HistoryChart
          title="Deliveries rebuild supply"
          series={[
            {
              label: "Docks supply",
              values: frames.map((f) => f.economy.towns[0]!.stock.supplies),
              exact: frames.map((f) =>
                String(f.economy.towns[0]!.stock.supplies),
              ),
            },
          ]}
          index={index}
          maximum={6}
          unit="/ 6"
        />
        <HistoryChart
          title="Hires raise the crew’s ask"
          series={[quote]}
          index={index}
          maximum={Math.max(...quote.values) * 1.2}
          unit="NEAR"
        />
        <HistoryChart
          title="The town funds the work"
          series={funds}
          index={index}
          maximum={Math.max(...funds.flatMap((s) => s.values)) * 1.1}
          unit="NEAR"
        />
      </div>
      <p className="text-xs text-secondary">
        Graphs show recorded events at equal spacing. The time jump is shown
        above.
      </p>
    </section>
  );
}
