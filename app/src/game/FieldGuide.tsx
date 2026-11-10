import { useState } from "react";
import * as engine from "./engine";
import { firstShiftCommands, firstShiftConfig } from "./firstShift";
import { coordinate } from "./types";
import GameIcon from "./GameIcon";

const topics = [
  {
    name: "Deliver",
    frames: [0, 1],
    captions: [
      "Reach the flag in five rounds. Keep the cart and captain alive.",
      "A unit beside the cart can push it once per round. Three pushes deliver it.",
    ],
  },
  {
    name: "Take a turn",
    frames: [0, 3],
    captions: [
      "Each crew member can move, then act once. Select a portrait to begin.",
      "End Phase resolves the posted enemy orders. Next round, your crew can act again. Guard blocks one hit this enemy phase.",
    ],
  },
  {
    name: "Cause a strike",
    frames: [0, 2, 3],
    captions: [
      "Dot’s posted path crosses E4. Her fine print refuses paths through fire.",
      "Captain uses Burn Notice on E4. The order stays fixed, but its path now breaks Dot’s terms.",
      "At End Phase, Dot refuses the order and goes on strike. Blocking a path with a unit would only block the order.",
    ],
  },
  {
    name: "Borrow",
    frames: [3, 4, 5],
    captions: [
      "Next round, move your captain within two tiles of the striker. Keep the captain’s action for Borrow.",
      "Borrow spends the captain’s action. The striker gets one move and action under your command.",
      "Dot hits her supervisor. She returns to enemy control after the phase and cannot be borrowed again this job.",
    ],
  },
];

export default function FieldGuide({ onReplay }: { onReplay: () => void }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(0);
  const [frame, setFrame] = useState(0);
  const lesson = topics[topic]!;
  let example = open ? engine.configure(firstShiftConfig) : null;
  for (const command of firstShiftCommands.slice(0, lesson.frames[frame]!))
    if (example) example = engine.apply(example.log, command).state;
  const dot = example?.setup.units[4];
  return (
    <details
      className="w-full"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer py-3 font-semibold">
        How to play
      </summary>
      {example && dot && (
        <div className="space-y-4 rounded-xl border border-border bg-muted/40 p-3 sm:p-5">
          <div className="flex flex-wrap gap-2" aria-label="Guide topics">
            {topics.map((item, i) => (
              <button
                key={item.name}
                aria-pressed={i === topic}
                onClick={() => {
                  setTopic(i);
                  setFrame(0);
                }}
                className="!min-h-11 !px-3 text-sm"
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="grid items-center gap-4 sm:grid-cols-[240px_1fr]">
            <div
              role="img"
              aria-label={`Example battlefield. Cart at ${coordinate(example.cart_cell)}. Dot at ${coordinate(dot.cell)}, ${dot.status}. ${example.fire.includes(25) ? "Fire at E4." : ""}`}
              className="grid grid-cols-7 gap-0.5 rounded-lg border border-border bg-stone p-2"
            >
              {Array.from({ length: 49 }, (_, cell) => {
                const unit = example.setup.units.find(
                  (u) => u.cell === cell && u.hp > 0,
                );
                const path = topic === 2 && [18, 25, 32].includes(cell);
                return (
                  <span
                    key={cell}
                    aria-hidden="true"
                    className={`flex aspect-square items-center justify-center rounded-sm text-xs font-bold ${example.setup.walls.includes(cell) ? "bg-ink/20" : path ? "border border-dashed border-danger bg-paper" : "bg-paper/70"} ${example.setup.route.includes(cell) ? "ring-1 ring-primary" : ""}`}
                  >
                    {example.cart_cell === cell ? (
                      <GameIcon name="push" className="h-5 w-5" />
                    ) : cell === 25 && example.fire.includes(cell) ? (
                      <GameIcon name="burn" className="h-5 w-5 text-danger" />
                    ) : unit ? (
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full ${unit.status === "striking" ? "border-2 border-danger bg-paper text-danger" : unit.side === "player" || example.borrow_pending === unit.id ? "bg-primary text-white" : "bg-danger text-white"}`}
                      >
                        {unit.status === "striking"
                          ? "!"
                          : unit.id === 0
                            ? "C"
                            : unit.name[0]}
                      </span>
                    ) : cell === example.setup.route[3] ? (
                      "⚑"
                    ) : example.setup.route.includes(cell) ? (
                      "↑"
                    ) : (
                      ""
                    )}
                  </span>
                );
              })}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Example · {frame + 1} / {lesson.frames.length}
              </p>
              <h3 className="mt-2 text-xl">{lesson.name}</h3>
              <p className="mt-2 text-sm" aria-live="polite">
                {lesson.captions[frame]}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  disabled={frame === 0}
                  onClick={() => setFrame(frame - 1)}
                >
                  Back
                </button>
                <button
                  disabled={frame === lesson.frames.length - 1}
                  onClick={() => setFrame(frame + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="text-xs text-secondary">
              Arrow keys move board focus. Enter selects.
            </p>
            <button onClick={onReplay}>Replay First Shift</button>
          </div>
        </div>
      )}
    </details>
  );
}
