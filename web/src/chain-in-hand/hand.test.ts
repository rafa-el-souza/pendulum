import { describe, expect, it } from "vitest";

import { Chain, createHand } from "../physics/chain.ts";
import { Stepper, restingState } from "../physics/step.ts";
import { HAND, handDamping } from "./parameters.ts";

// The hand's steps through the physics (PH-4 with the hand's force). One mass
// on a rod of 1 m, held by a hand level with the pivot at (1, 0), settles
// where the spring's torque about the pivot, stiffness * cos(theta), balances
// gravity's, m g sin(theta). With the chain's mass all in the held one, that
// is tan(theta) = rate^2 / g, and the mass hangs sqrt(2 - 2 sin(theta)) m
// from the hand.

const G = 9.81;

/** One mass held at (1, 0) by the hand at `rate`, after 40 s. */
function settle(rate: number): { theta: number; omega: number; off: number } {
  const chain = Chain.uniform(1);
  const state = restingState(1);
  const hand = createHand(chain, 0, rate, handDamping(rate));
  hand.x = 1;
  hand.y = 0;
  const stepper = new Stepper(chain);
  for (let frame = 0; frame < 60 * 40; frame++) {
    stepper.advance(state, 1 / 60, G, hand);
  }
  const x = new Float64Array(1);
  const y = new Float64Array(1);
  chain.positions(state.theta, x, y);
  return {
    theta: state.theta[0] ?? Number.NaN,
    omega: state.omega[0] ?? Number.NaN,
    off: Math.hypot((x[0] ?? Number.NaN) - 1, y[0] ?? Number.NaN),
  };
}

describe("the hand's steps", () => {
  it.each(HAND.values)(
    "at %i rad/s, a mass held level with the pivot settles where its spring and gravity balance",
    (rate) => {
      const { theta, omega } = settle(rate);
      expect(theta).toBeCloseTo(Math.atan2(rate * rate, G), 9);
      expect(Math.abs(omega)).toBeLessThan(1e-8);
    },
  );

  it("hang the mass more than half a metre below the hand at the elastic end, and under a centimetre at the firm end", () => {
    expect(settle(HAND.values[0] ?? Number.NaN).off).toBeGreaterThan(0.5);
    expect(settle(HAND.values.at(-1) ?? Number.NaN).off).toBeLessThan(0.01);
  });
});
