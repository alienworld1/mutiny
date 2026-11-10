import { afterEach, describe, expect, it, vi } from "vitest";
import { createBattleSound, eventCue, readSoundPreferences } from "./sound";

afterEach(() => vi.unstubAllGlobals());
describe("optional battle sound", () => {
  it("defaults safely when storage is blocked or its data is invalid", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("Blocked");
      },
    });
    expect(readSoundPreferences()).toEqual({ effects: true, music: false });
    vi.stubGlobal("localStorage", {
      getItem: () => '{"effects":"yes","music":true}',
    });
    expect(readSoundPreferences()).toEqual({ effects: true, music: false });
  });
  it("keeps independent mute preferences", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => '{"effects":false,"music":true}',
    });
    expect(readSoundPreferences()).toEqual({ effects: false, music: true });
  });
  it("uses distinct cues for a real strike, an ordinary block, and defeat", () => {
    expect(
      eventCue({ kind: "strike", unit: 4, cell: 25, reason: "Fire" }),
    ).toBe("strike");
    expect(eventCue({ kind: "blocked", unit: 4, reason: "Occupied" })).toBe(
      "blocked",
    );
    expect(eventCue({ kind: "ended", outcome: "cart_lost" })).toBe("loss");
    expect(eventCue({ kind: "recovering", unit: 4 })).toBeNull();
  });
  it("never creates audio before a gesture and survives unsupported or rejected audio", () => {
    const constructor = vi.fn(function () {
      throw new Error("Unavailable");
    });
    vi.stubGlobal("AudioContext", constructor);
    const sound = createBattleSound();
    sound.setActive(true);
    sound.cue("win");
    expect(constructor).not.toHaveBeenCalled();
    expect(() => sound.unlock()).not.toThrow();
    expect(() => sound.dispose()).not.toThrow();
    vi.stubGlobal("AudioContext", undefined);
    const unavailable = createBattleSound();
    expect(unavailable.supported).toBe(false);
    expect(() => {
      unavailable.unlock();
      unavailable.cue("strike");
      unavailable.dispose();
    }).not.toThrow();
  });
});
