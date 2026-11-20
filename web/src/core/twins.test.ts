import { describe, expect, it } from "vitest";

import { Chain } from "../physics/chain.ts";
import { restingState } from "../physics/step.ts";
import {
  Doubling,
  Fading,
  TwinBudget,
  WHOLE_TURN,
  apart,
  bornApart,
  bornWidth,
  drawIn,
  leashFactor,
  bornPerFrame,
  bornTwin,
  bornTwins,
  fanPlace,
  fromPivot,
  lightApart,
  rootMeanSquare,
  twinShine,
  widened,
} from "./twins.ts";

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

  it("learns nothing from a frame drawn while the view changes, nor counts it among three over the budget, and still drops the twins it did not reach (decision 67)", () => {
    const budget = new TwinBudget(4, 0.01);
    expect(budget.measured(512, 512, 5.5)).toBe(512);
    expect(budget.measured(512, 512, 5.5)).toBe(512);
    const learned = budget.cost;
    // a gesture's frames, slower still, teach nothing
    expect(budget.measured(512, 512, 9, false)).toBe(512);
    expect(budget.measured(512, 512, 9, false)).toBe(512);
    expect(budget.cost).toBe(learned);
    expect(budget.measured(300, 512, 9, false)).toBe(300);
    // the count goes on from where the gesture found it
    expect(budget.measured(512, 512, 5.5)).toBe(372);
  });

  it("expects a twin of more masses to cost more, between linear and quadratic", () => {
    const budget = new TwinBudget(4, 0.01);
    budget.rescale(2, 8);
    expect(budget.cost).toBeCloseTo(0.01 * 8, 15);
  });
});

// Twins that fade (decision 43): each one's light falls with how far chaos
// has carried it from the chain, and never rises again; those gone dark are
// born again on the chain, a few a frame, so that the twins come out of it
// as a plume.

describe("twins that fade", () => {
  it("are born again each at its own place in the fan: the chain as it is now, turned by the twin's share of the spread", () => {
    const chain = restingState(2);
    chain.theta.set([1.1, -0.4]);
    chain.omega.set([2, 3]);
    for (const j of [0, 1, 7, 300]) {
      const twin = bornTwin(chain, j, 1e-3);
      const turn = 1e-3 * (fanPlace(j) - 0.5);
      expect(twin.theta[0]).toBeCloseTo(1.1 + turn, 15);
      expect(twin.theta[1]).toBeCloseTo(-0.4 + turn, 15);
      expect([...twin.omega]).toEqual([2, 3]);
      expect(twin.theta).not.toBe(chain.theta);
      expect(twin.omega).not.toBe(chain.omega);
      // the same twin as the whole fan has at that place
      expect(twin).toEqual(bornTwins(chain, j + 1, 1e-3)[j]);
    }
  });

  it("measure how far apart two chains look: the root mean square of the distances between their masses, as a share of the chain's length", () => {
    // one mass, a metre down and a metre up
    expect(
      apart(
        Float64Array.of(0),
        Float64Array.of(-1),
        Float64Array.of(0),
        Float64Array.of(1),
        1,
      ),
    ).toBeCloseTo(2, 15);
    // two masses of a chain 1 m long, hanging and held out level: the first
    // half a metre down against half a metre out, the second a metre down
    // against a metre out
    const hanging = [Float64Array.of(0, 0), Float64Array.of(-0.5, -1)] as const;
    const level = [Float64Array.of(0.5, 1), Float64Array.of(0, 0)] as const;
    expect(apart(...hanging, ...level, 1)).toBeCloseTo(
      Math.sqrt((0.5 + 2) / 2),
      15,
    );
    // the same, on a chain twice as long, is half as far
    expect(apart(...hanging, ...level, 2)).toBeCloseTo(
      Math.sqrt((0.5 + 2) / 2) / 2,
      15,
    );
    expect(apart(...hanging, ...hanging, 1)).toBe(0);
  });

  it("know how far each twin looks from its chain as it is born, however wide the fan: the chain turned whole moves each mass along a chord of its circle round the pivot (decision 63)", () => {
    const chain = new Chain([1, 2, 1], [0.5, 0.3, 0.2]);
    const state = restingState(3);
    state.theta.set([1.1, -0.4, 2.5]);
    const x = new Float64Array(3);
    const y = new Float64Array(3);
    const tx = new Float64Array(3);
    const ty = new Float64Array(3);
    chain.positions(state.theta, x, y);
    const reach = fromPivot(x, y, chain.totalLength);
    // the root mean square of the masses' distances from the pivot, over the
    // chain's length, which is 1 m
    const squares = [...x].map((at, i) => at ** 2 + (y[i] ?? 0) ** 2);
    expect(reach).toBeCloseTo(
      Math.sqrt(squares.reduce((sum, d) => sum + d, 0) / 3),
      15,
    );
    for (const spread of [1e-3, 0.1, 0.79, 3.14, 6.28]) {
      for (const j of [0, 1, 7, 300, 4095]) {
        chain.positions(bornTwin(state, j, spread).theta, tx, ty);
        expect(bornApart(j, spread, reach)).toBeCloseTo(
          apart(x, y, tx, ty, chain.totalLength),
          12,
        );
      }
    }
    // the first twin, in the middle of the fan, is born on the chain
    expect(bornApart(0, 6.28, reach)).toBe(0);
  });

  it("measure a twin's light from how far it was born from its chain: lit while it keeps that distance, falling as chaos carries it nearer or farther (decision 63)", () => {
    const fading = new Fading(8);
    fading.born(3, 0.5);
    fading.see(3, 0.5, 0.2);
    expect(fading.light[3]).toBe(1);
    fading.see(3, 0.6, 0.2);
    expect(fading.light[3]).toBeCloseTo(lightApart(0.1, 0.2), 15);
    fading.see(3, 0.3, 0.2);
    expect(fading.light[3]).toBeCloseTo(lightApart(0.2, 0.2), 15);
    // born again where it is, it measures from there
    fading.light[3] = 1;
    fading.born(3, 0.3);
    fading.see(3, 0.3, 0.2);
    expect(fading.light[3]).toBe(1);
    // a twin born on its chain measures from the chain, as before
    fading.see(2, 0.2, 0.2);
    expect(fading.light[2]).toBeCloseTo(lightApart(0.2, 0.2), 15);
  });

  it("open as wide as the music asks, ten to its lift times the spread, but never past a whole turn round the pivot (decisions 49 and 63)", () => {
    expect(WHOLE_TURN).toBe(2 * Math.PI);
    expect(widened(1e-3, 0)).toBe(1e-3);
    expect(widened(1e-3, 2)).toBeCloseTo(0.1, 15);
    expect(widened(0.79, 0.5)).toBeCloseTo(0.79 * Math.sqrt(10), 15);
    expect(widened(3.14, 1)).toBe(WHOLE_TURN);
    expect(widened(6.28, 0)).toBe(6.28);
    expect(widened(6.28, 0.1)).toBe(WHOLE_TURN);
  });

  it("light a twin fully on the chain, to a third of it at the reach, and all but out at twice the reach", () => {
    expect(lightApart(0, 0.2)).toBe(1);
    expect(lightApart(0.2, 0.2)).toBeCloseTo(Math.exp(-1), 15);
    expect(lightApart(0.4, 0.2)).toBeLessThan(1 / 50);
    expect(lightApart(0.1, 0.2)).toBeGreaterThan(lightApart(0.15, 0.2));
  });

  it("keep a twin's light from rising again once chaos has carried it off, even where it crosses the chain", () => {
    const fading = new Fading(8);
    expect([...fading.light]).toEqual(new Array(8).fill(1));
    fading.see(3, 0.1, 0.2);
    expect(fading.light[3]).toBeCloseTo(lightApart(0.1, 0.2), 15);
    // crossing the chain, it stays as dark as it has been
    fading.see(3, 0, 0.2);
    expect(fading.light[3]).toBeCloseTo(lightApart(0.1, 0.2), 15);
    fading.see(3, 0.3, 0.2);
    expect(fading.light[3]).toBeCloseTo(lightApart(0.3, 0.2), 15);
    // the others keep theirs, and born again they are all lit
    expect(fading.light[2]).toBe(1);
    fading.relight();
    expect(fading.light[3]).toBe(1);
  });

  it("give back the twins gone dark to be born again, a few a frame, taking them in turn, lit again", () => {
    const fading = new Fading(16);
    for (const j of [1, 4, 5, 9, 12]) fading.see(j, 1, 0.2);
    // 2 a frame: from the first, then on from where the last frame stopped,
    // and round
    expect(fading.gone(16, 2)).toEqual([1, 4]);
    expect(fading.light[1]).toBe(1);
    expect(fading.light[4]).toBe(1);
    expect(fading.gone(16, 2)).toEqual([5, 9]);
    fading.see(2, 1, 0.2);
    expect(fading.gone(16, 2)).toEqual([12, 2]);
    expect(fading.gone(16, 2)).toEqual([]);
    // a twin still lit, if faintly, is left alone
    fading.see(6, 0.25, 0.2);
    expect(fading.gone(16, 2)).toEqual([]);
    // and only those among the twins there are count
    fading.see(14, 1, 0.2);
    expect(fading.gone(14, 2)).toEqual([]);
    expect(fading.gone(15, 2)).toEqual([14]);
  });

  it("bear at most a sixty-fourth of the twins in a frame, again or anew, and one at least", () => {
    expect(bornPerFrame(512)).toBe(8);
    expect(bornPerFrame(4096)).toBe(64);
    expect(bornPerFrame(100)).toBe(2);
    expect(bornPerFrame(64)).toBe(1);
    expect(bornPerFrame(3)).toBe(1);
    expect(bornPerFrame(0)).toBe(1);
  });
});

describe("a twin's light", () => {
  it("is faint, so that many together read as one bright chain: 2.2 over the root of their number, from a twentieth to a half", () => {
    expect(twinShine(512)).toBeCloseTo(2.2 / Math.sqrt(512), 15);
    expect(twinShine(64)).toBeCloseTo(0.275, 15);
    expect(twinShine(4096)).toBe(0.05);
    expect(twinShine(1)).toBe(0.5);
    expect(twinShine(0)).toBe(0.5);
  });
});

describe("twins held near the chain (decision 64)", () => {
  it("are drawn in towards the chain by a factor: every angle's difference the nearest way round, and every rate's", () => {
    const chain = restingState(3);
    chain.theta.set([0.1, 3.1, -3.1]);
    chain.omega.set([1, -2, 0.5]);
    const twin = restingState(3);
    // the second and third angles a hair across the turn from the chain's
    twin.theta.set([0.5, -3.1, 3.1 + 2 * Math.PI]);
    twin.omega.set([3, 2, 0.5]);
    drawIn(twin, chain, 0.25);
    const across = 2 * Math.PI - 6.2;
    expect(twin.theta[0]).toBeCloseTo(0.1 + 0.25 * 0.4, 12);
    expect(twin.theta[1]).toBeCloseTo(3.1 + 0.25 * across, 12);
    expect(twin.theta[2]).toBeCloseTo(-3.1 - 0.25 * across, 12);
    expect([...twin.omega]).toEqual([1 + 0.25 * 2, -2 + 0.25 * 4, 0.5]);
  });

  it("measure the fan's width as the root mean square of its twins' distances, so that one twin carried off does not set it", () => {
    const distances = Float64Array.from([0.1, 0.1, 0.1, 1, 99]);
    expect(rootMeanSquare(distances, 4)).toBeCloseTo(
      Math.sqrt((3 * 0.01 + 1) / 4),
      12,
    );
    expect(rootMeanSquare(distances, 0)).toBe(0);
  });

  it("know the fan's width as it is born, the root mean square of how far each twin looks from the chain", () => {
    const reach = 0.7;
    const widths = Array.from({ length: 512 }, (_, j) =>
      bornApart(j, 1.57, reach),
    );
    const rms = Math.sqrt(
      widths.reduce((sum, w) => sum + w * w, 0) / widths.length,
    );
    expect(bornWidth(512, 1.57, reach)).toBeCloseTo(rms, 12);
    expect(bornWidth(0, 1.57, reach)).toBe(0);
  });

  it("are leashed with slack: free within it, and past it what is beyond falls back at the rate, as the time goes by", () => {
    const fall = Math.exp(-8 * 0.1);
    expect(leashFactor(0.1, 0.15, fall)).toBe(1);
    expect(leashFactor(0.15, 0.15, fall)).toBe(1);
    expect(leashFactor(0.35, 0.15, fall) * 0.35).toBeCloseTo(
      0.15 + 0.2 * fall,
      12,
    );
    expect(leashFactor(0.35, 0.15, 1)).toBe(1);
  });
});

describe("the time differences take to double, measured by the lens (decision 64)", () => {
  it("waits for half a second of measure, then reads ln 2 over the rate the fan stretches at", () => {
    const doubling = new Doubling();
    expect(doubling.seconds).toBeNull();
    // stretching by e^6.93 a second: differences double every 0.1 s
    const rate = Math.LN2 / 0.1;
    for (let frame = 0; frame < 20; frame++) doubling.add(rate / 60, 1 / 60);
    expect(doubling.seconds).toBeNull();
    for (let frame = 0; frame < 20; frame++) doubling.add(rate / 60, 1 / 60);
    expect(doubling.seconds).toBeCloseTo(0.1, 9);
  });

  it("forgets what it measured over about three seconds, so that a new motion takes over", () => {
    const doubling = new Doubling();
    for (let frame = 0; frame < 600; frame++) {
      doubling.add(Math.LN2 / 0.1 / 60, 1 / 60);
    }
    for (let frame = 0; frame < 900; frame++) {
      doubling.add(Math.LN2 / 0.4 / 60, 1 / 60);
    }
    expect(doubling.seconds).toBeCloseTo(0.4, 1);
  });

  it("reads nothing while the fan does not stretch, and nothing once cleared", () => {
    const doubling = new Doubling();
    for (let frame = 0; frame < 60; frame++) doubling.add(-0.01, 1 / 60);
    expect(doubling.seconds).toBeNull();
    for (let frame = 0; frame < 60; frame++) doubling.add(0.2, 1 / 60);
    expect(doubling.seconds).not.toBeNull();
    doubling.clear();
    expect(doubling.seconds).toBeNull();
  });

  it("takes no measure of no time", () => {
    const doubling = new Doubling();
    for (let frame = 0; frame < 60; frame++) doubling.add(5, 0);
    expect(doubling.seconds).toBeNull();
  });
});
