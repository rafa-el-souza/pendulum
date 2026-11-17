// A worker's share of the twins (docs/decisions.md, decision 51). The fan's
// twins are dealt out to the workers in turn, twin j to share j mod W, and
// each share keeps the states of its own: every twin a whole chain, advanced
// by the same step, in the same pieces, as the piece's own loop advanced it
// before the workers (decision 20), so that the motion is the same, number
// for number. A share runs in a worker (twins.worker.ts), or on the main line
// where no worker can run, and in the tests.
//
// It is told what to do by a command a frame: the events since the last one
// (twins born, kept, given other masses, run backwards), then the time to
// advance and what to send back. It answers with a report: where its twins
// are, in buffers that are handed over, not copied.

/* eslint-disable @typescript-eslint/no-non-null-assertion --
   Every index here runs within arrays sized for it, which the compiler's
   unchecked-index rule cannot see. */

import { Chain, type Gravity } from "../physics/chain.ts";
import { resample } from "../physics/resample.ts";
import {
  Stepper,
  reverseMotion,
  type ChainState,
  type Shake,
} from "../physics/step.ts";
import { apart, bornTwin } from "./twins.ts";

/** The twins' longest substep, coarser than the chain's (decision 20). */
export const TWIN_STEP = 1 / 240;

/** Something that happened to the twins since the last command; a share applies them in order, before it advances its twins. */
export type TwinEvent =
  | {
      /**
       * Twins born from the chain as it is, each turned by its share of the
       * spread at its place in the fan (decisions 20 and 43): those there
       * already are born again, and the next ones of the fan are added.
       */
      readonly kind: "born";
      /** The twins' places in the whole fan. */
      readonly twins: readonly number[];
      readonly theta: Float64Array;
      readonly omega: Float64Array;
      readonly spread: number;
    }
  | {
      /** Only the first `count` twins of the whole fan stay. */
      readonly kind: "keep";
      readonly count: number;
    }
  | {
      /** The same motions on another number of masses (decision 4). */
      readonly kind: "masses";
      readonly n: number;
    }
  | {
      /** Time the other way: each twin keeps its place and moves the opposite way (decision 28). */
      readonly kind: "reverse";
    };

/** A frame's work for a share. */
export interface TwinCommand {
  readonly events: readonly TwinEvent[];
  /** The simulated time to advance the twins by, in s; none applies the events alone. */
  readonly time: number;
  /** The pieces the time goes by in, each ending in a point of the twins' trails. */
  readonly pieces: number;
  readonly g: Gravity;
  /** The shaken pivot over each piece, from where in its cycle it is as the piece starts (decision 36); null while it is still. */
  readonly shakes: readonly (Shake | null)[];
  /**
   * Where the chain's masses are once the time has gone by, every x then
   * every y, to measure how far each twin has gone from it (decision 43);
   * null when no twin's light is asked for.
   */
  readonly chain: Float64Array | null;
  /** Each twin sent back whole, every mass, or its tip alone, as dust (decision 50). */
  readonly whole: boolean;
  /** How long the share may take, in ms; the twins it has not reached by twice this are dropped (decision 20). */
  readonly budget: number;
  /** How many times the fan had been put out when this was sent: a report of an older time is not drawn. */
  readonly generation: number;
}

/** What a share sends back from a command: its twins as they are now. */
export interface TwinReport {
  readonly generation: number;
  /** The share's twins when the time began to go by, and those it advanced: the rest are dropped. */
  readonly asked: number;
  readonly count: number;
  /** The masses of each twin. */
  readonly n: number;
  /** The pieces the time went by in; none for a command of events alone. */
  readonly pieces: number;
  /** Each twin's masses, every mass's x and y from the top, 2 n numbers a twin, when sent whole; else none. */
  readonly positions: Float32Array;
  /** Each twin's tip before the time went by and at the end of each piece, 2 (pieces + 1) numbers a twin. */
  readonly tips: Float32Array;
  /** Each twin's distance from the chain, as a share of the chain's length (decision 43), when asked for; else none. */
  readonly apart: Float64Array;
  /** How long the command took, in ms. */
  readonly spent: number;
}

/** How many twins of a fan of `count` belong to share `index` of `shares`. */
export function shareOf(count: number, index: number, shares: number): number {
  return Math.max(0, Math.ceil((count - index) / shares));
}

/** The twins j ≡ index (mod shares) of a fan: their states, and how they move. */
export class TwinShare {
  readonly index: number;
  readonly shares: number;
  #chain: Chain;
  #stepper: Stepper;
  #twins: ChainState[] = [];
  #x: Float64Array;
  #y: Float64Array;
  readonly #clock: () => number;

  /** A share of no twins yet, of chains of n masses, timed by `clock` (performance.now). */
  constructor(
    index: number,
    shares: number,
    n: number,
    clock: () => number = () => performance.now(),
  ) {
    if (!(Number.isInteger(shares) && shares >= 1)) {
      throw new Error("a fan is shared out among one share or more");
    }
    if (!(Number.isInteger(index) && index >= 0 && index < shares)) {
      throw new Error(`no share ${String(index)} of ${String(shares)}`);
    }
    this.index = index;
    this.shares = shares;
    this.#clock = clock;
    // the piece's chain: n equal masses on n equal rods, of the length and
    // the mass that resampling keeps (decision 4)
    this.#chain = Chain.uniform(n);
    this.#stepper = new Stepper(this.#chain, { maxStep: TWIN_STEP });
    this.#x = new Float64Array(n);
    this.#y = new Float64Array(n);
  }

  /** The states of the share's twins, in the order of their places in the fan; for the tests. */
  get twins(): readonly ChainState[] {
    return this.#twins;
  }

  /** Applies a command's events, advances the twins by its time, and reports where they are. */
  run(command: TwinCommand): TwinReport {
    const start = this.#clock();
    for (const event of command.events) this.#apply(event);
    const twins = this.#twins;
    const asked = twins.length;
    const n = this.#chain.n;
    const pieces = command.time > 0 ? Math.max(1, command.pieces) : 0;
    const stride = 2 * (pieces + 1);
    const tips = new Float32Array(stride * asked);
    const giveUp = start + 2 * command.budget;
    let done = 0;
    for (const twin of twins) {
      // Out of time: the twins not reached are dropped, so that every twin
      // left has lived the same time as the chain (decision 20). The clock
      // is read every eight twins.
      if (pieces > 0 && (done & 7) === 0 && this.#clock() > giveUp) break;
      let at = stride * done;
      this.#tip(twin.theta, tips, at);
      for (let piece = 0; piece < pieces; piece++) {
        this.#stepper.advance(twin, command.time / pieces, command.g, {
          shake: command.shakes[piece] ?? null,
        });
        at += 2;
        this.#tip(twin.theta, tips, at);
      }
      done++;
    }
    twins.length = done;

    const positions = new Float32Array(command.whole ? 2 * n * done : 0);
    const distances = new Float64Array(command.chain === null ? 0 : done);
    const chainX = command.chain?.subarray(0, n) ?? null;
    const chainY = command.chain?.subarray(n, 2 * n) ?? null;
    const x = this.#x;
    const y = this.#y;
    for (let k = 0; k < done; k++) {
      if (!command.whole && chainX === null) break;
      this.#chain.positions(twins[k]!.theta, x, y);
      if (command.whole) {
        const base = 2 * n * k;
        for (let i = 0; i < n; i++) {
          positions[base + 2 * i] = x[i]!;
          positions[base + 2 * i + 1] = y[i]!;
        }
      }
      if (chainX !== null && chainY !== null) {
        distances[k] = apart(chainX, chainY, x, y, this.#chain.totalLength);
      }
    }
    return {
      generation: command.generation,
      asked,
      count: done,
      n,
      pieces,
      positions,
      tips,
      apart: distances,
      spent: this.#clock() - start,
    };
  }

  #apply(event: TwinEvent): void {
    const twins = this.#twins;
    switch (event.kind) {
      case "born": {
        const chain = { theta: event.theta, omega: event.omega };
        for (const j of event.twins) {
          const k = (j - this.index) / this.shares;
          if (!Number.isInteger(k) || k < 0 || k > twins.length) {
            throw new Error(
              `twin ${String(j)} is not the next of share ${String(this.index)} of ${String(this.shares)}`,
            );
          }
          twins[k] = bornTwin(chain, j, event.spread);
        }
        break;
      }
      case "keep":
        twins.length = Math.min(
          twins.length,
          shareOf(event.count, this.index, this.shares),
        );
        break;
      case "masses": {
        if (event.n === this.#chain.n) break;
        const before = this.#chain;
        for (let k = 0; k < twins.length; k++) {
          twins[k] = resample(before, twins[k]!, event.n).state;
        }
        this.#chain = Chain.uniform(
          event.n,
          before.totalLength,
          before.totalMass,
        );
        this.#stepper = new Stepper(this.#chain, { maxStep: TWIN_STEP });
        this.#x = new Float64Array(event.n);
        this.#y = new Float64Array(event.n);
        break;
      }
      case "reverse":
        for (const twin of twins) reverseMotion(twin);
        break;
    }
  }

  /** Where the tip of a chain at these angles is, written to out at `at`. */
  #tip(theta: Float64Array, out: Float32Array, at: number): void {
    const lengths = this.#chain.lengths;
    let px = 0;
    let py = 0;
    for (let i = 0; i < this.#chain.n; i++) {
      px += lengths[i]! * Math.sin(theta[i]!);
      py -= lengths[i]! * Math.cos(theta[i]!);
    }
    out[at] = px;
    out[at + 1] = py;
  }
}
