import { scenery } from "../stage/assets";

// A picture of confirmed town data. The labels below the picture remain the source
// of accessible values, and the illustration never anticipates a delivery.
export default function TownScene({
  policy,
  supplies,
  incoming,
  restored,
}: {
  policy: keyof typeof scenery;
  supplies: number;
  incoming: number;
  restored: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className="relative h-44 overflow-hidden bg-clay/20"
    >
      <img
        src={scenery[policy]}
        alt=""
        className="h-full w-full object-cover object-top"
      />
      {restored && (
        <div className="absolute inset-x-0 top-0 flex justify-center">
          <span className="border-x-4 border-brass bg-primary px-4 py-1 font-display text-sm text-white shadow-panel">
            Restored
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-ink/70 to-transparent px-3 pb-2 pt-8">
        <div className="flex items-end -space-x-1">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={`h-9 w-8 bg-no-repeat ${i < supplies ? "" : "opacity-20 grayscale"}`}
              style={{
                backgroundImage: "url(/assets/art/props.webp)",
                backgroundSize: "400% 200%",
                backgroundPosition: "66.6667% 0%",
              }}
            />
          ))}
        </div>
        <span className="rounded bg-paper px-2 py-1 text-xs font-semibold text-ink">
          {incoming}/2 incoming
        </span>
      </div>
    </div>
  );
}
