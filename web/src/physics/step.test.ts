import { describe, expect, it } from "vitest";

import { Chain, createHand, gravity, type Gravity } from "./chain.ts";
import { kickPull, type Drive } from "./drive.ts";
import {
  PeriodTension,
  Stepper,
  restingState,
  reverseMotion,
  type ChainState,
  type Shake,
} from "./step.ts";

const G = 9.81;
const DOWN = gravity(G);

/** The energy that lifts the hanging chain to the horizontal: a scale for energy errors. */
function lift(chain: Chain, g: number): number {
  let depth = 0;
  return chain.masses.reduce((sum, m, i) => {
    depth += chain.lengths[i] ?? Number.NaN;
    return sum + g * m * depth;
  }, 0);
}

/** Runs a chain released at rest from the given angles, frame by frame at 60 per second, under gravity g. */
function run(
  chain: Chain,
  angles: (i: number) => number,
  seconds: number,
  g: Gravity = DOWN,
) {
  const state = restingState(chain.n);
  state.theta.forEach((_, i) => {
    state.theta[i] = angles(i);
  });
  const stepper = new Stepper(chain);
  const start = chain.energy(state.theta, state.omega, g);
  const scale = lift(chain, Math.hypot(g.x, g.y));
  let worst = 0;
  for (let frame = 0; frame < 60 * seconds; frame++) {
    stepper.advance(state, 1 / 60, g);
    const drift = Math.abs(chain.energy(state.theta, state.omega, g) - start);
    worst = Math.max(worst, drift / scale);
  }
  return { worst, state };
}

/** The piece's raised start for n masses: to one side, at rest. */
function raised(n: number): ChainState {
  const state = restingState(n);
  state.theta.forEach((_, i) => {
    state.theta[i] = 2.2 + (0.7 * i) / Math.max(1, n - 1);
  });
  return state;
}

/** The angular momentum about the pivot, the sum of m (x v_y - y v_x). */
function angularMomentum(chain: Chain, state: ChainState): number {
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  let total = 0;
  for (let i = 0; i < chain.n; i++) {
    const l = chain.lengths[i] ?? Number.NaN;
    const s = Math.sin(state.theta[i] ?? Number.NaN);
    const c = Math.cos(state.theta[i] ?? Number.NaN);
    const w = state.omega[i] ?? Number.NaN;
    x += l * s;
    y -= l * c;
    vx += l * w * c;
    vy += l * w * s;
    total += (chain.masses[i] ?? Number.NaN) * (x * vy - y * vx);
  }
  return total;
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
  new Stepper(chain, { maxStep }).advance(state, period, DOWN);
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
      new Stepper(chain).advance(restingState(128), 1 / 60, DOWN).substeps,
    ).toBe(45);
  });

  it("is at most 1/480 s, however slow the chain", () => {
    // One mass on 1 m at rest: the rate is 2 sqrt(9.81) = 6.3 rad/s, and
    // 0.3 / 6.3 = 0.048 s would be too coarse for RK4 to keep the energy.
    const chain = Chain.uniform(1);
    expect(
      new Stepper(chain).advance(restingState(1), 1 / 60, DOWN).substeps,
    ).toBe(8);
  });

  it("shortens as the chain spins, through the tension that the spin puts in the rods", () => {
    // One mass on 1 m spinning at 400 rad/s: T = m (l omega^2 + g cos theta),
    // so the rate is about 2 * 400 = 800 rad/s and the substep 3.75e-4 s.
    const chain = Chain.uniform(1);
    const state = restingState(1);
    state.omega[0] = 400;
    expect(new Stepper(chain).advance(state, 1 / 60, DOWN).substeps).toBe(45);
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
    const result = new Stepper(chain).advance(state, 1 / 60, DOWN);
    expect(result.simulated).toBe(1 / 60);
  });

  it("stops short when the deadline has passed, and says how much time it simulated", () => {
    // The clock is read every eight substeps, so a deadline already past
    // stops the advance after the first eight: the rest is slow motion.
    const chain = Chain.uniform(64);
    const state = restingState(64);
    state.theta.fill(1);
    const result = new Stepper(chain).advance(state, 1 / 60, DOWN, {
      deadline: Number.NEGATIVE_INFINITY,
    });
    expect(result.substeps).toBe(8);
    expect(result.simulated).toBeGreaterThan(0);
    expect(result.simulated).toBeLessThan(1 / 60);
  });
});

// The energy is a quadratic form in the rates (PH-2), and in the equations of
// motion the rates appear only squared (PH-3): both are the same with every
// rate reversed, so the motion is the same with time reversed.
describe("time run backwards (docs/decisions.md, decision 28; PH-2, PH-3)", () => {
  it("keeps every mass where it is, moving the opposite way, with the same energy", () => {
    const chain = Chain.uniform(3);
    const state = raised(3);
    new Stepper(chain).advance(state, 0.7, DOWN);
    const theta = Float64Array.from(state.theta);
    const omega = Float64Array.from(state.omega);
    const energy = chain.energy(state.theta, state.omega, DOWN);
    reverseMotion(state);
    expect(Array.from(state.theta)).toEqual(Array.from(theta));
    expect(Array.from(state.omega)).toEqual(Array.from(omega).map((w) => -w));
    expect(chain.energy(state.theta, state.omega, DOWN)).toBeCloseTo(
      energy,
      12,
    );
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
        stepper.advance(state, 1 / 60, DOWN);
      }
      reverseMotion(state);
      for (let frame = 0; frame < 60; frame++) {
        stepper.advance(state, 1 / 60, DOWN);
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

// Gravity turned by an angle turns the whole motion by it (PH-4; the oracle's
// states are checked turned in chain.test.ts). Its strength g and the rods'
// lengths are the only scales of time, so a chain let go from rest under a
// weaker gravity goes through the same motion, slower by the square root of
// the ratio; what it changes beyond the pace is how far a throw carries.
describe("gravity of any strength, turned to any direction (docs/decisions.md, decision 29; PH-2, PH-4)", () => {
  it.each([0.4, Math.PI / 2, Math.PI, -2.5])(
    "leaves a chain hanging along gravity at rest, gravity turned by %s rad",
    (turn) => {
      const chain = Chain.uniform(8);
      const state = restingState(8);
      state.theta.fill(turn);
      const stepper = new Stepper(chain);
      for (let frame = 0; frame < 600; frame++) {
        stepper.advance(state, 1 / 60, gravity(G, turn));
      }
      state.theta.forEach((angle) => {
        expect(Math.abs(angle - turn)).toBeLessThan(1e-12);
      });
    },
  );

  it("keeps the energy along chaotic motion with gravity turned, as it does straight down", () => {
    // The first check of the energy above, turned a quarter turn.
    const turn = Math.PI / 2;
    const { worst } = run(
      Chain.uniform(2),
      (i) => turn + ([2.2, 2.9][i] ?? 0),
      10,
      gravity(G, turn),
    );
    expect(worst).toBeLessThan(2e-6);
  });

  it("with no gravity, keeps a thrown chain's energy and its angular momentum about the pivot", () => {
    // Nothing outside pulls or turns it: only the pivot holds it, and the
    // pivot's force has no moment about itself. Measured: 2.3e-8 and 3.8e-9
    // of their starting values.
    const chain = Chain.uniform(3);
    const state: ChainState = {
      theta: Float64Array.of(0.3, 1.2, -0.5),
      omega: Float64Array.of(3, 4, 5),
    };
    const none = gravity(0);
    const energy = chain.energy(state.theta, state.omega, none);
    const momentum = angularMomentum(chain, state);
    const stepper = new Stepper(chain);
    for (let frame = 0; frame < 600; frame++) {
      stepper.advance(state, 1 / 60, none);
    }
    expect(
      Math.abs(chain.energy(state.theta, state.omega, none) / energy - 1),
    ).toBeLessThan(1e-7);
    expect(Math.abs(angularMomentum(chain, state) / momentum - 1)).toBeLessThan(
      2e-8,
    );
  });

  it("weaker, takes a chain let go from rest through the same motion, slower by the square root of the ratio", () => {
    // A second under Earth's gravity against sqrt(9.81 / 1.62) s under the
    // Moon's: the same angles, and rates slower by sqrt(1.62 / 9.81). With
    // the piece's substeps the two differ by the integration's error, 2.7e-8
    // rad; with substeps of 1/7680 s, measured, by 7.6e-13.
    const chain = Chain.uniform(2);
    const fine = { maxStep: 1 / 7680 };
    const earth = raised(2);
    const moon = raised(2);
    new Stepper(chain, fine).advance(earth, 1, gravity(9.81));
    new Stepper(chain, fine).advance(
      moon,
      Math.sqrt(9.81 / 1.62),
      gravity(1.62),
    );
    earth.theta.forEach((angle, i) => {
      expect(Math.abs((moon.theta[i] ?? Number.NaN) - angle)).toBeLessThan(
        1e-11,
      );
    });
    earth.omega.forEach((rate, i) => {
      const slower = rate * Math.sqrt(1.62 / 9.81);
      expect(Math.abs((moon.omega[i] ?? Number.NaN) - slower)).toBeLessThan(
        1e-11,
      );
    });
  });
});

/** A copy of a state, to advance apart from it. */
function copied(state: ChainState): ChainState {
  return {
    theta: Float64Array.from(state.theta),
    omega: Float64Array.from(state.omega),
  };
}

/** The tensions of one state, as solve() gives them. */
function tensionsOf(chain: Chain, state: ChainState, g: Gravity): Float64Array {
  const alpha = new Float64Array(chain.n);
  const tension = new Float64Array(chain.n);
  chain.solve(state.theta, state.omega, g, alpha, tension);
  return tension;
}

// The colour of the tension (docs/decisions.md, decision 35) shows each rod's
// tension averaged over the time a frame moves the chain, as the substeps of
// RK4 meet it, so that a tension that changes within a frame is shown by its
// mean rather than by whichever instant the frame ends on.
describe("each rod's mean tension over an advance (decision 35; PH-3, PH-4)", () => {
  it("is the weight of what hangs from the rod, for a chain hanging at rest", () => {
    // M_j g, with M_j the mass at or below rod j (PH-3), here 1, 0.5 and 0.3 kg.
    const chain = new Chain([0.5, 0.2, 0.3], [0.3, 0.3, 0.4]);
    const mean = new Float64Array(3);
    new Stepper(chain).advance(restingState(3), 1 / 60, DOWN, {
      meanTension: mean,
    });
    [1, 0.5, 0.3].forEach((below, j) => {
      expect(mean[j]).toBeCloseTo(G * below, 12);
    });
  });

  it("is the tension averaged over the time advanced, to fourth order in the substep", () => {
    // Eight masses two seconds after the piece's raised start, whipping:
    // within a frame their tensions change by several weights. The reference
    // is the trapezoid rule over 4 000 instants of a run with substeps 40
    // times finer, itself within 5e-9 of the scale. Measured: 8.5e-7 of the
    // scale with the piece's substeps, and 16 times less with half as long.
    const chain = Chain.uniform(8);
    const state = raised(8);
    new Stepper(chain).advance(state, 2, DOWN);
    const dt = 1 / 60;

    const samples = 4000;
    const fine = copied(state);
    const fineStepper = new Stepper(chain, { maxStep: 1 / 19200 });
    const sampled = new Float64Array(8);
    let before = tensionsOf(chain, fine, DOWN);
    for (let k = 0; k < samples; k++) {
      fineStepper.advance(fine, dt / samples, DOWN);
      const after = tensionsOf(chain, fine, DOWN);
      after.forEach((t, j) => {
        sampled[j] =
          (sampled[j] ?? 0) + (0.5 * ((before[j] ?? 0) + t)) / samples;
      });
      before = after;
    }
    const scale = Math.max(...Array.from(sampled, Math.abs));

    const mean = new Float64Array(8);
    const off = (maxStep: number): number => {
      new Stepper(chain, { maxStep }).advance(copied(state), dt, DOWN, {
        meanTension: mean,
      });
      return Math.max(
        ...Array.from(sampled, (t, j) => Math.abs((mean[j] ?? Number.NaN) - t)),
      );
    };
    const halved = off(1 / 960);
    const piece = off(1 / 480);
    expect(piece).toBeLessThan(2e-6 * scale);
    expect(piece / halved).toBeGreaterThan(12);

    // and it is neither instant at either end of the frame
    const end = copied(state);
    new Stepper(chain).advance(end, dt, DOWN);
    const differs = (instant: Float64Array): number =>
      Math.max(...Array.from(instant, (t, j) => Math.abs(t - (mean[j] ?? 0))));
    expect(differs(tensionsOf(chain, state, DOWN))).toBeGreaterThan(
      1e-2 * scale,
    );
    expect(differs(tensionsOf(chain, end, DOWN))).toBeGreaterThan(1e-2 * scale);
  });

  it("is over the time simulated when the deadline stops the advance short", () => {
    const chain = Chain.uniform(64);
    const state = raised(64);
    const short = new Float64Array(64);
    const { simulated } = new Stepper(chain).advance(
      copied(state),
      1 / 60,
      DOWN,
      { deadline: Number.NEGATIVE_INFINITY, meanTension: short },
    );
    expect(simulated).toBeLessThan(1 / 60);
    const exact = new Float64Array(64);
    new Stepper(chain).advance(copied(state), simulated, DOWN, {
      meanTension: exact,
    });
    const scale = Math.max(...Array.from(exact, Math.abs));
    exact.forEach((t, j) => {
      expect(Math.abs((short[j] ?? Number.NaN) - t)).toBeLessThan(1e-9 * scale);
    });
  });

  it("is the tension of the instant when no time goes by", () => {
    const chain = Chain.uniform(3);
    const state = raised(3);
    new Stepper(chain).advance(state, 0.4, DOWN);
    const mean = new Float64Array(3);
    new Stepper(chain).advance(state, 0, DOWN, { meanTension: mean });
    expect(Array.from(mean)).toEqual(
      Array.from(tensionsOf(chain, state, DOWN)),
    );
  });
});

/** The pivot shaken up and down: a cos(W t) along the vertical. */
function shaken(amplitude: number, rate: number, phase = 0): Shake {
  return { amplitude, rate, x: 0, y: 1, phase };
}

/** One pendulum's angle over time, shaken, let go at rest from `start`, sampled every 1/240 s. */
function swing(
  start: number,
  amplitude: number,
  rate: number,
  seconds: number,
): number[] {
  const chain = Chain.uniform(1);
  const state: ChainState = {
    theta: Float64Array.of(start),
    omega: Float64Array.of(0),
  };
  const stepper = new Stepper(chain);
  const angles: number[] = [];
  const frame = 1 / 240;
  let phase = 0;
  for (let k = 0; k < seconds / frame; k++) {
    stepper.advance(state, frame, DOWN, {
      shake: shaken(amplitude, rate, phase),
    });
    phase += rate * frame;
    angles.push(state.theta[0] ?? Number.NaN);
  }
  return angles;
}

/** The mean time between the moments a slow swing, sampled every 1/240 s, crosses its centre going up. */
function period(angles: number[], centre: number): number {
  const ups: number[] = [];
  // a crossing counts once the swing has been well below the centre, so that
  // the shake's own small quiver across it is not counted
  let armed = false;
  angles.forEach((angle, k) => {
    const off = angle - centre;
    if (off < -0.02) armed = true;
    if (armed && off > 0) {
      ups.push(k / 240);
      armed = false;
    }
  });
  const first = ups[1] ?? Number.NaN;
  const last = ups.at(-1) ?? Number.NaN;
  return (last - first) / (ups.length - 2);
}

// A pivot shaken along a line (docs/decisions.md, decision 36). In its frame,
// every mass feels gravity and, besides, a W² cos(W t) along the line, so the
// chain moves as under a gravity that oscillates, and the tension route
// holds there unchanged (PH-4). Kapitza (1951), and Landau and Lifshitz,
// Mechanics, §30: for one pendulum of length l shaken along the vertical,
// with a ≪ l and W ≫ sqrt(g / l), the slow motion is that in the potential
// m g l (−cos φ + a² W² sin² φ / (4 g l)). Upside down it is stable when
// a² W² > 2 g l, and swings about it at sqrt(a² W² / (2 l²) − g / l);
// hanging, at sqrt(g / l + a² W² / (2 l²)).
describe("a pivot shaken up and down (decision 36; PH-4, PH-5)", () => {
  it("holds one pendulum upside down when a² W² > 2 g l, and lets it fall when less", () => {
    // 2 cm: 2 g l = 19.6 m²/s², so the edge is at W = 221 rad/s. Measured
    // over 30 s from 0.1 rad off: at 220 rad/s it falls, at 225 it stands.
    const off = (angles: number[]): number =>
      Math.max(...angles.map((angle) => Math.abs(angle - Math.PI)));
    expect(off(swing(Math.PI - 0.1, 0.02, 230, 30))).toBeLessThan(0.2);
    expect(off(swing(Math.PI - 0.1, 0.02, 215, 30))).toBeGreaterThan(1);
  });

  it("swings one pendulum about upside down, and about hanging, at the rates of the averaged potential", () => {
    // 2 cm at 300 rad/s: a² W² / (2 l²) = 18 s⁻², so upside down the swing
    // takes 2π / sqrt(18 − 9.81) = 2.1955 s, and hanging 2π / sqrt(27.81) =
    // 1.1915 s, against 2.006 s unshaken. Measured: 2.1976 s and 1.1917 s,
    // 0.09% and 0.02% off, as the averaging leaves terms of order a / l.
    const up = period(swing(Math.PI - 0.05, 0.02, 300, 30), Math.PI);
    const down = period(swing(0.05, 0.02, 300, 20), 0);
    expect(Math.abs(up / ((2 * Math.PI) / Math.sqrt(18 - G)) - 1)).toBeLessThan(
      0.005,
    );
    expect(
      Math.abs(down / ((2 * Math.PI) / Math.sqrt(18 + G)) - 1),
    ).toBeLessThan(0.005);
  });

  it("keeps a chain on one line through the pivot on it, upright, whatever the shake", () => {
    // PH-5: every rod on one line accelerates like one pendulum at its first
    // angle, here upright, where gravity along the line has no grip.
    const chain = Chain.uniform(8);
    const state = restingState(8);
    state.theta.fill(Math.PI);
    new Stepper(chain).advance(state, 1, DOWN, { shake: shaken(0.02, 300) });
    state.theta.forEach((angle) => {
      expect(angle).toBe(Math.PI);
    });
  });

  it("takes substeps no longer than 0.3 / W", () => {
    // One mass at rest, hanging: unshaken it takes substeps of 1/480 s.
    const chain = Chain.uniform(1);
    const { substeps } = new Stepper(chain).advance(
      restingState(1),
      1 / 60,
      DOWN,
      {
        shake: shaken(0.001, 2000),
      },
    );
    expect(substeps).toBeGreaterThanOrEqual(Math.ceil((1 / 60) * (2000 / 0.3)));
  });
});

describe("each rod's tension over whole periods of the shake (decision 36; PH-4, PH-5)", () => {
  it("is the weight below each rod, pushing, for a chain standing upright, while the instant swings by a W² / g weights", () => {
    // Upright and still, rod j pushes with M_j times the gravity along the
    // line, 9.81 + 1 800 cos(W t) for 2 cm at 300 rad/s: 185 weights either
    // way of one, pushing. Over a whole period the shake averages out.
    // Measured: within 6.4e-6 of a weight, where the mean over a frame of
    // 1/120 s is up to 139 weights off.
    const chain = new Chain([0.5, 0.2, 0.3], [0.3, 0.3, 0.4]);
    const state = restingState(3);
    state.theta.fill(Math.PI);
    const meter = new PeriodTension(3);
    const stepper = new Stepper(chain);
    const rate = 300;
    let phase = 0.7;
    let lowest = 0;
    let highest = 0;
    for (let k = 0; k < 9; k++) {
      stepper.advance(state, 1 / 120, DOWN, {
        shake: shaken(0.02, rate, phase),
        periodTension: meter,
      });
      phase += rate / 120;
      const top =
        tensionsOf(chain, state, {
          x: 0,
          y: -G - 0.02 * rate * rate * Math.cos(phase),
        })[0] ?? Number.NaN;
      lowest = Math.min(lowest, top);
      highest = Math.max(highest, top);
    }
    expect(meter.closed).toBe(true);
    [1, 0.5, 0.3].forEach((below, j) => {
      expect(Math.abs((meter.mean[j] ?? Number.NaN) + G * below)).toBeLessThan(
        1e-3 * G * below,
      );
    });
    // and the instant, which a frame's mean would show, swings far wider
    expect(highest - lowest).toBeGreaterThan(100 * G);
  });

  it("closes a period at each whole turn of the shake's phase, across advances, once it has seen one whole", () => {
    // 2 cm at 300 rad/s: a period is 20.9 ms, and an advance of 1/120 s
    // moves the phase by 2.5 rad. From 0.7, the first turn ends in the third
    // advance, after part of a period only, and the first whole period ends
    // in the fifth.
    const chain = Chain.uniform(2);
    const meter = new PeriodTension(2);
    const stepper = new Stepper(chain);
    const state = restingState(2);
    const advance = (k: number): void => {
      stepper.advance(state, 1 / 120, DOWN, {
        shake: shaken(0.02, 300, 0.7 + 2.5 * k),
        periodTension: meter,
      });
    };
    for (let k = 0; k < 4; k++) advance(k);
    expect(meter.closed).toBe(false);
    advance(4);
    expect(meter.closed).toBe(true);
  });
});

// The music's command for a frame (docs/decisions.md, decision 74): forces
// from outside the chain, which the paper does not have, taken by the tension
// route as it takes the hand and gravity (PH-4), each stage of RK4 at its own
// instant, so that the chain and its twins, moving in pieces and steps of
// their own, feel the same force at the same instant.

/** A frame at 0.8 of real time and 60 frames a second. */
const FRAME = 0.8 / 60;

/** A command of `span` s with nothing in it. */
function emptyDrive(span: number): Drive {
  return {
    span,
    tilt: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    kicks: [],
    hands: [],
    drag: [0, 0],
    heat: null,
  };
}

/**
 * The music at its fullest over the frame that starts `t0` s in: gravity
 * swaying 0.3 rad either way once a second, the pivot kicked 3 cm sideways
 * every 0.4 s, a hand on the tip going round a circle of 15 cm in 2 s, and a
 * drag of 0.2 a second.
 */
function music(chain: Chain, t0: number, span: number): Drive {
  const sway = (t: number): Gravity => {
    const turned = gravity(G, 0.3 * Math.sin(2 * Math.PI * t));
    return { x: turned.x - DOWN.x, y: turned.y - DOWN.y };
  };
  const kicks = [];
  const beat = Math.floor(t0 / 0.4);
  for (let b = beat; b > beat - 4 && b >= 0; b--) {
    kicks.push({
      start: 0.4 * b - t0,
      x: 0.03,
      y: 0,
      attack: 0.015,
      decay: 0.1,
    });
  }
  const tip = createHand(chain, chain.n - 1, 12, 1);
  const round = (t: number) => ({
    x: 0.15 * Math.sin(Math.PI * t),
    y: -0.85 + 0.15 * Math.cos(Math.PI * t),
  });
  return {
    span,
    tilt: [sway(t0), sway(t0 + span)],
    kicks,
    hands: [
      {
        index: tip.index,
        stiffness: tip.stiffness,
        damping: tip.damping,
        fastest: tip.fastest,
        from: round(t0),
        to: round(t0 + span),
      },
    ],
    drag: [0.2, 0.2],
    heat: null,
  };
}

/** How far apart two chains look, as a share of the length (the twins' measure). */
function apartOf(chain: Chain, a: ChainState, b: ChainState): number {
  const n = chain.n;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const u = new Float64Array(n);
  const v = new Float64Array(n);
  chain.positions(a.theta, x, y);
  chain.positions(b.theta, u, v);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += ((x[i] ?? 0) - (u[i] ?? 0)) ** 2 + ((y[i] ?? 0) - (v[i] ?? 0)) ** 2;
  }
  return Math.sqrt(sum / n) / chain.totalLength;
}

const NONE: Gravity = { x: 0, y: 0 };

describe("the music's command (decision 74; PH-2, PH-4)", () => {
  it("left empty, moves the chain as no command does, number for number: free, held and shaken, with the tension's mean", () => {
    for (const n of [2, 8]) {
      const chain = Chain.uniform(n);
      const plain = raised(n);
      const driven = raised(n);
      const one = new Stepper(chain);
      const other = new Stepper(chain);
      const hand = createHand(chain, n - 1, 20, 0.7);
      hand.x = 0.3;
      hand.y = -0.6;
      hand.vx = 0.4;
      const plainMean = new Float64Array(n);
      const drivenMean = new Float64Array(n);
      for (let frame = 0; frame < 180; frame++) {
        const held = frame < 60 ? hand : null;
        const shake =
          frame >= 120 ? shaken(0.001, 2 * Math.PI * 800, frame * 0.3) : null;
        for (let piece = 0; piece < 7; piece++) {
          one.advance(plain, FRAME / 7, DOWN, {
            hand: held,
            shake,
            meanTension: plainMean,
          });
          other.advance(driven, FRAME / 7, DOWN, {
            hand: held,
            shake,
            meanTension: drivenMean,
            drive: emptyDrive(FRAME),
            into: (piece * FRAME) / 7,
          });
        }
      }
      expect([...driven.theta]).toEqual([...plain.theta]);
      expect([...driven.omega]).toEqual([...plain.omega]);
      expect([...drivenMean]).toEqual([...plainMean]);
    }
  });

  it("drags every mass by −c m v: the energy falls by c times twice the kinetic energy over the time", () => {
    // dE/dt = −c Σ m v², from a swing that stays regular, over 5 s
    const n = 3;
    const chain = Chain.uniform(n);
    const state = restingState(n);
    state.theta.fill(0.6);
    const stepper = new Stepper(chain);
    const c = 0.3;
    const h = 1 / 4000;
    const drive: Drive = { ...emptyDrive(h), drag: [c, c] };
    const start = chain.energy(state.theta, state.omega, DOWN);
    let twice = 2 * chain.energy(state.theta, state.omega, NONE);
    let lost = 0;
    for (let k = 0; k < 4000 * 5; k++) {
      stepper.advance(state, h, DOWN, { drive });
      const next = 2 * chain.energy(state.theta, state.omega, NONE);
      lost += (c * h * (twice + next)) / 2;
      twice = next;
    }
    const end = chain.energy(state.theta, state.omega, DOWN);
    // most of the swing's energy goes in the 5 s, as it should
    expect(lost).toBeGreaterThan(
      0.5 *
        (start - chain.energy(new Float64Array(n), new Float64Array(n), DOWN)),
    );
    expect(Math.abs(start - end - lost)).toBeLessThan(1e-6 * lost);
  });

  it("kicks the pivot: one pendulum moves as under its pivot accelerating by the kick, seen from the pivot", () => {
    // l θ'' = −g sin θ − a(t) cos θ for a pivot accelerating by a(t) to the right
    const size = 0.05;
    const kick = { start: 0.1, x: size, y: 0, attack: 0.015, decay: 0.1 };
    const drive: Drive = { ...emptyDrive(1), kicks: [kick] };
    const state: ChainState = {
      theta: Float64Array.of(0.3),
      omega: Float64Array.of(0),
    };
    new Stepper(new Chain([1], [1]), { maxStep: 1e-4 }).advance(
      state,
      1,
      DOWN,
      { drive },
    );
    // the same by an RK4 of its own, in steps of 1e-5 s
    const rate = (t: number, angle: number): number =>
      -G * Math.sin(angle) -
      size *
        kickPull(t - kick.start, kick.attack, kick.decay) *
        Math.cos(angle);
    let angle = 0.3;
    let spin = 0;
    const h = 1e-5;
    for (let k = 0; k < 1e5; k++) {
      const t = k * h;
      const a1 = rate(t, angle);
      const a2 = rate(t + h / 2, angle + (h / 2) * spin);
      const a3 = rate(t + h / 2, angle + (h / 2) * (spin + (h / 2) * a1));
      const a4 = rate(t + h, angle + h * (spin + (h / 2) * a2));
      angle += h * (spin + (h / 6) * (a1 + a2 + a3));
      spin += (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    }
    // the kick moved it: unkicked it would be elsewhere
    const unkicked = { theta: Float64Array.of(0.3), omega: Float64Array.of(0) };
    new Stepper(new Chain([1], [1]), { maxStep: 1e-4 }).advance(
      unkicked,
      1,
      DOWN,
    );
    expect(Math.abs((unkicked.theta[0] ?? 0) - angle)).toBeGreaterThan(1e-3);
    expect(Math.abs((state.theta[0] ?? Number.NaN) - angle)).toBeLessThan(1e-9);
    expect(Math.abs((state.omega[0] ?? Number.NaN) - spin)).toBeLessThan(1e-8);
  });

  it("with the thermostat, brings the energy above rest to its target, from above and from below", () => {
    const n = 3;
    const chain = Chain.uniform(n);
    const scale = lift(chain, G);
    const cases: [ChainState, number][] = [
      [raised(n), 0.2],
      [
        { theta: new Float64Array(n).fill(0.15), omega: new Float64Array(n) },
        0.3,
      ],
    ];
    for (const [state, share] of cases) {
      const target = share * scale;
      const drive: Drive = {
        ...emptyDrive(FRAME),
        heat: { target: [target, target], gain: 3, floor: 0.01 * scale },
      };
      const stepper = new Stepper(chain);
      const before = chain.energyAboveRest(state.theta, state.omega, DOWN);
      expect(Math.abs(before / target - 1)).toBeGreaterThan(0.5);
      for (let frame = 0; frame < 75 * 5; frame++) {
        stepper.advance(state, FRAME, DOWN, { drive });
      }
      const after = chain.energyAboveRest(state.theta, state.omega, DOWN);
      expect(Math.abs(after / target - 1)).toBeLessThan(0.02);
    }
  });

  it("keeps a twin born on the chain with it, each moving in its own pieces and steps, as the chain and its twins do", () => {
    // The chain in 7 pieces a frame of steps up to 1/480 s, the twin in 4 of
    // steps up to 1/240 s (decision 20), three masses swinging regularly
    // under the music at its fullest for 10 s: each feels the force of each
    // instant, so they differ only by their steps. Held over each piece
    // instead, the force would part them by a few hundredths of the length.
    const n = 3;
    const chain = Chain.uniform(n);
    const own = new Stepper(chain);
    const twins = new Stepper(chain, { maxStep: 1 / 240 });
    const state = restingState(n);
    state.theta.fill(0.3);
    const twin: ChainState = {
      theta: Float64Array.from(state.theta),
      omega: Float64Array.from(state.omega),
    };
    let worst = 0;
    for (let frame = 0; frame < 750; frame++) {
      const drive = music(chain, frame * FRAME, FRAME);
      for (let piece = 0; piece < 7; piece++) {
        own.advance(state, FRAME / 7, DOWN, {
          drive,
          into: (piece * FRAME) / 7,
        });
      }
      for (let piece = 0; piece < 4; piece++) {
        twins.advance(twin, FRAME / 4, DOWN, {
          drive,
          into: (piece * FRAME) / 4,
        });
      }
      worst = Math.max(worst, apartOf(chain, state, twin));
    }
    expect(worst).toBeLessThan(1e-3);
    // and the music moved the chain far from where it would be without it
    expect(Math.abs(state.theta[n - 1] ?? 0)).toBeGreaterThan(0);
  });
});
