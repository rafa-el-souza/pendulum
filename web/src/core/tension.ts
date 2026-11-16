// The colour of the tension (docs/decisions.md, decision 35): each rod of a
// chain painted by how hard it pulls, against the weight it holds hanging
// still on Earth. A chain hanging at rest on Earth is its own colour all
// along; a rod that pulls harder, as at the bottom of a swing or in a whip's
// crack, warms, through amber and orange to red at sixteen weights; a rod
// that goes slack cools to blue, and one that pushes, which a chain of links
// cannot do and the rods of these equations can (PH-4), cools on to violet.
// That is the first scale; the others paint the same places in other colours
// (decision 41). The stops are placeholders for the author to settle by
// looking.

import type { Chain } from "../physics/chain.ts";
import { parseColor, type Rgb } from "./color.ts";

/** The Earth's gravity, in m/s², the weight every tension is measured in, whatever gravity the chain is under. */
export const EARTH = 9.81;

/** Tensions of this many weights and more are at the hot end of the scale. */
const HOT = 16;

/** A scale of the tension's colours. */
export interface TensionScale {
  /** What a screen reader, the title and the row call it. */
  readonly name: string;
  /**
   * Its fixed colours, at their places from -1 to 1; the chain's own colour
   * is at 0. A rod pushing with a weight or more is at -1, a slack rod at
   * -0.5, and one pulling with 2, 4 and 16 weights at 0.25, 0.5 and 1.
   */
  readonly stops: readonly (readonly [number, Rgb])[];
}

/** A scale whose colours, written as #rrggbb, are those of a push, a slack rod, and 2, 4 and 16 weights. */
function scale(
  name: string,
  push: string,
  slack: string,
  two: string,
  four: string,
  sixteen: string,
): TensionScale {
  return {
    name,
    stops: [
      [-1, parseColor(push)],
      [-0.5, parseColor(slack)],
      [0.25, parseColor(two)],
      [0.5, parseColor(four)],
      [1, parseColor(sixteen)],
    ],
  };
}

export const TENSION_SCALES: readonly TensionScale[] = [
  // decision 35's: cold violet and blue, warm amber, orange and red
  scale("heat", "#9a66ff", "#4a8cff", "#ffc24d", "#ff8a26", "#ff3b2b"),
  // a body's light as it heats: a slack rod glows dull orange, and one
  // pulling hard goes past white to the blue of the hottest stars
  scale("incandescent", "#7a1c12", "#ff6a1f", "#ffffff", "#cfe0ff", "#8fb3ff"),
  // cold blue and cyan, warm pink, magenta and violet
  scale("neon", "#3d5bff", "#2ad6f0", "#ff8ae0", "#ff42d0", "#c22cff"),
  // cold indigo and teal, warm lime and greens
  scale("verdant", "#6a4cff", "#25b5c8", "#c6f25a", "#7ee04a", "#21d07a"),
];

/** The scale at `index` in TENSION_SCALES; any other index throws. */
export function tensionScaleAt(index: number): TensionScale {
  const found = Number.isInteger(index) ? TENSION_SCALES[index] : undefined;
  if (found === undefined) {
    throw new Error(`there is no tension scale ${String(index)}`);
  }
  return found;
}

/** The weight each rod holds hanging still on Earth: the Earth's gravity times the mass at or below it (M_j of PH-3), in N. */
export function earthWeights(chain: Chain): Float64Array {
  const weights = new Float64Array(chain.n);
  let below = 0;
  for (let j = chain.n - 1; j >= 0; j--) {
    below += chain.masses[j] ?? 0;
    weights[j] = EARTH * below;
  }
  return weights;
}

/**
 * Where a tension of `ratio` weights falls on the scale, from -1 to 1: 0 at
 * one weight; above, a quarter of the way to the hot end each time the
 * tension doubles; below, in a straight line to -0.5 when the rod is slack,
 * and on to -1 as it pushes with a weight. A ratio that is not a number is
 * at 0.
 */
export function tensionPlace(ratio: number): number {
  if (Number.isNaN(ratio)) return 0;
  if (ratio >= 1) return Math.min(1, Math.log2(ratio) / Math.log2(HOT));
  if (ratio >= 0) return -0.5 * (1 - ratio);
  return -0.5 - 0.5 * Math.min(1, -ratio);
}

/** A scale's colours with the chain's own at 0, mixed in a straight line between neighbours; outside -1 to 1, the nearer end's. */
export function tensionScale(
  chain: Rgb,
  { stops: fixed }: TensionScale,
): (place: number) => Rgb {
  const stops = [...fixed, [0, chain] as const].sort(([a], [b]) => a - b);
  const last = stops.length - 1;
  return (place) => {
    const at = Math.min(1, Math.max(-1, place));
    let i = 0;
    while (i < last - 1 && at > (stops[i + 1]?.[0] ?? 1)) i++;
    const [a, from] = stops[i] ?? [0, chain];
    const [b, to] = stops[i + 1] ?? [0, chain];
    const share = b > a ? (at - a) / (b - a) : 0;
    if (share <= 0) return from;
    if (share >= 1) return to;
    return [
      from[0] + share * (to[0] - from[0]),
      from[1] + share * (to[1] - from[1]),
      from[2] + share * (to[2] - from[2]),
    ];
  };
}

/**
 * Each rod's place on the scale, eased from frame to frame so that a tension
 * changing faster than the eye follows shows as it goes rather than as a
 * flicker. They start at 0, the chain's own colour.
 */
export class TensionShades {
  readonly places: Float64Array;

  constructor(n: number) {
    this.places = new Float64Array(n);
  }

  /** Moves each rod's place `share` of the way to that of its tension, in weights of `weights`. */
  ease(tension: Float64Array, weights: Float64Array, share: number): void {
    const places = this.places;
    for (let j = 0; j < places.length; j++) {
      const target = tensionPlace(
        (tension[j] ?? Number.NaN) / (weights[j] ?? Number.NaN),
      );
      places[j] = (places[j] ?? 0) + share * (target - (places[j] ?? 0));
    }
  }
}
