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
 * author chose by trying, with 0.9 one step up (decision 17).
 */
export const TIME: Parameter = {
  id: "time",
  label: "Speed of time",
  values: [0.1, 0.25, 0.5, 0.8, 0.9, 1, 1.5, 2, 3, 4],
  initial: 0.8,
  keys: { down: ["ArrowLeft", "["], up: ["ArrowRight", "]"] },
  show: (value) => `×${String(value)}`,
};

export const PARAMETERS: readonly Parameter[] = [MASSES, TIME];
