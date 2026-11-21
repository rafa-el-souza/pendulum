import type { Signals } from "../audio/signals.ts";
import type { Force } from "../core/routes.ts";
import {
  Chain,
  createHand,
  type Gravity,
  type Hand,
} from "../physics/chain.ts";
import {
  handAt,
  pivotAt,
  type Drive,
  type PivotMotion,
  type WritableHand,
} from "../physics/drive.ts";
import { resample } from "../physics/resample.ts";
import {
  PeriodTension,
  Stepper,
  restingState,
  reverseMotion,
  type ChainState,
  type Shake,
} from "../physics/step.ts";
import { MusicForces } from "./forces.ts";
import { handDamping, shakeOf } from "./parameters.ts";

// The chain's motion over a frame (docs/decisions.md, decision 80), apart
// from the page that asks for it and draws it: where the chain is and how it
// moves, the visitor's hand, the shaken pivot, the music's forces and the
// pivot where they take it. Each frame the page asks for the time that went
// by, and the motion steps it in pieces (decision 21) and gives back a record
// of the frame: how long each piece ran, and where every mass and the pivot
// were at its end, which the page draws the trails from and sends the twins
// by. Between frames it changes by events alone, each noted in a diary, and
// its whole state can be taken as a snapshot and given back (decision 81).

/**
 * A frame's motion goes in this many pieces to the simulated second, each
 * ending in a point of the trails (decision 21), no fewer than FEWEST_PIECES
 * and no more than MOST_PIECES.
 */
export const PIECE_RATE = 480;
export const FEWEST_PIECES = 4;
export const MOST_PIECES = 16;

/** Where a pointer is, and how it moves, in the world's metres. */
export interface Pointer {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

/** What a frame asks of the chain's motion. */
export interface MotionFrame {
  /** The real time since the frame before, in s. */
  readonly real: number;
  /** How fast the piece's time runs against the clock (decision 15). */
  readonly speed: number;
  /** The clock (performance.now()) past which the frame stops short: slow motion (decision 15). */
  readonly deadline: number;
  /** What the music says this frame, or null while no source plays; its mode's force, if any, and its strength (decisions 74 and 75). */
  readonly heard: Signals | null;
  readonly force: Force | undefined;
  readonly strength: number;
  /** Where the visitor's hand is in the world, as the frame begins, while it holds the chain. */
  readonly pointer: Pointer;
  /** Whether each rod's tension is taken, for its colour (decision 35). */
  readonly tension: boolean;
  /** Whether the record takes each mass's velocity, for trails kept as curves (decision 68). */
  readonly speeds: boolean;
  /** Whether the frame runs a frame ahead, while there are twins (decision 51). */
  readonly ahead: boolean;
}

/** What a frame of the chain's motion did: its record. */
export interface Moved {
  /** The piece's time the frame asked for, and the time it simulated, in s: less where time ran out (decision 15). */
  readonly asked: number;
  readonly simulated: number;
  /**
   * The real time the frame spans, in s, and where it starts against the
   * moment the music was heard: −real where it ends at that moment, 0 where
   * it runs a frame ahead (decision 51).
   */
  readonly real: number;
  readonly from: number;
  /** The piece's time the frame began at, in s since the motion was made. */
  readonly start: number;
  /** Where in its cycle the shake was as the frame began (decision 36). */
  readonly phase: number;
  /** How many pieces ran, and how long each ran, in s. */
  readonly pieces: number;
  readonly times: Float64Array;
  /**
   * At each piece's end, every mass where it is, x then y, hung from the
   * pivot where the music has taken it (decision 75), 2n numbers a piece;
   * and the pivot there, x then y.
   */
  readonly positions: Float64Array;
  readonly pivots: Float64Array;
  /**
   * Where asked for, each mass's velocity, x then y, the pivot's added, at
   * each piece's end, 2n numbers a piece, and as the frame began.
   */
  readonly velocities: Float64Array;
  readonly startVelocities: Float64Array;
  /** What the music put into the physics over the frame (decision 74). */
  readonly drive: Drive | null;
  /** Whether the motion broke down, a number gone infinite: the chain should start again. */
  readonly broke: boolean;
}

/** The shake the controls ask for: how many times a second, and gravity's turn, whose line it runs along. */
export interface ShakeAsked {
  readonly hertz: number;
  readonly degrees: number;
}

/** The chain as the screen shows it: where it is, how it moves, and the shake's phase then. */
export interface Shown extends ChainState {
  readonly phase: number;
}

/**
 * What changes the chain's motion between frames (decision 81): a setting
 * to a value, never by a step, or what the visitor does.
 */
export type MotionEvent =
  /** The chain starts from where it is given, with the shake's phase there, or where it stands when none is (decisions 33 and 34). */
  | {
      readonly kind: "start";
      readonly theta: Float64Array;
      readonly omega: Float64Array;
      readonly phase: number | null;
    }
  /** The same motion on `n` masses. */
  | { readonly kind: "masses"; readonly n: number }
  /** The visitor's hand grabs the mass nearest the point of the world, with a grip (decision 18). */
  | {
      readonly kind: "grab";
      readonly x: number;
      readonly y: number;
      readonly grip: number;
    }
  /** The visitor's hand takes another grip where it is. */
  | { readonly kind: "grip"; readonly grip: number }
  /** The visitor's hand lets go. */
  | { readonly kind: "let go" }
  /** Time the other way (decision 28). */
  | { readonly kind: "reverse" }
  /** Gravity's strength and direction (decision 29). */
  | { readonly kind: "gravity"; readonly g: Gravity }
  /** The pivot shaken so many times a second along gravity turned so far, or still (decision 36). */
  | {
      readonly kind: "shake";
      readonly hertz: number;
      readonly degrees: number;
    }
  /** The tension over the shake's periods measured afresh (decision 35). */
  | { readonly kind: "measure afresh" };

/** An event as the diary notes it: how many frames had run, and the piece's time and the clock's the motion had run, in s. */
export interface Noted {
  readonly frame: number;
  readonly time: number;
  readonly clock: number;
  readonly event: MotionEvent;
}

/** How many events the diary keeps, the latest. */
export const DIARY_MOST = 1024;

/**
 * The chain's motion whole, as plain data (decision 81): the chain's state,
 * the shake's phase, gravity, the shake asked for, the visitor's hand with
 * its grip, the pivot, the chain the screen shows, and the piece's time, the
 * clock's and the frames run.
 */
export interface MotionSnapshot {
  readonly n: number;
  readonly theta: Float64Array;
  readonly omega: Float64Array;
  readonly phase: number;
  readonly g: Gravity;
  readonly shake: ShakeAsked;
  readonly hand: {
    readonly index: number;
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly grip: number;
  } | null;
  readonly pivot: Readonly<PivotMotion>;
  readonly shown: Shown;
  readonly time: number;
  readonly clock: number;
  readonly frames: number;
}

/** The chain's motion, frame by frame. */
export class Motion {
  #chain: Chain;
  #state: ChainState;
  #stepper: Stepper;
  #g: Gravity;
  #shake: ShakeAsked;
  #shakePhase = 0;
  #hand: Hand | null = null;
  // the grip the visitor's hand holds with
  #grip = 0;
  readonly #slow: boolean;
  #forces: MusicForces;
  // what the music put into the physics of the frame run last, the pivot
  // where it took it as that frame ended, and the music's hand then
  #drive: Drive | null = null;
  readonly #pivot: PivotMotion = { x: 0, y: 0, vx: 0, vy: 0 };
  readonly #then: PivotMotion = { x: 0, y: 0, vx: 0, vy: 0 };
  #musicHand: WritableHand | null = null;
  // each rod's tension, over whole periods of the shake, over a piece, and
  // summed over the frame by the time each piece took (decision 35)
  #meter: PeriodTension;
  #pieceTension: Float64Array;
  #frameTension: Float64Array;
  // the chain as the screen shows it, kept while the next frame runs ahead
  // (decision 51)
  #shown: { theta: Float64Array; omega: Float64Array; phase: number };
  // the piece's time and the clock's run since the motion was made, in s,
  // the frames run, and the events since, the latest DIARY_MOST
  #time = 0;
  #clock = 0;
  #frames = 0;
  #diary: Noted[] = [];
  // the record's room, kept from frame to frame
  #times = new Float64Array(MOST_PIECES);
  #positions: Float64Array;
  #pivots = new Float64Array(2 * MOST_PIECES);
  #velocities: Float64Array;
  #startVelocities: Float64Array;
  #x: Float64Array;
  #y: Float64Array;

  /**
   * A chain of `n` masses hanging at rest, under gravity `g`, its pivot
   * shaken as `shake` asks; with reduced motion asked for (`slow`), the
   * music kicks nothing and its hand crosses slowly (decision 75).
   */
  constructor(
    n: number,
    options: { g: Gravity; shake: ShakeAsked; slow: boolean },
  ) {
    this.#chain = Chain.uniform(n);
    this.#state = restingState(n);
    this.#stepper = new Stepper(this.#chain);
    this.#g = options.g;
    this.#shake = options.shake;
    this.#slow = options.slow;
    this.#forces = new MusicForces({ slow: options.slow });
    this.#meter = new PeriodTension(n);
    this.#pieceTension = new Float64Array(n);
    this.#frameTension = new Float64Array(n);
    this.#shown = {
      theta: new Float64Array(n),
      omega: new Float64Array(n),
      phase: 0,
    };
    this.#positions = new Float64Array(2 * n * MOST_PIECES);
    this.#velocities = new Float64Array(2 * n * MOST_PIECES);
    this.#startVelocities = new Float64Array(2 * n);
    this.#x = new Float64Array(n);
    this.#y = new Float64Array(n);
  }

  /** The chain: how many masses, their masses and their rods. */
  get chain(): Chain {
    return this.#chain;
  }

  /** Where the chain is and how it moves now: each rod's angle and its rate. */
  get state(): ChainState {
    return this.#state;
  }

  /** The gravity the chain falls under, as its controls ask. */
  get g(): Gravity {
    return this.#g;
  }

  /** The visitor's hand, while it holds the chain. */
  get hand(): Hand | null {
    return this.#hand;
  }

  /** Whether the visitor's hand holds the chain. */
  get held(): boolean {
    return this.#hand !== null;
  }

  /** Where in its cycle the shake is now (decision 36). */
  get shakePhase(): number {
    return this.#shakePhase;
  }

  /** What the music put into the physics of the frame run last, which its twins are sent with (decision 74). */
  get drive(): Drive | null {
    return this.#drive;
  }

  /** Where the pivot is, and how it moves, at the instant the chain was run to (decision 75). */
  get pivot(): Readonly<PivotMotion> {
    return this.#pivot;
  }

  /** The music's hand at the instant the chain was run to, while it holds the tip (decision 75). */
  get musicHand(): Readonly<WritableHand> | null {
    return this.#musicHand;
  }

  /** Whether the music's kicks are still moving the pivot. */
  get kicking(): boolean {
    return this.#forces.kicking;
  }

  /** Each rod's tension over whole periods of the shake (decision 35). */
  get meter(): PeriodTension {
    return this.#meter;
  }

  /** Each rod's tension summed over the frame run last, each piece's weighted by the time it took, where the tension was asked for (decision 35). */
  get frameTension(): Float64Array {
    return this.#frameTension;
  }

  /** The chain as the screen shows it while the next frame runs ahead (decision 51). */
  get shown(): Shown {
    return this.#shown;
  }

  /** The piece's time run since the motion was made, in s. */
  get time(): number {
    return this.#time;
  }

  /** The clock's time the motion has run, in s: the real time of its frames. */
  get clock(): number {
    return this.#clock;
  }

  /** How many frames the motion has run. */
  get frames(): number {
    return this.#frames;
  }

  /** The events that changed the motion, in order, the latest DIARY_MOST. */
  get diary(): readonly Noted[] {
    return this.#diary;
  }

  /** The shake the controls ask for, from `phase`, or none while the pivot is still (decision 36). */
  shakeAt(phase: number): Shake | null {
    return shakeOf(this.#shake.hertz, this.#shake.degrees, phase);
  }

  /**
   * The shake over each of `pieces` pieces of `simulated` s, from `phase`
   * where the frame began (decision 36): the twins' share of the frame.
   */
  twinShakes(
    phase: number,
    simulated: number,
    pieces: number,
  ): (Shake | null)[] {
    const rate = 2 * Math.PI * this.#shake.hertz;
    return Array.from({ length: pieces }, (_, piece) =>
      this.shakeAt(phase + (rate * piece * simulated) / pieces),
    );
  }

  /** Where the music's kicks had taken the pivot `t` s into the frame run last, written to `out`: nowhere without them. */
  pivotAt(t: number, out: PivotMotion): void {
    pivotIn(this.#drive, t, out);
  }

  /** Every mass where it is now, hung from the pivot where the music has taken it, into `x` and `y`. */
  positions(x: Float64Array, y: Float64Array): void {
    this.#chain.positions(this.#state.theta, x, y);
    hangFrom(this.#pivot, x, y, this.#chain.n);
  }

  /**
   * The frame: the time that went by, times the speed asked for, stepped in
   * pieces, under the music's forces and with the visitor's hand where the
   * pointer is; the record of what it did.
   */
  advance(frame: MotionFrame): Moved {
    // run ahead, the chain the screen shows until then is kept (decision 51)
    if (frame.ahead) this.#keepShown();
    const chain = this.#chain;
    const n = chain.n;
    const state = this.#state;
    if (frame.tension) this.#frameTension.fill(0);
    // the hand holds in the pivot's frame, where the music's kicks have
    // taken it (decision 75)
    const hand = this.#hand;
    if (hand !== null) {
      hand.x = frame.pointer.x - this.#pivot.x;
      hand.y = frame.pointer.y - this.#pivot.y;
      hand.vx = frame.pointer.vx - this.#pivot.vx;
      hand.vy = frame.pointer.vy - this.#pivot.vy;
    }
    const asked = frame.real * frame.speed;
    const pieces = Math.min(
      MOST_PIECES,
      Math.max(FEWEST_PIECES, Math.ceil(asked * PIECE_RATE)),
    );
    if (frame.speeds) {
      this.#velocitiesInto(this.#startVelocities, 0);
      movedWith(this.#pivot, this.#startVelocities, 0, n);
    }
    // The music's forces over the frame, which each piece feels from where
    // it starts in it (decision 74): one run ahead starts at the moment the
    // music was heard, one run now ends at it (decision 51).
    const from = frame.ahead ? 0 : -frame.real;
    const drive = this.#forces.frame({
      heard: frame.heard,
      force: frame.force,
      strength: frame.strength,
      real: frame.real,
      span: asked,
      speed: frame.speed,
      chain,
      state,
      g: this.#g,
      held: hand !== null,
      from,
    });
    this.#drive = drive;
    const start = this.#time;
    const phase = this.#shakePhase;
    let simulated = 0;
    let ran = 0;
    for (let piece = 0; piece < pieces; piece++) {
      const want = asked / pieces;
      const shake = this.shakeAt(this.#shakePhase);
      const moved = this.#stepper.advance(state, want, this.#g, {
        hand,
        deadline: frame.deadline,
        meanTension:
          frame.tension && shake === null ? this.#pieceTension : null,
        shake,
        periodTension: frame.tension ? this.#meter : null,
        drive,
        into: simulated,
      });
      simulated += moved.simulated;
      if (shake !== null) {
        this.#shakePhase =
          (this.#shakePhase + shake.rate * moved.simulated) % (2 * Math.PI);
      }
      if (frame.tension && shake === null) {
        for (let i = 0; i < n; i++) {
          this.#frameTension[i] =
            (this.#frameTension[i] ?? 0) +
            moved.simulated * (this.#pieceTension[i] ?? 0);
        }
      }
      // where every mass and the pivot are at the piece's end
      this.#times[piece] = moved.simulated;
      pivotIn(drive, simulated, this.#then);
      this.#pivots[2 * piece] = this.#then.x;
      this.#pivots[2 * piece + 1] = this.#then.y;
      const x = this.#x;
      const y = this.#y;
      chain.positions(state.theta, x, y);
      hangFrom(this.#then, x, y, n);
      const at = 2 * n * piece;
      for (let i = 0; i < n; i++) {
        this.#positions[at + 2 * i] = x[i] ?? 0;
        this.#positions[at + 2 * i + 1] = y[i] ?? 0;
      }
      if (frame.speeds) {
        this.#velocitiesInto(this.#velocities, at);
        movedWith(this.#then, this.#velocities, at, n);
      }
      ran = piece + 1;
      // out of time: the rest of the frame is slow motion (decision 15)
      if (moved.simulated < want * 0.999) break;
    }
    // where the pivot is as the frame ends, and the music's hand then
    // (decision 75)
    this.#forces.ran(simulated);
    pivotIn(drive, simulated, this.#pivot);
    const holder = drive?.hands[0];
    if (drive !== null && holder !== undefined) {
      this.#musicHand ??= {
        index: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        stiffness: 0,
        damping: 0,
        fastest: 0,
      };
      handAt(holder, drive, simulated, this.#musicHand);
    } else {
      this.#musicHand = null;
    }
    this.#time += simulated;
    this.#clock += frame.real;
    this.#frames++;
    const broke = !(
      state.theta.every(Number.isFinite) && state.omega.every(Number.isFinite)
    );
    return {
      asked,
      simulated,
      real: frame.real,
      from,
      start,
      phase,
      pieces: ran,
      times: this.#times,
      positions: this.#positions,
      pivots: this.#pivots,
      velocities: this.#velocities,
      startVelocities: this.#startVelocities,
      drive,
      broke,
    };
  }

  /** The motion changes as `event` asks, between frames, and the diary notes it. */
  apply(event: MotionEvent): void {
    switch (event.kind) {
      case "start":
        this.#start(event.theta, event.omega, event.phase);
        break;
      case "masses":
        this.#resample(event.n);
        break;
      case "grab":
        this.#grab(event.x, event.y, event.grip);
        break;
      case "grip":
        this.#regrip(event.grip);
        break;
      case "let go":
        this.#hand = null;
        break;
      case "reverse":
        this.#reverse();
        break;
      case "gravity":
        this.#g = event.g;
        break;
      case "shake":
        this.#shake = { hertz: event.hertz, degrees: event.degrees };
        break;
      case "measure afresh":
        this.#meter = new PeriodTension(this.#chain.n);
        break;
    }
    this.#diary.push({
      frame: this.#frames,
      time: this.#time,
      clock: this.#clock,
      event,
    });
    if (this.#diary.length > DIARY_MOST) this.#diary.shift();
  }

  /** The motion whole, as plain data, copied. */
  snapshot(): MotionSnapshot {
    const hand = this.#hand;
    return {
      n: this.#chain.n,
      theta: Float64Array.from(this.#state.theta),
      omega: Float64Array.from(this.#state.omega),
      phase: this.#shakePhase,
      g: { ...this.#g },
      shake: { ...this.#shake },
      hand:
        hand === null
          ? null
          : {
              index: hand.index,
              x: hand.x,
              y: hand.y,
              vx: hand.vx,
              vy: hand.vy,
              grip: this.#grip,
            },
      pivot: { ...this.#pivot },
      shown: {
        theta: Float64Array.from(this.#shown.theta),
        omega: Float64Array.from(this.#shown.omega),
        phase: this.#shown.phase,
      },
      time: this.#time,
      clock: this.#clock,
      frames: this.#frames,
    };
  }

  /**
   * The motion as `snapshot` was taken: the music's forces start afresh,
   * without the kicks or the hand they had then, and the diary is kept.
   */
  restore(snapshot: MotionSnapshot): void {
    const { n } = snapshot;
    if (n !== this.#chain.n) {
      this.#chain = Chain.uniform(n);
      this.#stepper = new Stepper(this.#chain);
      this.#room(n);
    }
    this.#state = {
      theta: Float64Array.from(snapshot.theta),
      omega: Float64Array.from(snapshot.omega),
    };
    this.#shakePhase = snapshot.phase;
    this.#g = { ...snapshot.g };
    this.#shake = { ...snapshot.shake };
    const hand = snapshot.hand;
    this.#hand =
      hand === null ? null : this.#holding(hand.index, hand, hand.grip);
    this.#forces = new MusicForces({ slow: this.#slow });
    this.#drive = null;
    this.#musicHand = null;
    Object.assign(this.#pivot, snapshot.pivot);
    this.#shown = {
      theta: Float64Array.from(snapshot.shown.theta),
      omega: Float64Array.from(snapshot.shown.omega),
      phase: snapshot.shown.phase,
    };
    this.#meter = new PeriodTension(n);
    this.#time = snapshot.time;
    this.#clock = snapshot.clock;
    this.#frames = snapshot.frames;
  }

  /**
   * The chain starts again from `theta` and `omega`, copied, as it is given
   * (decision 33), or from a moment saved, with the shake's `phase` where it
   * was then (decision 34): the visitor's hand and the music's let go, the
   * music's to take hold again from where its path is (decision 75), and the
   * tension over the shake's periods is measured afresh.
   */
  #start(theta: Float64Array, omega: Float64Array, phase: number | null): void {
    this.#state = {
      theta: Float64Array.from(theta),
      omega: Float64Array.from(omega),
    };
    if (phase !== null) this.#shakePhase = phase;
    this.#hand = null;
    this.#forces.letGo();
    this.#meter = new PeriodTension(this.#chain.n);
  }

  /** The same motion on `n` masses, the visitor's hand keeping hold of the same place along the chain with its grip; the music's hand takes hold of the new tip (decision 75). */
  #resample(n: number): void {
    if (n === this.#chain.n) return;
    const before = this.#chain;
    const moved = resample(before, this.#state, n);
    this.#chain = moved.chain;
    this.#state = moved.state;
    this.#stepper = new Stepper(this.#chain);
    this.#room(n);
    const hand = this.#hand;
    if (hand !== null) {
      const along = (hand.index + 1) / before.n;
      const index = Math.min(n - 1, Math.max(0, Math.round(along * n) - 1));
      this.#hand = this.#holding(index, hand, this.#grip);
    }
    this.#forces.letGo();
  }

  /** Room for `n` masses: the tension's, the record's, and the meter afresh. */
  #room(n: number): void {
    this.#meter = new PeriodTension(n);
    this.#pieceTension = new Float64Array(n);
    this.#frameTension = new Float64Array(n);
    this.#positions = new Float64Array(2 * n * MOST_PIECES);
    this.#velocities = new Float64Array(2 * n * MOST_PIECES);
    this.#startVelocities = new Float64Array(2 * n);
    this.#x = new Float64Array(n);
    this.#y = new Float64Array(n);
  }

  /** The visitor's hand grabs the mass nearest the point (`x`, `y`) of the world, in the pivot's frame, with the grip `rate` (decision 18). */
  #grab(x: number, y: number, rate: number): void {
    const hx = x - this.#pivot.x;
    const hy = y - this.#pivot.y;
    this.#hand = this.#holding(
      this.#chain.nearestMass(this.#state.theta, hx, hy),
      { x: hx, y: hy, vx: 0, vy: 0 },
      rate,
    );
  }

  /** The visitor's hand, if it holds, takes the grip `rate` at once, where it is. */
  #regrip(rate: number): void {
    const hand = this.#hand;
    if (hand !== null) this.#hand = this.#holding(hand.index, hand, rate);
  }

  /**
   * Time the other way (decision 28): the chain keeps its place and moves
   * the opposite way, the shake's phase turned over, and so does the chain
   * the screen shows while the next frame runs ahead; the tension over the
   * shake's periods is measured afresh.
   */
  #reverse(): void {
    reverseMotion(this.#state);
    this.#shakePhase = -this.#shakePhase;
    reverseMotion(this.#shown);
    this.#shown.phase = -this.#shown.phase;
    this.#meter = new PeriodTension(this.#chain.n);
  }

  /** The chain as the screen shows it now is kept, while the next frame runs ahead (decision 51). */
  #keepShown(): void {
    const n = this.#chain.n;
    if (this.#shown.theta.length !== n) {
      this.#shown.theta = new Float64Array(n);
      this.#shown.omega = new Float64Array(n);
    }
    this.#shown.theta.set(this.#state.theta);
    this.#shown.omega.set(this.#state.omega);
    this.#shown.phase = this.#shakePhase;
  }

  /** A hand on mass `index` with the grip `rate`, where `at` is and moving as it moves; the grip is kept. */
  #holding(
    index: number,
    at: { x: number; y: number; vx: number; vy: number },
    rate: number,
  ): Hand {
    this.#grip = rate;
    const held = createHand(this.#chain, index, rate, handDamping(rate));
    held.x = at.x;
    held.y = at.y;
    held.vx = at.vx;
    held.vy = at.vy;
    return held;
  }

  /** Each mass's velocity now, into `out` from `at`, x then y for each: how fast positions() changes. */
  #velocitiesInto(out: Float64Array, at: number): void {
    const chain = this.#chain;
    const { theta, omega } = this.#state;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < chain.n; i++) {
      const sweep = (chain.lengths[i] ?? 0) * (omega[i] ?? 0);
      vx += sweep * Math.cos(theta[i] ?? 0);
      vy += sweep * Math.sin(theta[i] ?? 0);
      out[at + 2 * i] = vx;
      out[at + 2 * i + 1] = vy;
    }
  }
}

/** Where the music's kicks have taken the pivot `t` s into a frame of `drive`, written to `out`: nowhere without one. */
function pivotIn(drive: Drive | null, t: number, out: PivotMotion): void {
  if (drive === null) {
    out.x = 0;
    out.y = 0;
    out.vx = 0;
    out.vy = 0;
  } else {
    pivotAt(drive, t, out);
  }
}

/** The first `n` masses where the pivot is (decision 75): the positions computed from it, moved by its place. */
function hangFrom(
  pivot: Readonly<PivotMotion>,
  x: Float64Array,
  y: Float64Array,
  n: number,
): void {
  if (pivot.x === 0 && pivot.y === 0) return;
  for (let i = 0; i < n; i++) {
    x[i] = (x[i] ?? 0) + pivot.x;
    y[i] = (y[i] ?? 0) + pivot.y;
  }
}

/** Each of the first `n` masses' velocities in `out` from `at`, with the pivot's added. */
function movedWith(
  pivot: Readonly<PivotMotion>,
  out: Float64Array,
  at: number,
  n: number,
): void {
  if (pivot.vx === 0 && pivot.vy === 0) return;
  for (let i = 0; i < n; i++) {
    out[at + 2 * i] = (out[at + 2 * i] ?? 0) + pivot.vx;
    out[at + 2 * i + 1] = (out[at + 2 * i + 1] ?? 0) + pivot.vy;
  }
}
