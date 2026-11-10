const colors: Record<string, string> = {
  rook: "#67899b",
  mallow: "#71896c",
  nix: "#994d57",
  dot: "#b9a273",
  brisk: "#8d9790",
  peebles: "#87768d",
};

export default function WorkerPortrait({
  token,
  className = "w-24 shrink-0",
}: {
  token: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const name = token[0]?.toUpperCase() + token.slice(1);
  const slot = characterSlots[name];
  if (!failed && slot !== undefined)
    return (
      <div
        aria-hidden="true"
        className={`relative aspect-[3/4] overflow-hidden bg-no-repeat ${className}`}
        style={{
          backgroundImage: `url(${characterAtlas})`,
          backgroundSize: "400% 200%",
          backgroundPosition: `${((slot % 4) / 3) * 100}% ${Math.floor(slot / 4) * 100}%`,
        }}
      >
        <img
          src={characterAtlas}
          alt=""
          onError={() => setFailed(true)}
          className="hidden"
        />
      </div>
    );
  const courier = token === "rook" || token === "dot";
  const shield = token === "mallow" || token === "brisk";
  const color = colors[token] ?? colors.rook;
  return (
    <svg aria-hidden="true" viewBox="0 0 120 120" className={className}>
      <path d="M12 104V44Q14 10 60 10T108 44V104Z" fill="#ded7c6" />
      <ellipse cx="60" cy="104" rx="35" ry="7" fill="#b3a68b" />
      <g stroke="#2d3432" strokeWidth="2" strokeLinejoin="round">
        <path
          d={
            courier
              ? "M43 67 77 65 89 101H34Z"
              : shield
                ? "M32 67Q60 53 88 67L94 103H27Z"
                : "M48 64H73L89 105H32Z"
          }
          fill={color}
        />
        <path d="M47 99 44 108M72 99 77 108" strokeWidth="7" />
        <path d="M44 70 28 88M77 72 92 88" strokeWidth="9" stroke={color} />
        <ellipse
          cx={token === "dot" ? 65 : 60}
          cy="48"
          rx="17"
          ry="20"
          fill="#e2c4a2"
        />
        <path d="M50 48H53M66 48H69" strokeWidth="3" />
        <path
          d={token === "peebles" ? "M53 59H65" : "M55 59Q61 62 67 57"}
          fill="none"
        />
        {courier ? (
          <>
            <path
              d={
                token === "dot"
                  ? "M42 35Q56 12 76 31L84 40H42Z"
                  : "M39 39Q41 20 62 25L80 38Z"
              }
              fill={color}
            />
            <path d="M44 66 79 92" stroke="#b9a273" strokeWidth="6" />
            <rect
              x={token === "dot" ? 27 : 73}
              y="79"
              width="23"
              height="22"
              rx="4"
              fill="#8f7058"
            />
            {token === "rook" && (
              <path d="M77 82H91M78 88H90" stroke="#f3f1e9" />
            )}
          </>
        ) : shield ? (
          <>
            <path
              d={
                token === "brisk"
                  ? "M39 39V27Q58 14 79 29V40Z"
                  : "M40 38Q42 21 61 23T79 38Z"
              }
              fill="#8d9790"
            />
            <path
              d={
                token === "brisk"
                  ? "M14 64H54L50 98 34 111 18 98Z"
                  : "M13 68 45 61 53 89 33 107 16 95Z"
              }
              fill={color}
              stroke="#f3f1e9"
              strokeWidth="4"
            />
            <path
              d={
                token === "brisk"
                  ? "M23 75H44M23 82H44M23 89H39"
                  : "M25 80H39V92H25Z"
              }
              fill="none"
              stroke="#b9a273"
              strokeWidth="3"
            />
            {token === "mallow" && (
              <rect
                x="76"
                y="87"
                width="20"
                height="14"
                rx="3"
                fill="#b9a273"
              />
            )}
          </>
        ) : (
          <>
            <path
              d={
                token === "peebles"
                  ? "M37 37 59 13 85 22 70 27 82 40Z"
                  : "M38 39 59 7 80 39Z"
              }
              fill={color}
            />
            <path d="M94 101V40" stroke="#8f7058" strokeWidth="5" />
            {token === "peebles" ? (
              <path d="M87 37 95 30 102 40 95 47Z" fill="#b9a273" />
            ) : (
              <circle cx="94" cy="36" r="8" fill="#b9a273" />
            )}
            {token === "nix" && (
              <path d="M46 46H57V53H46ZM63 46H74V53H63ZM57 48H63" fill="none" />
            )}
          </>
        )}
      </g>
    </svg>
  );
}
import { useState } from "react";
import { characterAtlas, characterSlots } from "../stage/assets";
