import { describe, expect, it } from "vitest";

import { said } from "./music.ts";

// What the music card says when a share comes without sound (decision 49):
// what to do depends on what was shared, since a browser shares a tab's
// sound everywhere, a screen's only on some systems, and a window's nowhere.
describe("the music card's words for a share without sound", () => {
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
