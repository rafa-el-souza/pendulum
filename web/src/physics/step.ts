// The chain's motion in time: classical RK4 on the angles, in substeps taken
// from the chain's fastest vibration, which the rod tensions give at every
// substep (docs/decisions.md, decision 5).
//
// A long chain's fastest vibration is near 2 n sqrt(g / L), and when it is
// thrown it cracks like a whip, with tensions far above its weight; a fixed
// step small enough for those moments is wasted on the calm ones. A string of
// beads under tension T vibrates at most at 2 sqrt(T / (m l)), and the
// tension route returns T with the accelerations at no extra cost.

/* eslint-disable @typescript-eslint/no-non-null-assertion --
   Every index here runs over 0..n-1 of arrays of length n, which the compiler's
   unchecked-index rule cannot see. */

import type { Chain, Gravity, Hand } from "./chain.ts";

/** Where a chain is and how it moves: absolute angles from the downward vertical, and their rates. */
export interface ChainState {
  readonly theta: Float64Array;
  readonly omega: Float64Array;
}

/** A chain of n rods hanging straight down, at rest. */
export function restingState(n: number): ChainState {
  return { theta: new Float64Array(n), omega: new Float64Array(n) };
}

/**
 * Time run backwards (docs/decisions.md, decision 28): every mass stays where
 * it is and moves the opposite way. The chain's equations have no friction
 * and are the same with time reversed, so advancing from here retraces the
 * motion that led here, until the integration's tiny errors, grown as chaos
 * grows them, take it elsewhere. A hand is not symmetric in time: its damper
 * would give energy instead of taking it.
 */
export function reverseMotion(state: ChainState): void {
  state.omega.forEach((rate, i) => {
    state.omega[i] = -rate;
  });
}

/** What an advance did: the substeps it took and the time it simulated, in seconds. */
export interface Advance {
  readonly substeps: number;
  readonly simulated: number;
}

export interface StepperOptions {
  /** A substep is this fraction of the inverse rate of the fastest motion. */
  readonly fraction?: number;
  /** The longest substep, in seconds, however slow the chain. */
  readonly maxStep?: number;
}

/** Advances one chain in time; it keeps the scratch that RK4 needs, so a frame allocates nothing. */
export class Stepper {
  readonly chain: Chain;
  readonly fraction: number;
  readonly maxStep: number;

  readonly #tension: Float64Array;
  readonly #stageTension: Float64Array;
  readonly #k1: Float64Array;
  readonly #k2: Float64Array;
  readonly #k3: Float64Array;
  readonly #k4: Float64Array;
  readonly #w2: Float64Array;
  readonly #w3: Float64Array;
  readonly #w4: Float64Array;
  readonly #theta: Float64Array;

  constructor(chain: Chain, options: StepperOptions = {}) {
    this.chain = chain;
    this.fraction = options.fraction ?? 0.3;
    this.maxStep = options.maxStep ?? 1 / 480;
    if (!(this.fraction > 0 && this.maxStep > 0)) {
      throw new Error(
        "the substep's fraction and its longest value must be positive",
      );
    }
    const n = chain.n;
    this.#tension = new Float64Array(n);
    this.#stageTension = new Float64Array(n);
    this.#k1 = new Float64Array(n);
    this.#k2 = new Float64Array(n);
    this.#k3 = new Float64Array(n);
    this.#k4 = new Float64Array(n);
    this.#w2 = new Float64Array(n);
    this.#w3 = new Float64Array(n);
    this.#w4 = new Float64Array(n);
    this.#theta = new Float64Array(n);
  }

  /**
   * Advances the state by dt seconds under gravity g, in place. Each substep
   * is fraction / rate, at most maxStep, where rate is the largest of the
   * fastest vibration across the rods, the fastest spin of a rod and the
   * fastest rate a hand adds; the last one is cut to land on dt. A hand, when
   * given, holds still in place and speed for the whole interval.
   *
   * If the clock (performance.now()) passes `deadline` first, the advance
   * stops short, and the time it reports simulated is less than dt: shown at
   * the frame's pace, that is slow motion (docs/decisions.md, decision 15).
   * The clock is read every eight substeps.
   */
  advance(
    state: ChainState,
    dt: number,
    g: Gravity,
    hand: Hand | null = null,
    deadline = Number.POSITIVE_INFINITY,
  ): Advance {
    const { chain, fraction, maxStep } = this;
    const n = chain.n;
    const { theta, omega } = state;
    const tension = this.#tension;
    const stageTension = this.#stageTension;
    const k1 = this.#k1;
    const k2 = this.#k2;
    const k3 = this.#k3;
    const k4 = this.#k4;
    const w2 = this.#w2;
    const w3 = this.#w3;
    const w4 = this.#w4;
    const th = this.#theta;

    let left = dt;
    let substeps = 0;
    while (left > 0) {
      chain.solve(theta, omega, g, k1, tension, hand);
      let spin = 0;
      for (let i = 0; i < n; i++) spin = Math.max(spin, Math.abs(omega[i]!));
      const rate = Math.max(
        chain.fastestVibration(tension),
        spin,
        hand === null ? 0 : hand.fastest,
      );
      let h = Math.min(maxStep, fraction / rate);
      // Within rounding of the time left, finish the frame in this substep.
      if (!(h < left * (1 - 1e-9))) h = left;

      const half = 0.5 * h;
      for (let i = 0; i < n; i++) {
        th[i] = theta[i]! + half * omega[i]!;
        w2[i] = omega[i]! + half * k1[i]!;
      }
      chain.solve(th, w2, g, k2, stageTension, hand);
      for (let i = 0; i < n; i++) {
        th[i] = theta[i]! + half * w2[i]!;
        w3[i] = omega[i]! + half * k2[i]!;
      }
      chain.solve(th, w3, g, k3, stageTension, hand);
      for (let i = 0; i < n; i++) {
        th[i] = theta[i]! + h * w3[i]!;
        w4[i] = omega[i]! + h * k3[i]!;
      }
      chain.solve(th, w4, g, k4, stageTension, hand);
      const sixth = h / 6;
      for (let i = 0; i < n; i++) {
        theta[i] =
          theta[i]! + sixth * (omega[i]! + 2 * w2[i]! + 2 * w3[i]! + w4[i]!);
        omega[i] =
          omega[i]! + sixth * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
      }
      left -= h;
      substeps++;
      if ((substeps & 7) === 0 && performance.now() > deadline) break;
    }
    return { substeps, simulated: dt - Math.max(0, left) };
  }
}
