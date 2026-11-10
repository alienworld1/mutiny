import { useState } from "react";
import type { BattleSound } from "./sound";
import GameIcon from "./GameIcon";

export default function SoundControls({ sound }: { sound: BattleSound }) {
  const [preferences, setPreferences] = useState(sound.preferences);
  function toggle(key: "effects" | "music") {
    sound.unlock();
    const next = { ...preferences, [key]: !preferences[key] };
    sound.configure(next);
    setPreferences(next);
    if (key === "effects" && next.effects) sound.cue("select");
  }
  return (
    <div className="flex flex-wrap gap-2" aria-label="Sound settings">
      <button
        disabled={!sound.supported}
        aria-label="Sound effects"
        aria-pressed={preferences.effects}
        onClick={() => toggle("effects")}
        className="inline-flex items-center gap-2 !min-h-9 !px-3 text-xs !text-ink aria-pressed:!text-paper"
      >
        <GameIcon name="sound" className="h-4 w-4" />
        Sound {preferences.effects ? "on" : "off"}
      </button>
      <button
        disabled={!sound.supported}
        aria-label="Music"
        aria-pressed={preferences.music}
        onClick={() => toggle("music")}
        className="inline-flex items-center gap-2 !min-h-9 !px-3 text-xs !text-ink aria-pressed:!text-paper"
      >
        <GameIcon name="music" className="h-4 w-4" />
        Music {preferences.music ? "on" : "off"}
      </button>
      {!sound.supported && <span className="text-xs">Sound unavailable</span>}
    </div>
  );
}
