import { describe, expect, it } from "vitest";

import { Chain, createHand } from "./chain.ts";
import { Stepper, restingState } from "./step.ts";

// The hand is not in the paper: a spring and a damper between the pointer and
// one mass, an external force that the tension route (PH-4) takes in the same
// single pass.

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

describe("a hand that holds one mass", () => {
  it.each([1, 2, 5, 16, 64])(
    "PH-4 with the hand's force: Newton's law holds for every one of %i masses",
    (n) => {
      // The accelerations that alpha implies through the kinematics, and the
      // tensions, must satisfy m a = m g + F - T_i e_i + T_{i+1} e_{i+1} for
      // every mass, F being the hand's force on the held one. These 2n
      // equations have one solution, so this pins both alpha and T.
      const draw = random(7 + n);
      for (let trial = 0; trial < 20; trial++) {
        const m = Float64Array.from(
          { length: n },
          () => 10 ** (2 * draw() - 1),
        );
        const l = Float64Array.from({ length: n }, () => 0.2 + 4.8 * draw());
        const g = 1 + 19 * draw();
        const chain = new Chain(m, l);
        const theta = Float64Array.from(
          { length: n },
          () => (2 * draw() - 1) * Math.PI,
        );
        const omega = l.map(
          (length) => 3 * (2 * draw() - 1) * Math.sqrt(g / length),
        );
        // every grip from a rubber band to a firm hand, damped from a tenth of
        // critical to critical for the mass it holds
        const hand = createHand(
          chain,
          Math.floor(draw() * n),
          2 + 58 * draw(),
          0.1 + 0.9 * draw(),
        );
        hand.x = 4 * (2 * draw() - 1);
        hand.y = 4 * (2 * draw() - 1);
        hand.vx = 2 * draw() - 1;
        hand.vy = 2 * draw() - 1;
        const alpha = new Float64Array(n);
        const tension = new Float64Array(n);
        chain.solve(theta, omega, g, alpha, tension, hand);

        // Positions, velocities and accelerations of the masses, down the chain.
        let px = 0;
        let py = 0;
        let vx = 0;
        let vy = 0;
        let ax = 0;
        let ay = 0;
        let walked = 0;
        const rows: number[][] = [];
        let force = [0, 0];
        for (let i = 0; i < n; i++) {
          const s = Math.sin(at(theta, i));
          const c = Math.cos(at(theta, i));
          const li = at(l, i);
          const w = at(omega, i);
          px += li * s;
          py -= li * c;
          vx += li * w * c;
          vy += li * w * s;
          ax += li * (at(alpha, i) * c - w * w * s);
          ay += li * (at(alpha, i) * s + w * w * c);
          // a mass's acceleration is a sum down the chain, which can cancel
          walked += li * (Math.abs(at(alpha, i)) + w * w);
          rows.push([s, -c, ax, ay, walked]);
          if (i === hand.index) {
            force = [
              hand.stiffness * (hand.x - px) - hand.damping * (vx - hand.vx),
              hand.stiffness * (hand.y - py) - hand.damping * (vy - hand.vy),
            ];
          }
        }
        // the pull the drawing reads is the force the motion obeys
        const pull = new Float64Array(2);
        chain.handForce(theta, omega, hand, pull);
        const [forceX = 0, forceY = 0] = force;
        const forceSize = Math.abs(forceX) + Math.abs(forceY);
        expect(Math.abs(at(pull, 0) - forceX)).toBeLessThanOrEqual(
          1e-12 * forceSize,
        );
        expect(Math.abs(at(pull, 1) - forceY)).toBeLessThanOrEqual(
          1e-12 * forceSize,
        );
        for (let i = 0; i < n; i++) {
          const [ex = 0, ey = 0, mx = 0, my = 0, terms = 0] = rows[i] ?? [];
          const [bx = 0, by = 0] = rows[i + 1] ?? [];
          const below = i + 1 < n ? at(tension, i + 1) : 0;
          const [fx = 0, fy = 0] = i === hand.index ? force : [0, 0];
          const mi = at(m, i);
          const rx = mi * mx - fx + at(tension, i) * ex - below * bx;
          const ry = mi * my + mi * g - fy + at(tension, i) * ey - below * by;
          const size =
            mi * terms +
            mi * g +
            Math.abs(fx) +
            Math.abs(fy) +
            Math.abs(at(tension, i)) +
            Math.abs(below);
          expect(Math.hypot(rx, ry)).toBeLessThan(1e-12 * size);
        }
      }
    },
  );

  it.each([1, 2, 8, 64])(
    "brings the held mass of %i to the hand, and keeps it there",
    (n) => {
      const chain = Chain.uniform(n);
      const state = restingState(n);
      state.theta.fill(0.3);
      const hand = createHand(chain, n - 1);
      // within reach of the tip: a single rod reaches only its own circle
      hand.x = n === 1 ? 0.6 : 0.5;
      hand.y = n === 1 ? -0.8 : -0.4;
      const stepper = new Stepper(chain);
      for (let frame = 0; frame < 120; frame++) {
        stepper.advance(state, 1 / 60, 9.81, hand);
      }
      const x = new Float64Array(n);
      const y = new Float64Array(n);
      chain.positions(state.theta, x, y);
      const off = Math.hypot(at(x, n - 1) - hand.x, at(y, n - 1) - hand.y);
      expect(off).toBeLessThan(0.02);
    },
  );

  it("is stiff for the whole chain and critically damped for the mass it holds", () => {
    // stiffness = total mass * rate^2; damping = 2 sqrt(stiffness * held mass);
    // the fastest rate it adds is 2 * rate * sqrt(total mass / held mass).
    const chain = new Chain([1, 3], [1, 1]);
    const hand = createHand(chain, 0, 10);
    expect(hand.stiffness).toBe(400);
    expect(hand.damping).toBe(40);
    expect(hand.fastest).toBe(40);
  });

  it("takes a damping ratio, for a hand that bounces like a rubber band", () => {
    // damping = ratio * 2 sqrt(stiffness * held mass). Below critical, the
    // held mass's fastest rate stays 2 * rate * sqrt(total / held); above
    // it, the faster of its two decays stays under ratio times that.
    const chain = new Chain([1, 3], [1, 1]);
    const bouncy = createHand(chain, 0, 10, 0.5);
    expect(bouncy.stiffness).toBe(400);
    expect(bouncy.damping).toBe(20);
    expect(bouncy.fastest).toBe(40);
    const heavy = createHand(chain, 0, 10, 2);
    expect(heavy.damping).toBe(80);
    expect(heavy.fastest).toBe(80);
  });

  it("pulls with its spring alone when it moves with the mass it holds", () => {
    // One rod of 2 m, horizontal and turning at 0.5 rad/s: the mass is at
    // (2, 0), moving at (0, 1). A hand 0.25 m to its right, moving with it,
    // pulls with stiffness * 0.25 m; held still, it adds damping * 1 m/s
    // against the motion.
    const chain = new Chain([1], [2]);
    const theta = Float64Array.of(Math.PI / 2);
    const omega = Float64Array.of(0.5);
    const hand = createHand(chain, 0, 10, 0.5);
    hand.x = 2.25;
    hand.y = 0;
    hand.vx = 0;
    hand.vy = 1;
    const pull = new Float64Array(2);
    chain.handForce(theta, omega, hand, pull);
    expect(at(pull, 0)).toBeCloseTo(100 * 0.25, 12);
    expect(at(pull, 1)).toBeCloseTo(0, 12);
    hand.vy = 0;
    chain.handForce(theta, omega, hand, pull);
    expect(at(pull, 0)).toBeCloseTo(25, 12);
    expect(at(pull, 1)).toBeCloseTo(-10 * 1, 12);
  });

  it("refuses a mass the chain does not have, and a grip that is not one", () => {
    const chain = Chain.uniform(3);
    expect(() => createHand(chain, 3)).toThrow();
    expect(() => createHand(chain, -1)).toThrow();
    expect(() => createHand(chain, 1.5)).toThrow();
    expect(() => createHand(chain, 0, 0)).toThrow();
    expect(() => createHand(chain, 0, Number.NaN)).toThrow();
    expect(() => createHand(chain, 0, 10, -0.1)).toThrow();
    expect(() => createHand(chain, 0, 10, Number.POSITIVE_INFINITY)).toThrow();
  });
});
