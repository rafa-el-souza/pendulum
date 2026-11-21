import { describe, expect, it } from "vitest";

import type { BeatAt } from "../audio/beat.ts";
import type { Signals } from "../audio/signals.ts";
import type { Force } from "../core/routes.ts";
import { Chain, createHand, type Gravity } from "../physics/chain.ts";
import {
  handAt,
  pivotAt,
  type Drive,
  type PivotMotion,
} from "../physics/drive.ts";
import { laguerreZero } from "../physics/modes.ts";
import { restingState, Stepper, type ChainState } from "../physics/step.ts";
import { MusicForces, type ForceFrame } from "./forces.ts";
import { BREATH_FLOOR, BREATH_GAIN, SEED_LEAN } from "./forces/breath.ts";
import {
  DRAG_PLAYING,
  DRAG_SILENT,
  KICK_ATTACK,
  KICK_DECAY,
  TAKE_HOLD,
} from "./forces/common.ts";
import { DANCE_OPENS, type Choreography } from "./forces/choreography.ts";
import {
  BASS_TURN,
  CATCH,
  CROSS,
  DANCE_GRIP,
  ENGAGE,
  INWARD,
  LIFT,
  TURN_SLACK,
} from "./forces/dance.ts";
import { FIRST_CROSS, LEAST_CROSS, MOST_CROSS } from "./forces/sway.ts";
import { SLOW_CROSS, WIDEST_SWING } from "./forces/swing.ts";
import { TUNED_DECAY, TUNED_DRAG } from "./forces/tuned.ts";
import { handDamping } from "./parameters.ts";

// The music's forces on the first piece (docs/decisions.md, decisions 75 and
// 77): forces from outside the chain, which the tension route (PH-4) takes as
// it takes the hand and gravity, in the pivot's frame.

const SPEAKER: Force = { kind: "speaker", depth: 0.04 };
const DANCE: Force = { kind: "dance", depth: 0.7 };
const BREATH: Force = { kind: "breath", depth: 1 };
const SWAY: Force = { kind: "sway", depth: (30 * Math.PI) / 180 };
const TUNED: Force = { kind: "tuned", depth: 0.003 };
const DOWN: Gravity = { x: 0, y: -9.81 };
const FRAME = 1 / 60;
const SPEED = 0.8;

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

/** A chain of `n` masses swinging, every rod 0.3 rad from straight down, at rest for an instant. */
function swinging(n: number): ChainState {
  const state = restingState(n);
  state.theta.fill(0.3);
  return state;
}

/** A frame at 60 Hz and ×0.8 of a chain of `n` masses on Earth, swinging, at the middle strength. */
function frame(over: Partial<ForceFrame> & { n?: number } = {}): ForceFrame {
  const { n = 2, ...rest } = over;
  return {
    heard: heard(),
    force: SPEAKER,
    strength: 3,
    real: FRAME,
    span: FRAME * SPEED,
    speed: SPEED,
    chain: Chain.uniform(n),
    state: swinging(n),
    g: DOWN,
    held: false,
    from: 0,
    ...rest,
  };
}

/** Runs frames of the same input, each in full, and gives the last one's command. */
function run(
  forces: MusicForces,
  count: number,
  input: ForceFrame,
): Drive | null {
  let drive: Drive | null = null;
  for (let k = 0; k < count; k++) {
    drive = forces.frame(input);
    forces.ran(input.span);
  }
  return drive;
}

describe("the speaker (decision 75)", () => {
  it("puts nothing into the physics without a source playing, nor in a mode without a force", () => {
    const forces = new MusicForces();
    expect(forces.frame(frame({ heard: null, force: SPEAKER }))).toBeNull();
    expect(
      forces.frame(frame({ heard: heard({ kick: 1 }), force: undefined })),
    ).toBeNull();
  });

  it("takes the pivot aside on a kick, across gravity, 4 cm at the middle strength for a full kick, at the music's pace on the piece's clock", () => {
    const forces = new MusicForces();
    const drive = forces.frame(frame({ heard: heard({ kick: 1 }) }));
    expect(drive?.kicks).toHaveLength(1);
    const [kick] = drive?.kicks ?? [];
    expect(kick?.start).toBe(0);
    expect(kick?.x).toBeCloseTo(0.04, 15);
    expect(kick?.y).toBeCloseTo(0, 15);
    // 15 ms and 100 ms of the clock, on the piece's own at ×0.8
    expect(kick?.attack).toBeCloseTo(KICK_ATTACK * SPEED, 15);
    expect(kick?.decay).toBeCloseTo(KICK_DECAY * SPEED, 15);
    // in slow motion the same kick is shorter on the piece's clock
    const slow = new MusicForces().frame(
      frame({ heard: heard({ kick: 1 }), speed: 0.1, span: FRAME * 0.1 }),
    );
    expect(slow?.kicks[0]?.attack).toBeCloseTo(KICK_ATTACK * 0.1, 15);
  });

  it("kicks as far as the kick is strong and the strength asks, less on longer chains, and across gravity where it is turned", () => {
    const size = (over: Partial<ForceFrame> & { n?: number }) => {
      const drive = new MusicForces().frame(frame(over));
      const kick = drive?.kicks[0];
      return kick === undefined ? 0 : Math.hypot(kick.x, kick.y);
    };
    expect(size({ heard: heard({ kick: 0.5 }) })).toBeCloseTo(0.02, 15);
    expect(size({ heard: heard({ kick: 1 }), strength: 5 })).toBeCloseTo(
      0.09,
      15,
    );
    expect(size({ heard: heard({ kick: 1 }), n: 3 })).toBeCloseTo(0.04, 15);
    expect(size({ heard: heard({ kick: 1 }), n: 12 })).toBeCloseTo(0.02, 15);
    // gravity to the right: the side is up
    const turned = new MusicForces().frame(
      frame({ heard: heard({ kick: 1 }), g: { x: 9.81, y: 0 } }),
    );
    expect(turned?.kicks[0]?.x).toBeCloseTo(0, 15);
    expect(turned?.kicks[0]?.y).toBeCloseTo(0.04, 15);
  });

  it("carries a kick into the next frames, from when it began, until it has faded, and then the pivot is back", () => {
    const forces = new MusicForces();
    forces.frame(frame({ heard: heard({ kick: 1 }) }));
    forces.ran(FRAME * SPEED);
    const next = forces.frame(frame());
    expect(next?.kicks[0]?.start).toBeCloseTo(-FRAME * SPEED, 15);
    forces.ran(FRAME * SPEED);
    // the source stops: the kick goes on, and nothing else does
    const off = run(forces, 60, frame({ heard: null }));
    expect(off?.kicks).toHaveLength(1);
    expect(off?.drag).toEqual([0, 0]);
    expect(forces.kicking).toBe(true);
    const motion: PivotMotion = { x: 0, y: 0, vx: 0, vy: 0 };
    if (off !== null) pivotAt(off, off.span, motion);
    expect(Math.abs(motion.x)).toBeLessThan(0.04 * 1e-3);
    expect(run(forces, 60, frame({ heard: null }))).toBeNull();
    expect(forces.kicking).toBe(false);
  });

  it("drags 0.2 a second while the music plays, 2 in its silence, eased, and nothing without a source", () => {
    const forces = new MusicForces();
    const playing = run(forces, 120, frame());
    expect(playing?.drag[1]).toBeCloseTo(DRAG_PLAYING, 3);
    const silent = run(forces, 240, frame({ heard: heard({ silent: true }) }));
    expect(silent?.drag[1]).toBeCloseTo(DRAG_SILENT, 3);
    // a frame into the silence, part of the way
    const forces2 = new MusicForces();
    run(forces2, 120, frame());
    const first = forces2.frame(frame({ heard: heard({ silent: true }) }));
    expect(first?.drag[0]).toBeCloseTo(DRAG_PLAYING, 3);
    expect(first?.drag[1]).toBeGreaterThan(DRAG_PLAYING);
    expect(first?.drag[1]).toBeLessThan(0.5);
    forces2.ran(FRAME * SPEED);
    // the source stops: the drag goes, within a frame
    expect(forces2.frame(frame({ heard: null }))?.drag[1]).toBe(0);
    forces2.ran(FRAME * SPEED);
    expect(forces2.frame(frame({ heard: null }))).toBeNull();
  });

  it("kicks nothing where reduced motion is asked for", () => {
    const forces = new MusicForces({ slow: true });
    const drive = forces.frame(frame({ heard: heard({ kick: 1 }) }));
    expect(drive?.kicks).toEqual([]);
  });
});

/** Where the music's hand's target is at the end of a command, and the hand at that instant. */
function targetOf(drive: Drive | null) {
  const music = drive?.hands[0];
  if (drive === null || music === undefined) return null;
  const hand = {
    index: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    stiffness: 0,
    damping: 0,
    fastest: 0,
  };
  handAt(music, drive, drive.span, hand);
  return hand;
}

describe("the dancing hand (decision 75)", () => {
  it("holds the tip with the hand's grip of 12, its target on the arc the tip reaches, at rest until the first kick", () => {
    const forces = new MusicForces();
    const drive = run(forces, 120, frame({ force: DANCE }));
    const hand = targetOf(drive);
    const chain = Chain.uniform(2);
    const grip = createHand(chain, 1, DANCE_GRIP, handDamping(DANCE_GRIP));
    expect(hand?.index).toBe(1);
    expect(hand?.stiffness).toBeCloseTo(grip.stiffness, 12);
    expect(hand?.damping).toBeCloseTo(grip.damping, 12);
    expect(hand?.fastest).toBe(grip.fastest);
    expect(hand?.x).toBeCloseTo(0, 12);
    expect(hand?.y).toBeCloseTo(-1, 12);
    expect(drive?.kicks).toEqual([]);
    expect(drive?.drag).toEqual([0, 0]);
  });

  it("crosses to the other side on each kick, in 0.12 s, as far as the loudness: 20° at the middle strength for music half as loud as it has been", () => {
    const forces = new MusicForces();
    run(forces, 120, frame({ force: DANCE }));
    const swing = 0.7 * 0.5;
    // a kick: on its way, then there after CROSS
    const first = forces.frame(
      frame({ force: DANCE, heard: heard({ kick: 1 }) }),
    );
    forces.ran(FRAME * SPEED);
    const going = targetOf(first);
    expect(going?.x).toBeGreaterThan(0);
    expect(going?.x).toBeLessThan(Math.sin(swing) / 2);
    const there = targetOf(
      run(forces, Math.ceil(CROSS / FRAME), frame({ force: DANCE })),
    );
    expect(there?.x).toBeCloseTo(Math.sin(swing), 5);
    expect(there?.y).toBeCloseTo(-Math.cos(swing), 5);
    // the next kick: to the other side
    forces.frame(frame({ force: DANCE, heard: heard({ kick: 1 }) }));
    forces.ran(FRAME * SPEED);
    const back = targetOf(
      run(forces, Math.ceil(CROSS / FRAME), frame({ force: DANCE })),
    );
    expect(back?.x).toBeCloseTo(-Math.sin(swing), 5);
    // louder, wider
    const loud = targetOf(
      run(forces, 120, frame({ force: DANCE, heard: heard({ level: 0.9 }) })),
    );
    expect(loud?.x).toBeCloseTo(-Math.sin(0.7 * 0.9), 6);
  });

  it("brings its target back to rest in the music's silence, and drags the chain then as the speaker does, with none while it plays", () => {
    const forces = new MusicForces();
    const playing = run(forces, 120, frame({ force: DANCE }));
    expect(playing?.drag).toEqual([0, 0]);
    forces.frame(frame({ force: DANCE, heard: heard({ kick: 1 }) }));
    forces.ran(FRAME * SPEED);
    const quiet = run(
      forces,
      300,
      frame({ force: DANCE, heard: heard({ silent: true }) }),
    );
    expect(Math.abs(targetOf(quiet)?.x ?? 1)).toBeLessThan(1e-6);
    expect(quiet?.drag[1]).toBeCloseTo(DRAG_SILENT, 3);
  });

  it("moves its target from where the frame before left it, also when that frame was cut short", () => {
    const forces = new MusicForces();
    run(forces, 120, frame({ force: DANCE }));
    const first = forces.frame(
      frame({ force: DANCE, heard: heard({ kick: 1 }) }),
    );
    forces.ran((FRAME * SPEED) / 2);
    const second = forces.frame(frame({ force: DANCE }));
    const [a] = first?.hands ?? [];
    const [b] = second?.hands ?? [];
    if (a === undefined || b === undefined) throw new Error("the hand holds");
    expect(b.from.x).toBeCloseTo((a.from.x + a.to.x) / 2, 15);
    expect(b.from.y).toBeCloseTo((a.from.y + a.to.y) / 2, 15);
  });

  it("lets go while the visitor's hand holds the chain, and takes hold again over a second", () => {
    const forces = new MusicForces();
    run(forces, 120, frame({ force: DANCE }));
    expect(run(forces, 10, frame({ force: DANCE, held: true }))).toBeNull();
    const again = forces.frame(frame({ force: DANCE }));
    forces.ran(FRAME * SPEED);
    const full = createHand(Chain.uniform(2), 1, DANCE_GRIP, 0.6).stiffness;
    expect(again?.hands[0]?.stiffness).toBeCloseTo(
      (full * FRAME) / TAKE_HOLD,
      9,
    );
    const held = run(
      forces,
      Math.ceil(TAKE_HOLD / FRAME),
      frame({ force: DANCE }),
    );
    expect(held?.hands[0]?.stiffness).toBeCloseTo(full, 9);
  });
});

/** A sure beat at 120 a minute, `t` s after a bar began, heard then. */
function beatAtTime(t: number): BeatAt {
  const beats = 2 * t;
  const turn = (x: number) => x - Math.floor(x);
  return {
    bpm: 120,
    phase: turn(beats),
    bar: turn(beats / 4),
    confidence: 1,
    at: t,
  };
}

/**
 * Runs the frames from `first` to `last` of a beat at 120 a minute, each a
 * frame run ahead (its end a frame after the moment heard), under the
 * choreography asked for, and gives the last one's command; on a chain of
 * two masses unless `input` asks for another.
 */
function dance(
  forces: MusicForces,
  first: number,
  last: number,
  choreography: Partial<Choreography>,
  over: Partial<Signals> = {},
  input: Partial<ForceFrame> & { n?: number } = {},
): Drive | null {
  let drive: Drive | null = null;
  for (let k = first; k <= last; k++) {
    drive = forces.frame(
      frame({
        force: DANCE,
        dance: { ...DANCE_OPENS, ...choreography },
        heard: heard({ beat: beatAtTime(k * FRAME), ...over }),
        ...input,
      }),
    );
    forces.ran(FRAME * SPEED);
  }
  return drive;
}

/** Where a point of a figure's plane is, `size` rad wide, on a chain 1 m long held at the tip, hanging below. */
function placedAt(x: number, y: number, size: number, turn = 0) {
  const angle = turn + x * size;
  const radius = 1 - y * INWARD * (size / WIDEST_SWING);
  return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) };
}

describe("the dancing hand's choreography (decision 83)", () => {
  // at the middle strength, for music half as loud as it has been
  const size = 0.7 * 0.5;

  it("led by the clock, it reaches each point of its figure on the beat: the swing, a beat a point, at one side on the bar's first and third beats and at the other on its second and fourth", () => {
    const forces = new MusicForces();
    // the frame that ends on the bar's first beat, at 2 s, then on the next
    const one = targetOf(dance(forces, 0, 119, { lead: "clock" }));
    expect(one?.x).toBeCloseTo(Math.sin(size), 4);
    const two = targetOf(dance(forces, 120, 149, { lead: "clock" }));
    expect(two?.x).toBeCloseTo(-Math.sin(size), 4);
    // in a snap, it waits at a side until the beat comes near
    const between = targetOf(dance(forces, 150, 164, { lead: "clock" }));
    expect(between?.x).toBeCloseTo(-Math.sin(size), 4);
  });

  it("smooth, led by the clock, it moves on without stopping, passing the middle between the beats", () => {
    const forces = new MusicForces();
    dance(forces, 0, 119, { lead: "clock", feel: "smooth" });
    const half = targetOf(
      dance(forces, 120, 134, { lead: "clock", feel: "smooth" }),
    );
    expect(half?.x).toBeCloseTo(0, 4);
    const beat = targetOf(
      dance(forces, 135, 149, { lead: "clock", feel: "smooth" }),
    );
    expect(beat?.x).toBeCloseTo(-Math.sin(size), 4);
  });

  it("as a conductor's beat, it goes through each point faster than between them: round the turn, some seven times as fast; smooth, as fast", () => {
    const step = (feel: Choreography["feel"], from: number, to: number) => {
      const forces = new MusicForces();
      const asked = { lead: "clock", figure: "turn", feel } as const;
      dance(forces, 0, from - 1, asked);
      const a = targetOf(dance(forces, from, from, asked));
      const b = targetOf(dance(forces, from + 1, to, asked));
      return Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0));
    };
    // three frames on from the bar's first beat, and three half a beat on
    const through = step("ictus", 119, 122);
    const between = step("ictus", 134, 137);
    expect(through).toBeGreaterThan(5 * between);
    expect(step("smooth", 119, 122)).toBeCloseTo(step("smooth", 134, 137), 4);
  });

  it("led by the clock, a turn of the conductor's figure takes a bar at a beat a point: down on the first beat, in on the second, out on the third and up on the fourth", () => {
    const forces = new MusicForces();
    dance(forces, 0, 89, { lead: "clock", figure: "conduct" });
    const beats = [
      [0, 0],
      [-0.7, 0.35],
      [1, 0.3],
      [0.1, 1],
    ] as const;
    let last = 119;
    for (const [x, y] of beats) {
      const hand = targetOf(
        dance(forces, last - 29, last, { lead: "clock", figure: "conduct" }),
      );
      const at = placedAt(x, y, size);
      expect(hand?.x, `${String(x)}, ${String(y)}`).toBeCloseTo(at.x, 4);
      expect(hand?.y, `${String(x)}, ${String(y)}`).toBeCloseTo(at.y, 4);
      last += 30;
    }
  });

  it("led by the clock, two beats a point take the swing a side a bar's half; and auto, for two masses at 120 a minute and ×0.8, whose slowest swing lasts some 2.3 s, takes two too", () => {
    for (const beats of [2, "auto"] as const) {
      const forces = new MusicForces();
      const one = targetOf(dance(forces, 0, 239, { lead: "clock", beats }));
      expect(one?.x, String(beats)).toBeCloseTo(Math.sin(size), 4);
      const two = targetOf(dance(forces, 240, 269, { lead: "clock", beats }));
      expect(two?.x, String(beats)).toBeCloseTo(Math.sin(size), 4);
      const three = targetOf(dance(forces, 270, 299, { lead: "clock", beats }));
      expect(three?.x, String(beats)).toBeCloseTo(-Math.sin(size), 4);
    }
  });

  it("led by the clock, it rests in the middle until the clock is sure, and goes back to it when the clock is not", () => {
    const forces = new MusicForces();
    const unsure = { confidence: 0.5 };
    let drive: Drive | null = null;
    for (let k = 0; k < 60; k++) {
      drive = forces.frame(
        frame({
          force: DANCE,
          dance: { ...DANCE_OPENS, lead: "clock" },
          heard: heard({ beat: { ...beatAtTime(k * FRAME), ...unsure } }),
        }),
      );
      forces.ran(FRAME * SPEED);
    }
    expect(targetOf(drive)?.x).toBeCloseTo(0, 9);
    expect(targetOf(dance(forces, 60, 179, { lead: "clock" }))?.x).toBeCloseTo(
      Math.sin(size),
      4,
    );
    for (let k = 180; k < 180 + Math.ceil(ENGAGE / FRAME); k++) {
      drive = forces.frame(
        frame({
          force: DANCE,
          dance: { ...DANCE_OPENS, lead: "clock" },
          heard: heard({ beat: { ...beatAtTime(k * FRAME), ...unsure } }),
        }),
      );
      forces.ran(FRAME * SPEED);
    }
    expect(Math.abs(targetOf(drive)?.x ?? 1)).toBeLessThan(1e-9);
  });

  it("led by the snare, it moves on the snares and not on the kicks; and with two sounds a point, on every second one", () => {
    const forces = new MusicForces();
    const snare = { lead: "snare" } as const;
    dance(forces, 0, 59, snare);
    const kicked = targetOf(dance(forces, 60, 89, snare, { kick: 1 }));
    expect(kicked?.x).toBeCloseTo(0, 9);
    dance(forces, 90, 90, snare, { snare: 1 });
    const moved = targetOf(dance(forces, 91, 120, snare));
    expect(moved?.x).toBeCloseTo(Math.sin(size), 4);

    const every = new MusicForces();
    const second = { lead: "kick", beats: 2 } as const;
    dance(every, 0, 59, second);
    dance(every, 60, 60, second, { kick: 1 });
    expect(targetOf(dance(every, 61, 90, second))?.x).toBeCloseTo(
      Math.sin(size),
      4,
    );
    dance(every, 91, 91, second, { kick: 1 });
    expect(targetOf(dance(every, 92, 121, second))?.x).toBeCloseTo(
      Math.sin(size),
      4,
    );
    dance(every, 122, 122, second, { kick: 1 });
    expect(targetOf(dance(every, 123, 152, second))?.x).toBeCloseTo(
      -Math.sin(size),
      4,
    );
  });

  it("smooth, led by a sound, it takes the time since the sound before to reach the next point", () => {
    const forces = new MusicForces();
    const smooth = { lead: "kick", feel: "smooth" } as const;
    dance(forces, 0, 59, smooth);
    dance(forces, 60, 60, smooth, { kick: 1 });
    // the first from the middle, over half a second
    expect(targetOf(dance(forces, 61, 89, smooth))?.x).toBeCloseTo(
      Math.sin(size),
      4,
    );
    // the next a second later, which it takes a second to cross
    dance(forces, 90, 119, smooth);
    dance(forces, 120, 120, smooth, { kick: 1 });
    const half = targetOf(dance(forces, 121, 149, smooth));
    expect(half?.x).toBeCloseTo(0, 4);
    const there = targetOf(dance(forces, 150, 179, smooth));
    expect(there?.x).toBeCloseTo(-Math.sin(size), 4);
  });

  it("traces its figure held level to a side, or standing above the pivot", () => {
    for (const [place, turn] of [
      ["side", Math.PI / 2],
      ["above", Math.PI],
    ] as const) {
      const forces = new MusicForces();
      const hand = targetOf(dance(forces, 0, 119, { lead: "clock", place }));
      const at = placedAt(1, 0, size, turn);
      expect(hand?.x, place).toBeCloseTo(at.x, 4);
      expect(hand?.y, place).toBeCloseTo(at.y, 4);
    }
  });

  it("goes round the pivot on the turn, a quarter of a turn a point, nearer the pivot the wider it swings", () => {
    const forces = new MusicForces();
    const turn = { lead: "clock", figure: "turn" } as const;
    const radius = 1 - TURN_SLACK * (size / WIDEST_SWING);
    const one = targetOf(dance(forces, 0, 119, turn));
    expect(one?.x).toBeCloseTo(0, 4);
    expect(one?.y).toBeCloseTo(-radius, 4);
    const two = targetOf(dance(forces, 120, 149, turn));
    expect(two?.x).toBeCloseTo(radius, 4);
    expect(two?.y).toBeCloseTo(0, 4);
    const three = targetOf(dance(forces, 150, 179, turn));
    expect(three?.x).toBeCloseTo(0, 4);
    expect(three?.y).toBeCloseTo(radius, 4);
  });
});

/** How far round from straight down, towards the side, the music's hand's target is: the angle of the figure's place, middle and swing together. */
function angleOf(hand: { x: number; y: number } | null): number {
  return Math.atan2(hand?.x ?? 0, -(hand?.y ?? 0));
}

describe("the dancing hand's expression and body (decision 85)", () => {
  // at the middle strength, for music half as loud as it has been
  const size = 0.7 * 0.5;
  const clock = { lead: "clock" } as const;

  it("where its size is fixed, swings as wide as for music as loud as it has been, whatever the loudness, and rests in the music's silence", () => {
    const fixed = { ...clock, size: "fixed" } as const;
    const loud = targetOf(
      dance(new MusicForces(), 0, 119, fixed, { level: 0.9 }),
    );
    expect(loud?.x).toBeCloseTo(Math.sin(size), 4);
    const forces = new MusicForces();
    dance(forces, 0, 119, fixed);
    const quiet = targetOf(dance(forces, 120, 419, fixed, { silent: true }));
    expect(Math.abs(quiet?.x ?? 1)).toBeLessThan(1e-6);
  });

  it("where its size follows the bass, or the treble, swings as wide as they are loud", () => {
    const bass = targetOf(
      dance(
        new MusicForces(),
        0,
        119,
        { ...clock, size: "bass" },
        {
          bass: 0.8,
        },
      ),
    );
    expect(bass?.x).toBeCloseTo(Math.sin(0.7 * 0.8), 4);
    const treble = targetOf(
      dance(
        new MusicForces(),
        0,
        119,
        { ...clock, size: "treble" },
        {
          treble: 0.3,
        },
      ),
    );
    expect(treble?.x).toBeCloseTo(Math.sin(0.7 * 0.3), 4);
  });

  it("where its size follows the kicks, swells on each as far as it is strong and shrinks until the next", () => {
    // eight beats a point: the hand stays at a side for four seconds
    const kick = { ...clock, size: "kick", beats: 8 } as const;
    const swelled = (strength: number) => {
      const forces = new MusicForces();
      const before = targetOf(dance(forces, 0, 119, kick));
      dance(forces, 120, 120, kick, { kick: strength });
      const soon = targetOf(dance(forces, 121, 131, kick));
      const later = targetOf(dance(forces, 132, 180, kick));
      return {
        before: Math.asin(before?.x ?? 1),
        soon: Math.asin(soon?.x ?? 0),
        later: Math.asin(later?.x ?? 1),
      };
    };
    const full = swelled(1);
    expect(full.before).toBe(0);
    // within a fifth of a second, about half the depth; a second after the
    // kick, well under a quarter of that
    expect(full.soon).toBeGreaterThan(0.4 * 0.7);
    expect(full.later).toBeLessThan(full.soon / 4);
    // a kick half as strong swells it half as far
    expect(swelled(0.5).soon / full.soon).toBeCloseTo(0.5, 9);
  });

  it("where its middle follows the bass's note, turns it to the right for a note an octave above those the bass played lately, by about half its depth, and to the left for one below; holds it while the bass rests, and comes back to the middle in silence", () => {
    const bass = { ...clock, center: "bass" } as const;
    const forces = new MusicForces();
    // the bass on E2 for four seconds: the hand at a side on the beat, its
    // middle straight down
    const settled = targetOf(dance(forces, 0, 239, bass, { bassNote: 40 }));
    expect(angleOf(settled)).toBeCloseTo(size, 4);
    // an octave up, for a second: the middle turns right
    const up = angleOf(
      targetOf(dance(forces, 240, 299, bass, { bassNote: 52 })),
    );
    expect(up - size).toBeGreaterThan(0.8 * BASS_TURN * 0.7);
    expect(up - size).toBeLessThan(BASS_TURN * 0.7);
    // the bass rests for a second: the middle stays
    const rest = angleOf(
      targetOf(dance(forces, 300, 359, bass, { bassNote: 0 })),
    );
    expect(Math.abs(rest - up)).toBeLessThan(0.02);
    // two octaves down, for a second: the middle turns left, as far as an octave takes it
    const down = angleOf(
      targetOf(dance(forces, 360, 419, bass, { bassNote: 28 })),
    );
    expect(down - size).toBeLessThan(-0.8 * BASS_TURN * 0.7);
    expect(down - size).toBeGreaterThan(-BASS_TURN * 0.7 - 1e-9);
    // in silence, back to the middle, and at rest
    const quiet = targetOf(
      dance(forces, 420, 659, bass, { bassNote: 0, silent: true }),
    );
    expect(Math.abs(quiet?.x ?? 1)).toBeLessThan(1e-3);
  });

  it("where its middle follows the loudness, lifts it towards the side, a quarter of a turn for music twice as loud as it has been, and lets it hang again in silence; standing, it lifts it no further", () => {
    const lift = { ...clock, center: "level" } as const;
    const forces = new MusicForces();
    const loud = targetOf(dance(forces, 0, 239, lift, { level: 1 }));
    expect(angleOf(loud)).toBeCloseTo(LIFT + 0.7, 2);
    const half = targetOf(dance(forces, 240, 479, lift));
    expect(angleOf(half)).toBeCloseTo(LIFT / 2 + size, 3);
    const quiet = targetOf(dance(forces, 480, 719, lift, { silent: true }));
    expect(Math.abs(quiet?.x ?? 1)).toBeLessThan(1e-3);
    // held level to a side, it lifts it to standing, and no further
    const side = targetOf(
      dance(
        new MusicForces(),
        0,
        239,
        { ...lift, place: "side" },
        {
          level: 1,
        },
      ),
    );
    expect(angleOf(side)).toBeCloseTo(-(Math.PI - 0.7), 2);
    const above = targetOf(
      dance(
        new MusicForces(),
        0,
        239,
        { ...lift, place: "above" },
        {
          level: 1,
        },
      ),
    );
    expect(angleOf(above)).toBeCloseTo(-(Math.PI - 0.7), 3);
  });

  it("pulsing on the beat, grips as firmly as its step on each beat and lets go halfway between, once the clock is sure; and grips throughout while it is not, or where reduced motion is asked for", () => {
    const full = createHand(
      Chain.uniform(2),
      1,
      DANCE_GRIP,
      handDamping(DANCE_GRIP),
    );
    const pulse = { ...clock, pulse: "beat" } as const;
    const forces = new MusicForces();
    // the frame that ends on the bar's first beat, at 2 s
    const on = targetOf(dance(forces, 0, 119, pulse));
    expect(on?.stiffness).toBeCloseTo(full.stiffness, 6);
    expect(on?.damping).toBeCloseTo(full.damping, 6);
    // a sixth of a beat on, three quarters as firm
    const after = targetOf(dance(forces, 120, 124, pulse));
    expect(after?.stiffness).toBeCloseTo((3 * full.stiffness) / 4, 6);
    // half a beat on, not at all
    const between = targetOf(dance(forces, 125, 134, pulse));
    expect(between?.stiffness).toBeCloseTo(0, 6);
    // led by a sound, it pulses on the clock's beats all the same
    const kicked = targetOf(
      dance(new MusicForces(), 0, 134, { pulse: "beat" }),
    );
    expect(kicked?.stiffness).toBeCloseTo(0, 6);
    // where reduced motion is asked for, firm throughout
    const slow = targetOf(
      dance(new MusicForces({ slow: true }), 0, 134, pulse),
    );
    expect(slow?.stiffness).toBeCloseTo(full.stiffness, 9);
    // while the clock is not sure, firm throughout
    const unsure = new MusicForces();
    let drive: Drive | null = null;
    for (let k = 0; k <= 134; k++) {
      drive = unsure.frame(
        frame({
          force: DANCE,
          dance: { ...DANCE_OPENS, ...pulse },
          heard: heard({
            beat: { ...beatAtTime(k * FRAME), confidence: 0.5 },
          }),
        }),
      );
      unsure.ran(FRAME * SPEED);
    }
    expect(targetOf(drive)?.stiffness).toBeCloseTo(full.stiffness, 9);
  });

  it("holds the mass halfway down, or a quarter of the way down, with the same grip, its figure on the arc that mass reaches", () => {
    const chain = Chain.uniform(8);
    for (const [grab, index, reach] of [
      ["middle", 3, 0.5],
      ["top", 1, 0.25],
    ] as const) {
      const hand = targetOf(
        dance(new MusicForces(), 0, 119, { ...clock, grab }, {}, { n: 8 }),
      );
      const grip = createHand(
        chain,
        index,
        DANCE_GRIP,
        handDamping(DANCE_GRIP),
      );
      expect(hand?.index, grab).toBe(index);
      expect(hand?.stiffness, grab).toBeCloseTo(grip.stiffness, 9);
      expect(hand?.damping, grab).toBeCloseTo(grip.damping, 9);
      expect(hand?.fastest, grab).toBe(grip.fastest);
      expect(hand?.x, grab).toBeCloseTo(reach * Math.sin(size), 4);
      expect(hand?.y, grab).toBeCloseTo(-reach * Math.cos(size), 4);
    }
  });

  it("grips from gentle to forced at its five steps, damped as the visitor's hand is at each of its own, and critically at 120", () => {
    const chain = Chain.uniform(2);
    for (const [grip, rate, ratio] of [
      [1, 4, 0.3],
      [2, 7, 0.45],
      [3, 12, 0.6],
      [4, 40, 1],
      [5, 120, 1],
    ] as const) {
      const hand = targetOf(
        dance(new MusicForces(), 0, 119, { ...clock, grip }),
      );
      const held = createHand(chain, 1, rate, ratio);
      expect(hand?.stiffness, String(rate)).toBeCloseTo(held.stiffness, 6);
      expect(hand?.damping, String(rate)).toBeCloseTo(held.damping, 9);
      expect(hand?.fastest, String(rate)).toBe(held.fastest);
    }
  });

  it("with slack, keeps its target nearer the pivot, by a tenth of the reach a step", () => {
    for (const slack of [1, 2, 3, 4]) {
      const hand = targetOf(
        dance(new MusicForces(), 0, 119, { ...clock, slack }),
      );
      const radius = 1 - 0.1 * slack;
      expect(hand?.x, String(slack)).toBeCloseTo(radius * Math.sin(size), 4);
      expect(hand?.y, String(slack)).toBeCloseTo(-radius * Math.cos(size), 4);
    }
  });

  it("asked to hold another mass, lets go and takes hold of it again over a second", () => {
    const forces = new MusicForces();
    dance(forces, 0, 119, clock, {}, { n: 8 });
    const again = targetOf(
      dance(forces, 120, 120, { ...clock, grab: "middle" }, {}, { n: 8 }),
    );
    const full = createHand(Chain.uniform(8), 3, DANCE_GRIP, 0.6).stiffness;
    expect(again?.index).toBe(3);
    expect(again?.stiffness).toBeCloseTo((full * FRAME) / TAKE_HOLD, 6);
  });
});

describe("the dancing hand's long time (decision 87)", () => {
  // at the middle strength, for music half as loud as it has been
  const size = 0.7 * 0.5;
  const clock = { lead: "clock" } as const;
  // the tip of two masses swinging, every rod 0.3 rad from straight down
  const tip = { x: Math.sin(0.3), y: -Math.cos(0.3) };

  it("tossing every bar, lets go on the bar's first beat, led by the clock or by a sound, and takes hold again on its third of the mass where it is, gripping over a tenth of a second and bringing it back to its figure over a beat", () => {
    for (const lead of ["clock", "kick"] as const) {
      const forces = new MusicForces();
      const asked = { lead, toss: 1 } as const;
      expect(targetOf(dance(forces, 0, 118, asked)), lead).not.toBeNull();
      // the frame that ends on the bar's first beat, and those until its third
      expect(dance(forces, 119, 119, asked)?.hands ?? [], lead).toEqual([]);
      expect(dance(forces, 120, 178, asked)?.hands ?? [], lead).toEqual([]);
      const caught = dance(forces, 179, 179, asked);
      const hand = caught?.hands[0];
      expect(hand?.from.x, lead).toBeCloseTo(tip.x, 9);
      expect(hand?.from.y, lead).toBeCloseTo(tip.y, 9);
      const full = createHand(Chain.uniform(2), 1, DANCE_GRIP, 0.6).stiffness;
      expect(hand?.stiffness, lead).toBeCloseTo((full * FRAME) / CATCH, 6);
      expect(targetOf(dance(forces, 180, 184, asked))?.stiffness).toBeCloseTo(
        full,
        6,
      );
    }
    // led by the clock, a beat on, the hand is back on its figure: the swing,
    // at the other side on the bar's fourth beat
    const forces = new MusicForces();
    const asked = { ...clock, toss: 1 } as const;
    dance(forces, 0, 178, asked);
    const back = targetOf(dance(forces, 179, 209, asked));
    expect(back?.x).toBeCloseTo(-Math.sin(size), 4);
    expect(back?.y).toBeCloseTo(-Math.cos(size), 4);
  });

  it("tossing every second or fourth bar, lets go on the first beat of those bars alone", () => {
    const tossed = (toss: 2 | 4, bar: number) => {
      const forces = new MusicForces();
      const asked = { ...clock, toss } as const;
      dance(forces, 0, 120 * bar - 2, asked);
      return (dance(forces, 120 * bar - 1, 120 * bar - 1, asked)?.hands ?? [])
        .length;
    };
    expect(tossed(2, 1)).toBe(1);
    expect(tossed(2, 2)).toBe(0);
    expect(tossed(2, 3)).toBe(1);
    expect(tossed(4, 2)).toBe(1);
    expect(tossed(4, 4)).toBe(0);
  });

  it("lets go only while the clock is sure, and takes hold again as soon as it is not, or the music falls silent", () => {
    const unsure = { ...beatAtTime(0), confidence: 0.5 };
    const forces = new MusicForces();
    const asked = { ...clock, toss: 1 } as const;
    // never let go while the clock is not sure
    for (let k = 0; k <= 130; k++) {
      const drive = forces.frame(
        frame({
          force: DANCE,
          dance: { ...DANCE_OPENS, ...asked },
          heard: heard({ beat: { ...beatAtTime(k * FRAME), confidence: 0.5 } }),
        }),
      );
      forces.ran(FRAME * SPEED);
      expect(drive?.hands.length, String(k)).toBe(1);
    }
    for (const over of [{ beat: unsure }, { silent: true }]) {
      const again = new MusicForces();
      dance(again, 0, 119, asked);
      expect(dance(again, 120, 120, asked)?.hands ?? []).toEqual([]);
      const caught = dance(again, 121, 121, asked, over);
      expect(caught?.hands[0]?.from.x).toBeCloseTo(tip.x, 9);
    }
  });

  it("varying every bar, brings the next figure in on the bar's first beat, gliding from the one before over a beat, through the figures listed and round again", () => {
    const forces = new MusicForces();
    const asked = { ...clock, then: ["bounce"], vary: 1 } as const;
    // the swing, at one side on the bar's first beat, as the bounce comes in
    const one = targetOf(dance(forces, 0, 119, asked));
    expect(one?.x).toBeCloseTo(Math.sin(size), 4);
    // halfway through the glide, halfway from the swing's side to the
    // bounce's full reach, straight across; a beat on, at the bounce's fold
    const half = targetOf(dance(forces, 120, 134, asked));
    const side = placedAt(1, 0, size);
    const reach = placedAt(0, 0, size);
    expect(half?.x).toBeCloseTo((side.x + reach.x) / 2, 4);
    expect(half?.y).toBeCloseTo((side.y + reach.y) / 2, 4);
    const fold = targetOf(dance(forces, 135, 149, asked));
    const folded = placedAt(0, 1, size);
    expect(fold?.x).toBeCloseTo(folded.x, 4);
    expect(fold?.y).toBeCloseTo(folded.y, 4);
    // on the next bar's first beat the swing comes back, a beat on at its
    // other side
    const next = targetOf(dance(forces, 150, 269, asked));
    expect(next?.x).toBeCloseTo(-Math.sin(size), 4);
  });

  it("varying every second bar, keeps each figure two bars; with one figure, varies through all eight in their order", () => {
    const forces = new MusicForces();
    const asked = { ...clock, figure: "bounce", vary: 2 } as const;
    // the bounce through the first two bars: at its fold on a bar's second beat
    const fold = placedAt(0, 1, size);
    expect(targetOf(dance(forces, 0, 149, asked))?.y).toBeCloseTo(fold.y, 4);
    // on the second bar's first beat, the poses come in: a beat on, high on
    // one side
    const pose = targetOf(dance(forces, 150, 269, asked));
    const high = placedAt(-1, 0.6, size);
    expect(pose?.x).toBeCloseTo(high.x, 4);
    expect(pose?.y).toBeCloseTo(high.y, 4);
  });

  it("varying with the loudness, brings in the figure the last bar's loudness picks: the first listed for a quiet bar, the last for a loud one, and keeps it for a bar near the line between them", () => {
    const forces = new MusicForces();
    const asked = { ...clock, then: ["bounce"], vary: "level" } as const;
    const fold = placedAt(0, 1, size * 1.8);
    // a loud bar brings the bounce in, a beat on at its fold
    dance(forces, 0, 119, asked, { level: 0.9 });
    const loud = targetOf(dance(forces, 120, 149, asked, { level: 0.9 }));
    expect(loud?.x).toBeCloseTo(fold.x, 4);
    expect(loud?.y).toBeCloseTo(fold.y, 4);
    // a bar a little quieter than the line keeps it
    dance(forces, 150, 239, asked, { level: 0.52 });
    const kept = targetOf(dance(forces, 240, 269, asked, { level: 0.52 }));
    expect(kept?.x).toBeCloseTo(0, 4);
    // a quiet bar brings the swing back: at its other side a beat on
    dance(forces, 270, 359, asked, { level: 0.2 });
    const quiet = targetOf(dance(forces, 360, 389, asked, { level: 0.2 }));
    expect(quiet?.x).toBeCloseTo(-Math.sin(0.7 * 0.2), 4);
  });

  /** Runs the frames from `first` to `last`, each a frame ahead, of a sure beat at 120 a minute whose record at `t` s `beatOf` gives, and the commands they give. */
  function danceWith(
    forces: MusicForces,
    first: number,
    last: number,
    choreography: Partial<Choreography>,
    beatOf: (t: number) => BeatAt,
  ): (Drive | null)[] {
    const drives: (Drive | null)[] = [];
    for (let k = first; k <= last; k++) {
      drives.push(
        forces.frame(
          frame({
            force: DANCE,
            dance: { ...DANCE_OPENS, ...choreography },
            heard: heard({ beat: beatOf(k * FRAME) }),
          }),
        ),
      );
      forces.ran(FRAME * SPEED);
    }
    return drives;
  }

  it("counts its bars by the beats, keeping the first beat it took while the clock's goes back and forth between the first and the third: it lets go on every bar all the same", () => {
    // the clock names every second beat the bar's first, as it did for the
    // demo beat's first seconds
    const wavering = (t: number): BeatAt => {
      const beats = 2 * t;
      const turn = (x: number) => x - Math.floor(x);
      return {
        bpm: 120,
        phase: turn(beats),
        bar: turn(beats / 2) / 2,
        confidence: 1,
        at: t,
      };
    };
    const forces = new MusicForces();
    const asked = { ...clock, toss: 1 } as const;
    const drives = danceWith(forces, 0, 359, asked, wavering);
    const holds = (k: number) => (drives[k]?.hands ?? []).length;
    // let go on the first beats of the bars at 2 and 4 s, taken again on
    // their third beats, at 3 and 5 s
    for (const one of [119, 239]) {
      expect(holds(one - 1), String(one)).toBe(1);
      expect(holds(one), String(one)).toBe(0);
      expect(holds(one + 59), String(one)).toBe(0);
      expect(holds(one + 60), String(one)).toBe(1);
    }
  });

  it("moves its bar's first beat to the clock's once the clock has held another for two bars, its figure gliding there over a beat", () => {
    // from 4 s on, the clock's bar begins two beats later
    const moved = (t: number): BeatAt => {
      const beats = 2 * t;
      const turn = (x: number) => x - Math.floor(x);
      return {
        bpm: 120,
        phase: turn(beats),
        bar: turn((beats + (t >= 4 ? 2 : 0)) / 4),
        confidence: 1,
        at: t,
      };
    };
    const tossed = new MusicForces();
    const drives = danceWith(tossed, 0, 719, { ...clock, toss: 1 }, moved);
    const holds = (k: number) => (drives[k]?.hands ?? []).length;
    // its own first beats until two bars after 4 s: at 6 s, not at 5 s
    expect(holds(359)).toBe(0);
    expect(holds(299)).toBe(1);
    // then the clock's: at 9 and 11 s, not at 10 s
    expect(holds(539)).toBe(0);
    expect(holds(659)).toBe(0);
    expect(holds(599)).toBe(1);

    // a circle a beat a point, smooth: from the bottom on the bar's first
    // beat, by its own count, it would be at the top at 9 s; by the clock's,
    // it is at the bottom, and it got there without a jump
    const circling = new MusicForces();
    const asked = { ...clock, figure: "circle", feel: "smooth" } as const;
    const path = danceWith(circling, 0, 539, asked, moved).map(targetOf);
    const bottom = placedAt(0, 0, size);
    expect(path[539]?.x).toBeCloseTo(bottom.x, 4);
    expect(path[539]?.y).toBeCloseTo(bottom.y, 4);
    let most = 0;
    for (let k = 241; k <= 539; k++) {
      const a = path[k - 1];
      const b = path[k];
      most = Math.max(
        most,
        Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0)),
      );
    }
    expect(most).toBeLessThan(0.05);
  });

  it("acts on a bar's first beat once, though the clock, drawing its beat to the music's, has it a little earlier the frame after", () => {
    // the frame after the one that crosses the bar's first beat at 2 s hears
    // the beat a hundredth of a beat back, as the clock's hand is drawn back
    // to the comb
    const drawn = (t: number): BeatAt => {
      const back = Math.abs(t - 2) < 1e-9 ? 0.01 : 0;
      const beats = 2 * t - back;
      const turn = (x: number) => x - Math.floor(x);
      return {
        bpm: 120,
        phase: turn(beats),
        bar: turn(beats / 4),
        confidence: 1,
        at: t,
      };
    };
    const forces = new MusicForces();
    const asked = { ...clock, then: ["bounce"], vary: 1 } as const;
    // the bounce came in once: a beat on, at its fold
    const drives = danceWith(forces, 0, 149, asked, drawn);
    const fold = placedAt(0, 1, size);
    expect(targetOf(drives[149] ?? null)?.x).toBeCloseTo(fold.x, 4);
    expect(targetOf(drives[149] ?? null)?.y).toBeCloseTo(fold.y, 4);
  });

  it("led by a sound, varies on the bars the clock counts all the same", () => {
    const forces = new MusicForces();
    const asked = { then: ["bounce"], vary: 1 } as const;
    // led by the kicks, with none heard, the hand rests in the middle while
    // the bounce comes in on the bar's first beat; two kicks on, it is at the
    // bounce's fold, where the swing would have it at a side
    dance(forces, 0, 150, asked);
    dance(forces, 151, 151, asked, { kick: 1 });
    dance(forces, 152, 170, asked);
    dance(forces, 171, 171, asked, { kick: 1 });
    const fold = targetOf(dance(forces, 172, 190, asked));
    const folded = placedAt(0, 1, size);
    expect(fold?.x).toBeCloseTo(folded.x, 4);
    expect(fold?.y).toBeCloseTo(folded.y, 4);
  });
});

/** The energy that lifts a chain of `n` masses, hanging on Earth, level: the breath's unit. */
function lift(n: number): number {
  return 9.81 * Chain.uniform(n).hangingMoment;
}

describe("the breath (decision 77)", () => {
  it("draws the chain's energy to the music's loudness times the energy that lifts it level, at the middle strength, with a gain of 3 a second", () => {
    const forces = new MusicForces();
    const drive = run(forces, 120, frame({ force: BREATH }));
    expect(drive?.heat?.target[0]).toBeCloseTo(0.5 * lift(2), 12);
    expect(drive?.heat?.target[1]).toBeCloseTo(0.5 * lift(2), 12);
    expect(drive?.heat?.gain).toBe(BREATH_GAIN);
    expect(BREATH_GAIN).toBe(3);
    expect(drive?.heat?.floor).toBeCloseTo(BREATH_FLOOR * lift(2), 12);
    // no force of the others: no kicks, hands, drag, nor any lean of
    // gravity on a chain that moves
    expect(drive?.kicks).toEqual([]);
    expect(drive?.hands).toEqual([]);
    expect(drive?.drag).toEqual([0, 0]);
    expect(drive?.tilt).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    // louder, and stronger: the target follows within a frame, from where
    // the frame before left it
    const louder = forces.frame(
      frame({ force: BREATH, heard: heard({ level: 0.9 }) }),
    );
    forces.ran(FRAME * SPEED);
    expect(louder?.heat?.target[0]).toBeCloseTo(0.5 * lift(2), 12);
    expect(louder?.heat?.target[1]).toBeCloseTo(0.9 * lift(2), 12);
    const stronger = run(forces, 2, frame({ force: BREATH, strength: 5 }));
    expect(stronger?.heat?.target[1]).toBeCloseTo(2.25 * 0.5 * lift(2), 12);
    // eight masses: the energy that lifts them level
    const eight = run(new MusicForces(), 120, frame({ force: BREATH, n: 8 }));
    expect(eight?.heat?.target[1]).toBeCloseTo(0.5 * lift(8), 12);
  });

  it("aims at no energy in the music's silence, and puts nothing into the physics without a source", () => {
    const forces = new MusicForces();
    run(forces, 120, frame({ force: BREATH }));
    const silent = run(
      forces,
      2,
      frame({ force: BREATH, heard: heard({ silent: true, level: 0.5 }) }),
    );
    expect(silent?.heat?.target[1]).toBe(0);
    expect(silent?.drag).toEqual([0, 0]);
    expect(forces.frame(frame({ force: BREATH, heard: null }))).toBeNull();
  });

  it("lets go while the visitor's hand holds the chain, and takes hold again over a second", () => {
    const forces = new MusicForces();
    run(forces, 120, frame({ force: BREATH }));
    expect(run(forces, 10, frame({ force: BREATH, held: true }))).toBeNull();
    const again = forces.frame(frame({ force: BREATH }));
    forces.ran(FRAME * SPEED);
    expect(again?.heat?.gain).toBeCloseTo(
      (BREATH_GAIN * FRAME) / TAKE_HOLD,
      12,
    );
    const held = run(
      forces,
      Math.ceil(TAKE_HOLD / FRAME),
      frame({ force: BREATH }),
    );
    expect(held?.heat?.gain).toBe(BREATH_GAIN);
  });

  it("with no gravity, aims at the energy that would lift the chain level on Earth", () => {
    const drive = run(
      new MusicForces(),
      120,
      frame({ force: BREATH, g: { x: 0, y: 0 } }),
    );
    expect(drive?.heat?.target[1]).toBeCloseTo(0.5 * lift(2), 12);
    expect(drive?.heat?.floor).toBeCloseTo(BREATH_FLOOR * lift(2), 12);
  });

  it("leans gravity a hundredth of a radian for a frame where the chain hangs at rest, which no drag could set going", () => {
    const forces = new MusicForces();
    const still = run(
      forces,
      120,
      frame({ force: BREATH, state: restingState(2) }),
    );
    expect(SEED_LEAN).toBe(0.01);
    const [start, end] = still?.tilt ?? [];
    expect(start?.x).toBeCloseTo(9.81 * Math.sin(SEED_LEAN), 12);
    expect(start?.y).toBeCloseTo(9.81 * (1 - Math.cos(SEED_LEAN)), 12);
    expect(end).toEqual(start);
    // not in the silence, which aims at rest
    const quiet = forces.frame(
      frame({
        force: BREATH,
        state: restingState(2),
        heard: heard({ silent: true }),
      }),
    );
    expect(quiet?.tilt[1]).toEqual({ x: 0, y: 0 });
  });
});

/** How far gravity leans at the end of a command, from straight down along `g` towards its side, in rad: positive to the right as one looks down. */
function leanOf(drive: Drive | null, g: Gravity = DOWN): number {
  const tilt = drive?.tilt[1] ?? { x: 0, y: 0 };
  const x = g.x + tilt.x;
  const y = g.y + tilt.y;
  const strength = Math.hypot(g.x, g.y);
  const down = { x: g.x / strength, y: g.y / strength };
  const side = { x: -down.y, y: down.x };
  return Math.atan2(x * side.x + y * side.y, x * down.x + y * down.y);
}

describe("the swaying gravity (decision 77)", () => {
  const swing = ((30 * Math.PI) / 180) * 0.5;

  it("leans gravity to the other side on each kick, crossing over the time since the kick before, as far as the loudness: 15° at the middle strength for music half as loud as it has been", () => {
    const forces = new MusicForces();
    // straight down until the first kick
    expect(leanOf(run(forces, 900, frame({ force: SWAY })))).toBeCloseTo(0, 12);
    // the first kick: to the right, over FIRST_CROSS
    forces.frame(frame({ force: SWAY, heard: heard({ kick: 1 }) }));
    forces.ran(FRAME * SPEED);
    const going = leanOf(
      run(
        forces,
        Math.round(FIRST_CROSS / FRAME / 2) - 1,
        frame({ force: SWAY }),
      ),
    );
    expect(going).toBeCloseTo(swing / 2, 2);
    const there = leanOf(
      run(forces, Math.round(FIRST_CROSS / FRAME / 2), frame({ force: SWAY })),
    );
    expect(there).toBeCloseTo(swing, 9);
    // a kick 0.8 s after it: back to the left over 0.8 s, halfway at 0.4 s
    run(forces, 48 - Math.round(FIRST_CROSS / FRAME), frame({ force: SWAY }));
    forces.frame(frame({ force: SWAY, heard: heard({ kick: 1 }) }));
    forces.ran(FRAME * SPEED);
    expect(leanOf(run(forces, 23, frame({ force: SWAY })))).toBeCloseTo(0, 2);
    expect(leanOf(run(forces, 24, frame({ force: SWAY })))).toBeCloseTo(
      -swing,
      9,
    );
    // louder, wider
    const loud = run(
      forces,
      600,
      frame({ force: SWAY, heard: heard({ level: 0.9 }) }),
    );
    expect(leanOf(loud)).toBeCloseTo((-swing * 0.9) / 0.5, 6);
  });

  it("crosses over no less than a quarter of a second and no more than a second and a half, and over a second at least where reduced motion is asked for", () => {
    const crossing = (apart: number, slow = false) => {
      const forces = new MusicForces({ slow });
      run(forces, 1800, frame({ force: SWAY }));
      forces.frame(frame({ force: SWAY, heard: heard({ kick: 1 }) }));
      forces.ran(FRAME * SPEED);
      run(forces, apart - 1, frame({ force: SWAY }));
      forces.frame(frame({ force: SWAY, heard: heard({ kick: 1 }) }));
      forces.ran(FRAME * SPEED);
      // the frames until the lean is back across, to the left
      for (let k = 1; k < 600; k++) {
        const drive = forces.frame(frame({ force: SWAY }));
        forces.ran(FRAME * SPEED);
        if (leanOf(drive) <= -swing * (1 - 1e-6)) return (k + 1) * FRAME;
      }
      return Number.POSITIVE_INFINITY;
    };
    expect(LEAST_CROSS).toBe(0.25);
    expect(MOST_CROSS).toBe(1.5);
    expect(crossing(6)).toBeCloseTo(LEAST_CROSS, 1);
    expect(crossing(36)).toBeCloseTo(0.6, 1);
    expect(crossing(180)).toBeCloseTo(MOST_CROSS, 1);
    expect(crossing(36, true)).toBeCloseTo(SLOW_CROSS, 1);
  });

  it("leans as far as the strength asks, less on chains of more than three masses, and never past 60°", () => {
    const settled = (over: Partial<ForceFrame> & { n?: number }) => {
      const forces = new MusicForces();
      const kick = { ...(over.heard ?? heard()), kick: 1 };
      forces.frame(frame({ force: SWAY, ...over, heard: kick }));
      forces.ran(FRAME * SPEED);
      return leanOf(run(forces, 900, frame({ force: SWAY, ...over })));
    };
    expect(settled({ n: 3 })).toBeCloseTo(swing, 9);
    expect(settled({ n: 12 })).toBeCloseTo(swing / 2, 9);
    expect(settled({ strength: 1 })).toBeCloseTo(swing / 4, 9);
    expect(WIDEST_SWING).toBeCloseTo(Math.PI / 3, 15);
    expect(settled({ strength: 5, heard: heard({ level: 1 }) })).toBeCloseTo(
      WIDEST_SWING,
      9,
    );
  });

  it("turns the visitor's gravity, whichever way it points, and keeps its strength", () => {
    const right: Gravity = { x: 24.79, y: 0 };
    const forces = new MusicForces();
    forces.frame(frame({ force: SWAY, g: right, heard: heard({ kick: 1 }) }));
    forces.ran(FRAME * SPEED);
    const drive = run(forces, 900, frame({ force: SWAY, g: right }));
    expect(leanOf(drive, right)).toBeCloseTo(swing, 9);
    const tilt = drive?.tilt[1] ?? { x: 0, y: 0 };
    expect(Math.hypot(right.x + tilt.x, right.y + tilt.y)).toBeCloseTo(
      24.79,
      12,
    );
    // and with no gravity, nothing leans
    const none = run(
      new MusicForces(),
      60,
      frame({ force: SWAY, g: { x: 0, y: 0 }, heard: heard({ kick: 1 }) }),
    );
    expect(none?.tilt).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it("drags as the speaker does, goes back to straight down in the music's silence, and puts nothing in without a source", () => {
    const forces = new MusicForces();
    forces.frame(frame({ force: SWAY, heard: heard({ kick: 1 }) }));
    forces.ran(FRAME * SPEED);
    const playing = run(forces, 120, frame({ force: SWAY }));
    expect(playing?.drag[1]).toBeCloseTo(DRAG_PLAYING, 3);
    const quiet = run(
      forces,
      300,
      frame({ force: SWAY, heard: heard({ silent: true }) }),
    );
    expect(Math.abs(leanOf(quiet))).toBeLessThan(1e-4);
    expect(quiet?.drag[1]).toBeCloseTo(DRAG_SILENT, 3);
    forces.frame(frame({ force: SWAY, heard: null }));
    forces.ran(FRAME * SPEED);
    expect(forces.frame(frame({ force: SWAY, heard: null }))).toBeNull();
  });

  it("leans from where the frame before left it, also when that frame was cut short", () => {
    const forces = new MusicForces();
    forces.frame(frame({ force: SWAY, heard: heard({ kick: 1 }) }));
    forces.ran(FRAME * SPEED);
    const first = forces.frame(frame({ force: SWAY }));
    forces.ran((FRAME * SPEED) / 2);
    const second = forces.frame(frame({ force: SWAY }));
    const [a0, a1] = first?.tilt ?? [];
    const [b0] = second?.tilt ?? [];
    if (a0 === undefined || a1 === undefined || b0 === undefined) {
      throw new Error("gravity leans");
    }
    expect(b0.x).toBeCloseTo((a0.x + a1.x) / 2, 15);
    expect(b0.y).toBeCloseTo((a0.y + a1.y) / 2, 15);
  });
});

/**
 * The music on a chain as the piece moves it: 60 frames a second at ×0.8, a
 * frame in 7 pieces, a kick every half second (120 beats a minute) for
 * `playing` s, then `silence` s of silence; the energy above rest at its
 * most while the music plays, and how long it takes after to fall under a
 * hundredth of that, both in J and s.
 */
function song(
  n: number,
  force: Force,
  playing: number,
  silence: number,
  from: "seed" | "rest" = "seed",
): { most: number; calm: number; reference: number; late: number } {
  const chain = Chain.uniform(n);
  const stepper = new Stepper(chain);
  const state = restingState(n);
  // a seed, as the probe's: a chain hanging at rest has no motion to grow
  if (from === "seed") state.theta.fill(0.02);
  const forces = new MusicForces();
  const reference = 9.81 * chain.hangingMoment;
  let most = 0;
  let calm = Number.POSITIVE_INFINITY;
  let late = 0;
  let lateFrames = 0;
  const frames = Math.round((playing + silence) / FRAME);
  for (let k = 0; k < frames; k++) {
    const time = k * FRAME;
    const quiet = time >= playing;
    const beat = !quiet && k % 30 === 0;
    const drive = forces.frame({
      heard: heard({
        kick: beat ? 1 : 0,
        silent: quiet,
        level: quiet ? 0 : 0.5,
      }),
      force,
      strength: 3,
      real: FRAME,
      span: FRAME * SPEED,
      speed: SPEED,
      chain,
      state,
      g: DOWN,
      held: false,
      from: 0,
    });
    let into = 0;
    for (let piece = 0; piece < 7; piece++) {
      stepper.advance(state, (FRAME * SPEED) / 7, DOWN, { drive, into });
      into += (FRAME * SPEED) / 7;
    }
    forces.ran(FRAME * SPEED);
    const energy = chain.energyAboveRest(state.theta, state.omega, DOWN);
    if (!quiet && time >= playing - 5) {
      late += energy;
      lateFrames++;
    }
    if (!quiet) most = Math.max(most, energy);
    else if (energy < most / 100 && calm === Number.POSITIVE_INFINITY) {
      calm = time - playing;
    } else if (energy >= most / 100) {
      calm = Number.POSITIVE_INFINITY;
    }
  }
  return { most, calm, reference, late: late / lateFrames };
}

describe("the music's forces on the chain, against the probe of the music's physics (decisions 75 and 77; PH-4)", () => {
  it("the speaker keeps two and eight masses within bounds while it plays, and calms them within a few seconds of silence", () => {
    for (const n of [2, 8]) {
      const { most, calm, reference } = song(n, SPEAKER, 20, 8);
      expect(most).toBeGreaterThan(1e-4 * reference);
      expect(most).toBeLessThan(0.5 * reference);
      expect(calm).toBeLessThan(5);
    }
  });

  it("the dancing hand keeps two and eight masses within bounds with no drag while it plays, and calms them within a few seconds of silence", () => {
    for (const n of [2, 8]) {
      const { most, calm, reference } = song(n, DANCE, 20, 8);
      expect(most).toBeGreaterThan(0.01 * reference);
      expect(most).toBeLessThan(5 * reference);
      expect(calm).toBeLessThan(3);
    }
  });

  it("the breath draws two and eight masses to its target while the music plays, half the energy that lifts them level for music half as loud as it has been, and calms them within a few seconds of silence", () => {
    for (const n of [2, 8]) {
      const { most, calm, reference, late } = song(n, BREATH, 20, 8);
      expect(late / reference).toBeGreaterThan(0.45);
      expect(late / reference).toBeLessThan(0.55);
      expect(most).toBeLessThan(0.8 * reference);
      expect(calm).toBeLessThan(4);
    }
  });

  it("the breath sets a chain hanging at rest going, by its seed", () => {
    const { late, reference } = song(2, BREATH, 10, 0, "rest");
    expect(late / reference).toBeGreaterThan(0.45);
  });

  it("the swaying gravity keeps two and eight masses within bounds while it plays, and calms them within a few seconds of silence", () => {
    for (const n of [2, 8]) {
      const { most, calm, reference } = song(n, SWAY, 20, 8);
      expect(most).toBeGreaterThan(0.01 * reference);
      expect(most).toBeLessThan(2 * reference);
      expect(calm).toBeLessThan(5);
    }
  });
});

/** A sure beat clock at `bpm`, `phase` into a beat and `bar` into a bar of four, at 10 s. */
function beatOf(over: Partial<BeatAt> = {}): BeatAt {
  return {
    at: 10,
    bpm: 120,
    phase: 0.5,
    bar: 0.125,
    confidence: 0.95,
    ...over,
  };
}

/** The beat clock `seconds` later, as the frames hear it. */
function later(beat: BeatAt, seconds: number): BeatAt {
  const beats = (seconds * beat.bpm) / 60;
  const turn = (x: number) => x - Math.floor(x);
  return {
    ...beat,
    at: beat.at + seconds,
    phase: turn(beat.phase + beats),
    bar: turn(beat.bar + beats / 4),
  };
}

/** How strong gravity is at the end of a command, the visitor's `g` with its tilt. */
function strengthOf(drive: Drive | null, g: Gravity = DOWN): number {
  const tilt = drive?.tilt[1] ?? { x: 0, y: 0 };
  return Math.hypot(g.x + tilt.x, g.y + tilt.y);
}

/** Runs `seconds` of frames of a tuned chain of `n` masses with the beat moving on, and gives the last command. */
function tunedFor(
  forces: MusicForces,
  seconds: number,
  over: Partial<ForceFrame> & { n?: number; beat?: BeatAt } = {},
): Drive | null {
  const { beat = beatOf(), ...rest } = over;
  let drive: Drive | null = null;
  const frames = Math.round(seconds / FRAME);
  for (let k = 0; k < frames; k++) {
    const input = frame({
      force: TUNED,
      heard: heard({ beat: later(beat, k * FRAME) }),
      ...rest,
    });
    drive = forces.frame(input);
    forces.ran(input.span);
  }
  return drive;
}

/** The gravity that swings the slowest mode of an equal chain of `n` masses, 1 m long, `per` times in `seconds` of real time at ×0.8 (PH-7). */
function tuning(n: number, seconds: number): number {
  const omega = (2 * Math.PI) / seconds / SPEED;
  return (omega * omega * (1 / n)) / laguerreZero(n, 1);
}

describe("the tuned chain (decision 79)", () => {
  it("tunes gravity's strength so that the chain's slowest mode swings once a bar: 13.2 m/s² for two masses at 120 beats a minute and ×0.8 (PH-7)", () => {
    const tuned = tunedFor(new MusicForces(), 6);
    expect(tuning(2, 2)).toBeCloseTo(13.16, 2);
    expect(strengthOf(tuned)).toBeCloseTo(tuning(2, 2), 1);
    expect(leanOf(tuned)).toBeCloseTo(0, 9);
    // along the visitor's gravity, whichever way it points
    const turned = { x: 9.81 * Math.sin(0.3), y: -9.81 * Math.cos(0.3) };
    const along = tunedFor(new MusicForces(), 6, { g: turned });
    expect(strengthOf(along, turned)).toBeCloseTo(tuning(2, 2), 1);
    expect(leanOf(along, turned)).toBeCloseTo(0, 9);
    // eight masses, and a slower tempo
    const eight = tunedFor(new MusicForces(), 6, { n: 8 });
    expect(strengthOf(eight)).toBeCloseTo(tuning(8, 2), 1);
    const slow = tunedFor(new MusicForces(), 6, { beat: beatOf({ bpm: 90 }) });
    expect(strengthOf(slow)).toBeCloseTo(tuning(2, (4 * 60) / 90), 1);
  });

  it("swings once every two bars where once a bar would ask for more gravity than Jupiter's", () => {
    const fast = tunedFor(new MusicForces(), 6, { beat: beatOf({ bpm: 170 }) });
    expect(tuning(2, (4 * 60) / 170)).toBeGreaterThan(24.79);
    expect(strengthOf(fast)).toBeCloseTo(tuning(2, (8 * 60) / 170), 1);
  });

  it("pushes the pivot across gravity on the beat, at its moment in the frame, two beats to one side and two to the other: 3 mm at the middle strength, coming back over half a second", () => {
    const side = { x: 1, y: 0 };
    // a beat 0.02 of a beat (10 ms) into a frame that starts at the moment
    // heard; the bar's second beat, to the first side
    const second = new MusicForces().frame(
      frame({
        force: TUNED,
        heard: heard({ beat: beatOf({ phase: 0.98, bar: 0.245 }) }),
      }),
    );
    const [kick] = second?.kicks ?? [];
    expect(kick?.start).toBeCloseTo(0.01 * SPEED, 9);
    expect(kick?.x).toBeCloseTo(0.003 * side.x, 9);
    expect(kick?.y).toBeCloseTo(0.003 * side.y, 9);
    expect(kick?.attack).toBeCloseTo(KICK_ATTACK * SPEED, 12);
    expect(kick?.decay).toBeCloseTo(TUNED_DECAY * SPEED, 12);
    // the bar's third beat, to the other side, as far as the strength asks
    const third = new MusicForces().frame(
      frame({
        force: TUNED,
        strength: 5,
        heard: heard({ beat: beatOf({ phase: 0.98, bar: 0.495 }) }),
      }),
    );
    expect(third?.kicks[0]?.x).toBeCloseTo(-0.003 * 2.25 * side.x, 9);
    // a frame that ends at the moment heard, as the chain's does without
    // twins, takes the beat that fell 5 ms before it
    const before = new MusicForces().frame(
      frame({
        force: TUNED,
        from: -FRAME,
        heard: heard({ beat: beatOf({ phase: 0.01, bar: 0.2525 }) }),
      }),
    );
    expect(before?.kicks[0]?.start).toBeCloseTo((FRAME - 0.005) * SPEED, 9);
    expect(before?.kicks[0]?.x).toBeCloseTo(0.003 * side.x, 9);
    // no beat within the frame, no push
    const none = new MusicForces().frame(
      frame({ force: TUNED, heard: heard({ beat: beatOf({ phase: 0.5 }) }) }),
    );
    expect(none?.kicks ?? []).toHaveLength(0);
  });

  it("pushes nothing and gives gravity back where the clock is not sure, or there is no clock, and drags 0.1 a second while the music plays, 2 in its silence", () => {
    const forces = new MusicForces();
    tunedFor(forces, 6);
    // long enough for the pushes given while it was sure to have faded
    const unsure = tunedFor(forces, 10, {
      beat: beatOf({ confidence: 0.5 }),
    });
    expect(strengthOf(unsure)).toBeCloseTo(9.81, 1);
    expect(unsure?.kicks ?? []).toHaveLength(0);
    expect(unsure?.drag[1]).toBeCloseTo(TUNED_DRAG, 3);
    const none = run(new MusicForces(), 360, frame({ force: TUNED }));
    expect(none?.kicks ?? []).toHaveLength(0);
    expect(strengthOf(none)).toBeCloseTo(9.81, 9);
    const silent = run(
      new MusicForces(),
      120,
      frame({ force: TUNED, heard: heard({ beat: beatOf(), silent: true }) }),
    );
    expect(silent?.kicks ?? []).toHaveLength(0);
    expect(silent?.drag[1]).toBeCloseTo(DRAG_SILENT, 2);
  });

  it("pushes nothing where reduced motion is asked for", () => {
    const drive = new MusicForces({ slow: true }).frame(
      frame({
        force: TUNED,
        heard: heard({ beat: beatOf({ phase: 0.98, bar: 0.245 }) }),
      }),
    );
    expect(drive?.kicks ?? []).toHaveLength(0);
  });

  it("swings two and three masses in their slowest mode, once a bar, and builds it within twenty seconds (PH-7)", () => {
    for (const n of [2, 3]) {
      const chain = Chain.uniform(n);
      const stepper = new Stepper(chain);
      const state = restingState(n);
      const forces = new MusicForces();
      const g = DOWN;
      let beat = beatOf({ phase: 0, bar: 0 });
      const tips: number[] = [];
      for (let k = 0; k < Math.round(30 / FRAME); k++) {
        const drive = forces.frame({
          ...frame({ force: TUNED, n, heard: heard({ beat }) }),
          chain,
          state,
        });
        let into = 0;
        for (let piece = 0; piece < 7; piece++) {
          stepper.advance(state, (FRAME * SPEED) / 7, g, { drive, into });
          into += (FRAME * SPEED) / 7;
        }
        forces.ran(FRAME * SPEED);
        beat = later(beat, FRAME);
        let x = 0;
        for (let i = 0; i < n; i++) x += Math.sin(state.theta[i] ?? 0) / n;
        tips.push(x);
      }
      // the tip's reach over the last ten seconds, of the chain's length,
      // and how often it crosses the middle: twice a bar, a bar each 2 s
      const last = tips.slice(-Math.round(10 / FRAME));
      const reach = Math.max(...last.map(Math.abs));
      expect(reach).toBeGreaterThan(0.04);
      expect(reach).toBeLessThan(0.25);
      let crossings = 0;
      for (let k = 1; k < last.length; k++) {
        if (Math.sign(last[k] ?? 0) !== Math.sign(last[k - 1] ?? 0))
          crossings++;
      }
      expect(crossings).toBeGreaterThanOrEqual(9);
      expect(crossings).toBeLessThanOrEqual(11);
      // and within twenty seconds it has more than half of that reach
      const early = tips.slice(Math.round(15 / FRAME), Math.round(20 / FRAME));
      expect(Math.max(...early.map(Math.abs))).toBeGreaterThan(0.5 * reach);
    }
  });
});
