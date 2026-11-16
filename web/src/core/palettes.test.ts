import { describe, expect, it } from "vitest";

import { FAN_PALETTES, fanPalette, throughColors } from "./palettes.ts";

/** The sketch's ramp, as it was written for the sketch the author approved. */
function sketchRamp(place: number): [number, number, number] {
  const t = 0.36 - 0.46 * place;
  return [
    0.5 + 0.5 * Math.cos(2 * Math.PI * t),
    0.5 + 0.5 * Math.cos(2 * Math.PI * (t + 0.33)),
    0.5 + 0.5 * Math.cos(2 * Math.PI * (t + 0.67)),
  ];
}

const PLACES = Array.from({ length: 101 }, (_, i) => i / 100);

describe("the palettes of a fan of twins", () => {
  it("open with the sketch's ramp, blue through magenta to amber, which the author keeps (decision 23)", () => {
    const [first] = FAN_PALETTES;
    if (first === undefined) throw new Error("there are no palettes");
    for (const place of PLACES) {
      const color = first.color(place);
      sketchRamp(place).forEach((channel, i) => {
        expect(color[i]).toBeCloseTo(channel, 12);
      });
    }
  });

  it("give every place across the fan a colour within 0 and 1, in every palette", () => {
    for (const palette of FAN_PALETTES) {
      for (const place of PLACES) {
        for (const channel of palette.color(place)) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("have names of their own, for a screen reader", () => {
    const names = FAN_PALETTES.map((palette) => palette.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z ]*$/);
  });

  it("keep the five of decision 23 first, in their order, so that an address written before keeps its colours, and add new ones after (decision 41)", () => {
    const names = FAN_PALETTES.map((palette) => palette.name);
    expect(names.slice(0, 5)).toEqual([
      "dusk",
      "fire",
      "ice",
      "spectrum",
      "silver",
    ]);
    expect(names.length).toBeGreaterThan(5);
  });

  it("are found by their place in the list, and nowhere else", () => {
    expect(fanPalette(0)).toBe(FAN_PALETTES[0]);
    expect(() => fanPalette(FAN_PALETTES.length)).toThrow();
    expect(() => fanPalette(0.5)).toThrow();
  });
});

describe("a palette through colours", () => {
  const grey = throughColors("#000000", "#ffffff");
  const three = throughColors("#ff0000", "#00ff00", "#0000ff");

  it("passes through each colour at its place, spaced evenly from 0 to 1", () => {
    expect(three(0)).toEqual([1, 0, 0]);
    expect(three(0.5)).toEqual([0, 1, 0]);
    expect(three(1)).toEqual([0, 0, 1]);
  });

  it("mixes neighbours in a straight line between their places", () => {
    expect(grey(0.25)).toEqual([0.25, 0.25, 0.25]);
    expect(three(0.75)).toEqual([0, 0.5, 0.5]);
  });

  it("takes the colour at the nearer end for a place outside 0 to 1", () => {
    expect(three(-0.5)).toEqual([1, 0, 0]);
    expect(three(2)).toEqual([0, 0, 1]);
  });

  it("needs two colours or more, each written as #rrggbb", () => {
    expect(() => throughColors("#ffffff")).toThrow();
    expect(() => throughColors("#fff", "#000")).toThrow();
  });
});
