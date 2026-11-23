import { describe, expect, it } from "vitest";

import { Chain, createHand, gravity } from "../physics/chain.ts";
import type { Drive } from "../physics/drive.ts";
import { resample } from "../physics/resample.ts";
import { Stepper, restingState, type Shake } from "../physics/step.ts";
import {
  TWIN_STEP,
  TwinShare,
  shareOf,
  type TwinCommand,
  type TwinEvent,
  type TwinFlash,
  type TwinHold,
} from "./twin-share.ts";
import { SPAN_BYTES, Merger, SpanBatch, readSpan } from "./curves.ts";
import { mixColors } from "./grounds.ts";
import { fanPalette } from "./palettes.ts";
import { pivotsOver, stampTwin, twinCurve } from "./twin-curves.ts";
import {
  apart,
  bornTwins,
  drawIn,
  fanPlace,
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
    clock: null,
    drive: null,
    budget: 1e9,
    generation: 0,
    seq: 0,
    curves: null,
    stamps: null,
    ...more,
  };
}

/**
 * The music over the frame that starts `t0` s in (decision 74): gravity
 * tilted a little more each frame, a kick of the pivot every 0.2 s, a hand
 * on the tip going round, and a drag.
 */
function musicOf(chain: Chain, t0: number, span: number): Drive {
  const beat = Math.floor(t0 / 0.2);
  const tip = createHand(chain, chain.n - 1, 12, 1);
  const round = (t: number) => ({
    x: 0.15 * Math.sin(Math.PI * t),
    y: -0.85 + 0.15 * Math.cos(Math.PI * t),
  });
  return {
    span,
    tilt: [
      { x: 0.5 * Math.sin(t0), y: 0 },
      { x: 0.5 * Math.sin(t0 + span), y: 0 },
    ],
    kicks: [
      { start: 0.2 * beat - t0, x: 0.02, y: 0, attack: 0.015, decay: 0.1 },
    ],
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
    drag: [0.2, 0.3],
    heat: null,
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

  it("advances each twin under the music's command as the piece's loop would, number for number, each piece from its own instant in the frame (decision 74)", () => {
    const n = 3;
    const chain = Chain.uniform(n);
    const start = raised(n);
    const count = 12;
    const reference = bornTwins(start, count, 1e-3);
    const stepper = new Stepper(chain, { maxStep: TWIN_STEP });
    const shares = [0, 1].map((index) => new TwinShare(index, 2, n));
    shares.forEach((share, index) =>
      share.run(command([bornAll(start, count, index, 2, 1e-3)], 0, 0)),
    );
    for (let frame = 0; frame < 60; frame++) {
      const pieces = 1 + (frame % 4);
      const drive = musicOf(chain, frame * FRAME, FRAME);
      const step = FRAME / pieces;
      for (const twin of reference) {
        for (let piece = 0; piece < pieces; piece++) {
          stepper.advance(twin, step, g, { drive, into: piece * step });
        }
      }
      for (const share of shares) {
        share.run(
          command(
            [],
            FRAME,
            pieces,
            Array.from({ length: pieces }, () => null),
            {
              drive,
            },
          ),
        );
      }
    }
    for (let j = 0; j < count; j++) {
      const twin = shares[j % 2]?.twins[Math.floor(j / 2)];
      expect([...(twin?.theta ?? [])]).toEqual([
        ...(reference[j]?.theta ?? []),
      ]);
      expect([...(twin?.omega ?? [])]).toEqual([
        ...(reference[j]?.omega ?? []),
      ]);
    }
    // and the music moved them: without it they would be elsewhere
    const free = bornTwins(start, 1, 1e-3)[0];
    if (free === undefined) throw new Error("a twin is born");
    for (let frame = 0; frame < 60; frame++) {
      const pieces = 1 + (frame % 4);
      for (let piece = 0; piece < pieces; piece++) {
        stepper.advance(free, FRAME / pieces, g);
      }
    }
    expect(free.theta[n - 1]).not.toBe(reference[0]?.theta[n - 1]);
  });

  it("takes a command with the music's as plain data, which a worker receives whole", () => {
    const chain = Chain.uniform(3);
    const sent = command([], FRAME, 4, [null, null, null, null], {
      drive: musicOf(chain, 0.3, FRAME),
    });
    expect(structuredClone(sent)).toEqual(sent);
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

  it("sends back each tip's velocity at the same instants when the command carries a clock, the rate the tip moves at, and the clock and the time with it (decision 68)", () => {
    const n = 3;
    const share = new TwinShare(0, 1, n);
    share.run(command([bornAll(raised(n), 4, 0, 1, 1e-2)], 0, 0));
    const pieces = 40;
    const still: (Shake | null)[] = Array.from({ length: pieces }, () => null);
    const clock = { seconds: 12.5, fade: 4.2, rate: 0.4 };
    const report = share.run(command([], FRAME, pieces, still, { clock }));
    expect(report.clock).toEqual(clock);
    expect(report.time).toBe(FRAME);
    expect(report.tipSpeeds).toHaveLength(report.tips.length);
    const dt = FRAME / pieces;
    const stride = 2 * (pieces + 1);
    for (let k = 0; k < 4; k++) {
      for (let piece = 1; piece < pieces; piece++) {
        const at = stride * k + 2 * piece;
        // how far the tip went over the pieces either side, a time apart
        const vx =
          ((report.tips[at + 2] ?? 0) - (report.tips[at - 2] ?? 0)) / (2 * dt);
        const vy =
          ((report.tips[at + 3] ?? 0) - (report.tips[at - 1] ?? 0)) / (2 * dt);
        expect(report.tipSpeeds[at]).toBeCloseTo(vx, 2);
        expect(report.tipSpeeds[at + 1]).toBeCloseTo(vy, 2);
      }
    }
    const plain = share.run(command([], FRAME, 2, [null, null]));
    expect(plain.tipSpeeds).toHaveLength(0);
    expect(plain.clock).toBeNull();
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

/** The bytes of the first `count` spans of `bytes`. */
function spanBytes(bytes: ArrayBuffer, count: number): number[] {
  return [...new Uint8Array(bytes, 0, count * SPAN_BYTES)];
}

describe("a share's twins' trails joined into curves where they move (decision 95)", () => {
  const n = 2;
  const clockOf = (frame: number) => ({
    seconds: 3 + frame * FRAME,
    fade: 1.5 + frame * FRAME * 0.4,
    rate: 0.4,
  });
  const still = (pieces: number): (Shake | null)[] =>
    Array.from({ length: pieces }, () => null);

  /**
   * The share `index` of `shares`, given `frames` commands that join its
   * twins' curves, against the main line joining the same reports as it does
   * now: twin j's tip, where the pivot was, in its palette's colour, tinted
   * as the music asks, in its light times its own times the music's.
   */
  function sideBySide(index: number, shares: number): void {
    const share = new TwinShare(index, shares, n);
    const merger = new Merger();
    const fresh = new SpanBatch();
    const closed = new SpanBatch();
    const open = new SpanBatch();
    const split = new SpanBatch();
    const palette = 2;
    const fan = 24;
    share.run(
      command([bornAll(raised(n), fan, index, shares, 0.4)], 0, 0, [], {
        curves: null,
      }),
    );
    const mine = Array.from({ length: fan }, (_, j) => j).filter(
      (j) => j % shares === index,
    );
    const shine = Float64Array.from(mine, (_, k) => 0.2 + 0.05 * k);
    for (let frame = 0; frame < 40; frame++) {
      const pieces = 4;
      // the music kicks the pivot over the middle frames, and tints the
      // twins over some of them
      const drive =
        frame >= 10 && frame < 30
          ? musicOf(Chain.uniform(n), frame * FRAME, FRAME)
          : null;
      const tint =
        frame % 7 < 3 ? { color: [0.9, 0.2, 0.1] as const, amount: 0.3 } : null;
      // one twin born again from the chain mid-way, and the last two of the
      // fan dropped later; the curves split, then let go
      const events: TwinEvent[] = [];
      if (frame === 12) {
        events.push({
          kind: "born",
          twins: [mine[1] ?? 0],
          theta: Float64Array.from(raised(n).theta),
          omega: Float64Array.from(raised(n).omega),
          spread: 0.4,
        });
      }
      if (frame === 20) events.push({ kind: "keep", count: fan - 2 * shares });
      if (frame === 25) events.push({ kind: "split" });
      if (frame === 33) events.push({ kind: "forget" });
      const light = 0.15;
      const music = frame >= 10 ? 1.4 : 1;
      const report = share.run(
        command(events, FRAME, pieces, still(pieces), {
          drive,
          clock: clockOf(frame),
          curves: {
            light,
            stampLight: light,
            music,
            shine,
            palette,
            tint,
            lines: true,
          },
          seq: frame + 1,
        }),
      );
      // the main line, as it joins the same twins now
      split.clear();
      if (frame === 25) merger.splitAll(split);
      if (frame === 33) merger.forget();
      const pivots = new Float64Array(2 * (pieces + 1));
      const speeds = new Float64Array(2 * (pieces + 1));
      pivotsOver(drive, pieces, FRAME, pivots, speeds);
      fresh.clear();
      closed.clear();
      for (let k = 0; k < report.count; k++) {
        const j = index + k * shares;
        const base = fanPalette(palette).color(fanPlace(j));
        const color =
          tint === null ? base : mixColors(base, tint.color, tint.amount);
        twinCurve(
          merger,
          fresh,
          closed,
          k,
          report,
          2 * (pieces + 1) * k,
          color,
          light * (shine[k] ?? 1) * music,
          pivots,
          speeds,
        );
      }
      open.clear();
      merger.openSpans(open);
      const curves = report.curves;
      if (curves === null) throw new Error("no curves came back");
      expect(report.seq).toBe(frame + 1);
      expect(curves.fresh.count).toBe(fresh.count);
      expect(spanBytes(curves.fresh.bytes, curves.fresh.count)).toEqual(
        spanBytes(fresh.bytes(), fresh.count),
      );
      expect(spanBytes(curves.closed.bytes, curves.closed.count)).toEqual(
        spanBytes(closed.bytes(), closed.count),
      );
      expect(spanBytes(curves.split.bytes, curves.split.count)).toEqual(
        spanBytes(split.bytes(), split.count),
      );
      expect(spanBytes(curves.open.bytes, curves.open.count)).toEqual(
        spanBytes(open.bytes(), open.count),
      );
      if (frame === 25) expect(curves.split.count).toBeGreaterThan(0);
    }
  }

  it("gives the same spans as the main line, byte for byte, for a fan in one share", () => {
    sideBySide(0, 1);
  });

  it("gives the same spans as the main line, byte for byte, for a share of three, each twin by its place in the fan", () => {
    sideBySide(1, 3);
  });

  it("joins nothing, and sends no curves back, where the command asks for none", () => {
    const share = new TwinShare(0, 1, n);
    share.run(command([bornAll(raised(n), 4, 0, 1, 0.1)], 0, 0));
    const report = share.run(
      command([], FRAME, 4, still(4), { clock: clockOf(0) }),
    );
    expect(report.curves).toBeNull();
  });

  it("sends back a split asked while it joins no curves, so that no light is lost (decision 97)", () => {
    const share = new TwinShare(0, 1, n);
    share.run(command([bornAll(raised(n), 4, 0, 1, 0.1)], 0, 0));
    const curves = {
      light: 0.2,
      stampLight: 0.2,
      music: 1,
      shine: null,
      palette: 0,
      tint: null,
      lines: true,
    };
    share.run(command([], FRAME, 4, still(4), { clock: clockOf(0), curves }));
    const report = share.run(
      command([{ kind: "split" }], FRAME, 4, still(4), { clock: clockOf(1) }),
    );
    const back = report.curves;
    if (back === null) throw new Error("the split did not come back");
    expect(back.split.count).toBe(4);
    expect(back.fresh.count + back.closed.count).toBe(0);
    // split just now, the curves still open span no time yet
    expect(back.open.count).toBe(0);
  });

  it("measures the lens's stretch across a split or a forget as if neither had come (decision 64)", () => {
    const start = raised(n);
    const width = 1e-9;
    const plain = new TwinShare(0, 1, n);
    const split = new TwinShare(0, 1, n);
    for (const share of [plain, split]) {
      share.run(command([bornAll(start, 8, 0, 1, 1e-3)], 0, 0));
      share.run(command([], FRAME, 4, still(4), { hold: lens(width, start) }));
    }
    const a = plain.run(
      command([], FRAME, 4, still(4), { hold: lens(width, start) }),
    );
    const b = split.run(
      command([{ kind: "split" }, { kind: "forget" }], FRAME, 4, still(4), {
        hold: lens(width, start),
      }),
    );
    expect(b.stretch).toBe(a.stretch);
    expect(a.stretchTime).toBeGreaterThan(0);
  });
});

describe("a share's twins stamped by a strobe's flashes (decision 100)", () => {
  const fan = 7;

  /**
   * Shares `with` and `without` stamps, the same twins born in each, run the
   * same `frames` commands, the music's and a shake in the middle ones: the
   * one with stamps given flashes at `flashes`, fractions of each frame.
   */
  function sideBySide(
    n: number,
    flashes: readonly number[],
    more: Partial<TwinCommand> = {},
  ) {
    const withStamps = new TwinShare(0, 1, n);
    const without = new TwinShare(0, 1, n);
    const born = command([bornAll(raised(n), fan, 0, 1, 0.3)], 0, 0);
    withStamps.run(born);
    without.run(born);
    const chain = Chain.uniform(n);
    const pieces = 4;
    return (frame: number) => {
      const drive =
        frame % 3 === 1 ? musicOf(chain, frame * FRAME, FRAME) : null;
      const shakes =
        frame % 3 === 2 ? shakesOf(pieces, FRAME, 0.7 * frame) : [];
      const marks: TwinFlash[] = flashes.map((share, f) => ({
        at: share * FRAME,
        fade: 2 + 0.1 * f,
        x: 0.01 * f,
        y: -0.02,
      }));
      const asked = command([], FRAME, pieces, shakes, { drive, ...more });
      const before = withStamps.twins.map((twin) => ({
        theta: Float64Array.from(twin.theta),
        omega: Float64Array.from(twin.omega),
      }));
      const stamped = withStamps.run({
        ...asked,
        stamps: { parts: "whole", flashes: marks },
      });
      const plain = without.run(asked);
      return { stamped, plain, before, marks, drive, shakes, pieces, chain };
    };
  }

  for (const n of [2, 5]) {
    it(`sends back, where it joins no curves, each twin's masses where its own step puts them at each flash, and moves no twin otherwise, with ${String(n)} masses`, () => {
      const run = sideBySide(n, [0.3, 0.71, 1]);
      const stepper = new Stepper(Chain.uniform(n), { maxStep: TWIN_STEP });
      const x = new Float64Array(n);
      const y = new Float64Array(n);
      let worst = 0;
      for (let frame = 0; frame < 12; frame++) {
        const { stamped, plain, before, marks, drive, shakes, pieces, chain } =
          run(frame);
        // the motion is the same, number for number
        expect(stamped.tips).toEqual(plain.tips);
        expect(stamped.stamps?.flashes).toEqual(marks);
        expect(stamped.stampPlaces).toHaveLength(2 * n * marks.length * fan);
        const step = FRAME / pieces;
        for (let k = 0; k < fan; k++) {
          marks.forEach((mark, f) => {
            // the twin as it was, its own step taken to the flash's instant
            const piece = Math.min(pieces - 1, Math.ceil(mark.at / step) - 1);
            const copy = {
              theta: Float64Array.from(before[k]?.theta ?? []),
              omega: Float64Array.from(before[k]?.omega ?? []),
            };
            for (let p = 0; p < piece; p++) {
              stepper.advance(copy, step, g, {
                shake: shakes[p] ?? null,
                drive,
                into: p * step,
              });
            }
            stepper.advance(copy, mark.at - piece * step, g, {
              shake: shakes[piece] ?? null,
              drive,
              into: piece * step,
            });
            chain.positions(copy.theta, x, y);
            const at = 2 * n * (k * marks.length + f);
            for (let i = 0; i < n; i++) {
              worst = Math.max(
                worst,
                Math.hypot(
                  (stamped.stampPlaces[at + 2 * i] ?? 0) - (x[i] ?? 0),
                  (stamped.stampPlaces[at + 2 * i + 1] ?? 0) - (y[i] ?? 0),
                ),
              );
            }
          });
        }
      }
      // within a fifth of a millimetre, float32 places included
      expect(worst).toBeLessThan(2e-4);
    });
  }

  it("stamps each twin at a flash that ends the frame where the frame leaves it", () => {
    const n = 3;
    const run = sideBySide(n, [1], { whole: true });
    for (let frame = 0; frame < 3; frame++) {
      const { stamped } = run(frame);
      expect(stamped.stampPlaces).toEqual(stamped.positions);
    }
  });

  it("stamps them into a batch of its own where it joins curves, each twin in its colour, tinted, in the trails' light times its own times the music's, from the pivot at the flash, at its fade: as the main line would from their places", () => {
    const n = 2;
    const palette = 3;
    const tint = { color: [0.1, 0.8, 0.3] as const, amount: 0.4 };
    const shine = Float64Array.from({ length: fan }, (_, k) => 0.3 + 0.1 * k);
    const paint = {
      light: 0.12,
      stampLight: 0.12,
      music: 1.5,
      shine,
      palette,
      tint,
    };
    // the same twins, one share joining curves with stamps alone, the other
    // sending places back
    const joining = new TwinShare(0, 1, n);
    const placing = new TwinShare(0, 1, n);
    const born = command([bornAll(raised(n), fan, 0, 1, 0.3)], 0, 0);
    joining.run(born);
    placing.run(born);
    const flashes: TwinFlash[] = [
      { at: 0.4 * FRAME, fade: 3.25, x: 0.02, y: -0.01 },
    ];
    for (const parts of ["tip", "masses", "rods", "whole"] as const) {
      const asked = command([], FRAME, 4, [], {
        stamps: { parts, flashes },
      });
      const joined = joining.run({
        ...asked,
        curves: { ...paint, lines: false },
      });
      const placed = placing.run(asked);
      const curves = joined.curves;
      if (curves === null) throw new Error("no curves came back");
      // stamps alone: no lines joined, and no places sent back
      expect(curves.fresh.count).toBe(0);
      expect(curves.closed.count).toBe(0);
      expect(joined.stampPlaces).toHaveLength(0);
      const expected = new SpanBatch();
      for (let k = 0; k < fan; k++) {
        const base = fanPalette(palette).color(fanPlace(k));
        stampTwin(
          expected,
          parts,
          n,
          placed.stampPlaces,
          2 * n * k,
          0.02,
          -0.01,
          mixColors(base, tint.color, tint.amount),
          0.12 * (shine[k] ?? 1) * 1.5,
          3.25,
        );
      }
      expect(curves.stamps.count).toBe(expected.count);
      expect(spanBytes(curves.stamps.bytes, curves.stamps.count)).toEqual(
        spanBytes(expected.bytes(), expected.count),
      );
    }
  });

  it("stamps them in the light of the twins' strobe, apart from their lines' (decision 102)", () => {
    const n = 2;
    const share = (stampLight: number) => {
      const joining = new TwinShare(0, 1, n);
      joining.run(command([bornAll(raised(n), fan, 0, 1, 0.3)], 0, 0));
      const joined = joining.run({
        ...command([], FRAME, 4, [], {
          stamps: {
            parts: "rods",
            flashes: [{ at: 0.4 * FRAME, fade: 0, x: 0, y: 0 }],
          },
        }),
        curves: {
          light: 0.12,
          stampLight,
          music: 1,
          shine: null,
          palette: 0,
          tint: null,
          lines: false,
        },
      });
      if (joined.curves === null) throw new Error("no curves came back");
      return joined.curves.stamps;
    };
    const asLines = share(0.12);
    const brighter = share(0.48);
    expect(brighter.count).toBe(asLines.count);
    expect(asLines.count).toBeGreaterThan(0);
    // the same spans, each four times as bright
    const lights = ({ bytes, count }: typeof asLines) =>
      Array.from(
        { length: count },
        (_, k) =>
          readSpan(new Float32Array(bytes), new Uint8Array(bytes), k).l0,
      );
    const dim = lights(asLines);
    for (const [k, light] of lights(brighter).entries()) {
      expect(light).toBeCloseTo(4 * (dim[k] ?? 0), 5);
    }
  });

  it("stamps no twin, and sends nothing of stamps back, without a flash, without stamps, or with no time", () => {
    const share = new TwinShare(0, 1, 2);
    share.run(command([bornAll(raised(2), 3, 0, 1, 0.1)], 0, 0));
    const none = share.run(
      command([], FRAME, 4, [], { stamps: { parts: "whole", flashes: [] } }),
    );
    expect(none.stampPlaces).toHaveLength(0);
    expect(none.stamps).toBeNull();
    const asleep = share.run(
      command([], 0, 0, [], {
        stamps: {
          parts: "whole",
          flashes: [{ at: 0, fade: 0, x: 0, y: 0 }],
        },
      }),
    );
    expect(asleep.stampPlaces).toHaveLength(0);
    expect(asleep.stamps).toBeNull();
    const joined = share.run(
      command([], FRAME, 4, [], {
        curves: {
          light: 0.1,
          stampLight: 0.1,
          music: 1,
          shine: null,
          palette: 0,
          tint: null,
          lines: false,
        },
      }),
    );
    expect(joined.curves?.stamps.count).toBe(0);
  });
});
