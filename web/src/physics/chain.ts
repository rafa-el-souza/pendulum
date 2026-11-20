// The planar chain pendulum by the tension route (PH-4 in physics/equations.yaml),
// as physics/oracle/chain/chain.py computes it, in double precision: from the
// state to the angular accelerations and the rod tensions in one pass of n
// steps (docs/decisions.md, decision 5). physics/oracle/chain/README.md has the
// derivation.
//
// Conventions as in the oracle: x to the right, y up, the pivot at the
// origin. theta[i] is the absolute angle of rod i from the downward vertical,
// so the unit vector along rod i is e = (sin, -cos) and its normal is
// n = (cos, sin). Index 0 is the rod at the pivot; rod i ends at mass i. A
// positive tension pulls the two ends of its rod together.
//
// The oracle's gravity is (0, -g), straight down. Here it may point anywhere
// (docs/decisions.md, decision 29): it pulls every mass alike, so it reaches
// the angles only through the top rod, as the pivot holds the chain against
// it, and turned by an angle it turns the whole motion by that angle.

/* eslint-disable @typescript-eslint/no-non-null-assertion --
   Every index here runs over 0..n-1 of arrays of length n, which the compiler's
   unchecked-index rule cannot see. */

/** The acceleration of gravity, in m/s², x to the right and y up. */
export interface Gravity {
  readonly x: number;
  readonly y: number;
}

/**
 * Gravity of strength g, in m/s², pointing `turn` radians from straight down
 * the way a rod's angle turns: a quarter turn points it to the right.
 */
export function gravity(g: number, turn = 0): Gravity {
  return { x: g * Math.sin(turn), y: -g * Math.cos(turn) };
}

/** No hands at all. */
const NO_HANDS: readonly Hand[] = [];

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
  /** Each mass times its depth below the pivot as the chain hangs straight, summed, in kg m. */
  readonly hangingMoment: number;

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
  // and a hand's pull on the mass it holds, the part of the hands' pulls
  // that lies across each rod, and a list of one hand
  readonly #pull = new Float64Array(2);
  readonly #across: Float64Array;
  readonly #one: Hand[] = [];

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
    let depth = 0;
    this.hangingMoment = this.masses.reduce((sum, m, i) => {
      depth += this.lengths[i]!;
      return sum + m * depth;
    }, 0);
    this.#inverseMass = this.masses.map((m) => 1 / m);
    this.#inverseLength = this.lengths.map((l) => 1 / l);
    this.#ratio = this.masses.map((m, i) =>
      i + 1 < n ? this.masses[i + 1]! / m : 0,
    );
    this.#sin = new Float64Array(n);
    this.#cos = new Float64Array(n);
    this.#rhs = new Float64Array(n);
    this.#inversePivot = new Float64Array(n);
    this.#across = new Float64Array(n);
  }

  /** The paper's refinement family: n equal masses on n equal rods. */
  static uniform(n: number, totalLength = 1, totalMass = 1): Chain {
    return new Chain(
      new Float64Array(n).fill(totalMass / n),
      new Float64Array(n).fill(totalLength / n),
    );
  }

  /**
   * The angular accelerations and the rod tensions of one state (PH-4) under
   * gravity g, written to alpha and tension. Every array has length n. A
   * hand, or several, each pulls on the mass it holds, and a drag of `drag`
   * per second, when given, slows every mass in proportion to it
   * (docs/decisions.md, decision 74).
   */
  solve(
    theta: Float64Array,
    omega: Float64Array,
    g: Gravity,
    alpha: Float64Array,
    tension: Float64Array,
    hands: Hand | readonly Hand[] | null = null,
    drag = 0,
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
    const acrossRods = this.#across;
    let held: readonly Hand[];
    if (hands === null) {
      held = NO_HANDS;
    } else if ("index" in hands) {
      this.#one[0] = hands;
      held = this.#one;
    } else {
      held = hands;
    }

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

    // The tension system, A T = b: b_i = l_i omega_i^2, plus at the top the
    // part of gravity along the first rod, g . e_1, which is g cos theta_1
    // for the paper's gravity, straight down.
    for (let i = 0; i < n; i++) {
      rhs[i] = this.lengths[i]! * omega[i]! * omega[i]!;
    }
    const topSin = Math.sin(theta[0]!);
    const topCos = Math.cos(theta[0]!);
    rhs[0] = rhs[0]! + g.x * topSin - g.y * topCos;

    // A force F on mass k is an acceleration f = F / m_k of that mass alone.
    // It enters rod k as +f and rod k + 1 as -f: along the rod in the tension
    // system, across the rod in the angular acceleration, which waits for
    // the tensions and adds each rod's once, however many hands touch it.
    for (let h = 0; h < held.length; h++) {
      const hand = held[h]!;
      const k = hand.index;
      const pull = this.#pull;
      this.handForce(theta, omega, hand, pull);
      const fx = pull[0]! * inverseMass[k]!;
      const fy = pull[1]! * inverseMass[k]!;
      const s = Math.sin(theta[k]!);
      const c = Math.cos(theta[k]!);
      rhs[k] = rhs[k]! + fx * s - fy * c;
      acrossRods[k] = acrossRods[k]! + (fx * c + fy * s);
      if (k + 1 < n) {
        const sb = Math.sin(theta[k + 1]!);
        const cb = Math.cos(theta[k + 1]!);
        rhs[k + 1] = rhs[k + 1]! - (fx * sb - fy * cb);
        acrossRods[k + 1] = acrossRods[k + 1]! - (fx * cb + fy * sb);
      }
    }

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
    // i - 1 pulling on mass i - 1 have one, and at the top, gravity across
    // the first rod, g . n_1, which is -g sin theta_1 straight down.
    let carry = g.x * topCos + g.y * topSin;
    for (let i = 0; i < n - 1; i++) {
      const across = sin[i]! * inverseMass[i]!;
      alpha[i] = (carry + tension[i + 1]! * across) * inverseLength[i]!;
      carry = -tension[i]! * across;
    }
    alpha[n - 1] = carry * inverseLength[n - 1]!;
    for (let h = 0; h < held.length; h++) {
      const k = held[h]!.index;
      for (let i = k; i <= k + 1 && i < n; i++) {
        const pulled = acrossRods[i]!;
        if (pulled !== 0) {
          alpha[i] = alpha[i]! + pulled * inverseLength[i]!;
          acrossRods[i] = 0;
        }
      }
    }

    // A drag of −drag m_i v_i on every mass: mass i's less mass i − 1's is
    // −drag l_i omega_i n_i, across rod i alone, so it changes no tension
    // and takes drag omega_i from alpha_i, exactly.
    if (drag !== 0) {
      for (let i = 0; i < n; i++) alpha[i] = alpha[i]! - drag * omega[i]!;
    }
  }

  /**
   * The energy above the chain hanging at rest along gravity g (PH-2), in J:
   * its energy, less that of every mass hanging straight below the pivot
   * along g, at rest.
   */
  energyAboveRest(
    theta: Float64Array,
    omega: Float64Array,
    g: Gravity,
  ): number {
    return (
      this.energy(theta, omega, g) + Math.hypot(g.x, g.y) * this.hangingMoment
    );
  }

  /**
   * The force a hand puts on the mass it holds, in N, written to out as x
   * then y: stiffness * (where the hand is - where the mass is) - damping *
   * (the mass's velocity - the hand's). The motion obeys it, and the drawing
   * shows it.
   */
  handForce(
    theta: Float64Array,
    omega: Float64Array,
    hand: Hand,
    out: Float64Array,
  ): void {
    let px = 0;
    let py = 0;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i <= hand.index; i++) {
      const l = this.lengths[i]!;
      const s = Math.sin(theta[i]!);
      const c = Math.cos(theta[i]!);
      px += l * s;
      py -= l * c;
      vx += l * omega[i]! * c;
      vy += l * omega[i]! * s;
    }
    out[0] = hand.stiffness * (hand.x - px) - hand.damping * (vx - hand.vx);
    out[1] = hand.stiffness * (hand.y - py) - hand.damping * (vy - hand.vy);
  }

  /** Where the masses are (PH-1), written to x and y, in m from the pivot, y up. */
  positions(theta: Float64Array, x: Float64Array, y: Float64Array): void {
    let px = 0;
    let py = 0;
    for (let i = 0; i < this.n; i++) {
      const l = this.lengths[i]!;
      px += l * Math.sin(theta[i]!);
      py -= l * Math.cos(theta[i]!);
      x[i] = px;
      y[i] = py;
    }
  }

  /** The index of the mass nearest to the point (x, y), in m from the pivot. */
  nearestMass(theta: Float64Array, x: number, y: number): number {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    let px = 0;
    let py = 0;
    for (let i = 0; i < this.n; i++) {
      const l = this.lengths[i]!;
      px += l * Math.sin(theta[i]!);
      py -= l * Math.cos(theta[i]!);
      const distance = (px - x) ** 2 + (py - y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  }

  /**
   * Kinetic plus potential energy (PH-2) under gravity g, the potential zero
   * at the pivot: each mass m at r from it has -m g . r.
   */
  energy(theta: Float64Array, omega: Float64Array, g: Gravity): number {
    let px = 0;
    let py = 0;
    let vx = 0;
    let vy = 0;
    let total = 0;
    for (let i = 0; i < this.n; i++) {
      const l = this.lengths[i]!;
      const s = Math.sin(theta[i]!);
      const c = Math.cos(theta[i]!);
      px += l * s;
      py -= l * c;
      vx += l * omega[i]! * c;
      vy += l * omega[i]! * s;
      total +=
        this.masses[i]! * (0.5 * (vx * vx + vy * vy) - (g.x * px + g.y * py));
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

/**
 * A hand holding one mass on a spring and a damper, which the paper does not
 * have: the force on that mass is stiffness * (where the hand is - where the
 * mass is) - damping * (the mass's velocity - the hand's).
 */
export interface Hand {
  /** The mass it holds, counted from the top, from 0. */
  readonly index: number;
  /** Where the hand is, in m from the pivot, y up. */
  x: number;
  y: number;
  /** How fast the hand moves, in m/s. */
  vx: number;
  vy: number;
  /** In N/m. */
  readonly stiffness: number;
  /** In N s/m. */
  readonly damping: number;
  /** The fastest rate the hand adds to the motion, in rad/s, for the substep. */
  readonly fastest: number;
}

/**
 * A hand on mass `index`, at rest at the pivot until it is moved. Its spring
 * is that of the whole chain's mass oscillating at `rate` rad/s, and its
 * damping is `dampingRatio` times critical for the held mass alone: at 1, the
 * held mass settles on the hand without a bounce; below 1, it bounces as on a
 * rubber band. The fastest rate it adds is then at most 2 * max(1, ratio) *
 * rate * sqrt(total mass / held mass).
 */
export function createHand(
  chain: Chain,
  index: number,
  rate = 40,
  dampingRatio = 1,
): Hand {
  if (!Number.isInteger(index) || index < 0 || index >= chain.n) {
    throw new Error(
      `a chain of ${String(chain.n)} masses has no mass ${String(index)}`,
    );
  }
  if (!(rate > 0 && Number.isFinite(rate))) {
    throw new Error(`a hand's rate must be positive (got ${String(rate)})`);
  }
  if (!(dampingRatio >= 0 && Number.isFinite(dampingRatio))) {
    throw new Error(
      `a hand's damping ratio must be zero or more (got ${String(dampingRatio)})`,
    );
  }
  const held = chain.masses[index]!;
  const stiffness = chain.totalMass * rate * rate;
  return {
    index,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    stiffness,
    damping: 2 * dampingRatio * Math.sqrt(stiffness * held),
    fastest:
      2 * Math.max(1, dampingRatio) * rate * Math.sqrt(chain.totalMass / held),
  };
}
