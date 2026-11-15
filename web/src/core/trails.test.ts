import { describe, expect, it } from "vitest";

import { fadeAfter } from "./trails.ts";

// Trails fade in simulated time, so that a paused piece keeps them
// (docs/decisions.md, decision 21).

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
});
