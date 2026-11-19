import { describe, expect, it } from "vitest";

import { Chain, gravity } from "../physics/chain.ts";
import { resample } from "../physics/resample.ts";
import { Stepper, restingState, type Shake } from "../physics/step.ts";
import {
  TWIN_STEP,
  TwinShare,
  shareOf,
  type TwinCommand,
  type TwinEvent,
  type TwinHold,
} from "./twin-share.ts";
import {
  apart,
  bornTwins,
  drawIn,
  leashFactor,
  rootMeanSquare,
} from "./twins.ts";

// A worker's share of the twins (docs/decisions.md, decision 51): the twins
// j ≡ index (mod shares) of the fan, advanced by the step the piece's own
// loop used before the workers (decision 20), number for number.

const g = gravity(9.81);
const FRAME = 0.8 / 60;

/** A chain of n masses let go from the piece's raised start. */
function raised(n: number): { theta: Float64Array; omega: Float64Array } {
  const state = restingState(n);
  for (let i = 0; i < n; i++) {
    state.theta[i] = 2.2 + (0.7 * i) / Math.max(1, n - 1);
  }
  return state;
}

/** Every twin of a fan of `count`, born now, as the events of one share. */
function bornAll(
  state: { theta: Float64Array; omega: Float64Array },
  count: number,
  index: number,
  shares: number,
  spread: number,
): TwinEvent {
  return {
    kind: "born",
    twins: Array.from({ length: count }, (_, j) => j).filter(
      (j) => j % shares === index,
    ),
    theta: Float64Array.from(state.theta),
    omega: Float64Array.from(state.omega),
    spread,
  };
}

/** A command of `time` in `pieces`, shaken by `shakes`, with nothing asked back but the tips. */
function command(
  events: readonly TwinEvent[],
  time: number,
  pieces: number,
  shakes: readonly (Shake | null)[] = [],
  more: Partial<TwinCommand> = {},
): TwinCommand {
  return {
    events,
    time,
    pieces,
    g,
    shakes,
    chain: null,
    hold: null,
    whole: false,
    budget: 1e9,
    generation: 0,
    ...more,
  };
}

/** The shake of each of `pieces` pieces of a frame of `time`, as the piece's loop gives them. */
function shakesOf(
  pieces: number,
  time: number,
  start: number,
): (Shake | null)[] {
  const rate = 2 * Math.PI * 30;
  return Array.from({ length: pieces }, (_, piece) => ({
    amplitude: 0.003,
    rate,
    x: 0,
    y: 1,
    phase: start + (rate * piece * time) / pieces,
  }));
}

describe("a share of the twins", () => {
  it("advances each twin as the piece's loop did, number for number, in every share of the fan", () => {
    const n = 3;
    const chain = Chain.uniform(n);
    const start = raised(n);
    const count = 24;
    // the reference: the loop of the piece before the workers
    const reference = bornTwins(start, count, 1e-3);
    const stepper = new Stepper(chain, { maxStep: TWIN_STEP });
    const shares = [0, 1, 2].map((index) => new TwinShare(index, 3, n));
    shares.forEach((share, index) =>
      share.run(command([bornAll(start, count, index, 3, 1e-3)], 0, 0)),
    );
    for (let frame = 0; frame < 90; frame++) {
      const pieces = 1 + (frame % 4);
      // shaken in the last third, from where the shake was
      const shakes =
        frame >= 60
          ? shakesOf(pieces, FRAME, frame * 0.7)
          : Array.from({ length: pieces }, () => null);
      for (const twin of reference) {
        for (let piece = 0; piece < pieces; piece++) {
          stepper.advance(twin, FRAME / pieces, g, {
            shake: shakes[piece] ?? null,
          });
        }
      }
      for (const share of shares) {
        share.run(command([], FRAME, pieces, shakes));
      }
    }
    for (let j = 0; j < count; j++) {
      const twin = shares[j % 3]?.twins[Math.floor(j / 3)];
      expect([...(twin?.theta ?? [])]).toEqual([
        ...(reference[j]?.theta ?? []),
      ]);
      expect([...(twin?.omega ?? [])]).toEqual([
        ...(reference[j]?.omega ?? []),
      ]);
    }
  });

  it("sends back each twin's tip before the time and after each piece, its masses when whole, and its distance from the chain", () => {
    const n = 4;
    const chain = Chain.uniform(n);
    const start = raised(n);
    const share = new TwinShare(0, 1, n);
    share.run(command([bornAll(start, 5, 0, 1, 1e-2)], 0, 0));
    const before = share.twins.map((twin) => Float64Array.from(twin.theta));
    // where the chain itself is, every x then every y
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    chain.positions(start.theta, x, y);
    const at = new Float64Array(2 * n);
    at.set(x, 0);
    at.set(y, n);
    const report = share.run(
      command([], FRAME, 3, [null, null, null], { whole: true, chain: at }),
    );
    expect(report.count).toBe(5);
    expect(report.pieces).toBe(3);
    expect(report.tips).toHaveLength(5 * 2 * 4);
    expect(report.positions).toHaveLength(5 * 2 * n);
    expect(report.apart).toHaveLength(5);
    const tx = new Float64Array(n);
    const ty = new Float64Array(n);
    for (let k = 0; k < 5; k++) {
      // the first tip is where the twin was before the time went by
      chain.positions(before[k] ?? new Float64Array(n), tx, ty);
      expect(report.tips[8 * k]).toBeCloseTo(tx[n - 1] ?? Number.NaN, 6);
      expect(report.tips[8 * k + 1]).toBeCloseTo(ty[n - 1] ?? Number.NaN, 6);
      // the last is where it is now, the end of its masses
      chain.positions(share.twins[k]?.theta ?? new Float64Array(n), tx, ty);
      expect(report.tips[8 * k + 6]).toBeCloseTo(tx[n - 1] ?? Number.NaN, 6);
      expect(report.tips[8 * k + 7]).toBeCloseTo(ty[n - 1] ?? Number.NaN, 6);
      for (let i = 0; i < n; i++) {
        expect(report.positions[2 * n * k + 2 * i]).toBeCloseTo(tx[i] ?? 0, 6);
        expect(report.positions[2 * n * k + 2 * i + 1]).toBeCloseTo(
          ty[i] ?? 0,
          6,
        );
      }
      expect(report.apart[k]).toBe(apart(x, y, tx, ty, chain.totalLength));
    }
  });

  it("sends back the tips alone, as dust, and no distances unless asked for", () => {
    const share = new TwinShare(0, 1, 2);
    share.run(command([bornAll(raised(2), 3, 0, 1, 1e-3)], 0, 0));
    const report = share.run(command([], FRAME, 2, [null, null]));
    expect(report.positions).toHaveLength(0);
    expect(report.apart).toHaveLength(0);
    expect(report.tips).toHaveLength(3 * 2 * 3);
  });

  it("applies the events before the time, in order: born again, kept, other masses, run backwards", () => {
    const n = 2;
    const start = raised(n);
    const share = new TwinShare(1, 2, n);
    // twins 1, 3, 5 and 7 of a fan of eight are this share's
    share.run(command([bornAll(start, 8, 1, 2, 1e-3)], 0, 0));
    expect(share.twins).toHaveLength(4);
    share.run(command([], FRAME, 2, [null, null]));
    // twin 3 born again on the chain; then a fan of five keeps twins 1 and 3
    const [again] = bornTwins(start, 4, 1e-3).slice(3);
    share.run(
      command(
        [
          {
            kind: "born",
            twins: [3],
            theta: Float64Array.from(start.theta),
            omega: Float64Array.from(start.omega),
            spread: 1e-3,
          },
          { kind: "keep", count: 5 },
        ],
        0,
        0,
      ),
    );
    expect(share.twins).toHaveLength(2);
    expect([...(share.twins[1]?.theta ?? [])]).toEqual([
      ...(again?.theta ?? []),
    ]);
    // other masses: each twin as resample makes it
    const chain = Chain.uniform(n);
    const expected = share.twins.map((twin) => resample(chain, twin, 5).state);
    const report = share.run(command([{ kind: "masses", n: 5 }], 0, 0));
    expect(report.n).toBe(5);
    share.twins.forEach((twin, k) => {
      expect([...twin.theta]).toEqual([...(expected[k]?.theta ?? [])]);
      expect([...twin.omega]).toEqual([...(expected[k]?.omega ?? [])]);
    });
    // backwards: every rate turned over, every angle kept
    const rates = share.twins.map((twin) => [...twin.omega]);
    share.run(command([{ kind: "reverse" }], 0, 0));
    share.twins.forEach((twin, k) => {
      expect([...twin.omega]).toEqual((rates[k] ?? []).map((rate) => -rate));
    });
  });

  it("adds the fan's next twins of the share, and refuses one that is not the next", () => {
    const share = new TwinShare(0, 3, 2);
    const start = raised(2);
    const born = (twins: number[]): TwinEvent => ({
      kind: "born",
      twins,
      theta: Float64Array.from(start.theta),
      omega: Float64Array.from(start.omega),
      spread: 1e-3,
    });
    share.run(command([born([0, 3])], 0, 0));
    expect(share.twins).toHaveLength(2);
    expect(() => share.run(command([born([9])], 0, 0))).toThrow(/not the next/);
    expect(() => share.run(command([born([7])], 0, 0))).toThrow(/not the next/);
    share.run(command([born([6])], 0, 0));
    expect(share.twins).toHaveLength(3);
  });

  it("drops the twins it has not reached by four times its budget, reading the clock every eight twins", () => {
    // every read of the clock finds a millisecond gone by
    let now = 0;
    const share = new TwinShare(0, 1, 2, () => (now += 1));
    share.run(command([bornAll(raised(2), 40, 0, 1, 1e-3)], 0, 0));
    const start = now + 1;
    const report = share.run(
      command([], FRAME, 2, [null, null], { budget: 1 }),
    );
    // read at the start, then before twins 0, 8, 16, 24 and 32: the last,
    // five milliseconds in, is past four times the budget, and twin 32 is
    // not reached
    expect(now).toBe(start + 6);
    expect(report.asked).toBe(40);
    expect(report.count).toBe(32);
    expect(share.twins).toHaveLength(32);
    expect(report.tips).toHaveLength(40 * 2 * 3);
  });

  it("times its twins' motion alone: the events before it, such as thousands of twins born, take none of its budget", () => {
    // the clock stands at 0 until the twins are born, and at 1000 after
    let share: TwinShare | null = null;
    share = new TwinShare(0, 1, 2, () =>
      (share?.twins.length ?? 0) > 0 ? 1000 : 0,
    );
    const report = share.run(
      command([bornAll(raised(2), 64, 0, 1, 1e-3)], FRAME, 2, [null, null], {
        budget: 1,
      }),
    );
    expect(report.count).toBe(64);
    expect(report.spent).toBe(0);
  });

  it("reads no clock and drops no twin for a command of events alone", () => {
    let now = 0;
    const share = new TwinShare(0, 1, 2, () => (now += 1000));
    const report = share.run(
      command([bornAll(raised(2), 40, 0, 1, 1e-3)], 0, 0, [], { budget: 0 }),
    );
    expect(report.count).toBe(40);
    expect(report.pieces).toBe(0);
    expect(report.tips).toHaveLength(40 * 2);
  });

  it("counts the twins of a fan that fall to each share", () => {
    expect([0, 1, 2].map((index) => shareOf(8, index, 3))).toEqual([3, 3, 2]);
    expect([0, 1, 2].map((index) => shareOf(2, index, 3))).toEqual([1, 1, 0]);
    expect(shareOf(0, 0, 1)).toBe(0);
    expect(shareOf(4096, 0, 1)).toBe(4096);
  });
});

/** The chain of n masses from `start`, `frames` frames on, as the piece's loop would have it. */
function chainAfter(
  start: { theta: Float64Array; omega: Float64Array },
  frames: number,
): { theta: Float64Array; omega: Float64Array } {
  const n = start.theta.length;
  const state = {
    theta: Float64Array.from(start.theta),
    omega: Float64Array.from(start.omega),
  };
  const stepper = new Stepper(Chain.uniform(n));
  for (let frame = 0; frame < frames; frame++) {
    stepper.advance(state, FRAME, g);
  }
  return state;
}

/** How far each of the twins looks from the chain, as a share of its length. */
function distancesOf(
  twins: readonly { theta: Float64Array }[],
  chain: { theta: Float64Array },
): Float64Array {
  const n = chain.theta.length;
  const shape = Chain.uniform(n);
  const cx = new Float64Array(n);
  const cy = new Float64Array(n);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  shape.positions(chain.theta, cx, cy);
  return Float64Array.from(twins, (twin) => {
    shape.positions(twin.theta, x, y);
    return apart(cx, cy, x, y, shape.totalLength);
  });
}

/** A copy of the twins' states. */
function copies(
  twins: readonly { theta: Float64Array; omega: Float64Array }[],
): { theta: Float64Array; omega: Float64Array }[] {
  return twins.map((twin) => ({
    theta: Float64Array.from(twin.theta),
    omega: Float64Array.from(twin.omega),
  }));
}

/** The lens of decision 64, `width` wide, about the chain as it is. */
function lens(
  width: number,
  chain: { theta: Float64Array; omega: Float64Array },
): TwinHold {
  return {
    kind: "lens",
    width,
    theta: Float64Array.from(chain.theta),
    omega: Float64Array.from(chain.omega),
  };
}

describe("twins held near the chain (decision 64)", () => {
  const n = 3;
  const start = raised(n);
  // a fan a tenth of the chain wide, some twins near the chain, some far
  const born = (count: number): TwinEvent => bornAll(start, count, 0, 1, 0.5);

  it("draw the whole share in by one factor once the fan grows wider than the lens, towards the chain as it is once the time has gone by", () => {
    const free = new TwinShare(0, 1, n);
    const held = new TwinShare(0, 1, n);
    free.run(command([born(24)], 0, 0));
    held.run(command([born(24)], 0, 0));
    const chain = chainAfter(start, 1);
    free.run(command([], FRAME, 2, [null, null]));
    held.run(command([], FRAME, 2, [null, null], { hold: lens(0.05, chain) }));
    // the free fan is wider than the lens, and the held one is the free one
    // drawn in by the lens's width over the fan's
    const width = rootMeanSquare(distancesOf(free.twins, chain), 24);
    expect(width).toBeGreaterThan(0.05);
    const expected = copies(free.twins);
    for (const twin of expected) drawIn(twin, chain, 0.05 / width);
    held.twins.forEach((twin, k) => {
      expect([...twin.theta]).toEqual([...(expected[k]?.theta ?? [])]);
      expect([...twin.omega]).toEqual([...(expected[k]?.omega ?? [])]);
    });
  });

  it("leave the fan alone while it is no wider than the lens", () => {
    const free = new TwinShare(0, 1, n);
    const held = new TwinShare(0, 1, n);
    free.run(command([born(24)], 0, 0));
    held.run(command([born(24)], 0, 0));
    const chain = chainAfter(start, 1);
    free.run(command([], FRAME, 2, [null, null]));
    held.run(command([], FRAME, 2, [null, null], { hold: lens(1, chain) }));
    held.twins.forEach((twin, k) => {
      expect([...twin.theta]).toEqual([...(free.twins[k]?.theta ?? [])]);
      expect([...twin.omega]).toEqual([...(free.twins[k]?.omega ?? [])]);
    });
  });

  it("report how much the fan stretched over the time, as a logarithm, from its width after the last command, and nothing just after the twins are born", () => {
    const free = new TwinShare(0, 1, n);
    const held = new TwinShare(0, 1, n);
    free.run(command([born(24)], 0, 0));
    const first = held.run(
      command([born(24)], FRAME, 2, [null, null], {
        hold: lens(1, chainAfter(start, 1)),
      }),
    );
    expect(first.stretch).toBe(0);
    expect(first.stretchTime).toBe(0);
    free.run(command([], FRAME, 2, [null, null]));
    const before = rootMeanSquare(
      distancesOf(free.twins, chainAfter(start, 1)),
      24,
    );
    free.run(command([], FRAME, 2, [null, null]));
    const after = rootMeanSquare(
      distancesOf(free.twins, chainAfter(start, 2)),
      24,
    );
    const second = held.run(
      command([], FRAME, 2, [null, null], {
        hold: lens(1, chainAfter(start, 2)),
      }),
    );
    expect(second.stretch).toBeCloseTo(Math.log(after / before), 12);
    expect(second.stretchTime).toBe(FRAME);
  });

  it("measure the stretch from the lens's width once the fan was drawn in, and start the measure again after any event", () => {
    const held = new TwinShare(0, 1, n);
    held.run(command([born(24)], 0, 0));
    held.run(
      command([], FRAME, 2, [null, null], {
        hold: lens(0.05, chainAfter(start, 1)),
      }),
    );
    const report = held.run(
      command([], FRAME, 2, [null, null], {
        hold: lens(0.05, chainAfter(start, 2)),
      }),
    );
    const width = rootMeanSquare(
      distancesOf(held.twins, chainAfter(start, 2)),
      24,
    );
    // drawn in again, so the width it stretched to is no longer there to
    // measure; what it stretched by was against the lens's width
    expect(report.stretch).toBeGreaterThan(0);
    expect(width).toBeLessThan(0.05 * Math.exp(report.stretch));
    for (const event of [
      { kind: "reverse" },
      { kind: "keep", count: 20 },
      { kind: "masses", n: 4 },
      born(24),
    ] as TwinEvent[]) {
      const after = held.run(
        command([event], FRAME, 2, [null, null], {
          hold: lens(0.05, chainAfter(start, 3)),
        }),
      );
      expect(after.stretch).toBe(0);
      expect(after.stretchTime).toBe(0);
      held.run(command([{ kind: "masses", n }], 0, 0));
    }
  });

  it("leash each twin with slack: free within it, and past it what is beyond falls back at the rate", () => {
    const free = new TwinShare(0, 1, n);
    const leashed = new TwinShare(0, 1, n);
    free.run(command([born(24)], 0, 0));
    leashed.run(command([born(24)], 0, 0));
    const chain = chainAfter(start, 1);
    const leash: TwinHold = {
      kind: "leash",
      slack: 0.05,
      rate: 8,
      theta: Float64Array.from(chain.theta),
      omega: Float64Array.from(chain.omega),
    };
    free.run(command([], FRAME, 2, [null, null]));
    const report = leashed.run(
      command([], FRAME, 2, [null, null], { hold: leash }),
    );
    const distances = distancesOf(free.twins, chain);
    const fall = Math.exp(-8 * FRAME);
    const expected = copies(free.twins);
    let within = 0;
    expected.forEach((twin, k) => {
      const factor = leashFactor(distances[k] ?? 0, 0.05, fall);
      if (factor === 1) within++;
      drawIn(twin, chain, factor);
    });
    // some twins within the slack and some past it
    expect(within).toBeGreaterThan(0);
    expect(within).toBeLessThan(24);
    leashed.twins.forEach((twin, k) => {
      expect([...twin.theta]).toEqual([...(expected[k]?.theta ?? [])]);
      expect([...twin.omega]).toEqual([...(expected[k]?.omega ?? [])]);
    });
    expect(report.stretch).toBe(0);
  });

  it("hold nothing over a command of events alone", () => {
    const held = new TwinShare(0, 1, n);
    held.run(command([born(24)], 0, 0, [], { hold: lens(0.001, start) }));
    const expected = bornTwins(start, 24, 0.5);
    held.twins.forEach((twin, k) => {
      expect([...twin.theta]).toEqual([...(expected[k]?.theta ?? [])]);
    });
  });
});
