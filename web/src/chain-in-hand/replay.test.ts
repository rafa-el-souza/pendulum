import { describe, expect, it } from "vitest";

import { BeatClock, beatAt, type BeatAt } from "../audio/beat.ts";
import { demoSample } from "../audio/demo.ts";
import { HEARD, Hearing, type Signals } from "../audio/signals.ts";
import type { Force } from "../core/routes.ts";
import { restingState, type ChainState } from "../physics/step.ts";
import {
  Motion,
  type MotionEvent,
  type MotionFrame,
  type MotionSnapshot,
} from "./motion.ts";
import { BREATH, DANCE, SPEAKER, SWAY, TUNED } from "./music.ts";
import { gravityOf } from "./parameters.ts";

// A session of the chain's motion replayed (docs/decisions.md, decision 81):
// a script of events and frames, with the demo beat heard through the page's
// own hearing and beat clock, run once, and run again from the snapshot taken
// as it began, with the events its diary noted. The motion changes by its
// events and its frames alone, so the two end alike, bit for bit; and the end
// is the one kept below, so that a change to the physics that was not meant
// fails here.

const RATE = 48_000;
const FRAME = 1 / 60;
const SPEED = 0.8;
const FRAMES = 1200;

/** The demo beat, frame by frame, as the page hears it where the browser makes no sound: its signals, and its beat clock's word at the frame's moment. */
function heardBeat(frames: number): Signals[] {
  const hearing = new Hearing(RATE);
  const clock = new BeatClock(RATE);
  const window = new Float32Array(HEARD);
  let fed = 0;
  const heard: Signals[] = [];
  for (let k = 0; k < frames; k++) {
    const t = (k + 1) * FRAME;
    for (let i = 0; i < HEARD; i++) {
      const at = t - (HEARD - 1 - i) / RATE;
      window[i] = at < 0 ? 0 : demoSample(at);
    }
    const end = Math.round(t * RATE);
    clock.hear(window.subarray(HEARD - (end - fed)), t);
    fed = end;
    const now = clock.now;
    const beat: BeatAt | null =
      now === null ? null : { ...beatAt(now, t), at: t };
    heard.push({ ...hearing.hear(window, t), beat });
  }
  return heard;
}

/** A chain of `n` masses raised to one side, as the piece starts it. */
function raised(n: number): ChainState {
  const state = restingState(n);
  for (let i = 0; i < n; i++) {
    state.theta[i] = 2.2 + (0.7 * i) / Math.max(1, n - 1);
  }
  return state;
}

/** The force of the music's mode at frame `k`: none for the first ten seconds, then each of the five for two. */
function forceAt(k: number): Force | undefined {
  const modes = [SPEAKER, DANCE, BREATH, SWAY, TUNED];
  return k < 600 ? undefined : modes[Math.floor((k - 600) / 120)]?.force;
}

/** The events of the script at frame `k`, given where the chain's masses are then. */
function eventsAt(k: number, motion: Motion): MotionEvent[] {
  const x = new Float64Array(motion.chain.n);
  const y = new Float64Array(motion.chain.n);
  motion.positions(x, y);
  const tip = motion.chain.n - 1;
  switch (k) {
    case 60:
      return [{ kind: "masses", n: 3 }];
    case 90:
    case 480:
      return [{ kind: "grab", x: x[tip] ?? 0, y: y[tip] ?? 0, grip: 4 }];
    case 120:
      return [{ kind: "grip", grip: 20 }];
    case 150:
    case 560:
      return [{ kind: "let go" }];
    case 200:
      return [{ kind: "gravity", g: gravityOf(9.81, 20) }];
    case 260:
      return [{ kind: "shake", hertz: 30, degrees: 20 }];
    case 320:
      return [
        { kind: "shake", hertz: 0, degrees: 20 },
        { kind: "measure afresh" },
      ];
    case 380:
    case 440:
      return [{ kind: "reverse" }];
    case 700:
      return [{ kind: "masses", n: 2 }];
    default:
      return [];
  }
}

/** The frame the script asks for at frame `k`: run ahead in turns of half a second, the pointer moving while the hand holds, the tension taken for a while. */
function frameAt(k: number, heard: readonly Signals[]): MotionFrame {
  return {
    real: FRAME,
    speed: SPEED,
    deadline: Number.POSITIVE_INFINITY,
    heard: k < 600 ? null : (heard[k] ?? null),
    force: forceAt(k),
    strength: 3,
    pointer: { x: 0.3 + 0.002 * (k % 90), y: -0.5, vx: 0.12, vy: 0 },
    tension: k >= 300 && k < 400,
    speeds: true,
    ahead: Math.floor(k / 30) % 2 === 1,
  };
}

/** Runs the script on a motion of two masses: its snapshot as it began, how many events its diary held then, and its snapshot at the end. */
function live(heard: readonly Signals[]): {
  motion: Motion;
  first: MotionSnapshot;
  noted: number;
  end: MotionSnapshot;
} {
  const motion = new Motion(2, {
    g: gravityOf(9.81, 0),
    shake: { hertz: 0, degrees: 0 },
    slow: false,
  });
  const { theta, omega } = raised(2);
  motion.apply({ kind: "start", theta, omega, phase: null });
  const first = motion.snapshot();
  const noted = motion.diary.length;
  for (let k = 0; k < FRAMES; k++) {
    for (const event of eventsAt(k, motion)) motion.apply(event);
    motion.advance(frameAt(k, heard));
  }
  return { motion, first, noted, end: motion.snapshot() };
}

/** Whether two arrays hold the same numbers, bit for bit. */
function same(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

describe("a session of the chain's motion, replayed (decision 81)", () => {
  const heard = heardBeat(FRAMES);

  it("hears the demo beat as the page does: its kicks, and its tempo once the clock is sure", () => {
    const kicks = heard.filter((said) => said.kick > 0).length;
    expect(kicks).toBeGreaterThan(30);
    const late = heard[FRAMES - 1]?.beat;
    expect(late?.bpm).toBeCloseTo(120, 0);
    expect(late?.confidence).toBeGreaterThan(0.8);
  });

  it("ends alike, bit for bit, run again from the snapshot taken as it began with the events its diary noted", () => {
    const { motion, first, noted, end } = live(heard);
    const events = motion.diary.slice(noted);
    expect(events.length).toBe(13);
    // a motion of another number of masses, given the snapshot
    const again = new Motion(5, {
      g: gravityOf(3.7, 0),
      shake: { hertz: 10, degrees: 0 },
      slow: false,
    });
    again.restore(first);
    let next = 0;
    for (let k = 0; k < FRAMES; k++) {
      while (events[next]?.frame === k) {
        const noted = events[next];
        if (noted !== undefined) again.apply(noted.event);
        next++;
      }
      again.advance(frameAt(k, heard));
    }
    const replayed = again.snapshot();
    expect(same(replayed.theta, end.theta)).toBe(true);
    expect(same(replayed.omega, end.omega)).toBe(true);
    expect(replayed.phase).toBe(end.phase);
    expect(replayed.pivot).toEqual(end.pivot);
    expect(replayed.time).toBe(end.time);
    expect(replayed.frames).toBe(end.frames);
  });

  it("ends where it ended when this test was written: a change to the physics that was not meant fails here", () => {
    const { end } = live(heard);
    expect(end.n).toBe(2);
    expect(Array.from(end.theta)).toEqual(ENDED.theta);
    expect(Array.from(end.omega)).toEqual(ENDED.omega);
  });
});

// The script's end, as the code that this test came with left it.
const ENDED = {
  theta: [1.7059524187627002, -0.5355023969375181],
  omega: [-2.882324609897392, 1.7654098939841965],
};
