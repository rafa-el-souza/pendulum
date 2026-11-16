import { describe, expect, it } from "vitest";

import { FADE_STEP, FadeBatch, fadeAfter } from "./trails.ts";

// Trails fade in simulated time, so that a paused piece keeps them
// (docs/decisions.md, decision 21), and a fade too small for the light's
// precision waits until it is not (decision 42).

describe("a trail's light", () => {
  it("halves every half-life, and stays whole while no time passes", () => {
    expect(fadeAfter(0, 2.5)).toBe(1);
    expect(fadeAfter(2.5, 2.5)).toBeCloseTo(0.5, 15);
    expect(fadeAfter(5, 2.5)).toBeCloseTo(0.25, 15);
  });

  it("fades by the same amount in one long frame as in many short ones", () => {
    let left = 1;
    for (let frame = 0; frame < 60; frame++) left *= fadeAfter(1 / 60, 2.5);
    expect(left).toBeCloseTo(fadeAfter(1, 2.5), 12);
  });

  it("does not fade with a half-life without end, as a trail that stays", () => {
    expect(fadeAfter(1000, Number.POSITIVE_INFINITY)).toBe(1);
  });
});

/**
 * A number as a half float keeps it: eleven significant bits, rounded to the
 * nearest, ties to even (enough for the normal range the trails' light is in).
 */
function half(x: number): number {
  if (x === 0) return 0;
  const exponent = Math.floor(Math.log2(Math.abs(x)));
  const unit = 2 ** (exponent - 10);
  const steps = x / unit;
  const floor = Math.floor(steps);
  const rest = steps - floor;
  const rounded =
    rest > 0.5 || (rest === 0.5 && floor % 2 === 1) ? floor + 1 : floor;
  return rounded * unit;
}

describe("the fade of light kept in half floats (decision 42)", () => {
  // time at a tenth of real time, sixty frames a second, a half-life of 2.5 s
  const left = fadeAfter(0.1 / 60, 2.5);
  const frames = Math.round((20 * 2.5 * 60) / 0.1);

  it("stops where each frame would take off less than half a step of the number's precision", () => {
    let light = 1;
    for (let frame = 0; frame < frames; frame++) light = half(light * left);
    // twenty half-lives, and the light has not gone below half
    expect(light).toBeGreaterThan(0.5);
  });

  it("reaches the dark when the fade waits until it takes off at least a 256th", () => {
    const batch = new FadeBatch();
    let light = 1;
    for (let frame = 0; frame < frames; frame++) {
      const now = batch.take(left);
      if (now < 1) light = half(light * now);
    }
    // a millionth, exactly, after twenty half-lives; within a few percent
    expect(light).toBeLessThan(1.1 * 0.5 ** 20);
    expect(light).toBeGreaterThan(0.9 * 0.5 ** 20);
  });
});

describe("a batch of fades", () => {
  it("passes on at once a fade of a 256th or more", () => {
    const batch = new FadeBatch();
    expect(batch.take(0.5)).toBe(0.5);
    expect(batch.take(1 - FADE_STEP)).toBe(1 - FADE_STEP);
  });

  it("keeps smaller fades until together they take off a 256th, and passes on all of them", () => {
    const batch = new FadeBatch();
    const small = 1 - FADE_STEP / 10;
    const passed: number[] = [];
    for (let frame = 0; frame < 25; frame++) passed.push(batch.take(small));
    const faded = passed.filter((factor) => factor < 1);
    expect(faded).toHaveLength(2);
    for (const factor of faded)
      expect(factor).toBeLessThanOrEqual(1 - FADE_STEP);
    expect(passed.reduce((a, b) => a * b, 1) * batch.pending).toBeCloseTo(
      small ** 25,
      15,
    );
  });

  it("forgets what it kept when the light is cleared", () => {
    const batch = new FadeBatch();
    batch.take(1 - FADE_STEP / 2);
    batch.reset();
    expect(batch.pending).toBe(1);
  });
});
