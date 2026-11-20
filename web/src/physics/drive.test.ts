import { describe, expect, it } from "vitest";

import {
  handAt,
  kickPlace,
  kickPull,
  kickSpeed,
  musicDrag,
  musicPull,
  pivotAt,
  type Drive,
  type PivotMotion,
  type WritableHand,
} from "./drive.ts";

// What the music puts into the chain's physics over a frame (docs/decisions.md,
// decision 74) is not in the paper: forces from outside the chain, which the
// tension route (PH-4) takes as it takes the hand and gravity.

const ATTACK = 0.015;
const DECAY = 0.1;

describe("a kick of the pivot (decision 74)", () => {
  it("takes the pivot out to its size and back, from rest, without a jolt as it starts", () => {
    expect(kickPlace(-0.01, ATTACK, DECAY)).toBe(0);
    expect(kickPlace(0, ATTACK, DECAY)).toBe(0);
    // its height is its size, at attack × ln(1 + 3 decay / attack)
    const height = ATTACK * Math.log(1 + (3 * DECAY) / ATTACK);
    expect(kickPlace(height, ATTACK, DECAY)).toBeCloseTo(1, 14);
    for (let s = 0; s < 0.5; s += 1e-5) {
      expect(kickPlace(s, ATTACK, DECAY)).toBeLessThanOrEqual(1 + 1e-15);
    }
    // and it falls back to its place
    expect(kickPlace(2, ATTACK, DECAY)).toBeLessThan(1e-7);
    // its pull grows from nothing, in proportion to the time, so the chain
    // feels no jolt as it starts: a microsecond in, under a thousandth of
    // the largest pull
    let most = 0;
    for (let s = 0; s < 0.5; s += 1e-4) {
      most = Math.max(most, Math.abs(kickPull(s, ATTACK, DECAY)));
    }
    expect(kickPull(0, ATTACK, DECAY)).toBe(0);
    const early = kickPull(1e-6, ATTACK, DECAY);
    expect(Math.abs(early)).toBeLessThan(1e-3 * most);
    expect(kickPull(2e-6, ATTACK, DECAY) / early).toBeCloseTo(2, 2);
  });

  it("pulls with the second derivative of where it takes the pivot", () => {
    let most = 0;
    for (let s = 0.0005; s < 0.6; s += 0.0005) {
      most = Math.max(most, Math.abs(kickPull(s, ATTACK, DECAY)));
    }
    // the finite difference's own error, h² times the fourth derivative,
    // is 2e-6 of the largest pull at this h
    const h = 1e-5;
    for (let s = 0.0005; s < 0.6; s += 0.0005) {
      const curve =
        (kickPlace(s + h, ATTACK, DECAY) -
          2 * kickPlace(s, ATTACK, DECAY) +
          kickPlace(s - h, ATTACK, DECAY)) /
        (h * h);
      expect(Math.abs(curve - kickPull(s, ATTACK, DECAY))).toBeLessThan(
        1e-5 * most,
      );
    }
  });
});

describe("where the kicks take the pivot (decision 75)", () => {
  it("moves it at the derivative of where it takes it", () => {
    expect(kickSpeed(0, ATTACK, DECAY)).toBe(0);
    expect(kickSpeed(-0.01, ATTACK, DECAY)).toBe(0);
    let most = 0;
    for (let s = 0.0005; s < 0.6; s += 0.0005) {
      most = Math.max(most, Math.abs(kickSpeed(s, ATTACK, DECAY)));
    }
    const h = 1e-6;
    for (let s = 0.0005; s < 0.6; s += 0.0005) {
      const slope =
        (kickPlace(s + h, ATTACK, DECAY) - kickPlace(s - h, ATTACK, DECAY)) /
        (2 * h);
      expect(Math.abs(slope - kickSpeed(s, ATTACK, DECAY))).toBeLessThan(
        1e-6 * most,
      );
    }
    // still at its height
    const height = ATTACK * Math.log(1 + (3 * DECAY) / ATTACK);
    expect(Math.abs(kickSpeed(height, ATTACK, DECAY))).toBeLessThan(
      1e-9 * most,
    );
  });

  it("adds every kick's place and speed along its line, and leaves it in place with none", () => {
    const drive: Drive = {
      span: 0.02,
      tilt: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      kicks: [
        { start: -0.03, x: 0.04, y: 0, attack: ATTACK, decay: DECAY },
        { start: 0.005, x: 0, y: -0.01, attack: 0.01, decay: 0.05 },
      ],
      hands: [],
      drag: [0, 0],
      heat: null,
    };
    const out: PivotMotion = { x: 1, y: 1, vx: 1, vy: 1 };
    pivotAt(drive, 0.01, out);
    expect(out.x).toBeCloseTo(0.04 * kickPlace(0.04, ATTACK, DECAY), 15);
    expect(out.y).toBeCloseTo(-0.01 * kickPlace(0.005, 0.01, 0.05), 15);
    expect(out.vx).toBeCloseTo(0.04 * kickSpeed(0.04, ATTACK, DECAY), 12);
    expect(out.vy).toBeCloseTo(-0.01 * kickSpeed(0.005, 0.01, 0.05), 12);
    pivotAt({ ...drive, kicks: [] }, 0.01, out);
    expect(out).toEqual({ x: 0, y: 0, vx: 0, vy: 0 });
  });
});

describe("the music's command for a frame (decision 74)", () => {
  const drive: Drive = {
    span: 0.02,
    tilt: [
      { x: 0.1, y: 0 },
      { x: 0.3, y: -0.2 },
    ],
    kicks: [
      { start: -0.005, x: 0.03, y: -0.01, attack: ATTACK, decay: DECAY },
      { start: 0.004, x: -0.02, y: 0, attack: 0.01, decay: 0.05 },
    ],
    hands: [
      {
        index: 1,
        stiffness: 100,
        damping: 4,
        fastest: 30,
        from: { x: 0.1, y: -0.5 },
        to: { x: 0.2, y: -0.4 },
      },
    ],
    drag: [0.2, 0.6],
    heat: null,
  };

  it("tilts gravity linearly over its span, and adds the pull of every kick in the pivot's frame", () => {
    // a quarter of the way: the tilt a quarter of the way from its start to
    // its end, less each kick's pull, the first kick 10 ms in, the second
    // 1 ms in, which begins within the frame
    const out = { x: 0, y: 0 };
    musicPull(drive, 0.005, out);
    const first = kickPull(0.01, ATTACK, DECAY);
    const second = kickPull(0.001, 0.01, 0.05);
    expect(out.x).toBeCloseTo(0.15 - 0.03 * first + 0.02 * second, 12);
    expect(out.y).toBeCloseTo(-0.05 + 0.01 * first, 12);
    // before the second kick begins, the first's alone
    musicPull(drive, 0.002, out);
    const early = kickPull(0.007, ATTACK, DECAY);
    expect(out.x).toBeCloseTo(0.1 + 0.1 * 0.2 - 0.03 * early, 12);
  });

  it("drags as much as it says linearly over its span", () => {
    expect(musicDrag(drive, 0)).toBe(0.2);
    expect(musicDrag(drive, 0.005)).toBeCloseTo(0.3, 15);
    expect(musicDrag(drive, 0.02)).toBeCloseTo(0.6, 15);
  });

  it("moves a hand's target in a line over its span, at the speed of the line", () => {
    const hand: WritableHand = {
      index: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      stiffness: 0,
      damping: 0,
      fastest: 0,
    };
    const [music] = drive.hands;
    if (music === undefined) throw new Error("the command has a hand");
    handAt(music, drive, 0.015, hand);
    expect(hand.index).toBe(1);
    expect(hand.stiffness).toBe(100);
    expect(hand.damping).toBe(4);
    expect(hand.fastest).toBe(30);
    expect(hand.x).toBeCloseTo(0.175, 15);
    expect(hand.y).toBeCloseTo(-0.425, 15);
    expect(hand.vx).toBeCloseTo(5, 12);
    expect(hand.vy).toBeCloseTo(5, 12);
  });

  it("holds every value at its start over a span of no time", () => {
    const still: Drive = { ...drive, span: 0, kicks: [] };
    const out = { x: 0, y: 0 };
    musicPull(still, 0, out);
    expect(out).toEqual({ x: 0.1, y: 0 });
    expect(musicDrag(still, 0)).toBe(0.2);
  });
});
