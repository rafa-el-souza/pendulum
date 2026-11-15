import { describe, expect, it } from "vitest";

import { restingState } from "../physics/step.ts";
import { TwinBudget, bornTwins, fanPlace } from "./twins.ts";

// Twins: copies of a chain born a hair apart, which fan out to show chaos
// (docs/decisions.md, decision 4), carried by a budget of their own that
// drops them, never slows time (decision 20).

describe("twins", () => {
  it("are born a hair apart: each one the chain turned whole, within the spread, moving as it moves", () => {
    const chain = restingState(3);
    chain.theta.set([2.2, 2.5, 2.9]);
    chain.omega.set([0.3, -1.2, 4]);
    const twins = bornTwins(chain, 64, 1e-3);
    expect(twins).toHaveLength(64);
    for (const twin of twins) {
      const turn = (twin.theta[0] ?? Number.NaN) - 2.2;
      expect(Math.abs(turn)).toBeLessThanOrEqual(0.5e-3);
      // the whole chain turned by the same angle, so its shape is the chain's
      expect((twin.theta[1] ?? Number.NaN) - 2.5).toBeCloseTo(turn, 15);
      expect((twin.theta[2] ?? Number.NaN) - 2.9).toBeCloseTo(turn, 15);
      expect([...twin.omega]).toEqual([0.3, -1.2, 4]);
    }
    // and each has its own state, so that they part
    expect(twins[1]?.theta).not.toBe(twins[2]?.theta);
  });

  it("cover the fan evenly whatever their number: the largest gap is under twice an even share", () => {
    for (let k = 1; k <= 4096; k++) {
      const places = Array.from({ length: k }, (_, j) => fanPlace(j)).sort(
        (a, b) => a - b,
      );
      let gap = 1 - (places.at(-1) ?? 0) + (places[0] ?? 0);
      for (let i = 1; i < k; i++) {
        gap = Math.max(gap, (places[i] ?? 0) - (places[i - 1] ?? 0));
      }
      expect(gap).toBeLessThan(2 / k + 1e-12);
    }
  });

  it("start in the middle of the fan, on the chain itself", () => {
    expect(fanPlace(0)).toBe(0.5);
    const [first] = bornTwins(restingState(2), 1, 1e-3);
    expect([...(first?.theta ?? [])]).toEqual([0, 0]);
  });
});

describe("the twins' budget", () => {
  it("carries as many twins as fit in it, with a fifth to spare", () => {
    const budget = new TwinBudget(4, 0.01);
    // 4 ms / (0.01 ms * 1.2) = 333.3
    expect(budget.affordable()).toBe(333);
    expect(new TwinBudget(4, 5).affordable()).toBe(0);
  });

  it("learns the cost of a twin from what a frame took, a fifth of the way each frame", () => {
    const budget = new TwinBudget(4, 0.01);
    budget.measured(100, 100, 2); // 0.02 ms each
    expect(budget.cost).toBeCloseTo(0.01 + 0.2 * (0.02 - 0.01), 15);
  });

  it("drops the twins a frame did not reach", () => {
    const budget = new TwinBudget(4, 0.01);
    expect(budget.measured(300, 512, 3)).toBe(300);
  });

  it("drops what three frames in a row over a quarter past the budget cannot carry", () => {
    const budget = new TwinBudget(4, 0.01);
    expect(budget.measured(512, 512, 5.5)).toBe(512);
    expect(budget.measured(512, 512, 5.5)).toBe(512);
    // 512 * 4 / 5.5 = 372.4
    expect(budget.measured(512, 512, 5.5)).toBe(372);
    // a frame within it starts the count again
    expect(budget.measured(372, 372, 4)).toBe(372);
    expect(budget.measured(372, 372, 5.5)).toBe(372);
  });

  it("expects a twin of more masses to cost more, between linear and quadratic", () => {
    const budget = new TwinBudget(4, 0.01);
    budget.rescale(2, 8);
    expect(budget.cost).toBeCloseTo(0.01 * 8, 15);
  });
});
