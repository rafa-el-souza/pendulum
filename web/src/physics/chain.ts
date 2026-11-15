// The planar chain pendulum by the tension route (PH-4 in physics/equations.yaml),
// as physics/oracle/chain/chain.py computes it, in double precision: from the
// state to the angular accelerations and the rod tensions in one pass of n
// steps (docs/decisions.md, decision 5). physics/oracle/chain/README.md has the
// derivation.
//
// Conventions as in the oracle: x to the right, y up, gravity (0, -g), the
// pivot at the origin. theta[i] is the absolute angle of rod i from the
// downward vertical, so the unit vector along rod i is e = (sin, -cos) and its
// normal is n = (cos, sin). Index 0 is the rod at the pivot; rod i ends at
// mass i. A positive tension pulls the two ends of its rod together.

/* eslint-disable @typescript-eslint/no-non-null-assertion --
   Every index here runs over 0..n-1 of arrays of length n, which the compiler's
   unchecked-index rule cannot see. */

/** A chain of n point masses on n massless rods, hanging from a fixed pivot. */
export class Chain {
  /** The number of rods, and of masses. */
  readonly n: number;
  /** m_i in kg, from the top. */
  readonly masses: Float64Array;
  /** l_i in m, from the top. */
  readonly lengths: Float64Array;
  readonly totalMass: number;
  readonly totalLength: number;

  readonly #inverseMass: Float64Array;
  readonly #inverseLength: Float64Array;
  /** m_{i+1} / m_i, and 0 at the bottom. */
  readonly #ratio: Float64Array;
  // Scratch of solve(): the sine and cosine of each joint, the right-hand side
  // being eliminated, and the inverse of each pivot's 1 + kappa.
  readonly #sin: Float64Array;
  readonly #cos: Float64Array;
  readonly #rhs: Float64Array;
  readonly #inversePivot: Float64Array;

  constructor(masses: ArrayLike<number>, lengths: ArrayLike<number>) {
    const n = masses.length;
    if (n < 1 || lengths.length !== n) {
      throw new Error(
        `a chain needs one rod per mass and at least one of each (got ${String(n)} masses and ${String(lengths.length)} rods)`,
      );
    }
    this.n = n;
    this.masses = Float64Array.from(masses);
    this.lengths = Float64Array.from(lengths);
    // The elimination divides by every mass and every length.
    for (let i = 0; i < n; i++) {
      const m = this.masses[i]!;
      const l = this.lengths[i]!;
      if (!(m > 0 && l > 0 && Number.isFinite(m) && Number.isFinite(l))) {
        throw new Error(
          `mass and rod ${String(i)} must be positive and finite (got ${String(m)} kg and ${String(l)} m)`,
        );
      }
    }
    this.totalMass = this.masses.reduce((sum, m) => sum + m, 0);
    this.totalLength = this.lengths.reduce((sum, l) => sum + l, 0);
    this.#inverseMass = this.masses.map((m) => 1 / m);
    this.#inverseLength = this.lengths.map((l) => 1 / l);
    this.#ratio = this.masses.map((m, i) =>
      i + 1 < n ? this.masses[i + 1]! / m : 0,
    );
    this.#sin = new Float64Array(n);
    this.#cos = new Float64Array(n);
    this.#rhs = new Float64Array(n);
    this.#inversePivot = new Float64Array(n);
  }

  /** The paper's refinement family: n equal masses on n equal rods. */
  static uniform(n: number, totalLength = 1, totalMass = 1): Chain {
    return new Chain(
      new Float64Array(n).fill(totalMass / n),
      new Float64Array(n).fill(totalLength / n),
    );
  }

  /**
   * The angular accelerations and the rod tensions of one state (PH-4),
   * written to alpha and tension. Every array has length n; g is in m/s².
   */
  solve(
    theta: Float64Array,
    omega: Float64Array,
    g: number,
    alpha: Float64Array,
    tension: Float64Array,
  ): void {
    const n = this.n;
    const m = this.masses;
    const sin = this.#sin;
    const cos = this.#cos;
    const rhs = this.#rhs;
    const inversePivot = this.#inversePivot;
    const ratio = this.#ratio;
    const inverseMass = this.#inverseMass;
    const inverseLength = this.#inverseLength;

    // The joints enter only through the sine and cosine of theta[i + 1] - theta[i].
    // That difference is exact near zero but rounded near pi and for large
    // angles, which would leave a nearly folded joint's sine with an absolute
    // error instead of a relative one, and extreme mass ratios amplify it. So
    // the difference is carried exactly, as hi + lo (Knuth's TwoSum), and the
    // sine and cosine are corrected to first order in lo, as the oracle does.
    for (let i = 0; i < n - 1; i++) {
      const upper = theta[i]!;
      const lower = theta[i + 1]!;
      const hi = lower - upper;
      const lowerPart = hi + upper;
      const upperPart = hi - lowerPart;
      const lo = lower - lowerPart - (upper + upperPart);
      const s = Math.sin(hi);
      const c = Math.cos(hi);
      sin[i] = s + lo * c;
      cos[i] = c - lo * s;
    }

    // The tension system, A T = b: b_i = l_i omega_i^2, plus g cos theta_1 at the top.
    for (let i = 0; i < n; i++) {
      rhs[i] = this.lengths[i]! * omega[i]! * omega[i]!;
    }
    rhs[0] = rhs[0]! + g * Math.cos(theta[0]!);

    // LDL^T elimination from the top rod down. Row i has the pivot
    // (1 + kappa_i) / m_i, with kappa_1 = 0 and
    //   kappa_{i+1} = (m_{i+1} / m_i) (s_i^2 + kappa_i) / (1 + kappa_i),
    // which adds only non-negative numbers; the textbook update subtracts
    // nearly equal ones at a nearly straight joint or a light mass above a
    // heavy one.
    let kappa = 0;
    for (let i = 0; i < n - 1; i++) {
      const r = 1 / (1 + kappa);
      inversePivot[i] = r;
      kappa = ratio[i]! * (sin[i]! * sin[i]! + kappa) * r;
      rhs[i + 1] = rhs[i + 1]! + cos[i]! * rhs[i]! * r;
    }
    inversePivot[n - 1] = 1 / (1 + kappa);
    let t = m[n - 1]! * rhs[n - 1]! * inversePivot[n - 1]!;
    tension[n - 1] = t;
    for (let i = n - 2; i >= 0; i--) {
      t = (m[i]! * rhs[i]! + cos[i]! * t) * inversePivot[i]!;
      tension[i] = t;
    }

    // l_i alpha_i is the part of the relative acceleration of the rod's two
    // ends that lies across the rod: only rod i + 1 pulling on mass i and rod
    // i - 1 pulling on mass i - 1 have one, and at the top, gravity.
    let carry = -g * Math.sin(theta[0]!);
    for (let i = 0; i < n - 1; i++) {
      const across = sin[i]! * inverseMass[i]!;
      alpha[i] = (carry + tension[i + 1]! * across) * inverseLength[i]!;
      carry = -tension[i]! * across;
    }
    alpha[n - 1] = carry * inverseLength[n - 1]!;
  }

  /** Kinetic plus potential energy (PH-2), the potential zero at the height of the pivot. */
  energy(theta: Float64Array, omega: Float64Array, g: number): number {
    let height = 0;
    let vx = 0;
    let vy = 0;
    let total = 0;
    for (let i = 0; i < this.n; i++) {
      const l = this.lengths[i]!;
      const s = Math.sin(theta[i]!);
      const c = Math.cos(theta[i]!);
      height -= l * c;
      vx += l * omega[i]! * c;
      vy += l * omega[i]! * s;
      total += this.masses[i]! * (0.5 * (vx * vx + vy * vy) + g * height);
    }
    return total;
  }

  /**
   * The rate of the chain's fastest vibration across its rods, in rad/s, from
   * the tensions of a solve(): a string of beads under tension T vibrates at
   * most at 2 sqrt(T / (m l)).
   */
  fastestVibration(tension: Float64Array): number {
    let largest = 0;
    for (let i = 0; i < this.n; i++) {
      const rate =
        Math.abs(tension[i]!) * this.#inverseMass[i]! * this.#inverseLength[i]!;
      if (rate > largest) largest = rate;
    }
    return 2 * Math.sqrt(largest);
  }
}
