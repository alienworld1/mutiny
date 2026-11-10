import { useEffect } from "react";

export type DeliveryStep = "work" | "crew" | "review";
export const deliveryGuideKey = "mutiny-delivery-guide-v1";

export default function DeliveryGuide({
  step,
  hasDelivery,
  onStep,
  onSkip,
  onLearn,
}: {
  step: DeliveryStep;
  hasDelivery: boolean;
  onStep: (step: DeliveryStep) => void;
  onSkip: () => void;
  onLearn?: () => void;
}) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>(
        "[data-delivery-heading]",
      );
      if (!heading) return;
      heading.focus({ preventScroll: true });
      const bounds = heading.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > window.innerHeight)
        heading.scrollIntoView({ block: "center", behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);
  return (
    <section
      aria-label="First delivery guide"
      className="overflow-hidden rounded-xl border border-border bg-muted/40"
    >
      <div className="relative overflow-hidden bg-muted p-4 sm:p-6">
        <img
          src="/assets/art/town.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-20"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
              The Royal Supply Route · NEAR testnet
            </p>
            <h2 className="mt-2 text-3xl">Your first delivery</h2>
            <p className="mt-2 max-w-xl text-sm">
              Hire a mercenary. Deliver a cart. Save Job to supply a town and
              collect its payment.
            </p>
            {onLearn && (
              <button
                className="mt-2 !border-0 !bg-transparent !px-0 !shadow-none text-sm underline underline-offset-4"
                onClick={onLearn}
              >
                Learn to play
              </button>
            )}
          </div>
          <button
            onClick={onSkip}
            className="shrink-0 !border-0 !bg-paper/70 !px-2 !shadow-none text-xs underline underline-offset-4"
          >
            Skip guide
          </button>
        </div>
      </div>
      <ol
        aria-label="Delivery steps"
        className="grid grid-cols-3 border-t border-border"
      >
        {(["work", "crew", "review"] as const).map((item, i) => (
          <li key={item}>
            <button
              disabled={item !== "work" && !hasDelivery}
              aria-current={item === step ? "step" : undefined}
              onClick={() => onStep(item)}
              className="w-full !rounded-none !border-0 !border-b-3 !border-b-transparent !bg-transparent !px-2 text-sm aria-[current=step]:!border-b-primary aria-[current=step]:!bg-paper"
            >
              <span className="mr-1 font-mono text-xs">{i + 1}</span>
              {["Delivery", "Crew", "Review"][i]}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
