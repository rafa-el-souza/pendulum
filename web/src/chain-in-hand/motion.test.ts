import { describe, expect, it } from "vitest";

import type { Signals } from "../audio/signals.ts";
import type { Force } from "../core/routes.ts";
import { Chain, createHand, type Gravity } from "../physics/chain.ts";
import { pivotAt, type PivotMotion } from "../physics/drive.ts";
import { resample } from "../physics/resample.ts";
import {
  PeriodTension,
  Stepper,
  restingState,
  type ChainState,
} from "../physics/step.ts";
import { MusicForces } from "./forces.ts";
import {
  DIARY_MOST,
  FEWEST_PIECES,
  MOST_PIECES,
  Motion,
  PIECE_RATE,
  type MotionFrame,
} from "./motion.ts";
import { gravityOf, handDamping, shakeOf } from "./parameters.ts";

// The chain's motion over a frame (docs/decisions.md, decision 80): the
// piece's own step, which the page asks for once a frame and whose record it
// draws the trails from. It must do what the page did before, number for
// number: the paper's equations (PH-4) stepped in the pieces of a frame
// (decision 21), with the visitor's hand (decision 18), the shaken pivot
// (decision 36), the tension's colour (decision 35) and the music's forces
// (decisions 74 and 75), slower than asked where time runs out (decision 15).
// Between frames it changes by events alone, which a diary notes, and its
// state is taken and given back whole (decision 81).

const DOWN: Gravity = { x: 0, y: -9.81 };
const FRAME = 1 / 60;
const SPEED = 0.8;
const SPEAKER: Force = { kind: "speaker", depth: 0.04 };
const STILL = { x: 0, y: 0, vx: 0, vy: 0 };

/** What a frame of music says: half as loud as it has been, no attack, unless told otherwise. */
function heard(over: Partial<Signals> = {}): Signals {
  return {
    at: 0,
    level: 0.5,
    bass: 0.5,
    mid: 0.5,
    treble: 0.5,
    onset: 0,
    kick: 0,
    snare: 0,
    hat: 0,
    hit: 0,
    note: 0,
    bassNote: 0,
    bassChange: 0,
    silent: false,
    loudness: -20,
    bands: { bass: -20, mid: -20, treble: -20 },
    beat: null,
    ...over,
  };
}

/** A frame at 60 Hz and ×0.8 with all the time it needs, no music and no hand, now. */
function frame(over: Partial<MotionFrame> = {}): MotionFrame {
  return {
    real: FRAME,
    speed: SPEED,
    deadline: Number.POSITIVE_INFINITY,
    heard: null,
    force: undefined,
    strength: 3,
    pointer: STILL,
    tension: false,
    speeds: false,
    ahead: false,
    ...over,
  };
}

/** A chain of `n` masses raised to one side, as the piece starts it, at rest for an instant. */
function raised(n: number): ChainState {
  const state = restingState(n);
  for (let i = 0; i < n; i++) {
    state.theta[i] = 2.2 + (0.7 * i) / Math.max(1, n - 1);
  }
  return state;
}

/** The chain starts from `state`, with the shake's phase there if given. */
function start(motion: Motion, state: ChainState, phase: number | null = null) {
  motion.apply({
    kind: "start",
    theta: state.theta,
    omega: state.omega,
    phase,
  });
}

/** A motion of `n` masses on Earth, raised to one side. */
function motionOf(n: number, over: { hertz?: number; slow?: boolean } = {}) {
  const motion = new Motion(n, {
    g: DOWN,
    shake: { hertz: over.hertz ?? 0, degrees: 0 },
    slow: over.slow ?? false,
  });
  start(motion, raised(n));
  return motion;
}

/** Whether two arrays hold the same numbers, bit for bit. */
function same(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/** How many pieces a frame of `asked` s of the piece's time goes in (decision 21). */
function piecesFor(asked: number): number {
  return Math.min(
    MOST_PIECES,
    Math.max(FEWEST_PIECES, Math.ceil(asked * PIECE_RATE)),
  );
}

describe("a frame of the chain's motion (decision 80)", () => {
  it("goes in pieces of the frame, 480 to the simulated second, from 4 to 16, each stepped as the stepper steps it, bit for bit (decision 21)", () => {
    expect(PIECE_RATE).toBe(480);
    expect(piecesFor(FRAME * SPEED)).toBe(7);
    expect(piecesFor(FRAME * 0.1)).toBe(4);
    expect(piecesFor(FRAME * 4)).toBe(16);
    for (const n of [1, 2, 3, 8, 64]) {
      const motion = motionOf(n);
      const chain = Chain.uniform(n);
      const stepper = new Stepper(chain);
      const state = raised(n);
      for (let f = 0; f < 120; f++) {
        const moved = motion.advance(frame());
        const asked = FRAME * SPEED;
        const pieces = piecesFor(asked);
        let simulated = 0;
        for (let piece = 0; piece < pieces; piece++) {
          const step = stepper.advance(state, asked / pieces, DOWN, {
            into: simulated,
          });
          simulated += step.simulated;
          expect(moved.times[piece]).toBe(step.simulated);
        }
        expect(moved.pieces).toBe(pieces);
        expect(moved.asked).toBe(asked);
        expect(moved.simulated).toBe(simulated);
      }
      expect(same(motion.state.theta, state.theta)).toBe(true);
      expect(same(motion.state.omega, state.omega)).toBe(true);
    }
  });

  it("records where every mass is at each piece's end, x then y, and the pivot there, still without music", () => {
    const n = 3;
    const motion = motionOf(n);
    const chain = Chain.uniform(n);
    const stepper = new Stepper(chain);
    const state = raised(n);
    const moved = motion.advance(frame());
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    let simulated = 0;
    for (let piece = 0; piece < moved.pieces; piece++) {
      simulated += stepper.advance(state, moved.asked / moved.pieces, DOWN, {
        into: simulated,
      }).simulated;
      chain.positions(state.theta, x, y);
      for (let i = 0; i < n; i++) {
        expect(moved.positions[piece * 2 * n + 2 * i]).toBe(x[i]);
        expect(moved.positions[piece * 2 * n + 2 * i + 1]).toBe(y[i]);
      }
      expect(moved.pivots[2 * piece]).toBe(0);
      expect(moved.pivots[2 * piece + 1]).toBe(0);
    }
  });

  it("asked for the speeds, records each mass's velocity at the frame's start and at each piece's end, how fast its place changes (decision 68)", () => {
    const n = 4;
    const motion = motionOf(n);
    motion.advance(frame());
    const before = motion.state;
    const expected = velocities(motion.chain, before);
    const moved = motion.advance(frame({ speeds: true }));
    expect(same(moved.startVelocities.subarray(0, 2 * n), expected)).toBe(true);
    const last = (moved.pieces - 1) * 2 * n;
    expect(
      same(
        moved.velocities.subarray(last, last + 2 * n),
        velocities(motion.chain, motion.state),
      ),
    ).toBe(true);
  });

  it("gives the time of the frame: the real time it spans, where it starts against the moment the music was heard, and the piece's time it began at", () => {
    const motion = motionOf(2);
    const now = motion.advance(frame());
    expect(now.real).toBe(FRAME);
    expect(now.from).toBe(-FRAME);
    expect(now.start).toBe(0);
    const ahead = motion.advance(frame({ ahead: true }));
    expect(ahead.from).toBe(0);
    expect(ahead.start).toBe(now.simulated);
    expect(motion.time).toBe(now.simulated + ahead.simulated);
  });

  it("stops short where the clock passes the deadline, and the frame is slow motion (decision 15)", () => {
    // the stepper reads the clock every eight substeps: a frame of a second
    // of the piece's time takes more than that in its first piece
    const motion = motionOf(2);
    const moved = motion.advance(
      frame({ real: 0.25, speed: 4, deadline: performance.now() - 1 }),
    );
    expect(moved.simulated).toBeLessThan(moved.asked);
    expect(moved.pieces).toBeLessThan(piecesFor(moved.asked));
  });

  it("says when the motion has broken down, so that the chain starts again", () => {
    const motion = motionOf(2);
    const state = raised(2);
    state.omega[0] = Number.NaN;
    start(motion, state);
    expect(motion.advance(frame()).broke).toBe(true);
    start(motion, raised(2));
    expect(motion.advance(frame()).broke).toBe(false);
  });
});

describe("the visitor's hand in the motion (decisions 18 and 75)", () => {
  it("grabs the mass nearest the point, with the grip asked for, at rest there, and lets go", () => {
    const n = 3;
    const motion = motionOf(n);
    expect(motion.held).toBe(false);
    const chain = Chain.uniform(n);
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    chain.positions(motion.state.theta, x, y);
    motion.apply({ kind: "grab", x: x[1] ?? 0, y: y[1] ?? 0, grip: 20 });
    expect(motion.held).toBe(true);
    const hand = motion.hand;
    const grip = createHand(chain, 1, 20, handDamping(20));
    expect(hand?.index).toBe(1);
    expect(hand?.stiffness).toBe(grip.stiffness);
    expect(hand?.damping).toBe(grip.damping);
    expect(hand?.x).toBe(x[1]);
    expect(hand?.vx).toBe(0);
    motion.apply({ kind: "let go" });
    expect(motion.held).toBe(false);
  });

  it("follows the pointer through the frame, as the stepper holds it, and takes a new grip where it is", () => {
    const n = 2;
    const motion = motionOf(n);
    const chain = Chain.uniform(n);
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    chain.positions(motion.state.theta, x, y);
    motion.apply({ kind: "grab", x: x[1] ?? 0, y: y[1] ?? 0, grip: 4 });
    const pointer = { x: 0.3, y: -0.6, vx: 0.4, vy: 0 };
    const moved = motion.advance(frame({ pointer }));
    const stepper = new Stepper(chain);
    const state = raised(n);
    const hand = createHand(chain, 1, 4, handDamping(4));
    Object.assign(hand, pointer);
    let simulated = 0;
    for (let piece = 0; piece < moved.pieces; piece++) {
      simulated += stepper.advance(state, moved.asked / moved.pieces, DOWN, {
        hand,
        into: simulated,
      }).simulated;
    }
    expect(same(motion.state.theta, state.theta)).toBe(true);
    motion.apply({ kind: "grip", grip: 12 });
    expect(motion.hand?.stiffness).toBe(
      createHand(chain, 1, 12, handDamping(12)).stiffness,
    );
    expect(motion.hand?.x).toBe(0.3);
  });

  it("holds in the pivot's frame, where the music's kicks have taken it", () => {
    const motion = motionOf(2);
    motion.advance(
      frame({ heard: heard({ kick: 1 }), force: SPEAKER, ahead: true }),
    );
    const pivot = { ...motion.pivot };
    expect(pivot.x).not.toBe(0);
    motion.apply({ kind: "grab", x: 0.5, y: -0.5, grip: 12 });
    expect(motion.hand?.x).toBe(0.5 - pivot.x);
    motion.advance(frame({ pointer: { x: 0.6, y: -0.5, vx: 1, vy: 0 } }));
    // the hand was moved to the pointer as the frame began, from where the
    // pivot was then
    expect(motion.hand?.x).toBe(0.6 - pivot.x);
    expect(motion.hand?.vx).toBe(1 - pivot.vx);
  });
});

describe("the music in the motion (decisions 74 and 75)", () => {
  it("puts the forces of the music's mode into the frame, heard from the frame's start when run ahead, or ending at the moment heard when run now", () => {
    for (const ahead of [true, false]) {
      const motion = motionOf(2);
      const forces = new MusicForces();
      const said = heard({ kick: 1 });
      const moved = motion.advance(
        frame({ heard: said, force: SPEAKER, ahead }),
      );
      const asked = FRAME * SPEED;
      const drive = forces.frame({
        heard: said,
        force: SPEAKER,
        strength: 3,
        real: FRAME,
        span: asked,
        speed: SPEED,
        chain: Chain.uniform(2),
        state: raised(2),
        g: DOWN,
        held: false,
        from: ahead ? 0 : -FRAME,
      });
      expect(moved.drive).toEqual(drive);
      expect(motion.drive).toBe(moved.drive);
      expect(motion.kicking).toBe(true);
    }
  });

  it("hangs the chain from the pivot where the kicks have taken it, at each piece's end and as the frame ends", () => {
    const n = 2;
    const motion = motionOf(n);
    const moved = motion.advance(
      frame({ heard: heard({ kick: 1 }), force: SPEAKER, ahead: true }),
    );
    const drive = moved.drive;
    if (drive === null) throw new Error("the speaker put nothing in");
    const chain = Chain.uniform(n);
    const stepper = new Stepper(chain);
    const state = raised(n);
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const pivot: PivotMotion = { x: 0, y: 0, vx: 0, vy: 0 };
    let simulated = 0;
    for (let piece = 0; piece < moved.pieces; piece++) {
      simulated += stepper.advance(state, moved.asked / moved.pieces, DOWN, {
        drive,
        into: simulated,
      }).simulated;
      pivotAt(drive, simulated, pivot);
      chain.positions(state.theta, x, y);
      expect(moved.pivots[2 * piece]).toBe(pivot.x);
      expect(moved.pivots[2 * piece + 1]).toBe(pivot.y);
      expect(moved.positions[piece * 2 * n]).toBe((x[0] ?? 0) + pivot.x);
      expect(moved.positions[piece * 2 * n + 1]).toBe((y[0] ?? 0) + pivot.y);
    }
    expect(motion.pivot).toEqual(pivot);
    const hung = { x: new Float64Array(n), y: new Float64Array(n) };
    motion.positions(hung.x, hung.y);
    expect(hung.x[1]).toBe((x[1] ?? 0) + pivot.x);
    // and where it was at any instant of the frame, for the twins
    const then: PivotMotion = { x: 0, y: 0, vx: 0, vy: 0 };
    motion.pivotAt(simulated / 2, then);
    pivotAt(drive, simulated / 2, pivot);
    expect(then).toEqual(pivot);
  });

  it("gives the music's hand where it holds the tip as the frame ends, and none without one", () => {
    const motion = motionOf(2);
    motion.advance(
      frame({
        heard: heard({ kick: 1 }),
        force: { kind: "dance", depth: 0.7 },
      }),
    );
    expect(motion.musicHand?.index).toBe(1);
    motion.advance(frame());
    expect(motion.musicHand).toBeNull();
  });
});

describe("the shaken pivot in the motion (decision 36)", () => {
  it("steps each piece shaken from where the shake stands, its phase going on with the time simulated", () => {
    const n = 2;
    const hertz = 40;
    const motion = motionOf(n, { hertz });
    const chain = Chain.uniform(n);
    const stepper = new Stepper(chain);
    const state = raised(n);
    let phase = 0;
    for (let f = 0; f < 30; f++) {
      const moved = motion.advance(frame());
      expect(moved.phase).toBe(phase);
      let simulated = 0;
      for (let piece = 0; piece < moved.pieces; piece++) {
        const shake = shakeOf(hertz, 0, phase);
        const step = stepper.advance(state, moved.asked / moved.pieces, DOWN, {
          shake,
          into: simulated,
        });
        simulated += step.simulated;
        phase = (phase + (shake?.rate ?? 0) * step.simulated) % (2 * Math.PI);
      }
    }
    expect(motion.shakePhase).toBe(phase);
    expect(same(motion.state.theta, state.theta)).toBe(true);
    expect(motion.shakeAt(0.5)).toEqual(shakeOf(hertz, 0, 0.5));
  });

  it("gives the twins the shake over each of their pieces, from where it stood as the frame began", () => {
    const motion = motionOf(2, { hertz: 40 });
    const shakes = motion.twinShakes(0.3, 0.01, 4);
    expect(shakes).toHaveLength(4);
    for (let piece = 0; piece < 4; piece++) {
      expect(shakes[piece]).toEqual(
        shakeOf(40, 0, 0.3 + (2 * Math.PI * 40 * piece * 0.01) / 4),
      );
    }
    motion.apply({ kind: "shake", hertz: 0, degrees: 0 });
    expect(motion.twinShakes(0.3, 0.01, 2)).toEqual([null, null]);
  });
});

describe("the tension in the motion (decision 35)", () => {
  it("sums each rod's tension over the frame's pieces, each weighted by the time it took, where the tension is shown", () => {
    const n = 3;
    const motion = motionOf(n);
    const chain = Chain.uniform(n);
    const stepper = new Stepper(chain);
    const state = raised(n);
    const piece = new Float64Array(n);
    const sum = new Float64Array(n);
    const moved = motion.advance(frame({ tension: true }));
    let simulated = 0;
    for (let k = 0; k < moved.pieces; k++) {
      const step = stepper.advance(state, moved.asked / moved.pieces, DOWN, {
        meanTension: piece,
        periodTension: new PeriodTension(n),
        into: simulated,
      });
      simulated += step.simulated;
      for (let i = 0; i < n; i++) {
        sum[i] = (sum[i] ?? 0) + step.simulated * (piece[i] ?? 0);
      }
    }
    expect(same(motion.frameTension, sum)).toBe(true);
  });
});

describe("what changes the motion (decision 81)", () => {
  it("starts again from a state given, copied, letting the hands go, its meter afresh, and its shake's phase where given", () => {
    const motion = motionOf(2, { hertz: 40 });
    motion.advance(frame());
    const phase = motion.shakePhase;
    motion.apply({ kind: "grab", x: 0.3, y: -0.3, grip: 12 });
    const state = raised(2);
    state.theta[0] = 1;
    start(motion, state);
    expect(motion.held).toBe(false);
    expect(motion.state.theta[0]).toBe(1);
    expect(motion.state.theta).not.toBe(state.theta);
    expect(motion.shakePhase).toBe(phase);
    start(motion, raised(2), 0.25);
    expect(motion.shakePhase).toBe(0.25);
  });

  it("goes on in another number of masses, the hand keeping the same place along the chain, and its grip", () => {
    const motion = motionOf(4);
    motion.advance(frame());
    const before = motion.state;
    const expected = resample(Chain.uniform(4), before, 8);
    const x = new Float64Array(4);
    const y = new Float64Array(4);
    motion.chain.positions(motion.state.theta, x, y);
    motion.apply({ kind: "grab", x: x[1] ?? 0, y: y[1] ?? 0, grip: 4 });
    motion.apply({ kind: "masses", n: 8 });
    expect(motion.chain.n).toBe(8);
    expect(same(motion.state.theta, expected.state.theta)).toBe(true);
    // the second of four masses, half way down, is the fourth of eight
    expect(motion.hand?.index).toBe(3);
    expect(motion.hand?.stiffness).toBe(
      createHand(motion.chain, 3, 4, handDamping(4)).stiffness,
    );
    expect(motion.frameTension).toHaveLength(8);
    const moved = motion.advance(frame({ speeds: true }));
    expect(moved.positions.length).toBeGreaterThanOrEqual(MOST_PIECES * 2 * 8);
  });

  it("runs backwards: every velocity reversed, the shake's phase turned over, and the chain the screen shows too (decision 28)", () => {
    const motion = motionOf(2, { hertz: 40 });
    motion.advance(frame());
    const before = {
      omega: Float64Array.from(motion.state.omega),
      phase: motion.shakePhase,
    };
    // run ahead, the frame keeps the chain the screen shows until then
    // (decision 51)
    motion.advance(frame({ ahead: true }));
    expect(same(motion.shown.omega, before.omega)).toBe(true);
    expect(motion.shown.phase).toBe(before.phase);
    const omega = Float64Array.from(motion.state.omega);
    const phase = motion.shakePhase;
    motion.apply({ kind: "reverse" });
    expect(
      same(
        motion.state.omega,
        omega.map((w) => -w),
      ),
    ).toBe(true);
    expect(motion.shakePhase).toBe(-phase);
    expect(
      same(
        motion.shown.omega,
        before.omega.map((w) => -w),
      ),
    ).toBe(true);
    expect(motion.shown.phase).toBe(-before.phase);
  });

  it("falls another way, or harder, from where it is", () => {
    const motion = motionOf(2);
    const g = gravityOf(24.79, 30);
    motion.apply({ kind: "gravity", g });
    expect(motion.g).toBe(g);
  });

  it("takes a setting to a value: the same event twice leaves the motion as once", () => {
    const once = motionOf(3, { hertz: 40 });
    const twice = motionOf(3, { hertz: 40 });
    for (const motion of [once, twice]) motion.advance(frame());
    const settings = [
      { kind: "masses", n: 8 },
      { kind: "gravity", g: gravityOf(3.7, -20) },
      { kind: "shake", hertz: 20, degrees: -20 },
    ] as const;
    for (const event of settings) {
      once.apply(event);
      twice.apply(event);
      twice.apply(event);
    }
    for (let f = 0; f < 30; f++) {
      once.advance(frame());
      twice.advance(frame());
    }
    expect(same(once.state.theta, twice.state.theta)).toBe(true);
    expect(once.shakePhase).toBe(twice.shakePhase);
  });

  it("notes every event in its diary, with the frames run, the piece's time and the clock's, the latest 1 024", () => {
    const motion = motionOf(2);
    const opening = motion.diary.length;
    motion.advance(frame());
    motion.advance(frame());
    motion.apply({ kind: "reverse" });
    const noted = motion.diary.at(-1);
    expect(motion.diary).toHaveLength(opening + 1);
    expect(noted?.event).toEqual({ kind: "reverse" });
    expect(noted?.frame).toBe(2);
    expect(noted?.time).toBe(motion.time);
    expect(noted?.clock).toBe(2 * FRAME);
    expect(DIARY_MOST).toBe(1024);
    for (let k = 0; k < DIARY_MOST + 10; k++) {
      motion.apply({ kind: "measure afresh" });
    }
    expect(motion.diary).toHaveLength(DIARY_MOST);
  });
});

describe("the motion's snapshot (decision 81)", () => {
  it("holds the whole motion, copied, which a motion given it goes on from as the one it was taken from, bit for bit", () => {
    const motion = motionOf(3, { hertz: 25 });
    for (let f = 0; f < 40; f++) motion.advance(frame());
    const x = new Float64Array(3);
    const y = new Float64Array(3);
    motion.positions(x, y);
    motion.apply({ kind: "grab", x: x[2] ?? 0, y: y[2] ?? 0, grip: 12 });
    motion.apply({ kind: "gravity", g: gravityOf(9.81, 15) });
    const pointer = { x: 0.2, y: -0.4, vx: 0.3, vy: 0 };
    motion.advance(frame({ pointer, ahead: true }));
    const shot = motion.snapshot();
    expect(shot.theta).not.toBe(motion.state.theta);
    expect(shot.hand?.grip).toBe(12);
    // a motion of another number of masses, under other gravity
    const copy = new Motion(8, {
      g: DOWN,
      shake: { hertz: 0, degrees: 0 },
      slow: false,
    });
    copy.restore(shot);
    expect(copy.chain.n).toBe(3);
    expect(copy.snapshot()).toEqual(shot);
    for (let f = 0; f < 120; f++) {
      const asked = frame({ pointer, tension: true, ahead: f % 2 === 0 });
      if (f === 60) {
        for (const m of [motion, copy]) m.apply({ kind: "let go" });
      }
      motion.advance(asked);
      copy.advance(asked);
    }
    expect(same(copy.state.theta, motion.state.theta)).toBe(true);
    expect(same(copy.state.omega, motion.state.omega)).toBe(true);
    expect(copy.shakePhase).toBe(motion.shakePhase);
    expect(same(copy.frameTension, motion.frameTension)).toBe(true);
    expect(copy.time).toBe(motion.time);
    expect(copy.frames).toBe(motion.frames);
  });

  it("gives the music's forces back afresh, without the kicks they had", () => {
    const motion = motionOf(2);
    motion.advance(frame({ heard: heard({ kick: 1 }), force: SPEAKER }));
    expect(motion.kicking).toBe(true);
    const shot = motion.snapshot();
    const copy = motionOf(2);
    copy.restore(shot);
    expect(copy.kicking).toBe(false);
    expect(copy.drive).toBeNull();
    expect(copy.pivot).toEqual(motion.pivot);
  });
});

/** Each mass's velocity, x then y, as the page's trails take it. */
function velocities(chain: Chain, state: ChainState): Float64Array {
  const out = new Float64Array(2 * chain.n);
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < chain.n; i++) {
    const sweep = (chain.lengths[i] ?? 0) * (state.omega[i] ?? 0);
    vx += sweep * Math.cos(state.theta[i] ?? 0);
    vy += sweep * Math.sin(state.theta[i] ?? 0);
    out[2 * i] = vx;
    out[2 * i + 1] = vy;
  }
  return out;
}
