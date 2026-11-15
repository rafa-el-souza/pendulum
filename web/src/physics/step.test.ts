import { describe, expect, it } from "vitest";

import { Chain } from "./chain.ts";
import {
  Stepper,
  restingState,
  reverseMotion,
  type ChainState,
} from "./step.ts";

const G = 9.81;

/** The energy that lifts the hanging chain to the horizontal: a scale for energy errors. */
function lift(chain: Chain, g: number): number {
  let depth = 0;
  return chain.masses.reduce((sum, m, i) => {
    depth += chain.lengths[i] ?? Number.NaN;
    return sum + g * m * depth;
  }, 0);
}

/** Runs a chain released at rest from the given angles, frame by frame at 60 per second. */
function run(chain: Chain, angles: (i: number) => number, seconds: number) {
  const state = restingState(chain.n);
  state.theta.forEach((_, i) => {
    state.theta[i] = angles(i);
  });
  const stepper = new Stepper(chain);
  const start = chain.energy(state.theta, state.omega, G);
  const scale = lift(chain, G);
  let worst = 0;
  for (let frame = 0; frame < 60 * seconds; frame++) {
    stepper.advance(state, 1 / 60, G);
    const drift = Math.abs(chain.energy(state.theta, state.omega, G) - start);
    worst = Math.max(worst, drift / scale);
  }
  return { worst, state };
}

/** K(k), the complete elliptic integral of the first kind, by the arithmetic-geometric mean. */
function ellipticK(k: number): number {
  let a = 1;
  let b = Math.sqrt(1 - k * k);
  while (Math.abs(a - b) > 4 * Number.EPSILON * a) {
    [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  }
  return Math.PI / (2 * a);
}

/** One pendulum released at rest from theta0, after one exact period: how far it is from its start. */
function periodError(theta0: number, maxStep: number): number {
  const chain = new Chain([1], [1]);
  const state: ChainState = {
    theta: Float64Array.of(theta0),
    omega: Float64Array.of(0),
  };
  const period = 4 * Math.sqrt(1 / G) * ellipticK(Math.sin(theta0 / 2));
  new Stepper(chain, { maxStep }).advance(state, period, G);
  const [theta = Number.NaN] = state.theta;
  const [omega = Number.NaN] = state.omega;
  return Math.hypot(theta - theta0, omega / Math.sqrt(G));
}

describe("the substep, taken from the rod tensions (decision 5)", () => {
  it("is 0.3 of the inverse rate of the fastest vibration, 2 sqrt(T / (m l))", () => {
    // 128 equal masses hanging at rest, 1 kg and 1 m in all: the top rod
    // carries T = 9.81 N, and m = l = 1/128, so the rate is
    // 2 sqrt(9.81 * 128^2) = 801.8 rad/s and the substep 3.74e-4 s. A frame of
    // 1/60 s takes 44 of them and a shorter one to land on the frame.
    const chain = Chain.uniform(128);
    expect(
      new Stepper(chain).advance(restingState(128), 1 / 60, G).substeps,
    ).toBe(45);
  });

  it("is at most 1/480 s, however slow the chain", () => {
    // One mass on 1 m at rest: the rate is 2 sqrt(9.81) = 6.3 rad/s, and
    // 0.3 / 6.3 = 0.048 s would be too coarse for RK4 to keep the energy.
    const chain = Chain.uniform(1);
    expect(
      new Stepper(chain).advance(restingState(1), 1 / 60, G).substeps,
    ).toBe(8);
  });

  it("shortens as the chain spins, through the tension that the spin puts in the rods", () => {
    // One mass on 1 m spinning at 400 rad/s: T = m (l omega^2 + g cos theta),
    // so the rate is about 2 * 400 = 800 rad/s and the substep 3.75e-4 s.
    const chain = Chain.uniform(1);
    const state = restingState(1);
    state.omega[0] = 400;
    expect(new Stepper(chain).advance(state, 1 / 60, G).substeps).toBe(45);
  });
});

describe("RK4 on the angles", () => {
  it("brings one pendulum back to its start after its exact period", () => {
    // The period of a pendulum released from rest at theta0 is
    // 4 sqrt(l / g) K(sin(theta0 / 2)). Measured: 4.8e-11 from 2.5 rad.
    expect(periodError(2.5, 1 / 480)).toBeLessThan(1e-9);
  });

  it("is of fourth order: halving the step divides the error by 16", () => {
    // Measured from 1 rad: 15.8, 15.9 and 15.9. A slip in RK4's stages or
    // weights leaves a method of lower order, which can still keep the energy.
    const ratios = [1 / 60, 1 / 120, 1 / 240].map(
      (h) => periodError(1, h) / periodError(1, h / 2),
    );
    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThan(15);
      expect(ratio).toBeLessThan(17);
    }
  });
});

describe("the energy along the motion, where trajectories are chaotic", () => {
  it("holds for two masses released from high up, over ten seconds", () => {
    // Measured: 4.3e-7 of the energy that lifts the chain to the horizontal.
    const { worst } = run(Chain.uniform(2), (i) => [2.2, 2.9][i] ?? 0, 10);
    expect(worst).toBeLessThan(2e-6);
  });

  it("holds for 32 masses swinging gently, over ten seconds", () => {
    // Measured: 1.8e-8.
    const { worst } = run(Chain.uniform(32), () => 0.5, 10);
    expect(worst).toBeLessThan(1e-7);
  });

  it("holds through the whip cracks of 128 masses released from the horizontal", () => {
    // Every fixed step up to 7 680 per second breaks on this start
    // (docs/decisions.md, decision 5); the step taken from the tensions carries
    // it through, at 60 substeps a frame on average. Measured: 4.6e-3.
    const { worst, state } = run(Chain.uniform(128), () => Math.PI / 2, 4);
    expect(state.theta.every(Number.isFinite)).toBe(true);
    expect(state.omega.every(Number.isFinite)).toBe(true);
    expect(worst).toBeLessThan(2e-2);
  });
});

describe("the time budget of a frame (decision 15)", () => {
  it("simulates the whole interval when no deadline is given", () => {
    const chain = Chain.uniform(8);
    const state = restingState(8);
    state.theta.fill(1);
    const result = new Stepper(chain).advance(state, 1 / 60, G);
    expect(result.simulated).toBe(1 / 60);
  });

  it("stops short when the deadline has passed, and says how much time it simulated", () => {
    // The clock is read every eight substeps, so a deadline already past
    // stops the advance after the first eight: the rest is slow motion.
    const chain = Chain.uniform(64);
    const state = restingState(64);
    state.theta.fill(1);
    const result = new Stepper(chain).advance(
      state,
      1 / 60,
      G,
      null,
      Number.NEGATIVE_INFINITY,
    );
    expect(result.substeps).toBe(8);
    expect(result.simulated).toBeGreaterThan(0);
    expect(result.simulated).toBeLessThan(1 / 60);
  });
});

// The energy is a quadratic form in the rates (PH-2), and in the equations of
// motion the rates appear only squared (PH-3): both are the same with every
// rate reversed, so the motion is the same with time reversed.
describe("time run backwards (docs/decisions.md, decision 28; PH-2, PH-3)", () => {
  /** The piece's raised start for n masses: to one side, at rest. */
  function raised(n: number): ChainState {
    const state = restingState(n);
    state.theta.forEach((_, i) => {
      state.theta[i] = 2.2 + (0.7 * i) / Math.max(1, n - 1);
    });
    return state;
  }

  it("keeps every mass where it is, moving the opposite way, with the same energy", () => {
    const chain = Chain.uniform(3);
    const state = raised(3);
    new Stepper(chain).advance(state, 0.7, G);
    const theta = Float64Array.from(state.theta);
    const omega = Float64Array.from(state.omega);
    const energy = chain.energy(state.theta, state.omega, G);
    reverseMotion(state);
    expect(Array.from(state.theta)).toEqual(Array.from(theta));
    expect(Array.from(state.omega)).toEqual(Array.from(omega).map((w) => -w));
    expect(chain.energy(state.theta, state.omega, G)).toBeCloseTo(energy, 12);
  });

  // Chaos grows the integration's tiny errors, so how close the chain comes
  // back depends on how chaotic it is: one mass comes back to rounding, two
  // masses after a second each way to within about a ten-millionth of a
  // radian, far closer than the thousandth twins are born apart.
  it.each([
    [1, 1e-9],
    [2, 1e-6],
  ])(
    "brings a chain back to its start (n = %i, within %s): a second forwards, reversed, a second forwards, reversed again",
    (n, within) => {
      const chain = Chain.uniform(n);
      const state = raised(n);
      const start = raised(n);
      const stepper = new Stepper(chain);
      for (let frame = 0; frame < 60; frame++) {
        stepper.advance(state, 1 / 60, G);
      }
      reverseMotion(state);
      for (let frame = 0; frame < 60; frame++) {
        stepper.advance(state, 1 / 60, G);
      }
      reverseMotion(state);
      state.theta.forEach((angle, i) => {
        expect(Math.abs(angle - (start.theta[i] ?? 0))).toBeLessThan(within);
      });
      state.omega.forEach((rate) => {
        expect(Math.abs(rate)).toBeLessThan(within);
      });
    },
  );
});
