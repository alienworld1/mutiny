export type IconName =
  | "move"
  | "attack"
  | "push"
  | "guard"
  | "burn"
  | "relocate"
  | "certify"
  | "smoke"
  | "swap"
  | "clean_shot"
  | "borrow"
  | "shove"
  | "sound"
  | "music"
  | "flag";
const paths: Record<IconName, string> = {
  move: "M4 18 18 4M8 4h10v10M4 10v8h8",
  attack: "m5 19 3-3m-4-4 8 8M9 15 19 5l1-1v5L10 19M13 5l6 6",
  push: "M3 5h3l2 11h11l2-8H7M10 20h.01M18 20h.01M11 3h6v5",
  guard: "M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6ZM8 12l3 3 5-6",
  burn: "M13 3c2 6-4 6-2 10 2-1 3-3 4-5 7 7 5 13-3 13C3 21 1 13 6 8c0 4 2 4 3 5-1-5 1-7 4-10Z",
  relocate: "M4 8h15M4 8l4-4M4 8l4 4M20 16H5m15 0-4-4m4 4-4 4",
  certify: "M5 3h14v18l-4-2-3 2-3-2-4 2ZM8 11l3 3 5-6",
  smoke:
    "M7 18H5a3 3 0 0 1 0-6 5 5 0 0 1 9-5 4 4 0 0 1 5 6 3 3 0 0 1-1 5H7M9 21h6",
  swap: "M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4",
  clean_shot:
    "M12 2v4m0 12v4M2 12h4m12 0h4M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM12 10v4m-2-2h4",
  borrow: "M3 11h5l4 4 4-4h5M7 7l4-3 5 3M3 8v9h5l4 4 4-4h5V8M8 11l4-4 5 4",
  shove: "M3 12h11m-4-4 4 4-4 4M18 4v16m4-16v16",
  sound: "M3 9h4l5-5v16l-5-5H3ZM16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14",
  music:
    "M9 17V5l11-2v12M9 8l11-2M5 17c-4 0-4 4 0 4s4-4 0-4Zm11-2c-4 0-4 4 0 4s4-4 0-4Z",
  flag: "M5 22V3c5-4 9 4 15 0v11c-6 4-10-4-15 0",
};
export default function GameIcon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={paths[name]} />
    </svg>
  );
}
