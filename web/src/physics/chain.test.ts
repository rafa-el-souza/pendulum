import { describe, expect, it } from "vitest";

import oracle from "../../../physics/fixtures/chain-states.json";
import { Chain } from "./chain.ts";

const EPS = Number.EPSILON;

/** The largest difference over the largest reference value. */
function normwise(x: Float64Array, ref: readonly number[]): number {
  let error = 0;
  let scale = 0;
  ref.forEach((r, i) => {
    error = Math.max(error, Math.abs((x[i] ?? Number.NaN) - r));
    scale = Math.max(scale, Math.abs(r));
  });
  return scale > 0 ? error / scale : error;
}

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

function solved(
  chain: Chain,
  theta: Float64Array,
  omega: Float64Array,
  g: number,
) {
  const alpha = new Float64Array(chain.n);
  const tension = new Float64Array(chain.n);
  chain.solve(theta, omega, g, alpha, tension);
  return { alpha, tension };
}

const cases = oracle.cases.map((c) => ({
  ...c,
  chain: new Chain(c.m, c.l),
  theta: Float64Array.from(c.theta),
  omega: Float64Array.from(c.omega),
}));

describe("the chain by the tension route (PH-4)", () => {
  it("has the oracle's states to check against, the hard ones included", () => {
    expect(cases.filter((c) => c.label.includes("folded back"))).toHaveLength(
      3,
    );
    expect(cases.filter((c) => c.label.includes("angles near"))).toHaveLength(
      2,
    );
  });

  it.each(cases)(
    "PH-4: gives the oracle's accelerations and rod tensions, $label",
    ({ chain, theta, omega, g, alpha, tension }) => {
      const out = solved(chain, theta, omega, g);
      expect(normwise(out.alpha, alpha)).toBeLessThan(1e-12);
      expect(normwise(out.tension, tension)).toBeLessThan(1e-12);
    },
  );

  it.each(cases)(
    "PH-2: gives the oracle's energy, $label",
    ({ chain, theta, omega, g, energy, m, l }) => {
      // The kinetic and the potential part can cancel, so the error is taken
      // against the energy that lifts the hanging chain to the horizontal.
      let depth = 0;
      const lift = m.reduce((sum, mass, i) => {
        depth += l[i] ?? Number.NaN;
        return sum + g * mass * depth;
      }, 0);
      const scale = Math.abs(energy) + lift;
      expect(Math.abs(chain.energy(theta, omega, g) - energy)).toBeLessThan(
        1e-12 * scale,
      );
    },
  );

  it.each(cases)(
    "PH-3 (EQ-38, the paper's general formula, its terms collected): the accelerations satisfy it, $label",
    ({ chain, theta, omega, g, m, l }) => {
      // sum_k A_jk alpha_k + sum_k M_max(j,k) l_j l_k sin(theta_j - theta_k) omega_k^2
      //   + g M_j l_j sin(theta_j) = 0, with A_jk = M_max(j,k) l_j l_k cos(theta_j - theta_k)
      // and M_j the mass at or below rod j. Evaluated densely, in n^2 terms. Here
      // theta_j - theta_k is rounded, by up to an ulp of itself, and the bound
      // allows for that: at angles far beyond one turn it is what limits it.
      const { alpha } = solved(chain, theta, omega, g);
      const n = chain.n;
      const below = new Float64Array(n);
      for (let j = n - 1, sum = 0; j >= 0; j--) {
        sum += m[j] ?? Number.NaN;
        below[j] = sum;
      }
      const at = (a: Float64Array | readonly number[], i: number): number =>
        a[i] ?? Number.NaN;
      const largest = alpha.reduce((top, a) => Math.max(top, Math.abs(a)), 0);
      for (let j = 0; j < n; j++) {
        let residual = g * at(below, j) * at(l, j) * Math.sin(at(theta, j));
        let size = g * at(below, j) * at(l, j);
        for (let k = 0; k < n; k++) {
          const weight = at(below, Math.max(j, k)) * at(l, j) * at(l, k);
          const d = at(theta, j) - at(theta, k);
          const spin = at(omega, k) * at(omega, k);
          residual +=
            weight * (Math.cos(d) * at(alpha, k) + Math.sin(d) * spin);
          size += weight * (largest + spin) * Math.max(1, Math.abs(d));
        }
        expect(Math.abs(residual)).toBeLessThan(1e-12 * size);
      }
    },
  );
});

describe("a chain with every rod on one line (PH-5)", () => {
  it.each([1, 2, 3, 8, 64, 1000, 10_000])(
    "PH-5: %i rods, straight or folded, accelerate like one pendulum at the top and not at all below",
    (n) => {
      // Every rod force is then along e_1, so alpha_1 = -(g/l_1) sin theta_1,
      // alpha_k = 0 below, and along e_1 Newton's law gives the tensions:
      // sigma_i T_i = sum_{j>=i} m_j (g cos theta_1 + sum_{k<=j} sigma_k l_k omega_k^2),
      // with sigma_k = +1 for a rod along the first and -1 for one folded back.
      const draw = random(n);
      const g = 9.81;
      const m = Float64Array.from({ length: n }, () => 10 ** (2 * draw() - 1));
      const l = Float64Array.from({ length: n }, () => 5 ** (2 * draw() - 1));
      const sigma = Float64Array.from({ length: n }, (_, i) =>
        i > 0 && draw() < 0.5 ? -1 : 1,
      );
      const theta1 = (2 * draw() - 1) * Math.PI;
      const theta = sigma.map((s) => (s > 0 ? theta1 : theta1 + Math.PI));
      const omega = l.map(
        (length) => 3 * (2 * draw() - 1) * Math.sqrt(g / length),
      );
      const chain = new Chain(m, l);
      const { alpha, tension } = solved(chain, theta, omega, g);

      const at = (a: Float64Array, i: number): number => a[i] ?? Number.NaN;
      const along = new Float64Array(n);
      const size = new Float64Array(n);
      for (let k = 0, sum = g * Math.cos(theta1), spin = g; k < n; k++) {
        sum += at(sigma, k) * at(l, k) * at(omega, k) ** 2;
        spin += at(l, k) * at(omega, k) ** 2;
        along[k] = sum;
        size[k] = spin;
      }
      for (let i = n - 1, sum = 0, total = 0; i >= 0; i--) {
        sum += at(m, i) * at(along, i);
        total += at(m, i) * at(size, i);
        // the weight and the spin of everything below, summed in n terms
        expect(
          Math.abs(at(tension, i) - at(sigma, i) * sum),
        ).toBeLessThanOrEqual(8 * n * EPS * total);
        size[i] = total;
      }
      // Adding a rounded pi folds a joint only to within an ulp or two, which
      // leaves angular accelerations of that relative size instead of zero.
      for (let k = 0; k < n; k++) {
        const pull =
          (k + 1 < n ? at(size, k + 1) / at(m, k) : 0) +
          (k > 0 ? at(size, k - 1) / at(m, k - 1) : 0);
        const expected = k === 0 ? -(g / at(l, 0)) * Math.sin(theta1) : 0;
        expect(Math.abs(at(alpha, k) - expected)).toBeLessThanOrEqual(
          (8 * EPS * (pull + g)) / at(l, k),
        );
      }
    },
  );
});

describe("a chain's masses and rods", () => {
  it("can be equal, as in the paper's refinement: n masses on n rods, 1 kg and 1 m in all", () => {
    const chain = Chain.uniform(4);
    expect(Array.from(chain.masses)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(Array.from(chain.lengths)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(chain.totalMass).toBe(1);
    expect(chain.totalLength).toBe(1);
    expect(Chain.uniform(3, 6, 9).masses).toEqual(Float64Array.of(3, 3, 3));
  });

  it("keeps copies, so the arrays it was given can change", () => {
    const masses = [1, 2];
    const chain = new Chain(masses, [1, 1]);
    masses[0] = 5;
    expect(chain.masses[0]).toBe(1);
  });

  it.each<[string, number[], number[]]>([
    ["no rod", [], []],
    ["a mass without its rod", [1, 1], [1]],
    ["a mass of zero", [1, 0], [1, 1]],
    ["a negative rod", [1, 1], [1, -1]],
    ["a mass that is not a number", [1, Number.NaN], [1, 1]],
    ["an infinite rod", [1, 1], [1, Number.POSITIVE_INFINITY]],
  ])("refuses %s", (_, masses, lengths) => {
    expect(() => new Chain(masses, lengths)).toThrow();
  });
});

describe("where the masses are (PH-1)", () => {
  it("PH-1: a chain hanging straight has its masses one below the other", () => {
    const chain = new Chain([1, 1, 1], [0.5, 0.25, 0.25]);
    const x = new Float64Array(3);
    const y = new Float64Array(3);
    chain.positions(new Float64Array(3), x, y);
    expect(Array.from(x)).toEqual([0, 0, 0]);
    expect(Array.from(y)).toEqual([-0.5, -0.75, -1]);
  });

  it("PH-1: each rod adds l (sin theta, -cos theta), its angle being absolute", () => {
    const chain = new Chain([1, 1], [1, 2]);
    const x = new Float64Array(2);
    const y = new Float64Array(2);
    chain.positions(Float64Array.of(Math.PI / 2, Math.PI), x, y);
    expect(x[0]).toBeCloseTo(1, 15);
    expect(y[0]).toBeCloseTo(0, 15);
    expect(x[1]).toBeCloseTo(1, 15);
    expect(y[1]).toBeCloseTo(2, 15);
  });

  it("finds the mass nearest to a point, wherever the point is", () => {
    // Four rods of 0.25 m hanging straight: masses at y = -0.25 ... -1.
    const chain = Chain.uniform(4);
    const theta = new Float64Array(4);
    expect(chain.nearestMass(theta, 0.1, -0.45)).toBe(1);
    expect(chain.nearestMass(theta, -3, -2)).toBe(3);
    expect(chain.nearestMass(theta, 0, 5)).toBe(0);
  });
});
