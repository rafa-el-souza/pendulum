import { describe, expect, it } from "vitest";

import { Chain } from "./chain.ts";
import { resample } from "./resample.ts";
import { restingState } from "./step.ts";

// Changing the number of masses while the chain moves is not in the paper,
// which refines a chain by doubling its masses; here any number goes to any
// other, keeping the total length and mass.

/** A small deterministic generator, so that every run draws the same states. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (a: Float64Array, i: number): number => a[i] ?? Number.NaN;

function tip(chain: Chain, theta: Float64Array): [number, number] {
  const x = new Float64Array(chain.n);
  const y = new Float64Array(chain.n);
  chain.positions(theta, x, y);
  return [at(x, chain.n - 1), at(y, chain.n - 1)];
}

describe("the same chain with another number of masses", () => {
  it.each([
    [1, 2],
    [2, 2],
    [3, 4],
    [8, 3],
  ])(
    "refining %i masses by %i keeps every old mass where it was, moving as it was",
    (n, factor) => {
      const draw = random(11 + n);
      const chain = Chain.uniform(n);
      const state = restingState(n);
      for (let i = 0; i < n; i++) {
        state.theta[i] = (2 * draw() - 1) * 3;
        state.omega[i] = (2 * draw() - 1) * 5;
      }
      const fine = resample(chain, state, n * factor);
      expect(fine.chain.n).toBe(n * factor);
      const x = new Float64Array(n);
      const y = new Float64Array(n);
      const fx = new Float64Array(n * factor);
      const fy = new Float64Array(n * factor);
      chain.positions(state.theta, x, y);
      fine.chain.positions(fine.state.theta, fx, fy);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) * factor - 1;
        expect(
          Math.hypot(at(fx, j) - at(x, i), at(fy, j) - at(y, i)),
        ).toBeLessThan(1e-12);
      }
      // every piece of an old rod turns at the old rod's rate
      for (let j = 0; j < n * factor; j++) {
        expect(
          Math.abs(
            at(fine.state.omega, j) - at(state.omega, Math.floor(j / factor)),
          ),
        ).toBeLessThan(1e-10);
      }
      expect(fine.chain.totalLength).toBeCloseTo(chain.totalLength, 12);
      expect(fine.chain.totalMass).toBeCloseTo(chain.totalMass, 12);
    },
  );

  it.each([47, 32, 24, 7, 64, 96])(
    "going from 48 masses to %i keeps the tip within a centimetre of where it was",
    (n) => {
      // A smooth shape: the chords of a coarser chain cut its corners only slightly.
      const chain = Chain.uniform(48);
      const state = restingState(48);
      for (let i = 0; i < 48; i++) {
        state.theta[i] = 0.8 * Math.sin((1.5 * (i + 0.5)) / 48) + 0.2;
      }
      const [tx, ty] = tip(chain, state.theta);
      const next = resample(chain, state, n);
      const [nx, ny] = tip(next.chain, next.state.theta);
      expect(Math.hypot(nx - tx, ny - ty)).toBeLessThan(0.01);
    },
  );

  it("keeps the number when asked for the same one, as a fresh copy", () => {
    const chain = Chain.uniform(3);
    const state = restingState(3);
    state.theta.set([0.1, 0.2, 0.3]);
    const same = resample(chain, state, 3);
    expect(Array.from(same.state.theta)).toEqual(
      Array.from(state.theta).map((t) => expect.closeTo(t, 12) as number),
    );
    expect(same.state.theta).not.toBe(state.theta);
  });

  it.each([0, -1, 2.5, Number.NaN])("refuses %s masses", (n) => {
    expect(() => resample(Chain.uniform(2), restingState(2), n)).toThrow();
  });
});
