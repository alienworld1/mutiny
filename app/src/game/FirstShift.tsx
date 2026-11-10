import WorkerPortrait from "../near/WorkerPortrait";

const lessons = [
  {
    title: "Deliver the cart",
    copy: "Select Rook, then Push Cart. Reach the flag with three pushes, one per round.",
    token: "rook",
  },
  {
    title: "Read the fine print",
    copy: "Dot plans to walk through E4. She refuses fire. Select Captain, choose Burn Notice, then E4.",
    token: "dot",
  },
  {
    title: "Let the enemy try",
    copy: "End Phase. Dot’s fixed order now crosses your fire. Watch her refuse it.",
    token: "dot",
  },
  {
    title: "Borrow the striker",
    copy: "Dot is on strike. Select Captain, move to E4, then Borrow Dot. This uses your captain’s action.",
    token: "captain",
  },
  {
    title: "Give Dot an order",
    copy: "Move Dot to D3, then Attack the supervisor at D4. One order. Make it count.",
    token: "dot",
  },
];

export default function FirstShift({
  step,
  preview,
  busy,
  onSkip,
}: {
  step: number;
  preview: boolean;
  busy: boolean;
  onSkip: () => void;
}) {
  const lesson = lessons[step];
  return (
    <aside
      aria-label="First Shift guide"
      className="relative z-30 border-l-4 border-brass bg-paper px-3 py-2 shadow-panel sm:px-5"
    >
      <div className="flex items-start gap-3">
        <WorkerPortrait
          token={lesson?.token ?? "captain"}
          className="w-11 shrink-0 rounded-t-full bg-brass/15 sm:w-12"
        />
        <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
          <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
            First Shift · {Math.min(step + 1, 5)} / 5
          </p>
          <h2 className="mt-1 text-xl">
            {lesson?.title ?? "The rest is yours"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm">
            {busy
              ? "Orders are resolving…"
              : preview
                ? "Check the preview, then Confirm. Cancel to change your choice."
                : (lesson?.copy ??
                  "Dot broke her order. You borrowed her for one activation. Now finish the delivery. Two pushes remain.")}
          </p>
        </div>
        <button
          onClick={onSkip}
          className="!min-h-11 !border-0 !bg-transparent !px-2 !shadow-none text-xs underline underline-offset-4"
        >
          {lesson ? "Skip guide" : "Continue"}
        </button>
      </div>
    </aside>
  );
}
