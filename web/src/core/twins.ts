// Twins: copies of a chain born a hair apart, which fan out to show chaos
// (docs/decisions.md, decision 4). They live the same simulated time as the
// chain, under a budget of their own: when they do not fit it there are fewer
// of them, and time never runs slower for them (decision 20). They can stay
// once the fan has opened, or fade as chaos carries them off from the chain
// and be born again on it, a few a frame, so that they come out of it as a
// plume (decision 43).

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
 * Twin j of a chain as it is now: the whole chain turned by a hair, between
 * -spread / 2 and spread / 2 radians, by the twin's place in the fan, and
 * moving as the chain moves.
 */
export function bornTwin(
  chain: ChainState,
  j: number,
  spread: number,
): ChainState {
  const turn = spread * (fanPlace(j) - 0.5);
  return {
    theta: chain.theta.map((angle) => angle + turn),
    omega: Float64Array.from(chain.omega),
  };
}

/** `count` twins of a chain as it is now, the first `count` places of the fan. */
export function bornTwins(
  chain: ChainState,
  count: number,
  spread: number,
): ChainState[] {
  return Array.from({ length: count }, (_, j) => bornTwin(chain, j, spread));
}

/**
 * How far apart two chains look, from where their masses are: the root mean
 * square of the distances between each mass of one and the same mass of the
 * other, as a share of the chain's length.
 */
export function apart(
  x: Float64Array,
  y: Float64Array,
  otherX: Float64Array,
  otherY: Float64Array,
  length: number,
): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = (otherX[i] ?? 0) - (x[i] ?? 0);
    const dy = (otherY[i] ?? 0) - (y[i] ?? 0);
    sum += dx * dx + dy * dy;
  }
  return Math.sqrt(sum / Math.max(1, x.length)) / length;
}

/**
 * The light of a twin `apart` from its chain (decision 43): whole on the
 * chain, staying near whole while the two look as one, falling to a third
 * at `reach` and all but out at twice it.
 */
export function lightApart(distance: number, reach: number): number {
  return Math.exp(-((distance / reach) ** 2));
}

/** A twin whose light is below this has gone dark, and is born again. */
const DARK = 1 / 64;

/**
 * How many twins of `count` may be born in a frame, again or anew, while they
 * fade (decision 43): a sixty-fourth of them, and one at least, so that they
 * come as a flow and not all at once.
 */
export function bornPerFrame(count: number): number {
  return Math.max(1, Math.ceil(count / 64));
}

/**
 * The light of each twin while the twins fade (decision 43), by its place in
 * the fan. It falls as chaos carries the twin off from the chain and never
 * rises again, so that a twin that has been carried off stays dark where it
 * crosses the chain; the light measures how far the chain can still be
 * foretold from it. Those gone dark are handed back, a few a frame, to be
 * born again on the chain.
 */
export class Fading {
  /** Each twin's light, from 1, on the chain, down to 0. */
  readonly light: Float64Array;
  /** Where the next look for twins gone dark starts. */
  #turn = 0;

  constructor(most: number) {
    this.light = new Float64Array(most).fill(1);
  }

  /** Every twin lit: they are born on the chain. */
  relight(): void {
    this.light.fill(1);
  }

  /** Twin j is `distance` from the chain: its light falls to that distance's, if lower. */
  see(j: number, distance: number, reach: number): void {
    const now = lightApart(distance, reach);
    if (now < (this.light[j] ?? 1)) this.light[j] = now;
  }

  /**
   * The twins among the first `count` gone dark, at most `most` of them,
   * taken in turn from where the last look stopped, so that none waits long;
   * each is lit again, to be born again on the chain.
   */
  gone(count: number, most: number): number[] {
    const taken: number[] = [];
    if (count <= 0) return taken;
    const from = this.#turn % count;
    for (let k = 0; k < count && taken.length < most; k++) {
      const j = (from + k) % count;
      if ((this.light[j] ?? 1) < DARK) {
        taken.push(j);
        this.light[j] = 1;
        this.#turn = j + 1;
      }
    }
    return taken;
  }
}

/** How many twins a frame carries, from what they were measured to cost. */
export class TwinBudget {
  /**
   * The time the twins may take in a frame, in ms: fixed on the main line
   * (decision 20), the frame's free time in a worker (decision 51).
   */
  budget: number;
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
