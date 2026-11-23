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
// advance, how to hold the twins near the chain once it has gone by, and
// what to send back. It answers with a report: where its twins are, in
// buffers that are handed over, not copied. A strobe's flashes in the time
// stamp each twin where it is at their instants (decision 100).

/* eslint-disable @typescript-eslint/no-non-null-assertion --
   Every index here runs within arrays sized for it, which the compiler's
   unchecked-index rule cannot see. */

import { Chain, type Gravity } from "../physics/chain.ts";
import type { Rgb } from "./color.ts";
import { Merger, SpanBatch } from "./curves.ts";
import { mixColors } from "./grounds.ts";
import { fanPalette } from "./palettes.ts";
import {
  anglesAt,
  pivotsOver,
  stampTwin,
  twinCurve,
  type StampParts,
} from "./twin-curves.ts";
import type { Drive } from "../physics/drive.ts";
import { resample } from "../physics/resample.ts";
import {
  Stepper,
  reverseMotion,
  type ChainState,
  type Shake,
} from "../physics/step.ts";
import {
  apart,
  bornTwin,
  drawIn,
  fanPlace,
  leashFactor,
  rootMeanSquare,
} from "./twins.ts";

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
    }
  | {
      /**
       * Every trail's open curve ends at its newest sample, and the next
       * begins there (decision 95), as the trails kept as curves split them
       * for a snapshot (decision 69).
       */
      readonly kind: "split";
    }
  | {
      /** Every trail's open curve is let go, none closed: the trails were put out (decision 95). */
      readonly kind: "forget";
    };

/**
 * How the twins are held near the chain once a command's time has gone by
 * (decision 64), towards the chain as it is then. The lens draws the share's
 * twins in all together, by one factor, once the fan, measured as the root
 * mean square of their distances from the chain, is wider than `width`, so
 * that they stay a blade along the direction chaos stretches them in. The
 * leash draws in each twin past the `slack` on its own, what is beyond it
 * falling at `rate` per second. Both are measured as shares of the chain's
 * length, and act on angles and rates alike; neither is in the paper.
 */
export type TwinHold =
  | {
      readonly kind: "lens";
      readonly width: number;
      readonly theta: Float64Array;
      readonly omega: Float64Array;
    }
  | {
      readonly kind: "leash";
      readonly slack: number;
      readonly rate: number;
      readonly theta: Float64Array;
      readonly omega: Float64Array;
    };

/** Where a command's time begins on the clock of trails kept as curves (decision 68). */
export interface TwinClock {
  /** The seconds of motion sampled as the time begins. */
  readonly seconds: number;
  /** The fade, in half-lives, as the time begins. */
  readonly fade: number;
  /** The half-lives a second the time fades at. */
  readonly rate: number;
}

/**
 * What a share needs to join its twins' trails into curves where it runs
 * (decision 95), with the numbers the main line joins them with otherwise
 * (decisions 21, 23, 43 and 46).
 */
export interface TwinCurves {
  /** How bright every twin's trail is drawn, as lines and as a strobe's stamps, each in its layer's light (decision 102), and how many times the music makes it brighter this frame. */
  readonly light: number;
  readonly stampLight: number;
  readonly music: number;
  /** Each of the share's twins' own light while they fade, by its place in the share; none while they stay. */
  readonly shine: Float64Array | null;
  /** The palette the fan is painted from, by its place in the fan. */
  readonly palette: number;
  /** The note's colour mixed into the twins, and how much, while the music tints them; none otherwise. */
  readonly tint: { readonly color: Rgb; readonly amount: number } | null;
  /** Whether the share joins its twins' tips into lines (decision 97); without, it stamps them alone (decision 100). */
  readonly lines: boolean;
}

/**
 * A strobe's flash within a command's time (decision 100), as it stamped the
 * chain: its instant, in s from the time's start; the fade clock of the
 * trails kept as curves then (decision 91), none otherwise; and where the
 * pivot was.
 */
export interface TwinFlash {
  readonly at: number;
  readonly fade: number;
  readonly x: number;
  readonly y: number;
}

/** What a strobe stamps of each twin over a command's time (decision 100): which parts, at which flashes, in order. */
export interface TwinStamps {
  readonly parts: StampParts;
  readonly flashes: readonly TwinFlash[];
}

/** Spans laid out as a batch lays them (curves.ts): the first `count` of `bytes`. */
export interface SpanBytes {
  readonly bytes: ArrayBuffer;
  readonly count: number;
}

/**
 * A share's twins' trails joined into curves (decision 95): the intervals
 * drawn now, the spans they closed, those a split closed before the time
 * went by, and those still open as it ends, for a view drawn anew; and the
 * twins stamped by the time's flashes, drawn now and kept, as the chain's
 * stamps are (decision 100).
 */
export interface TwinCurveReport {
  readonly fresh: SpanBytes;
  readonly closed: SpanBytes;
  readonly split: SpanBytes;
  readonly open: SpanBytes;
  readonly stamps: SpanBytes;
}

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
   * What the music puts into the physics over the command's time, from its
   * start (decision 74), which each twin feels at every instant of its own
   * steps, as the chain does at those of its own; null while the music acts
   * as no force.
   */
  readonly drive: Drive | null;
  /**
   * Where the chain's masses are once the time has gone by, every x then
   * every y, to measure how far each twin has gone from it (decision 43);
   * null when no twin's light is asked for.
   */
  readonly chain: Float64Array | null;
  /** How the twins are held near the chain once the time has gone by (decision 64); null while they go free. */
  readonly hold: TwinHold | null;
  /** Each twin sent back whole, every mass, or its tip alone, as dust (decision 50). */
  readonly whole: boolean;
  /**
   * Where the command's time begins on the clock of trails kept as curves
   * (decision 68): asked for, each tip's velocity is sent back as well, and
   * the clock with it, so that a report gives each piece its instant however
   * late it comes. None without them.
   */
  readonly clock: TwinClock | null;
  /** How long the share may take, in ms; the twins it has not reached by four times this are dropped (decision 20). */
  readonly budget: number;
  /** How many times the fan had been put out when this was sent: a report of an older time is not drawn. */
  readonly generation: number;
  /** The command's number, counted as the commands are sent; its report gives it back. */
  readonly seq: number;
  /** What the share needs to join its twins' trails into curves where it runs (decision 95), or to stamp them there (decision 100); none where the main line joins them, or there are none. */
  readonly curves: TwinCurves | null;
  /**
   * The strobe's flashes over the time, and what they stamp of each twin
   * (decision 100): where the command carries `curves`, the share stamps them
   * into its curves; otherwise it sends back where each twin's masses were
   * at each flash. None while no strobe stamps the twins, or none flashed.
   */
  readonly stamps: TwinStamps | null;
}

/** What a share sends back from a command: its twins as they are now. */
export interface TwinReport {
  readonly generation: number;
  /** The command's number. */
  readonly seq: number;
  /** The share's twins' trails joined into curves, where the command asked (decision 95); none otherwise. */
  readonly curves: TwinCurveReport | null;
  /** The command's flashes and what they stamp (decision 100), where any stamped the twins; else none. */
  readonly stamps: TwinStamps | null;
  /**
   * Where the share joins no curves, each twin's masses at each of the
   * flashes, every mass's x and y from the top, 2 n numbers a flash and the
   * flashes of a twin together; else none.
   */
  readonly stampPlaces: Float32Array;
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
  /** Each tip's velocity at the same instants, laid out as the tips, in metres a second, when the command carried a clock; else none. */
  readonly tipSpeeds: Float32Array;
  /** The simulated time the command advanced the twins by, in s. */
  readonly time: number;
  /** The command's clock, sent back. */
  readonly clock: TwinClock | null;
  /** Each twin's distance from the chain, as a share of the chain's length (decision 43), when asked for; else none. */
  readonly apart: Float64Array;
  /** How long the command took, in ms. */
  readonly spent: number;
  /**
   * Under the lens (decision 64), how much the share's fan stretched over
   * the time, as the logarithm of its width now over its width after the
   * last command, and that time, in s; both none just after an event, or
   * without the lens.
   */
  readonly stretch: number;
  readonly stretchTime: number;
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
  // under the lens, the fan's width after the last command, as a share of
  // the chain's length; none after an event, when there is nothing to
  // measure from
  #widthAfter = 0;
  // the chain's masses where the twins are held to, and each twin's distance
  // from them
  #heldX: Float64Array;
  #heldY: Float64Array;
  #held = new Float64Array(0);
  // The share's twins' trails, joined into curves here where the command
  // asks (decision 95), each twin by its place in the share; the batches of a
  // command; the palette's colours by place, and where the pivot was at each
  // instant of a command.
  readonly #merger = new Merger();
  readonly #fresh = new SpanBatch(1024);
  readonly #closed = new SpanBatch(256);
  readonly #split = new SpanBatch(256);
  readonly #open = new SpanBatch(1024);
  readonly #stamps = new SpanBatch(256);
  #palette = Number.NaN;
  #colors: Rgb[] = [];
  #pivots = new Float64Array(2);
  #pivotSpeeds = new Float64Array(2);

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
    this.#heldX = new Float64Array(n);
    this.#heldY = new Float64Array(n);
  }

  /** The states of the share's twins, in the order of their places in the fan; for the tests. */
  get twins(): readonly ChainState[] {
    return this.#twins;
  }

  /**
   * Applies a command's events, advances the twins by its time, and reports
   * where they are. Only the motion is timed: the events before it, such as
   * a whole fan born at once, take none of the budget.
   */
  run(command: TwinCommand): TwinReport {
    for (const event of command.events) this.#apply(event);
    const start = this.#clock();
    const twins = this.#twins;
    const asked = twins.length;
    const n = this.#chain.n;
    const pieces = command.time > 0 ? Math.max(1, command.pieces) : 0;
    const step = pieces > 0 ? command.time / pieces : 0;
    const stride = 2 * (pieces + 1);
    const tips = new Float32Array(stride * asked);
    const speeds = command.clock !== null;
    const tipSpeeds = new Float32Array(speeds ? stride * asked : 0);
    const giveUp = start + 4 * command.budget;
    // A strobe's flashes over the time (decision 100): the piece each falls
    // in, and how far into it.
    const stamps = pieces > 0 ? command.stamps : null;
    const flashes = stamps?.flashes ?? [];
    const flashCount = flashes.length;
    const flashPiece = new Int32Array(flashCount);
    const flashInto = new Float64Array(flashCount);
    const flashing = new Uint8Array(pieces);
    flashes.forEach((flash, f) => {
      // one that ends the time ends the last piece, exactly
      const end = flash.at >= command.time * (1 - 1e-9);
      const piece = end
        ? pieces - 1
        : Math.min(pieces - 1, Math.max(0, Math.ceil(flash.at / step) - 1));
      flashPiece[f] = piece;
      flashInto[f] = end ? step : Math.max(0, flash.at - piece * step);
      flashing[piece] = 1;
    });
    const places = new Float32Array(2 * n * flashCount * asked);
    const theta0 = new Float64Array(flashCount > 0 ? n : 0);
    const omega0 = new Float64Array(flashCount > 0 ? n : 0);
    const angles = new Float64Array(flashCount > 0 ? n : 0);
    let done = 0;
    for (const twin of twins) {
      // Out of time: the twins not reached are dropped, so that every twin
      // left has lived the same time as the chain (decision 20). The clock
      // is read every eight twins.
      if (pieces > 0 && (done & 7) === 0 && this.#clock() > giveUp) break;
      let at = stride * done;
      this.#tip(twin.theta, tips, at);
      if (speeds) this.#tipSpeed(twin, tipSpeeds, at);
      for (let piece = 0; piece < pieces; piece++) {
        // where a flash falls in the piece, the twin as the piece begins
        const flashed = flashing[piece] === 1;
        if (flashed) {
          theta0.set(twin.theta);
          omega0.set(twin.omega);
        }
        this.#stepper.advance(twin, step, command.g, {
          shake: command.shakes[piece] ?? null,
          drive: command.drive,
          into: piece * step,
        });
        at += 2;
        this.#tip(twin.theta, tips, at);
        if (speeds) this.#tipSpeed(twin, tipSpeeds, at);
        // and at each flash in it, the twin between the piece's ends, its
        // own motion untouched
        if (flashed) {
          for (let f = 0; f < flashCount; f++) {
            if (flashPiece[f] !== piece) continue;
            anglesAt(
              theta0,
              omega0,
              twin.theta,
              twin.omega,
              flashInto[f] ?? step,
              step,
              angles,
            );
            this.#placeAt(angles, places, 2 * n * (done * flashCount + f));
          }
        }
      }
      done++;
    }
    twins.length = done;
    const curves = this.#join(command, pieces, tips, tipSpeeds, done, places);

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
    // held once the time has gone by: what is sent back is where the twins
    // got to on their own, and the next frame starts where they are held to
    const stretch =
      command.hold !== null && pieces > 0
        ? this.#hold(command.hold, command.time, done)
        : null;
    return {
      generation: command.generation,
      seq: command.seq,
      curves,
      stamps: flashCount > 0 ? stamps : null,
      // joined into curves, the stamps went with them
      stampPlaces:
        flashCount > 0 && curves === null ? places : new Float32Array(0),
      asked,
      count: done,
      n,
      pieces,
      positions,
      tips,
      tipSpeeds,
      time: command.time,
      clock: command.clock,
      apart: distances,
      spent: this.#clock() - start,
      stretch: stretch ?? 0,
      stretchTime: stretch === null ? 0 : command.time,
    };
  }

  /**
   * The share's first `count` twins' tips along a command of `pieces`
   * pieces, joined into their trails' curves as the main line would join
   * them (decision 95): each tip where the pivot was at each instant, under
   * the command's own music (decision 75), in its place's colour, tinted as
   * the music asks, in the trails' light times its own times the music's.
   * Then every curve still open, for a view drawn anew. And each twin
   * stamped at each of the command's flashes, from its masses' `places`
   * (decision 100), in the same colour, in the stamps' light (decision 102).
   * None where the command asks for none.
   */
  #join(
    command: TwinCommand,
    pieces: number,
    tips: Float32Array,
    tipSpeeds: Float32Array,
    count: number,
    places: Float32Array,
  ): TwinCurveReport | null {
    const { curves, clock } = command;
    // joining none, the share still sends back a split asked for, and the
    // curves still open after it, so that no light is lost (decision 97)
    if (curves === null && this.#split.count === 0) return null;
    if (curves?.lines === true && pieces > 0 && clock !== null) {
      if (this.#pivots.length !== 2 * (pieces + 1)) {
        this.#pivots = new Float64Array(2 * (pieces + 1));
        this.#pivotSpeeds = new Float64Array(2 * (pieces + 1));
      }
      pivotsOver(
        command.drive,
        pieces,
        command.time,
        this.#pivots,
        this.#pivotSpeeds,
      );
      const along = { pieces, tips, tipSpeeds, clock, time: command.time };
      const stride = 2 * (pieces + 1);
      for (let k = 0; k < count; k++) {
        const shine = curves.shine?.[k] ?? 1;
        twinCurve(
          this.#merger,
          this.#fresh,
          this.#closed,
          k,
          along,
          stride * k,
          this.#colorOf(this.index + k * this.shares, curves),
          curves.light * shine * curves.music,
          this.#pivots,
          this.#pivotSpeeds,
        );
      }
    }
    this.#merger.openSpans(this.#open);
    const flashes = pieces > 0 ? (command.stamps?.flashes ?? []) : [];
    if (curves !== null && command.stamps !== null && flashes.length > 0) {
      const n = this.#chain.n;
      const { parts } = command.stamps;
      for (let k = 0; k < count; k++) {
        const color = this.#colorOf(this.index + k * this.shares, curves);
        const light =
          curves.stampLight * (curves.shine?.[k] ?? 1) * curves.music;
        flashes.forEach((flash, f) => {
          stampTwin(
            this.#stamps,
            parts,
            n,
            places,
            2 * n * (k * flashes.length + f),
            flash.x,
            flash.y,
            color,
            light,
            flash.fade,
          );
        });
      }
    }
    return {
      fresh: handed(this.#fresh),
      closed: handed(this.#closed),
      split: handed(this.#split),
      open: handed(this.#open),
      stamps: handed(this.#stamps),
    };
  }

  /** Twin `j`'s colour this command: its place's in the fan's palette, tinted as the music asks (decision 46). */
  #colorOf(j: number, curves: TwinCurves): Rgb {
    if (curves.palette !== this.#palette) {
      this.#palette = curves.palette;
      this.#colors = [];
    }
    const k = (j - this.index) / this.shares;
    let color = this.#colors[k];
    if (color === undefined) {
      color = fanPalette(curves.palette).color(fanPlace(j));
      this.#colors[k] = color;
    }
    const { tint } = curves;
    return tint === null ? color : mixColors(color, tint.color, tint.amount);
  }

  /**
   * Holds the share's first `count` twins near the chain once `time` has
   * gone by (decision 64), and returns how much the fan stretched over it
   * under the lens, or null where there is no measure.
   */
  #hold(hold: TwinHold, time: number, count: number): number | null {
    const chain = this.#chain;
    const n = chain.n;
    const twins = this.#twins;
    if (hold.theta.length !== n || count === 0) return null;
    if (this.#held.length < count) this.#held = new Float64Array(count);
    const held = this.#held;
    const x = this.#x;
    const y = this.#y;
    chain.positions(hold.theta, this.#heldX, this.#heldY);
    for (let k = 0; k < count; k++) {
      chain.positions(twins[k]!.theta, x, y);
      held[k] = apart(this.#heldX, this.#heldY, x, y, chain.totalLength);
    }
    if (hold.kind === "leash") {
      const fall = Math.exp(-hold.rate * time);
      for (let k = 0; k < count; k++) {
        const factor = leashFactor(held[k]!, hold.slack, fall);
        if (factor < 1) drawIn(twins[k]!, hold, factor);
      }
      return null;
    }
    const width = rootMeanSquare(held, count);
    const stretch =
      this.#widthAfter > 0 && width > 0
        ? Math.log(width / this.#widthAfter)
        : null;
    if (width > hold.width) {
      const factor = hold.width / width;
      for (let k = 0; k < count; k++) drawIn(twins[k]!, hold, factor);
      this.#widthAfter = hold.width;
    } else {
      this.#widthAfter = width;
    }
    return stretch;
  }

  #apply(event: TwinEvent): void {
    // the trails' curves, which say nothing of the twins themselves
    if (event.kind === "split") {
      this.#merger.splitAll(this.#split);
      return;
    }
    if (event.kind === "forget") {
      this.#merger.forget();
      return;
    }
    const twins = this.#twins;
    // the fan's width after the last command says nothing of it now
    this.#widthAfter = 0;
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
        this.#heldX = new Float64Array(event.n);
        this.#heldY = new Float64Array(event.n);
        break;
      }
      case "reverse":
        for (const twin of twins) reverseMotion(twin);
        break;
    }
  }

  /** Where every mass of a chain at these angles is, from the top, x then y for each, written to out at `at`. */
  #placeAt(theta: Float64Array, out: Float32Array, at: number): void {
    const x = this.#x;
    const y = this.#y;
    this.#chain.positions(theta, x, y);
    for (let i = 0; i < this.#chain.n; i++) {
      out[at + 2 * i] = x[i]!;
      out[at + 2 * i + 1] = y[i]!;
    }
  }

  /** How fast the tip of a twin moves, the rate its place changes, written to out at `at`. */
  #tipSpeed(twin: ChainState, out: Float32Array, at: number): void {
    const lengths = this.#chain.lengths;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < this.#chain.n; i++) {
      const sweep = lengths[i]! * twin.omega[i]!;
      vx += sweep * Math.cos(twin.theta[i]!);
      vy += sweep * Math.sin(twin.theta[i]!);
    }
    out[at] = vx;
    out[at + 1] = vy;
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

/** The spans of `batch` as bytes of their own, handed over, and the batch emptied for the next command. */
function handed(batch: SpanBatch): SpanBytes {
  const spans = { bytes: batch.bytes(), count: batch.count };
  batch.clear();
  return spans;
}
