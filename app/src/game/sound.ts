import type { Event } from "./types";

export type SoundCue =
  | "select"
  | "step"
  | "push"
  | "attack"
  | "hit"
  | "guard"
  | "fire"
  | "smoke"
  | "strike"
  | "borrow"
  | "blocked"
  | "round"
  | "win"
  | "loss";
export interface SoundPreferences {
  effects: boolean;
  music: boolean;
}
const preferenceKey = "mutiny-sound-v1";
export function readSoundPreferences(): SoundPreferences {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(preferenceKey) ?? "null",
    );
    if (
      saved &&
      typeof saved === "object" &&
      "effects" in saved &&
      "music" in saved &&
      typeof saved.effects === "boolean" &&
      typeof saved.music === "boolean"
    )
      return { effects: saved.effects, music: saved.music };
  } catch {
    /* Sound also works when browser storage is unavailable. */
  }
  return { effects: true, music: false };
}
export function eventCue(event: Event): SoundCue | null {
  switch (event.kind) {
    case "moved":
    case "displaced":
    case "swapped":
      return "step";
    case "pushed":
      return "push";
    case "attacked":
      return "attack";
    case "damaged":
      return "hit";
    case "guarded":
    case "protected":
    case "certified":
      return "guard";
    case "ignited":
      return "fire";
    case "smoked":
      return "smoke";
    case "strike":
      return "strike";
    case "borrowed":
      return "borrow";
    case "blocked":
    case "refused":
      return "blocked";
    case "ended":
      return event.outcome === "delivered" ? "win" : "loss";
    default:
      return null;
  }
}

// Small, locally synthesized foley and a sparse plucked theme. No downloads or autoplay.
export function createBattleSound() {
  let preferences = readSoundPreferences();
  let context: AudioContext | undefined;
  let effectsGain: GainNode | undefined, musicGain: GainNode | undefined;
  let noise: AudioBuffer | undefined;
  let active = false,
    bar = 0;
  let musicTimer: ReturnType<typeof setInterval> | undefined;
  const effects = new Set<AudioScheduledSourceNode>(),
    music = new Set<AudioScheduledSourceNode>();
  const supported = typeof globalThis.AudioContext === "function";
  function stop(nodes: Set<AudioScheduledSourceNode>) {
    for (const source of nodes) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
      source.disconnect();
    }
    nodes.clear();
  }
  function tone(
    frequency: number,
    duration: number,
    volume: number,
    delay = 0,
    musical = false,
    endFrequency = frequency,
  ) {
    if (!context || !effectsGain || !musicGain) return;
    const at = context.currentTime + delay,
      oscillator = context.createOscillator(),
      envelope = context.createGain();
    oscillator.type = musical ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, endFrequency),
      at + duration,
    );
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(volume, at + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope).connect(musical ? musicGain : effectsGain);
    (musical ? music : effects).add(oscillator);
    oscillator.onended = () => {
      (musical ? music : effects).delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + duration + 0.01);
  }
  function rustle(
    duration: number,
    frequency: number,
    volume: number,
    delay = 0,
  ) {
    if (!context || !noise || !effectsGain) return;
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      envelope = context.createGain(),
      at = context.currentTime + delay;
    source.buffer = noise;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(volume, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(envelope).connect(effectsGain);
    effects.add(source);
    source.onended = () => {
      effects.delete(source);
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
    source.start(at);
    source.stop(at + duration);
  }
  function playBar() {
    // Four short phrases leave space for planning and foreground effects.
    const phrases = [
      [293.66, 369.99, 440, 369.99],
      [246.94, 293.66, 369.99],
      [220, 293.66, 329.63, 293.66],
      [246.94, 277.18, 293.66],
    ];
    const notes = phrases[bar++ % phrases.length]!;
    notes.forEach((frequency, i) =>
      tone(frequency, 0.65, 0.075, i * 0.65, true),
    );
    tone(bar % 2 ? 146.83 : 110, 2.1, 0.045, 0, true);
  }
  function syncMusic() {
    if (musicTimer !== undefined) clearInterval(musicTimer);
    musicTimer = undefined;
    stop(music);
    if (active && preferences.music && context?.state === "running") {
      playBar();
      musicTimer = setInterval(playBar, 5200);
    }
  }
  function cue(cue: SoundCue) {
    if (!active || !preferences.effects || context?.state !== "running") return;
    switch (cue) {
      case "select":
        tone(430, 0.06, 0.13, 0, false, 220);
        break;
      case "step":
        rustle(0.07, 450, 0.3);
        tone(130, 0.07, 0.2);
        break;
      case "push":
        tone(165, 0.3, 0.18, 0, false, 85);
        rustle(0.32, 650, 0.25);
        tone(95, 0.1, 0.3, 0.22);
        break;
      case "attack":
        rustle(0.15, 1800, 0.3);
        break;
      case "hit":
        tone(95, 0.14, 0.4, 0, false, 40);
        rustle(0.1, 800, 0.3);
        break;
      case "guard":
        tone(620, 0.25, 0.18);
        tone(930, 0.16, 0.08);
        break;
      case "fire":
        rustle(0.35, 1100, 0.5);
        tone(80, 0.25, 0.2, 0, false, 160);
        break;
      case "smoke":
        rustle(0.4, 2300, 0.25);
        break;
      case "strike":
        rustle(0.13, 1600, 0.3);
        tone(180, 0.1, 0.35, 0.16);
        tone(105, 0.16, 0.3, 0.21);
        break;
      case "borrow":
        // A quiet call and answer, aligned with captain then worker.
        rustle(0.08, 900, 0.2);
        tone(330, 0.12, 0.2);
        tone(495, 0.16, 0.2, 0.19);
        tone(660, 0.1, 0.08, 0.3);
        break;
      case "blocked":
        tone(130, 0.1, 0.15, 0, false, 100);
        break;
      case "round":
        tone(587.33, 0.55, 0.14);
        tone(1174.66, 0.3, 0.04);
        break;
      case "win":
        [293.66, 369.99, 440, 587.33].forEach((f, i) =>
          tone(f, 0.6, 0.22, i * 0.12),
        );
        break;
      case "loss":
        tone(220, 0.5, 0.15, 0, false, 110);
        tone(146.83, 0.7, 0.12, 0.15);
        break;
    }
  }
  return {
    supported,
    get preferences() {
      return preferences;
    },
    unlock() {
      if (!supported) return;
      try {
        if (!context) {
          context = new AudioContext();
          effectsGain = context.createGain();
          musicGain = context.createGain();
          effectsGain.gain.value = 0.28;
          musicGain.gain.value = 0.18;
          effectsGain.connect(context.destination);
          musicGain.connect(context.destination);
          noise = context.createBuffer(
            1,
            context.sampleRate,
            context.sampleRate,
          );
          const data = noise.getChannelData(0);
          let seed = 9317;
          for (let i = 0; i < data.length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
            data[i] = (seed / 2147483648) * 0.6;
          }
        }
        if (context.state === "suspended")
          void context
            .resume()
            .then(syncMusic)
            .catch(() => {});
      } catch {
        /* Audio failure must never interrupt a job. */
      }
    },
    configure(next: SoundPreferences) {
      preferences = next;
      try {
        localStorage.setItem(preferenceKey, JSON.stringify(next));
      } catch {
        /* Optional preference storage. */
      }
      if (!next.effects) stop(effects);
      syncMusic();
    },
    setActive(next: boolean) {
      active = next;
      if (!next) stop(effects);
      syncMusic();
    },
    cue,
    event(event: Event) {
      const next = eventCue(event);
      if (next) cue(next);
    },
    dispose() {
      active = false;
      if (musicTimer !== undefined) clearInterval(musicTimer);
      stop(effects);
      stop(music);
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
      context = undefined;
      effectsGain = undefined;
      musicGain = undefined;
      noise = undefined;
    },
  };
}
export type BattleSound = ReturnType<typeof createBattleSound>;
