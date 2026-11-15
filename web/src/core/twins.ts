// Twins: copies of a chain born a hair apart, which fan out to show chaos
// (docs/decisions.md, decision 4). They live the same simulated time as the
// chain, under a budget of their own: when they do not fit it there are fewer
// of them, and time never runs slower for them (decision 20).

import type { ChainState } from "../physics/step.ts";

// 1 / the golden ratio: steps of it around a circle leave every first part of
// the sequence spread evenly.
const GOLDEN = 0.6180339887498949;

/**
 * Where twin j sits across the fan, from 0 to 1. Any first part of the
 * sequence covers the fan evenly, so dropping twins from the end leaves the
 * rest spread over all of it. The first sits in the middle.
 */
export function fanPlace(j: number): number {
  return (0.5 + j * GOLDEN) % 1;
}

/**
 * `count` twins of a chain as it is now: each is the whole chain turned by a
 * hair, between -spread / 2 and spread / 2 radians, by its place in the fan,
 * and moving as the chain moves.
 */
export function bornTwins(
  chain: ChainState,
  count: number,
  spread: number,
): ChainState[] {
  const twins: ChainState[] = [];
  for (let j = 0; j < count; j++) {
    const turn = spread * (fanPlace(j) - 0.5);
    twins.push({
      theta: chain.theta.map((angle) => angle + turn),
      omega: Float64Array.from(chain.omega),
    });
  }
  return twins;
}

/** How many twins a frame carries, from what they were measured to cost. */
export class TwinBudget {
  /** The time the twins may take in a frame, in ms. */
  readonly budget: number;
  /** What one twin costs in a frame, in ms, as measured lately. */
  cost: number;
  #framesOver = 0;

  constructor(budget: number, cost: number) {
    if (!(budget > 0 && cost > 0)) {
      throw new Error("a twin budget and a twin's cost must be positive");
    }
    this.budget = budget;
    this.cost = cost;
  }

  /** The twins that fit in the budget, with a fifth of it to spare. */
  affordable(): number {
    return Math.max(0, Math.floor(this.budget / (this.cost * 1.2)));
  }

  /**
   * After a frame that advanced `done` of `count` twins in `spent` ms: learns
   * their cost, and returns how many to keep. Those the frame did not reach
   * are dropped, and so is what three frames in a row over a quarter past the
   * budget could not carry.
   */
  measured(done: number, count: number, spent: number): number {
    if (done > 0) this.cost += 0.2 * (spent / done - this.cost);
    let keep = Math.min(count, done);
    this.#framesOver = spent > this.budget * 1.25 ? this.#framesOver + 1 : 0;
    if (this.#framesOver >= 3) {
      keep = Math.min(keep, Math.floor((keep * this.budget) / spent));
      this.#framesOver = 0;
    }
    return keep;
  }

  /**
   * The chain went from `before` to `after` masses. A twin costs more per
   * substep and needs more substeps, between linear and quadratic in the
   * masses; the measured cost takes over within a few frames.
   */
  rescale(before: number, after: number): void {
    this.cost *= (after / before) ** 1.5;
  }
}
