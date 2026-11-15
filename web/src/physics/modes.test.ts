import { describe, expect, it } from "vitest";

import oracle from "../../../physics/fixtures/chain-modes.json";
import { Chain, gravity } from "./chain.ts";
import { laguerreZero, startInMode, uniformMode } from "./modes.ts";
import { Stepper, type ChainState } from "./step.ts";

/**
 * What the comparison with the oracle allows: its eigensolver finds the
 * smallest eigenvalues only to about eps n² of their size, and so do the
 * shapes (physics/oracle/limits/test_write_modes.py); ten times that.
 */
function allowed(n: number): number {
  return 1e-14 * n * n;
}

/** The largest difference between two chains' angles. */
function apart(a: Float64Array, b: Float64Array): number {
  let most = 0;
  a.forEach((angle, i) => {
    most = Math.max(most, Math.abs(angle - (b[i] ?? Number.NaN)));
  });
  return most;
}

/** The angular frequency of mode k of a uniform chain, in rad/s: ω² = λ g / l. */
function frequency(chain: Chain, k: number, g: number): number {
  return Math.sqrt(
    (uniformMode(chain.n, k).lambda * g * chain.n) / chain.totalLength,
  );
}

function copy(state: ChainState): ChainState {
  return {
    theta: Float64Array.from(state.theta),
    omega: Float64Array.from(state.omega),
  };
}

describe("the normal modes of the equal chain (PH-6, PH-7)", () => {
  it("has the oracle's modes to check against, from one mass to 512", () => {
    const sizes = new Set(oracle.cases.map((c) => c.n));
    expect([...sizes]).toEqual([1, 2, 3, 4, 8, 32, 128, 512]);
    expect(oracle.cases.filter((c) => c.n === 512)).toHaveLength(6);
  });

  it("finds the oracle's squared frequencies as the zeros of the Laguerre polynomial of degree n (PH-7)", () => {
    for (const c of oracle.cases) {
      const found = laguerreZero(c.n, c.k);
      expect(
        Math.abs(found - c.lambda),
        `n = ${String(c.n)}, mode ${String(c.k)}`,
      ).toBeLessThanOrEqual(allowed(c.n) * c.lambda);
      expect(uniformMode(c.n, c.k).lambda).toBe(found);
    }
  });

  it("finds the oracle's shapes by the recurrence of the difference equation (65), scaled as the oracle scales them", () => {
    for (const c of oracle.cases) {
      const { shape } = uniformMode(c.n, c.k);
      expect(shape).toHaveLength(c.n);
      expect(
        apart(shape, Float64Array.from(c.shape)),
        `n = ${String(c.n)}, mode ${String(c.k)}`,
      ).toBeLessThanOrEqual(allowed(c.n));
      expect(Math.max(...shape.map(Math.abs))).toBe(1);
      expect(shape.at(-1)).toBeGreaterThan(0);
    }
  });

  it("gives the textbook double pendulum: ω² l / g = 2 ∓ √2, and the rods at ±1/√2 of each other (PH-7)", () => {
    expect(laguerreZero(2, 1)).toBeCloseTo(2 - Math.SQRT2, 15);
    expect(laguerreZero(2, 2)).toBeCloseTo(2 + Math.SQRT2, 15);
    expect(uniformMode(2, 1).shape[0]).toBeCloseTo(Math.SQRT1_2, 15);
    expect(uniformMode(2, 2).shape[0]).toBeCloseTo(-Math.SQRT1_2, 15);
  });

  it("finds every mode of a chain, in order, and none it does not have", () => {
    for (const n of [1, 5, 24, 96]) {
      const zeros = Array.from({ length: n }, (_, k) => laguerreZero(n, k + 1));
      zeros.forEach((zero, k) => {
        expect(zero).toBeGreaterThan(k === 0 ? 0 : (zeros[k - 1] ?? 0));
      });
      // the sum of the zeros of L_n is n², the trace of its Jacobi matrix
      const sum = zeros.reduce((total, zero) => total + zero, 0);
      expect(Math.abs(sum - n * n)).toBeLessThanOrEqual(1e-12 * n * n);
    }
    expect(() => laguerreZero(2, 3)).toThrow();
    expect(() => laguerreZero(2, 0)).toThrow();
    expect(() => uniformMode(0, 1)).toThrow();
  });

  it("keeps the highest modes of a long chain finite, whose Laguerre values outgrow a double", () => {
    const { lambda, shape } = uniformMode(512, 512);
    expect(lambda).toBeGreaterThan(2000);
    expect(shape.every(Number.isFinite)).toBe(true);
    expect(Math.max(...shape.map(Math.abs))).toBe(1);
  });
});

describe("a chain started in a mode (PH-6)", () => {
  it("is at rest about the way gravity points, its largest angle from there the amplitude", () => {
    const state = startInMode(8, 2, 0.1, 0.5);
    expect(state.omega.every((rate) => rate === 0)).toBe(true);
    const offsets = state.theta.map((angle) => angle - 0.5);
    expect(Math.max(...offsets.map(Math.abs))).toBeCloseTo(0.1, 15);
    expect(
      apart(
        offsets,
        uniformMode(8, 2).shape.map((s) => 0.1 * s),
      ),
    ).toBeLessThan(1e-15);
  });

  it("swings in the mode with the piece's own physics: mirrored after half a period, back after one", () => {
    const amplitude = 1e-4;
    for (const [n, k] of [
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 3],
      [8, 2],
      [32, 3],
    ] as const) {
      const chain = Chain.uniform(n);
      const stepper = new Stepper(chain);
      const start = startInMode(n, k, amplitude);
      const state = copy(start);
      const half = Math.PI / frequency(chain, k, 9.81);
      stepper.advance(state, half, gravity(9.81));
      const where = `n = ${String(n)}, mode ${String(k)}`;
      const mirrored = start.theta.map((angle) => -angle);
      expect(apart(state.theta, mirrored) / amplitude, where).toBeLessThan(
        1e-7,
      );
      stepper.advance(state, half, gravity(9.81));
      expect(apart(state.theta, start.theta) / amplitude, where).toBeLessThan(
        1e-7,
      );
    }
  });

  it("swings the same about gravity turned any way", () => {
    const chain = Chain.uniform(3);
    const stepper = new Stepper(chain);
    const down = 2.5;
    const start = startInMode(3, 2, 1e-4, down);
    const state = copy(start);
    const period = (2 * Math.PI) / frequency(chain, 2, 9.81);
    stepper.advance(state, period, gravity(9.81, down));
    expect(apart(state.theta, start.theta) / 1e-4).toBeLessThan(1e-7);
  });

  it("stays where it was put with no gravity: without it there is no mode", () => {
    const chain = Chain.uniform(8);
    const stepper = new Stepper(chain);
    const start = startInMode(8, 1, 0.3);
    const state = copy(start);
    stepper.advance(state, 5, gravity(0));
    expect(apart(state.theta, start.theta)).toBe(0);
  });
});
