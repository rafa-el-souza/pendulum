import { describe, expect, it } from "vitest";

import { Chain, gravity } from "../physics/chain.ts";
import { restingState } from "../physics/step.ts";
import type { Rgb } from "./color.ts";
import { parseColor } from "./color.ts";
import { GROUNDS } from "./grounds.ts";
import { PALETTES, paletteNamed } from "./palettes.ts";
import {
  EARTH,
  TENSION_PLACES,
  TensionShades,
  earthWeights,
  tensionPlace,
  tensionScale,
} from "./tension.ts";

describe("each rod's weight on Earth (decision 35; PH-3)", () => {
  it("is the Earth's gravity times the mass at or below the rod", () => {
    const weights = earthWeights(new Chain([0.5, 0.2, 0.3], [1, 1, 1]));
    expect(Array.from(weights)).toEqual([EARTH * 1, EARTH * 0.5, EARTH * 0.3]);
  });

  it("is what every rod of a chain hanging at rest on Earth pulls with, so that each holds one weight", () => {
    // PH-4: hanging still, a rod pulls up exactly what hangs from it.
    for (const chain of [
      Chain.uniform(1),
      Chain.uniform(16),
      new Chain([0.1, 2, 0.4, 0.05], [0.2, 0.5, 0.1, 0.2]),
    ]) {
      const alpha = new Float64Array(chain.n);
      const tension = new Float64Array(chain.n);
      const { theta, omega } = restingState(chain.n);
      chain.solve(theta, omega, gravity(EARTH), alpha, tension);
      const weights = earthWeights(chain);
      tension.forEach((t, j) => {
        expect(t / (weights[j] ?? Number.NaN)).toBeCloseTo(1, 12);
      });
    }
  });
});

describe("the place of a tension on the colour scale (decision 35)", () => {
  it("is 0 where a rod pulls with the weight it holds on Earth", () => {
    expect(tensionPlace(1)).toBe(0);
  });

  it("warms a quarter of the way each time the tension doubles, to the hot end at sixteen weights", () => {
    expect(tensionPlace(2)).toBeCloseTo(0.25, 12);
    expect(tensionPlace(4)).toBeCloseTo(0.5, 12);
    expect(tensionPlace(8)).toBeCloseTo(0.75, 12);
    expect(tensionPlace(16)).toBe(1);
    expect(tensionPlace(1000)).toBe(1);
    expect(tensionPlace(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("cools in a straight line to the middle of the cold half as the rod goes slack", () => {
    expect(tensionPlace(0.5)).toBeCloseTo(-0.25, 12);
    expect(tensionPlace(0)).toBe(-0.5);
  });

  it("goes on cooling as the rod pushes, which a chain of links cannot, to the cold end at a weight's push", () => {
    expect(tensionPlace(-0.5)).toBeCloseTo(-0.75, 12);
    expect(tensionPlace(-1)).toBe(-1);
    expect(tensionPlace(-50)).toBe(-1);
    expect(tensionPlace(Number.NEGATIVE_INFINITY)).toBe(-1);
  });

  it("rises with the tension, and only with it", () => {
    let last = -Infinity;
    for (let ratio = -3; ratio <= 40; ratio += 0.01) {
      const place = tensionPlace(ratio);
      expect(place).toBeGreaterThanOrEqual(last);
      last = place;
    }
  });

  it("is 0 for a tension that is not a number, so that a broken frame is not painted", () => {
    expect(tensionPlace(Number.NaN)).toBe(0);
  });
});

describe("the tension's colours in a palette (decisions 35 and 104)", () => {
  it("are its seven colours at a push, a slack rod, half a weight, and 2, 4, 8 and 16 weights, the chain's own colour standing at one weight between them", () => {
    expect(TENSION_PLACES).toEqual([-1, -0.5, -0.25, 0.25, 0.5, 0.75, 1]);
    expect(
      [-1, 0, 0.5, 2, 4, 8, 16].map((weights) => tensionPlace(weights)),
    ).toEqual([-1, -0.5, -0.25, 0.25, 0.5, 0.75, 1]);
    expect(tensionPlace(1)).toBe(0);
  });

  it("are the chain's own colour at 0, and each of the palette's at its place, in every palette", () => {
    const chain: Rgb = [1, 0.94, 0.82];
    for (const { name, colors } of PALETTES) {
      const color = tensionScale(chain, colors);
      expect(color(0), name).toEqual(chain);
      TENSION_PLACES.forEach((place, k) => {
        expect(color(place), name).toEqual(colors[k]);
      });
    }
  });

  it("mix neighbours in a straight line, and hold the nearer end's colour outside -1 to 1", () => {
    const chain: Rgb = [1, 0.94, 0.82];
    const { colors } = PALETTES[paletteNamed("jellyfish")] ?? { colors: [] };
    const color = tensionScale(chain, colors);
    const [from, to] = [colors[5] ?? chain, colors[6] ?? chain];
    color(0.875).forEach((channel, k) => {
      expect(channel).toBeCloseTo(((from[k] ?? 0) + (to[k] ?? 0)) / 2, 12);
    });
    color(0.125).forEach((channel, k) => {
      expect(channel).toBeCloseTo(
        ((chain[k] ?? 0) + (colors[3]?.[k] ?? 0)) / 2,
        12,
      );
    });
    expect(color(-3)).toEqual(color(-1));
    expect(color(3)).toEqual(color(1));
  });

  it("are, in heat on the first ground, the colours decision 35's scale gave every tension", () => {
    // decision 35's scale: five colours, the chain's own at one weight
    const before: [number, Rgb][] = [
      [-1, parseColor("#9a66ff")],
      [-0.5, parseColor("#4a8cff")],
      [0.25, parseColor("#ffc24d")],
      [0.5, parseColor("#ff8a26")],
      [1, parseColor("#ff3b2b")],
    ];
    const [night] = GROUNDS;
    if (night === undefined) throw new Error("there are no grounds");
    const stops = [...before, [0, night.chain] as [number, Rgb]].sort(
      ([a], [b]) => a - b,
    );
    const old = (place: number): Rgb => {
      const i = stops.findIndex(([at], k) => k > 0 && place <= at);
      const [a, x] = stops[i - 1] ?? stops[0] ?? [0, night.chain];
      const [b, y] = stops[i] ?? [0, night.chain];
      const share = (place - a) / (b - a);
      return [0, 1, 2].map(
        (k) => (x[k] ?? 0) + share * ((y[k] ?? 0) - (x[k] ?? 0)),
      ) as unknown as Rgb;
    };
    const { colors } = PALETTES[paletteNamed("heat")] ?? { colors: [] };
    const color = tensionScale(night.chain, colors);
    for (let place = -1; place <= 1; place += 1 / 64) {
      const [now, was] = [color(place), old(place)];
      now.forEach((channel, k) => {
        expect(Math.abs(channel - (was[k] ?? 0))).toBeLessThanOrEqual(
          0.5 / 255 + 1e-12,
        );
      });
    }
  });
});

describe("the shades of the rods, eased from frame to frame (decision 35)", () => {
  it("start at the chain's own colour, and move a share of the way to each rod's place", () => {
    const shades = new TensionShades(3);
    expect(Array.from(shades.places)).toEqual([0, 0, 0]);
    const weights = Float64Array.of(2, 1, 1);
    // 16 weights, half its weight, none
    shades.ease(Float64Array.of(32, 0.5, 0), weights, 0.25);
    expect(shades.places[0]).toBeCloseTo(0.25, 12);
    expect(shades.places[1]).toBeCloseTo(-0.0625, 12);
    expect(shades.places[2]).toBeCloseTo(-0.125, 12);
    shades.ease(Float64Array.of(32, 0.5, 0), weights, 1);
    expect(Array.from(shades.places)).toEqual([1, -0.25, -0.5]);
  });
});
