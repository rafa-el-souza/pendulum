import { describe, expect, it } from "vitest";

import { gravity } from "../physics/chain.ts";
import { restingState, type ChainState } from "../physics/step.ts";
import { TwinShare, type TwinCommand } from "./twin-share.ts";
import {
  TwinWorkers,
  sharesFor,
  type OpenShare,
  type SharePort,
} from "./twin-workers.ts";

// The twins dealt out to workers (docs/decisions.md, decision 51), here to
// shares run in the test itself: the commands go out, and the reports come
// back when the test hands them over, as a worker's would, later.

const g = gravity(9.81);
const FRAME = 0.8 / 60;

/** A chain of n masses let go from the piece's raised start. */
function raised(n: number): ChainState {
  const state = restingState(n);
  for (let i = 0; i < n; i++) {
    state.theta[i] = 2.2 + (0.7 * i) / Math.max(1, n - 1);
  }
  return state;
}

/** Shares that run each command when the test says, and what they were sent. */
class Bench {
  readonly sent: TwinCommand[][] = [];
  readonly shares: TwinShare[] = [];
  readonly #pending: (() => void)[] = [];
  readonly #fails: ((reason: string) => void)[] = [];
  /** Each share's clock, standing still unless the test moves it. */
  readonly clocks: (() => number)[] = [];

  readonly open: OpenShare = (index, shares, n, receive, fail) => {
    const share = new TwinShare(index, shares, n, () =>
      (this.clocks[index] ?? (() => 0))(),
    );
    this.shares[index] = share;
    this.sent[index] = [];
    this.#fails[index] = fail;
    const port: SharePort = {
      send: (command) => {
        this.sent[index]?.push(command);
        this.#pending.push(() => {
          receive(share.run(command));
        });
      },
      close: () => undefined,
    };
    return port;
  };

  /** The reports of every command sent so far come back. */
  deliver(): void {
    for (const back of this.#pending.splice(0)) back();
  }

  /** Share `index` fails, as a worker that cannot run. */
  fail(index: number): void {
    this.#fails[index]?.("refused");
  }
}

/** A frame's command, without its events. */
function frame(
  more: Partial<Omit<TwinCommand, "events" | "generation">> = {},
): Omit<TwinCommand, "events" | "generation"> {
  return {
    time: FRAME,
    pieces: 2,
    g,
    shakes: [null, null],
    chain: null,
    whole: true,
    budget: 10,
    ...more,
  };
}

/** Twins 0 to count - 1. */
function places(count: number, from = 0): number[] {
  return Array.from({ length: count - from }, (_, k) => from + k);
}

describe("the twins' workers", () => {
  it("are the device's cores but one, one at least and seven at most, three where the cores are unknown", () => {
    expect([1, 2, 3, 4, 8, 12, 64].map((cores) => sharesFor(cores))).toEqual([
      1, 1, 2, 3, 7, 7, 7,
    ]);
    expect(sharesFor(undefined)).toBe(3);
    expect(sharesFor(0)).toBe(3);
  });

  it("deal the fan out in turn, twin j to worker j mod W, so that any first part of it is spread over all of them", () => {
    const bench = new Bench();
    const twins = new TwinWorkers({
      shares: 3,
      n: 2,
      budget: 10,
      cost: 0.002,
      open: bench.open,
    });
    twins.born(places(8), raised(2), 1e-3);
    expect(twins.count).toBe(8);
    twins.send(frame());
    const born = bench.sent.map((commands) =>
      commands[0]?.events.flatMap((event) =>
        event.kind === "born" ? event.twins : [],
      ),
    );
    expect(born).toEqual([
      [0, 3, 6],
      [1, 4, 7],
      [2, 5],
    ]);
    // nothing is drawn until the reports come back
    const seen: number[] = [];
    twins.each((j) => seen.push(j));
    expect(seen).toEqual([]);
    bench.deliver();
    twins.take();
    twins.each((j, report, k) => {
      seen.push(j);
      expect(report.count).toBe(j % 3 === 2 ? 2 : 3);
      expect(k).toBe(Math.floor(j / 3));
    });
    expect(seen.sort((a, b) => a - b)).toEqual(places(8));
  });

  it("hand every twin of every report to be seen, and draw the latest", () => {
    const bench = new Bench();
    const twins = new TwinWorkers({
      shares: 2,
      n: 2,
      budget: 10,
      cost: 0.002,
      open: bench.open,
    });
    twins.born(places(5), raised(2), 1e-3);
    twins.send(frame());
    twins.send(frame({ pieces: 3, shakes: [null, null, null] }));
    bench.deliver();
    const seen: [number, number][] = [];
    twins.take((j, report) => seen.push([j, report.pieces]));
    // both frames' tips, for the trails, in the order they came
    expect(seen.filter(([, pieces]) => pieces === 2)).toHaveLength(5);
    expect(seen.filter(([, pieces]) => pieces === 3)).toHaveLength(5);
    twins.each((_, report) => {
      expect(report.pieces).toBe(3);
    });
  });

  it("born again those already there and add the fan's next ones, and refuse a gap in the fan", () => {
    const bench = new Bench();
    const twins = new TwinWorkers({
      shares: 2,
      n: 2,
      budget: 10,
      cost: 0.002,
      open: bench.open,
    });
    twins.born(places(4), raised(2), 1e-3);
    twins.born([1, 4, 5], raised(2), 1e-2);
    expect(twins.count).toBe(6);
    expect(() => {
      twins.born([7], raised(2), 1e-3);
    }).toThrow(/gap/);
    twins.send(frame({ time: 0, pieces: 0, shakes: [] }));
    bench.deliver();
    expect(bench.shares.map((share) => share.twins.length)).toEqual([3, 3]);
  });

  it("keep the first part of the fan that every worker carried, and drop the rest from all of them", () => {
    const bench = new Bench();
    const twins = new TwinWorkers({
      shares: 3,
      n: 2,
      budget: 1,
      cost: 0.002,
      open: bench.open,
    });
    twins.born(places(60), raised(2), 1e-3);
    twins.send(frame({ time: 0, pieces: 0, shakes: [] }));
    bench.deliver();
    twins.take();
    expect(twins.count).toBe(60);
    // worker 1 finds two milliseconds gone at every read of its clock, and
    // runs out of four times its budget before its twin 16 of 20, which is
    // twin 49 of the fan
    let now = 0;
    bench.clocks[1] = () => (now += 2);
    twins.send(frame({ budget: 1 }));
    bench.deliver();
    twins.take();
    expect(twins.count).toBe(3 * 16 + 1);
    // the others are told to keep that first part of the fan too
    twins.send(frame({ time: 0, pieces: 0, shakes: [] }));
    bench.deliver();
    expect(bench.shares.map((share) => share.twins.length)).toEqual([
      17, 16, 16,
    ]);
  });

  it("put the fan out: none left, and no report of before it drawn", () => {
    const bench = new Bench();
    const twins = new TwinWorkers({
      shares: 2,
      n: 2,
      budget: 10,
      cost: 0.002,
      open: bench.open,
    });
    twins.born(places(6), raised(2), 1e-3);
    twins.send(frame());
    twins.clear();
    expect(twins.count).toBe(0);
    bench.deliver();
    twins.take(() => {
      throw new Error("a report of before the fan was put out was seen");
    });
    // born again: drawn when their own reports come back
    twins.born(places(4), raised(2), 1e-3);
    twins.send(frame());
    bench.deliver();
    const seen: number[] = [];
    twins.take();
    twins.each((j) => seen.push(j));
    expect(seen.sort((a, b) => a - b)).toEqual(places(4));
  });

  it("send other masses and time run backwards to every worker, in order with the rest", () => {
    const bench = new Bench();
    const twins = new TwinWorkers({
      shares: 2,
      n: 2,
      budget: 10,
      cost: 0.002,
      open: bench.open,
    });
    twins.born(places(4), raised(2), 1e-3);
    twins.resample(5);
    twins.reverse();
    expect(twins.pending).toBe(true);
    twins.send(frame({ time: 0, pieces: 0, shakes: [] }));
    expect(twins.pending).toBe(false);
    for (const commands of bench.sent) {
      expect(commands[0]?.events.map((event) => event.kind)).toEqual([
        "born",
        "masses",
        "reverse",
      ]);
    }
    bench.deliver();
    twins.take();
    twins.each((_, report) => {
      expect(report.n).toBe(5);
    });
  });

  it("carry as many twins as the worker that carries fewest allows, each in its budget", () => {
    const bench = new Bench();
    const twins = new TwinWorkers({
      shares: 3,
      n: 2,
      budget: 4,
      cost: 0.01,
      open: bench.open,
    });
    // each carries 4 / (0.01 x 1.2) = 333 twins
    expect(twins.affordable()).toBe(3 * 333);
    twins.setBudget(10);
    expect(twins.affordable()).toBe(3 * 833);
    // a twin of more masses costs more
    twins.rescale(2, 8);
    expect(twins.affordable()).toBeLessThan((3 * 833) / 7);
  });

  it("go back to the main line when a worker fails: the fan is lost, and one share carries it from then on", () => {
    const bench = new Bench();
    let lost = 0;
    const twins = new TwinWorkers({
      shares: 3,
      n: 2,
      budget: 10,
      cost: 0.002,
      open: bench.open,
      lost: () => {
        lost++;
      },
    });
    twins.born(places(9), raised(2), 1e-3);
    twins.send(frame());
    bench.fail(1);
    expect(lost).toBe(1);
    expect(twins.local).toBe(true);
    expect(twins.shares).toBe(1);
    expect(twins.count).toBe(0);
    // the twins born again run at once, on the main line
    twins.born(places(5), raised(2), 1e-3);
    twins.send(frame());
    const seen: number[] = [];
    twins.take();
    twins.each((j, report) => {
      seen.push(j);
      expect(report.count).toBe(5);
    });
    expect(seen).toEqual(places(5));
    // a report of a worker that failed is not drawn
    bench.deliver();
    twins.take(() => {
      throw new Error("a failed worker's report was seen");
    });
  });
});
