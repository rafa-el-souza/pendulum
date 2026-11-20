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
import {
  driveRate,
  handAt,
  heatDrag,
  musicDrag,
  musicPull,
  musicTilt,
  type Drive,
  type WritableHand,
} from "./drive.ts";

/** How many instants of the music's pull a stepper keeps: the stages of the last few substeps. */
const PULLS_KEPT = 16;

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

/**
 * A pivot shaken back and forth along a line (docs/decisions.md, decision
 * 36): `t` seconds into an advance it is amplitude * cos(phase + rate * t)
 * from its place along (x, y), a unit vector, x to the right and y up. In its
 * frame every mass feels, besides gravity, amplitude * rate² * cos(phase +
 * rate * t) along the line, so the chain moves there as under a gravity that
 * oscillates, and its equations are the same (PH-4).
 */
export interface Shake {
  /** How far the pivot goes either way of its place, in m. */
  readonly amplitude: number;
  /** In rad/s. */
  readonly rate: number;
  readonly x: number;
  readonly y: number;
  /** Where in its cycle the pivot is as the advance starts, in rad. */
  readonly phase: number;
}

/**
 * Each rod's tension averaged over whole periods of a shaking pivot
 * (docs/decisions.md, decision 36), kept across advances. Within a period a
 * fast shake swings the tension by many weights, and a mean over any other
 * stretch of time keeps part of that swing; over a whole period it averages
 * out. An advance given a shake and this meter lands a substep on every
 * whole turn of the shake's phase and closes the period there. The first
 * turn it meets ends a period it saw only in part, which is dropped.
 */
export class PeriodTension {
  /** Each rod's mean tension over the last whole period, in N. */
  readonly mean: Float64Array;
  /** Whether a whole period has closed since the meter was made. */
  closed = false;
  readonly #sum: Float64Array;
  #time = 0;
  #whole = false;

  constructor(n: number) {
    this.mean = new Float64Array(n);
    this.#sum = new Float64Array(n);
  }

  /** Adds `weight` seconds of these tensions to the period going on. */
  add(tension: Float64Array, weight: number): void {
    addTo(this.#sum, tension, weight);
    this.#time += weight;
  }

  /** Ends the period going on: its mean is kept if it was seen whole, and the next one starts. */
  close(): void {
    if (this.#whole && this.#time > 0) {
      const inverse = 1 / this.#time;
      for (let i = 0; i < this.mean.length; i++) {
        this.mean[i] = this.#sum[i]! * inverse;
      }
      this.closed = true;
    }
    this.#whole = true;
    this.#sum.fill(0);
    this.#time = 0;
  }
}

/** What an advance may be given besides the state, the time and gravity. */
export interface AdvanceOptions {
  /** A hand on one mass, held still in place and speed for the whole interval. */
  readonly hand?: Hand | null;
  /** The clock (performance.now()) past which the advance stops short. */
  readonly deadline?: number;
  /** Receives each rod's tension averaged over the time simulated (decision 35). */
  readonly meanTension?: Float64Array | null;
  /** The pivot shaken along a line (decision 36). */
  readonly shake?: Shake | null;
  /** Takes each rod's tension over whole periods of the shake (decision 36). */
  readonly periodTension?: PeriodTension | null;
  /** What the music puts into the physics over the frame (decision 74). */
  readonly drive?: Drive | null;
  /** How far into the drive's frame this advance starts, in s. */
  readonly into?: number;
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
  // gravity in the frame of a shaken pivot, at the stage being taken
  readonly #shaken = { x: 0, y: 0 };
  // what the music adds to it there, gravity tilted by the music, the hands
  // a stage pulls with, the visitor's and the music's, and where the music's
  // are at the stage's instant
  readonly #pulled = { x: 0, y: 0 };
  readonly #tilted = { x: 0, y: 0 };
  readonly #hands: Hand[] = [];
  readonly #musicHands: WritableHand[] = [];
  // The music's pull at the instants met last, for the command they belong
  // to (decision 75): the twins of a worker, stepped one after another
  // through the same frame, meet the same instants while they take the same
  // substeps, and every kick costs exponentials at each.
  #memoDrive: Drive | null = null;
  readonly #memoT = new Float64Array(PULLS_KEPT).fill(Number.NaN);
  readonly #memoX = new Float64Array(PULLS_KEPT);
  readonly #memoY = new Float64Array(PULLS_KEPT);
  #memoNext = 0;

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
   * fastest vibration across the rods, the fastest spin of a rod, the
   * fastest rate a hand adds and the rate of a shake; the last one is cut to
   * land on dt. A hand, when given, holds still in place and speed for the
   * whole interval, in the frame of the pivot.
   *
   * If the clock (performance.now()) passes the `deadline` first, the advance
   * stops short, and the time it reports simulated is less than dt: shown at
   * the frame's pace, that is slow motion (docs/decisions.md, decision 15).
   * The clock is read every eight substeps.
   *
   * `meanTension`, when given, receives each rod's tension averaged over the
   * time simulated, with RK4's own weights on the tensions its four stages
   * meet, which is Simpson's rule over each substep (docs/decisions.md,
   * decision 35). With no time to simulate, it receives the tension of the
   * instant. A shake, when given, adds its pull to gravity at every stage,
   * and with a `periodTension` meter a substep lands on every whole turn of
   * its phase, where the meter closes a period.
   *
   * A drive, when given, puts the music into every stage at that stage's
   * instant, `into` + the time into the advance from the drive's start
   * (docs/decisions.md, decision 74): its pull on gravity, its hands with
   * their targets there, its drag and its thermostat. Its hands and its
   * kicks add their rates to the substep's, and so does its drag.
   */
  advance(
    state: ChainState,
    dt: number,
    g: Gravity,
    options: AdvanceOptions = {},
  ): Advance {
    const hand = options.hand ?? null;
    const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
    const meanTension = options.meanTension ?? null;
    const shake = options.shake ?? null;
    const meter = shake === null ? null : (options.periodTension ?? null);
    const drive = options.drive ?? null;
    const into = options.into ?? 0;
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
    if (meanTension !== null) meanTension.fill(0);
    // the time into the advance at which the shake's phase next completes a
    // whole turn, and its period
    const turn = 2 * Math.PI;
    const period = shake === null ? 0 : turn / shake.rate;
    let closeAt = Number.POSITIVE_INFINITY;
    if (meter !== null && shake !== null) {
      const into = ((shake.phase % turn) + turn) % turn;
      closeAt = (turn - into) / shake.rate;
    }
    // the hands every stage pulls with: the visitor's alone, or with the
    // music's (decision 74), and the fastest rate any of them adds
    const hands =
      drive === null || drive.hands.length === 0
        ? hand
        : this.#handsWith(hand, drive);
    const handRate = Math.max(
      hand === null ? 0 : hand.fastest,
      drive === null ? 0 : driveRate(drive),
    );
    while (left > 0) {
      const at = dt - left;
      // the music's drag at each stage's instant, its hands moved there
      let drag =
        drive === null ? 0 : this.#music(drive, into + at, theta, omega, g);
      const start = this.#gravity(g, shake, at, drive, into + at);
      chain.solve(theta, omega, start, k1, tension, hands, drag);
      let spin = 0;
      for (let i = 0; i < n; i++) spin = Math.max(spin, Math.abs(omega[i]!));
      const rate = Math.max(
        chain.fastestVibration(tension),
        spin,
        handRate,
        shake === null ? 0 : shake.rate,
        Math.abs(drag),
      );
      let h = Math.min(maxStep, fraction / rate);
      // Land on the end of the shake's turn, for the meter.
      if (closeAt - at < h) h = closeAt - at;
      // Within rounding of the time left, finish the frame in this substep.
      if (!(h < left * (1 - 1e-9))) h = left;

      const half = 0.5 * h;
      const sixth = h / 6;
      // the tension's integral over the substep, a sixth of h at each end
      // and a third at the middle, met twice
      if (meanTension !== null) addTo(meanTension, tension, sixth);
      if (meter !== null) meter.add(tension, sixth);
      for (let i = 0; i < n; i++) {
        th[i] = theta[i]! + half * omega[i]!;
        w2[i] = omega[i]! + half * k1[i]!;
      }
      if (drive !== null)
        drag = this.#music(drive, into + at + half, th, w2, g);
      const middle = this.#gravity(
        g,
        shake,
        at + half,
        drive,
        into + at + half,
      );
      chain.solve(th, w2, middle, k2, stageTension, hands, drag);
      if (meanTension !== null) addTo(meanTension, stageTension, 2 * sixth);
      if (meter !== null) meter.add(stageTension, 2 * sixth);
      for (let i = 0; i < n; i++) {
        th[i] = theta[i]! + half * w2[i]!;
        w3[i] = omega[i]! + half * k2[i]!;
      }
      // the thermostat's drag follows the state, the rest the instant
      if (drive !== null && drive.heat !== null) {
        drag = this.#music(drive, into + at + half, th, w3, g);
      }
      chain.solve(th, w3, middle, k3, stageTension, hands, drag);
      if (meanTension !== null) addTo(meanTension, stageTension, 2 * sixth);
      if (meter !== null) meter.add(stageTension, 2 * sixth);
      for (let i = 0; i < n; i++) {
        th[i] = theta[i]! + h * w3[i]!;
        w4[i] = omega[i]! + h * k3[i]!;
      }
      if (drive !== null) drag = this.#music(drive, into + at + h, th, w4, g);
      const end = this.#gravity(g, shake, at + h, drive, into + at + h);
      chain.solve(th, w4, end, k4, stageTension, hands, drag);
      if (meanTension !== null) addTo(meanTension, stageTension, sixth);
      if (meter !== null) meter.add(stageTension, sixth);
      for (let i = 0; i < n; i++) {
        theta[i] =
          theta[i]! + sixth * (omega[i]! + 2 * w2[i]! + 2 * w3[i]! + w4[i]!);
        omega[i] =
          omega[i]! + sixth * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
      }
      left -= h;
      substeps++;
      // a whole turn of the shake ends here
      if (meter !== null && closeAt - (dt - left) <= 1e-9 * period) {
        meter.close();
        closeAt += period;
      }
      if ((substeps & 7) === 0 && performance.now() > deadline) break;
    }
    const simulated = dt - Math.max(0, left);
    if (meanTension !== null) {
      if (substeps === 0) {
        const drag =
          drive === null ? 0 : this.#music(drive, into, theta, omega, g);
        const now = this.#gravity(g, shake, 0, drive, into);
        chain.solve(theta, omega, now, k1, meanTension, hands, drag);
      } else {
        const inverse = 1 / simulated;
        for (let i = 0; i < n; i++) meanTension[i] = meanTension[i]! * inverse;
      }
    }
    return { substeps, simulated };
  }

  /**
   * Gravity in the frame of the pivot, `at` seconds into the advance and `t`
   * into the drive's frame: g, what the music adds to it, and a shake's
   * pull along its line.
   */
  #gravity(
    g: Gravity,
    shake: Shake | null,
    at: number,
    drive: Drive | null,
    t: number,
  ): Gravity {
    if (shake === null && drive === null) return g;
    let x = g.x;
    let y = g.y;
    if (drive !== null) {
      this.#pullAt(drive, t);
      x += this.#pulled.x;
      y += this.#pulled.y;
    }
    if (shake !== null) {
      const pull =
        shake.amplitude *
        shake.rate *
        shake.rate *
        Math.cos(shake.phase + shake.rate * at);
      x += pull * shake.x;
      y += pull * shake.y;
    }
    this.#shaken.x = x;
    this.#shaken.y = y;
    return this.#shaken;
  }

  /**
   * The music's pull on gravity `t` s into the drive's frame, written to
   * `#pulled`: kept for the last few instants met, which give the same
   * numbers when met again, by the next twin through the same frame.
   */
  #pullAt(drive: Drive, t: number): void {
    const pulled = this.#pulled;
    if (drive.kicks.length === 0) {
      musicPull(drive, t, pulled);
      return;
    }
    const times = this.#memoT;
    if (drive !== this.#memoDrive) {
      this.#memoDrive = drive;
      times.fill(Number.NaN);
      this.#memoNext = 0;
    }
    for (let k = 0; k < PULLS_KEPT; k++) {
      if (times[k] === t) {
        pulled.x = this.#memoX[k]!;
        pulled.y = this.#memoY[k]!;
        return;
      }
    }
    musicPull(drive, t, pulled);
    const k = this.#memoNext;
    times[k] = t;
    this.#memoX[k] = pulled.x;
    this.#memoY[k] = pulled.y;
    this.#memoNext = (k + 1) % PULLS_KEPT;
  }

  /** The visitor's hand, when there is one, and the music's, which `#music` moves to each stage's instant. */
  #handsWith(hand: Hand | null, drive: Drive): readonly Hand[] {
    const music = this.#musicHands;
    while (music.length < drive.hands.length) {
      music.push({
        index: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        stiffness: 0,
        damping: 0,
        fastest: 0,
      });
    }
    const hands = this.#hands;
    hands.length = 0;
    if (hand !== null) hands.push(hand);
    for (let k = 0; k < drive.hands.length; k++) {
      const held = music[k]!;
      handAt(drive.hands[k]!, drive, 0, held);
      if (held.index >= this.chain.n) {
        throw new Error(
          `a chain of ${String(this.chain.n)} masses has no mass ${String(held.index)} for the music's hand`,
        );
      }
      hands.push(held);
    }
    return hands;
  }

  /**
   * Moves the music's hands to where they are `t` s into the drive's frame,
   * and returns its drag there, for a chain in this state, in 1/s: the
   * drag it asks for, and the thermostat's, from the chain's energy above
   * rest along gravity as the music tilts it.
   */
  #music(
    drive: Drive,
    t: number,
    theta: Float64Array,
    omega: Float64Array,
    g: Gravity,
  ): number {
    const music = this.#musicHands;
    for (let k = 0; k < drive.hands.length; k++) {
      handAt(drive.hands[k]!, drive, t, music[k]!);
    }
    let drag = musicDrag(drive, t);
    if (drive.heat !== null) {
      const tilted = this.#tilted;
      musicTilt(drive, t, tilted);
      tilted.x += g.x;
      tilted.y += g.y;
      const energy = this.chain.energyAboveRest(theta, omega, tilted);
      drag += heatDrag(drive.heat, drive, t, energy);
    }
    return drag;
  }
}

/** Adds weight times each of `values` to `sums`. */
function addTo(sums: Float64Array, values: Float64Array, weight: number): void {
  for (let i = 0; i < sums.length; i++) {
    sums[i] = sums[i]! + weight * values[i]!;
  }
}
