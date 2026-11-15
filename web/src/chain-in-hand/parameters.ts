import { FAN_PALETTES, fanPalette } from "../core/palettes.ts";
import type { Parameter } from "../core/parameters.ts";

// The first piece's parameters (docs/decisions.md, decision 10). Each feeds
// its control on screen, its keys and the shareable address.

/** How many masses the chain has, from one to a rope, on the sketch's ladder. */
export const MASSES: Parameter = {
  id: "n",
  label: "Number of masses",
  values: [
    1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512,
  ],
  initial: 2,
  keys: { down: ["ArrowDown", "-"], up: ["ArrowUp", "+", "="] },
  show: (value) => `n = ${String(value)}`,
};

/**
 * How fast time runs, as a multiple of real time for a chain 1 m long
 * (decision 15). It starts a little slower than real time, at 0.8, which the
 * author chose by trying, with 0.9 one step up (decisions 17 and 19).
 */
export const TIME: Parameter = {
  id: "time",
  label: "Speed of time",
  values: [0.1, 0.25, 0.5, 0.8, 0.9, 1, 1.5, 2, 3, 4],
  initial: 0.8,
  keys: { down: ["ArrowLeft", "["], up: ["ArrowRight", "]"] },
  show: (value) => `×${String(value)}`,
};

/**
 * How firmly the hand holds the chain, from elastic to firm (decision 18):
 * each step is a spring rate in rad/s for the whole chain's mass and a
 * damping ratio for the mass held (createHand). At the elastic end the chain
 * hangs below the finger and bounces as on a rubber band, and a pull let go
 * at the right moment flings it; at the firm end, the hand before this
 * control, the held mass stays on the finger and a throw leaves at the
 * gesture's speed. The author tried these steps and kept them (decision
 * 19).
 */
const GRIPS: ReadonlyMap<number, number> = new Map([
  [4, 0.3],
  [7, 0.45],
  [12, 0.6],
  [20, 0.8],
  [40, 1],
]);

/** The damping ratio of the hand's step at `rate` rad/s. */
export function handDamping(rate: number): number {
  const ratio = GRIPS.get(rate);
  if (ratio === undefined) {
    throw new Error(`the hand has no step at ${String(rate)} rad/s`);
  }
  return ratio;
}

const RATES = [...GRIPS.keys()];

export const HAND: Parameter = {
  id: "hand",
  label: "Firmness of the hand",
  values: RATES,
  initial: 40,
  keys: { down: [",", "<"], up: [".", ">"] },
  // one pip per step, filled up to this one
  show: (value) => {
    const filled = RATES.indexOf(value) + 1;
    return "●".repeat(filled) + "○".repeat(RATES.length - filled);
  },
  speak: (value) =>
    `${String(RATES.indexOf(value) + 1)} of ${String(RATES.length)}`,
};

/**
 * How many twins are born when the chain is let go (decisions 20 and 22): the
 * sketch's choices, from none to 4 096. Their budget may carry fewer, and the
 * control then shows how many it carries.
 */
export const TWIN_COUNT: Parameter = {
  id: "twins",
  label: "Number of twins",
  values: [0, 64, 512, 4096],
  initial: 512,
  keys: { down: ["9"], up: ["0"] },
  show: (value) => String(value),
  icon: "fan",
};

/**
 * How long the trails last, as the half-life of their light in seconds of
 * simulated time (decisions 21 and 22): from none to one that stays, whose
 * half-life of ten minutes a visit does not see fade.
 */
const HALF_LIVES = [0, 0.5, 1, 2.5, 10, 600];

export const TRAIL: Parameter = {
  id: "trail",
  label: "Length of the trails",
  values: HALF_LIVES,
  initial: 2.5,
  keys: { down: ["7"], up: ["8"] },
  // one pip per length, none when the trails are off
  show: (value) => {
    const filled = HALF_LIVES.indexOf(value);
    return "●".repeat(filled) + "○".repeat(HALF_LIVES.length - 1 - filled);
  },
  speak: (value) => {
    if (value === 0) return "off";
    if (value === HALF_LIVES.at(-1)) return "stays";
    return `${String(value)} s`;
  },
  icon: "comet",
};

/**
 * The twins' colours, and their trails' (decision 23): one palette per step,
 * opening with the sketch's, which the author keeps. The control paints five
 * dots from one edge of the fan to the other in the palette's colours, and a
 * screen reader hears its name.
 */
const SWATCH_PLACES = [0, 0.25, 0.5, 0.75, 1];

export const PALETTE: Parameter = {
  id: "palette",
  label: "Colours of the twins",
  values: FAN_PALETTES.map((_, i) => i),
  initial: 0,
  keys: { down: ["5"], up: ["6"] },
  show: (value) => fanPalette(value).name,
  swatches: (value) => {
    const palette = fanPalette(value);
    return SWATCH_PLACES.map((place) => palette.color(place));
  },
};

export const PARAMETERS: readonly Parameter[] = [
  MASSES,
  TIME,
  HAND,
  TWIN_COUNT,
  TRAIL,
  PALETTE,
];
