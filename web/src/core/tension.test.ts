import { describe, expect, it } from "vitest";

import { Chain, gravity } from "../physics/chain.ts";
import { restingState } from "../physics/step.ts";
import type { Rgb } from "./color.ts";
import {
  EARTH,
  TENSION_STOPS,
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

describe("the colour of a place on the scale (decision 35)", () => {
  const chain: Rgb = [1, 0.94, 0.82];
  const scale = tensionScale(chain);

  it("is the chain's own colour at 0", () => {
    expect(scale(0)).toEqual(chain);
  });

  it("is each stop's colour at its place, and mixes between neighbours", () => {
    for (const [place, color] of TENSION_STOPS) {
      expect(scale(place)).toEqual(color);
    }
    const [[a, from], [b, to]] = TENSION_STOPS.slice(-2) as [
      [number, Rgb],
      [number, Rgb],
    ];
    const middle = scale((a + b) / 2);
    middle.forEach((channel, k) => {
      expect(channel).toBeCloseTo(((from[k] ?? 0) + (to[k] ?? 0)) / 2, 12);
    });
  });

  it("holds the colour of the nearer end outside -1 to 1", () => {
    expect(scale(-3)).toEqual(scale(-1));
    expect(scale(3)).toEqual(scale(1));
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
