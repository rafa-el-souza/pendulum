import { describe, expect, it } from "vitest";

import { QUIET, type Signals } from "../audio/signals.ts";
import { said, tempoWords } from "./music.ts";

// What the music's panel says when a share comes without sound (decision 49):
// what to do depends on what was shared, since a browser shares a tab's
// sound everywhere, a screen's only on some systems, and a window's nowhere.
describe("the music's panel's words for a share without sound", () => {
  it("asks for the tab's audio when a tab was shared", () => {
    expect(said({ kind: "soundless", surface: "browser" })).toBe(
      "The tab was shared without its sound. In the browser's dialog, tick the box that shares the tab's audio.",
    );
  });

  it("says a window shares no sound, and asks for the tab", () => {
    expect(said({ kind: "soundless", surface: "window" })).toBe(
      "A window is shared without its sound. In the browser's dialog, pick the tab playing the music and tick the box that shares its audio.",
    );
  });

  it("says where a screen's sound is offered, and asks for the tab elsewhere", () => {
    expect(said({ kind: "soundless", surface: "monitor" })).toBe(
      "The screen was shared without its sound. Where the browser offers it, tick the box that shares it; elsewhere, pick the tab playing the music and tick the box that shares its audio.",
    );
  });

  it("asks for the tab when what was shared is not told", () => {
    expect(said({ kind: "soundless", surface: "" })).toBe(
      "No sound came with the share. In the browser's dialog, pick the tab playing the music and tick the box that shares its audio.",
    );
  });
});

// The music's tempo, beside the panel's words, once the beat clock is sure
// of it and while the music sounds (decision 78); shown, it stays until the
// clock is clearly unsure, so that it does not flicker.
describe("the music's tempo beside the panel's words", () => {
  const heard = (over: Partial<Signals>): Signals => ({
    ...QUIET,
    silent: false,
    ...over,
  });
  const beat = { at: 3, bpm: 119.6, phase: 0.2, bar: 0.3, confidence: 0.9 };
  const sure = (confidence: number) => heard({ beat: { ...beat, confidence } });

  it("says the tempo, rounded, where the clock is sure", () => {
    expect(tempoWords(heard({ beat }), false)).toBe("120 bpm.");
  });

  it("says none where the clock has no tempo, or the music is silent", () => {
    expect(tempoWords(heard({ beat: null }), true)).toBe("");
    expect(tempoWords(heard({ beat, silent: true }), true)).toBe("");
  });

  it("begins to say it at a sureness of 0.8, and stops under 0.6", () => {
    expect(tempoWords(sure(0.79), false)).toBe("");
    expect(tempoWords(sure(0.8), false)).toBe("120 bpm.");
    expect(tempoWords(sure(0.61), true)).toBe("120 bpm.");
    expect(tempoWords(sure(0.59), true)).toBe("");
  });
});
