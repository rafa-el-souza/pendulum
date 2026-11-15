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

export const PARAMETERS: readonly Parameter[] = [MASSES, TIME, HAND];
