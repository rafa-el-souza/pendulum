import { describe, expect, it } from "vitest";

import { parseColor, type Rgb } from "./color.ts";
import {
  COLOURS,
  PALETTES,
  noteColor,
  paletteAt,
  paletteNamed,
  throughColors,
} from "./palettes.ts";

/** The sketch's ramp, as it was written for the sketch the author approved. */
function sketchRamp(place: number): [number, number, number] {
  const t = 0.36 - 0.46 * place;
  return [
    0.5 + 0.5 * Math.cos(2 * Math.PI * t),
    0.5 + 0.5 * Math.cos(2 * Math.PI * (t + 0.33)),
    0.5 + 0.5 * Math.cos(2 * Math.PI * (t + 0.67)),
  ];
}

/** A colour in OKLab (Björn Ottosson, 2020): lightness from 0 to 1, then a and b. */
function oklab([r, g, b]: Rgb): [number, number, number] {
  const linear = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** How far apart two colours look, as the distance between them in OKLab. */
function apart(x: Rgb, y: Rgb): number {
  const [a, b] = [oklab(x), oklab(y)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const PLACES = Array.from({ length: 101 }, (_, i) => i / 100);

describe("the palettes", () => {
  it("open with the sketch's ramp, blue through magenta to amber, which the author keeps (decision 23)", () => {
    const [first] = PALETTES;
    if (first === undefined) throw new Error("there are no palettes");
    for (const place of PLACES) {
      const color = first.color(place);
      sketchRamp(place).forEach((channel, i) => {
        expect(color[i]).toBeCloseTo(channel, 12);
      });
    }
  });

  it("are the thirty-six of decision 104, each with a name of its own, for a screen reader and the address", () => {
    expect(PALETTES).toHaveLength(36);
    const names = PALETTES.map((palette) => palette.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+( [a-z]+)*$/);
  });

  it("give every place across the fan a colour within 0 and 1, in every palette", () => {
    for (const palette of PALETTES) {
      for (const place of PLACES) {
        for (const channel of palette.color(place)) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("have seven colours each, which the fan passes through in order, a closed one coming back to its first at the far edge (decision 104)", () => {
    for (const { name, colors, closed, color } of PALETTES) {
      expect(colors, name).toHaveLength(COLOURS);
      const spans = closed ? COLOURS : COLOURS - 1;
      colors.forEach((stop, k) => {
        color(k / spans).forEach((channel, i) => {
          expect(channel, name).toBeCloseTo(stop[i] ?? Number.NaN, 12);
        });
      });
      const end = closed ? colors[0] : colors[COLOURS - 1];
      color(1).forEach((channel, i) => {
        expect(channel, name).toBeCloseTo(end?.[i] ?? Number.NaN, 12);
      });
    }
    expect(PALETTES.filter(({ closed }) => closed).length).toBeGreaterThan(0);
  });

  it("have seven colours that differ, in steps of a size, the tension's heat apart (decision 104)", () => {
    for (const { name, colors, closed } of PALETTES) {
      colors.forEach((a, i) => {
        colors.slice(i + 1).forEach((b) => {
          expect(apart(a, b), name).toBeGreaterThanOrEqual(0.03);
        });
      });
      const steps = colors
        .slice(1)
        .map((b, i) => apart(colors[i] ?? b, b))
        .concat(
          closed
            ? [apart(colors[COLOURS - 1] ?? [0, 0, 0], colors[0] ?? [0, 0, 0])]
            : [],
        );
      // heat's largest step is where the chain's own colour stands between
      // half a weight and two, on the tension's scale
      const uneven = name === "heat" ? 3.7 : 3.5;
      expect(Math.max(...steps) / Math.min(...steps), name).toBeLessThanOrEqual(
        uneven,
      );
    }
  });

  it("have no colour too dim to see on a dark ground: none darker than 0.45 in OKLab, nor than 0.55 unless vivid (decision 104)", () => {
    for (const { name, colors } of PALETTES) {
      for (const color of colors) {
        const [lightness, a, b] = oklab(color);
        expect(lightness, name).toBeGreaterThanOrEqual(0.45);
        if (lightness < 0.55) {
          expect(Math.hypot(a, b), name).toBeGreaterThanOrEqual(0.12);
        }
      }
    }
  });

  it("are found by their place in the list, or by their name, and nowhere else", () => {
    expect(paletteAt(0)).toBe(PALETTES[0]);
    expect(() => paletteAt(PALETTES.length)).toThrow();
    expect(() => paletteAt(0.5)).toThrow();
    expect(paletteNamed("dusk")).toBe(0);
    expect(paletteNamed("black body")).toBe(
      PALETTES.findIndex(({ name }) => name === "black body"),
    );
    expect(() => paletteNamed("black-body")).toThrow();
  });
});

describe("a palette through colours", () => {
  const grey = throughColors(["#000000", "#ffffff"].map(parseColor));
  const three = throughColors(
    ["#ff0000", "#00ff00", "#0000ff"].map(parseColor),
  );
  const round = throughColors(
    ["#ff0000", "#00ff00", "#0000ff"].map(parseColor),
    true,
  );

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

  it("comes back to its first colour at 1 when it is closed, the others a third of the way apart", () => {
    expect(round(0)).toEqual([1, 0, 0]);
    expect(round(1 / 3)).toEqual([0, 1, 0]);
    expect(round(2 / 3)).toEqual([0, 0, 1]);
    expect(round(1)).toEqual([1, 0, 0]);
    expect(round(5 / 6)).toEqual([0.5, 0, 0.5]);
  });

  it("needs two colours or more", () => {
    expect(() => throughColors([[1, 1, 1]])).toThrow();
  });
});

describe("the colours of the twelve notes", () => {
  const distance = (a: Rgb, b: Rgb) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  it("give each note its own bright colour round the wheel, a fifth apart as neighbours (decision 49)", () => {
    const colors = Array.from({ length: 12 }, (_, name) => noteColor(name));
    colors.forEach((color, a) => {
      expect(Math.max(...color)).toBeCloseTo(1, 12);
      for (const channel of color) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
      colors.slice(a + 1).forEach((other) => {
        expect(distance(color, other)).toBeGreaterThan(0.1);
      });
    });
    // C and G are a fifth apart, and neighbours; C and C sharp are not
    expect(distance(noteColor(0), noteColor(7))).toBeLessThan(
      distance(noteColor(0), noteColor(1)),
    );
    // a name past B is the same note
    expect(noteColor(12)).toEqual(noteColor(0));
  });
});
