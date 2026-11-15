// The normal modes of the equal chain, n equal masses on n equal rods hanging
// at rest (docs/decisions.md, decision 33). At small angles the chain is
// linear (PH-6) and has n modes: shapes that keep their form as they swing,
// each at a frequency of its own, from the lowest, where the whole chain
// swings one way, up to the highest, where each rod turns against the next.
//
// For equal masses and rods, the paper's difference equation (65) for the
// masses' sideways displacements x_j, in a mode where x_j = X_j cos(ω t) and
// λ = ω² l / g, l being one rod's length, reads counted from the bottom mass
// up, s = n - j:
//
//   (s + 1) X_{s+1} = (2s + 1 - λ) X_s - s X_{s-1},
//
// the three-term recurrence of the Laguerre polynomials. So mass j moves by
// L_{n-j}(λ) times the tip's motion, the pivot by L_n(λ), which must be zero,
// and the squared frequencies, in units of g / l, are the zeros of L_n
// (PH-7). The oracle's test of PH-7 checks the shapes too, and
// physics/fixtures/chain-modes.json holds the modes found without these
// polynomials, from the linearized chain by an eigensolver, for the tests.

/* eslint-disable @typescript-eslint/no-non-null-assertion --
   Every index here runs over 0..n-1 of arrays of length n, which the compiler's
   unchecked-index rule cannot see. */

import type { ChainState } from "./step.ts";

/** A normal mode of the equal chain. */
export interface Mode {
  /** ω² l / g: the mode's squared frequency in units of g over one rod's length. */
  readonly lambda: number;
  /**
   * The rods' angles in the mode, from the top, scaled so that the largest
   * in size is 1; the bottom rod's is positive, and never zero.
   */
  readonly shape: Float64Array;
}

function checkMode(n: number, k: number): void {
  if (!(Number.isInteger(n) && n >= 1)) {
    throw new Error(`a chain has one mass or more (got ${String(n)})`);
  }
  if (!(Number.isInteger(k) && k >= 1 && k <= n)) {
    throw new Error(
      `a chain of ${String(n)} masses has modes 1 to ${String(n)} (got ${String(k)})`,
    );
  }
}

/**
 * How many zeros of the Laguerre polynomial of degree n lie below x: the
 * eigenvalues below x of its Jacobi matrix, whose diagonal is 2s + 1 and
 * whose off-diagonal is s, counted by the signs of the pivots of T - x I. A
 * pivot that comes out zero counts as the smallest negative number, as in
 * bisection on any tridiagonal matrix; the next pivot is then infinite, and
 * the one after it starts afresh.
 */
function zerosBelow(n: number, x: number): number {
  let below = 0;
  let pivot = 0;
  for (let s = 0; s < n; s++) {
    pivot = s === 0 ? 1 - x : 2 * s + 1 - x - (s * s) / pivot;
    if (pivot === 0) pivot = -Number.MIN_VALUE;
    if (pivot < 0) below++;
  }
  return below;
}

/**
 * The k-th smallest zero of the Laguerre polynomial of degree n, from k = 1,
 * by bisection: every zero lies between 0 and 4n - 2, where the Jacobi
 * matrix's rows bound them.
 */
export function laguerreZero(n: number, k: number): number {
  checkMode(n, k);
  let low = 0;
  let high = 4 * n;
  for (;;) {
    const middle = 0.5 * (low + high);
    if (middle <= low || middle >= high) return middle;
    if (zerosBelow(n, middle) >= k) high = middle;
    else low = middle;
  }
}

/** Mode k of n equal masses on n equal rods, from k = 1, the lowest. */
export function uniformMode(n: number, k: number): Mode {
  const lambda = laguerreZero(n, k);
  // The sideways displacements, from the bottom mass up: L_0(λ), L_1(λ),
  // ..., L_{n-1}(λ). Where they would outgrow a double, as a long chain's
  // highest modes do, those so far shrink together.
  const lift = new Float64Array(n);
  lift[0] = 1;
  if (n > 1) lift[1] = 1 - lambda;
  for (let s = 1; s + 1 < n; s++) {
    lift[s + 1] =
      ((2 * s + 1 - lambda) * lift[s]! - s * lift[s - 1]!) / (s + 1);
    if (Math.abs(lift[s + 1]!) > 1e150) {
      for (let r = 0; r <= s + 1; r++) lift[r] = lift[r]! * 1e-150;
    }
  }
  // Rod j, from the top, turns by the displacement of mass j less that of
  // mass j - 1, the pivot's being zero; mass j is lift[n - j].
  const shape = new Float64Array(n);
  let above = 0;
  for (let j = 0; j < n; j++) {
    const here = lift[n - 1 - j]!;
    shape[j] = here - above;
    above = here;
  }
  let largest = 0;
  for (const angle of shape) {
    if (Math.abs(angle) > Math.abs(largest)) largest = angle;
  }
  // the bottom rod turns by L_0 - L_1 = λ times the tip's motion: positive
  const divisor = (shape[n - 1]! < 0 ? -1 : 1) * Math.abs(largest);
  for (let j = 0; j < n; j++) shape[j] = shape[j]! / divisor;
  return { lambda, shape };
}

/**
 * n equal masses on n equal rods at rest in mode k, about gravity pointing
 * `down` radians from straight down, the largest angle from there being
 * `amplitude` radians. Let go, the chain swings in that mode for as long as
 * the amplitude is small enough for it to be linear.
 */
export function startInMode(
  n: number,
  k: number,
  amplitude: number,
  down = 0,
): ChainState {
  const { shape } = uniformMode(n, k);
  return {
    theta: shape.map((s) => down + amplitude * s),
    omega: new Float64Array(n),
  };
}
