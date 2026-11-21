import { describe, expect, it } from "vitest";

import type { Signals } from "../audio/signals.ts";
import type { Force } from "../core/routes.ts";
import { Chain, createHand, type Gravity } from "../physics/chain.ts";
import {
  handAt,
  pivotAt,
  type Drive,
  type PivotMotion,
} from "../physics/drive.ts";
import { restingState, Stepper, type ChainState } from "../physics/step.ts";
import {
  BREATH_FLOOR,
  BREATH_GAIN,
  CROSS,
  DANCE_GRIP,
  DRAG_PLAYING,
  DRAG_SILENT,
  FIRST_CROSS,
  KICK_ATTACK,
  KICK_DECAY,
  LEAST_CROSS,
  MOST_CROSS,
  MusicForces,
  SEED_LEAN,
  SLOW_CROSS,
  TAKE_HOLD,
  WIDEST_SWING,
  type ForceFrame,
} from "./forces.ts";
import { handDamping } from "./parameters.ts";

// The music's forces on the first piece (docs/decisions.md, decisions 75 and
// 77): forces from outside the chain, which the tension route (PH-4) takes as
// it takes the hand and gravity, in the pivot's frame.

const SPEAKER: Force = { kind: "speaker", depth: 0.04 };
const DANCE: Force = { kind: "dance", depth: 0.7 };
const BREATH: Force = { kind: "breath", depth: 1 };
const SWAY: Force = { kind: "sway", depth: (30 * Math.PI) / 180 };
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
