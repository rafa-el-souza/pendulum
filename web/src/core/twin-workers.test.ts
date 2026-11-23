import { describe, expect, it } from "vitest";

import { gravity } from "../physics/chain.ts";
import { restingState, type ChainState } from "../physics/step.ts";
import { TwinShare, type TwinCommand } from "./twin-share.ts";
import {
  FrameRhythm,
  TwinWorkers,
  sharesFor,
  workerBudget,
  type OpenShare,
  type SharePort,
  type TwinFrame,
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
function frame(more: Partial<TwinFrame> = {}): TwinFrame {
  return {
    time: FRAME,
    pieces: 2,
    g,
    shakes: [null, null],
    chain: null,
    hold: null,
    whole: true,
    clock: null,
    drive: null,
    budget: 10,
    curves: null,
    stamps: null,
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

  it("send a split and a forget of the twins' curves to every worker, in order with the rest, as what happened (decision 95)", () => {
    const bench = new Bench();
    const twins = new TwinWorkers({
      shares: 2,
      n: 2,
      budget: 10,
      cost: 0.002,
      open: bench.open,
    });
    twins.born(places(4), raised(2), 1e-3);
    twins.split();
    twins.forget();
    expect(twins.pending).toBe(true);
    twins.send(frame({ time: 0, pieces: 0, shakes: [] }));
    for (const commands of bench.sent) {
      expect(commands[0]?.events.map((event) => event.kind)).toEqual([
        "born",
        "split",
        "forget",
      ]);
    }
  });

  it("number the commands, and tell whether every worker has had each one it was sent taken back (decision 95)", () => {
    const bench = new Bench();
    const twins = new TwinWorkers({
      shares: 3,
      n: 2,
      budget: 10,
      cost: 0.002,
      open: bench.open,
    });
    expect(twins.inStep).toBe(true);
    twins.born(places(6), raised(2), 1e-3);
    twins.send(frame());
    twins.send(frame());
    for (const commands of bench.sent) {
      expect(commands.map((command) => command.seq)).toEqual([1, 2]);
    }
    expect(twins.inStep).toBe(false);
    // come back, but not yet taken
    bench.deliver();
    expect(twins.inStep).toBe(false);
    twins.take();
    expect(twins.inStep).toBe(true);
    twins.send(frame());
    expect(twins.inStep).toBe(false);
    // a fan put out meanwhile: its report is not drawn, but it came back
    twins.clear();
    bench.deliver();
    twins.take();
    expect(twins.inStep).toBe(true);
  });

  it("say the number the next command will carry, hand back every report taken, of an old fan too, and send each worker its own curves' numbers (decision 97)", () => {
    const bench = new Bench();
    const twins = new TwinWorkers({
      shares: 2,
      n: 2,
      budget: 10,
      cost: 0.002,
      open: bench.open,
    });
    expect(twins.nextSeq).toBe(1);
    twins.born(places(4), raised(2), 1e-3);
    const curvesFor = (share: number) => ({
      light: 0.1,
      stampLight: 0.1,
      music: 1,
      shine: Float64Array.of(share, share),
      palette: 0,
      tint: null,
      lines: true,
    });
    twins.send(frame(), curvesFor);
    expect(twins.nextSeq).toBe(2);
    expect(
      bench.sent.map((sent) => [...(sent[0]?.curves?.shine ?? [])]),
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
    twins.clear();
    bench.deliver();
    const back: [number, number][] = [];
    twins.take(undefined, true, (share, report) => {
      back.push([share, report.seq]);
    });
    expect(back).toEqual([
      [0, 1],
      [1, 1],
    ]);
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

// The time each worker may take in a frame (decision 51): the frame's free
// time, until 2 ms before the screen's next frame. A page whose frames come
// late, such as one drawn without a GPU, has none, so that the twins it
// draws are not more than the frames can carry.
describe("the frames' rhythm", () => {
  const SIXTY = 1000 / 60;

  /** A rhythm that has seen `count` frames `gap` ms apart. */
  function after(gap: number, count = 60, rhythm = new FrameRhythm()) {
    for (let i = 0; i < count; i++) rhythm.frame(gap);
    return rhythm;
  }

  it("starts as a screen at 60 Hz whose frames come on time", () => {
    const rhythm = new FrameRhythm();
    expect(rhythm.screen).toBeCloseTo(SIXTY, 9);
    // 3 ms into the frame, 2 ms kept before the next one
    expect(rhythm.free(3, 2)).toBeCloseTo(SIXTY - 5, 9);
  });

  it("gives a frame on time at 60 Hz the time until a little before the next one", () => {
    const rhythm = after(SIXTY);
    expect(rhythm.free(3, 2)).toBeCloseTo(SIXTY - 5, 6);
    expect(rhythm.free(8, 2)).toBeCloseTo(SIXTY - 10, 6);
  });

  it("follows a faster screen's own rhythm, which leaves less time", () => {
    const rhythm = after(1000 / 120, 400);
    expect(rhythm.screen).toBeCloseTo(1000 / 120, 6);
    expect(rhythm.free(3, 2)).toBeCloseTo(1000 / 120 - 5, 6);
  });

  it("leaves no free time while the frames come late, where the page cannot draw as fast as the screen", () => {
    // ten frames a second on a screen of sixty: the frames are late, and the
    // time until the next one is no time the page has to spare
    const rhythm = after(100);
    expect(rhythm.screen).toBeCloseTo(SIXTY, 9);
    expect(rhythm.free(1, 2)).toBeLessThan(0);
  });

  it("takes a little lateness off the free time, and gives it back as the frames catch up", () => {
    const late = after(20, 200);
    expect(late.free(3, 2)).toBeCloseTo(SIXTY - 5 - (20 - SIXTY), 3);
    const caught = after(SIXTY, 200, late);
    expect(caught.free(3, 2)).toBeCloseTo(SIXTY - 5, 3);
  });

  it("takes a browser that holds the frames to 30 a second as late against 60 Hz", () => {
    expect(after(1000 / 30, 200).free(3, 2)).toBeLessThan(0);
  });

  it("is not taken for a faster screen by a few short gaps", () => {
    const rhythm = new FrameRhythm();
    for (let i = 0; i < 60; i++) rhythm.frame(i % 20 === 0 ? 5 : SIXTY);
    expect(rhythm.screen).toBeCloseTo(SIXTY, 9);
  });

  it("leaves out a pause of the page, such as a hidden tab, which is no frame", () => {
    const rhythm = after(SIXTY);
    rhythm.frame(5000);
    expect(rhythm.free(3, 2)).toBeCloseTo(SIXTY - 5, 6);
    expect(rhythm.late).toBe(false);
  });

  it("says the frames come late once they come a quarter slower than the screen's, and not for a frame dropped now and then", () => {
    expect(new FrameRhythm().late).toBe(false);
    expect(after(SIXTY).late).toBe(false);
    expect(after(1000 / 120, 400).late).toBe(false);
    // one frame in ten dropped at 60 Hz
    const dropped = new FrameRhythm();
    for (let i = 0; i < 200; i++)
      dropped.frame(i % 10 === 0 ? 2 * SIXTY : SIXTY);
    expect(dropped.late).toBe(false);
    expect(after(20, 200).late).toBe(false);
    expect(after(1000 / 30, 200).late).toBe(true);
    expect(after(100).late).toBe(true);
  });
});

// The time each worker takes (decisions 20 and 51): the frame's free time,
// from 1 ms to 10 ms; and while the frames come late, the workers together
// keep at least the 4 ms the main line gave all the twins before them, so
// that a device with few cores carries no fewer twins than it did then.
describe("a worker's budget", () => {
  const limits = { least: 1, most: 10, floor: 4 };

  it("is the frame's free time, at most the most", () => {
    expect(workerBudget(5, 3, false, limits)).toBe(5);
    expect(workerBudget(12, 3, false, limits)).toBe(10);
    expect(workerBudget(5, 1, true, limits)).toBe(5);
  });

  it("is the least in a frame with no time free whose frames come on time, however few the workers", () => {
    expect(workerBudget(-3, 1, false, limits)).toBe(1);
    expect(workerBudget(0.5, 3, false, limits)).toBe(1);
  });

  it("while the frames come late, shares out at least the main line's time among the workers, never less than the least each", () => {
    expect(workerBudget(-20, 1, true, limits)).toBe(4);
    expect(workerBudget(-20, 2, true, limits)).toBe(2);
    expect(workerBudget(-20, 3, true, limits)).toBeCloseTo(4 / 3, 12);
    expect(workerBudget(-20, 4, true, limits)).toBe(1);
    expect(workerBudget(-20, 7, true, limits)).toBe(1);
    // the frame's free time where it is more
    expect(workerBudget(6, 1, true, limits)).toBe(6);
  });
});
