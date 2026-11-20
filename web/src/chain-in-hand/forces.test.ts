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
import { restingState, Stepper } from "../physics/step.ts";
import {
  CROSS,
  DANCE_GRIP,
  DRAG_PLAYING,
  DRAG_SILENT,
  KICK_ATTACK,
  KICK_DECAY,
  MusicForces,
  TAKE_HOLD,
  type ForceFrame,
} from "./forces.ts";
import { handDamping } from "./parameters.ts";

// The music's forces on the first piece (docs/decisions.md, decision 75):
// forces from outside the chain, which the tension route (PH-4) takes as it
// takes the hand and gravity, in the pivot's frame.

const SPEAKER: Force = { kind: "speaker", depth: 0.04 };
const DANCE: Force = { kind: "dance", depth: 0.7 };
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
    ...over,
  };
}

/** A frame at 60 Hz and ×0.8 of a chain of `n` masses on Earth, at the middle strength. */
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
): { most: number; calm: number; reference: number } {
  const chain = Chain.uniform(n);
  const stepper = new Stepper(chain);
  const state = restingState(n);
  // a seed, as the probe's: a chain hanging at rest has no motion to grow
  state.theta.fill(0.02);
  const forces = new MusicForces();
  const reference = 9.81 * chain.hangingMoment;
  let most = 0;
  let calm = Number.POSITIVE_INFINITY;
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
    if (!quiet) most = Math.max(most, energy);
    else if (energy < most / 100 && calm === Number.POSITIVE_INFINITY) {
      calm = time - playing;
    } else if (energy >= most / 100) {
      calm = Number.POSITIVE_INFINITY;
    }
  }
  return { most, calm, reference };
}

describe("the music's forces on the chain, against the probe of the music's physics (decision 75; PH-4)", () => {
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
});
