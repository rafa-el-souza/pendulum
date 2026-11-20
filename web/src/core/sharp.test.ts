import { describe, expect, it } from "vitest";

import {
  SNAPSHOT_HALF_LIVES,
  SNAPSHOT_SPANS,
  TrailClock,
  clockAt,
  keepMeasures,
  readMeter,
  readTrailsAsked,
  snapshotDue,
  snapshotGain,
  trailMechanism,
} from "./sharp.ts";

// Trails kept as curves, drawn anew in any view, beside the image carried
// to it (docs/decisions.md, decision 68).

describe("which trails an address asks for", () => {
  it("asks for trails kept as curves with ?trails=sharp, and for the image carried otherwise", () => {
    expect(readTrailsAsked("?trails=sharp")).toBe(true);
    expect(readTrailsAsked("?n=3&trails=sharp&zoom=2")).toBe(true);
    expect(readTrailsAsked("?trails=b")).toBe(false);
    expect(readTrailsAsked("?trails=")).toBe(false);
    expect(readTrailsAsked("")).toBe(false);
  });

  it("keeps the trails' mechanism and the meter, and nothing else, beside a saved moment", () => {
    expect(keepMeasures("?n=3&trails=sharp&zoom=2&fps=1")).toBe(
      "?trails=sharp&fps=1",
    );
    expect(keepMeasures("?fps=1")).toBe("?fps=1");
    expect(keepMeasures("?n=3&zoom=2")).toBe("");
  });

  it("shows the meter with ?fps=1", () => {
    expect(readMeter("?fps=1")).toBe(true);
    expect(readMeter("?trails=sharp&fps=1")).toBe(true);
    expect(readMeter("?fps=0")).toBe(false);
    expect(readMeter("")).toBe(false);
  });
});

describe("the trails' mechanism", () => {
  const lines = { strobe: false, mark: false, floating: true };

  it("keeps the trails as curves when asked, as lines, without a mark, in half floats", () => {
    expect(trailMechanism(true, lines)).toBe("sharp");
  });

  it("carries the image when not asked, and where the curves cannot yet: a strobe's, a mark, eight bits", () => {
    expect(trailMechanism(false, lines)).toBe("B");
    expect(trailMechanism(true, { ...lines, strobe: true })).toBe("B");
    expect(trailMechanism(true, { ...lines, mark: true })).toBe("B");
    expect(trailMechanism(true, { ...lines, floating: false })).toBe("B");
  });
});

describe("the samples' clock", () => {
  it("runs a step's fade at a half-life a half-life, and not at all for trails that stay", () => {
    const clock = new TrailClock();
    const first = clock.begin(2.5);
    expect(first).toEqual({ seconds: 0, fade: 0, rate: 0.4 });
    clock.advance(0.5);
    clock.advance(0.75);
    expect(clock.seconds).toBeCloseTo(1.25, 15);
    expect(clock.fade).toBeCloseTo(0.5, 15);
    // the music lingers: the next step's half-life is twice as long
    const next = clock.begin(5);
    clock.advance(2.5);
    expect(next).toEqual({ seconds: 1.25, fade: 0.5, rate: 0.2 });
    expect(clock.fade).toBeCloseTo(1, 15);
    clock.begin(Number.POSITIVE_INFINITY);
    clock.advance(10);
    expect(clock.fade).toBeCloseTo(1, 15);
    expect(clock.seconds).toBeCloseTo(13.75, 15);
  });

  it("gives an instant within a step its seconds and its fade, as the twins' pieces take them", () => {
    const start = { seconds: 2, fade: 0.5, rate: 0.4 };
    expect(clockAt(start, 0)).toEqual([2, 0.5]);
    const [seconds, fade] = clockAt(start, 0.25);
    expect(seconds).toBeCloseTo(2.25, 15);
    expect(fade).toBeCloseTo(0.6, 15);
  });
});

describe("the snapshots", () => {
  it("are due three half-lives of fade after the last, or once its count of spans has come since, whichever first", () => {
    expect(SNAPSHOT_HALF_LIVES).toBe(3);
    expect(snapshotDue(2.99, 0)).toBe(false);
    expect(snapshotDue(3, 0)).toBe(true);
    expect(snapshotDue(0.1, SNAPSHOT_SPANS - 1)).toBe(false);
    expect(snapshotDue(0.1, SNAPSHOT_SPANS)).toBe(true);
    // trails that stay never fade: the count alone brings one
    expect(snapshotDue(0, SNAPSHOT_SPANS)).toBe(true);
  });

  it("are read with their light faded since they were taken, in the units the image holds now", () => {
    // light kept divided by k: a snapshot taken at k = 0.5 holds half its
    // light; two half-lives later, read into an image at k = 0.25
    expect(snapshotGain({ k: 0.5, fade: 1 }, { k: 0.25, fade: 3 })).toBeCloseTo(
      0.5,
      15,
    );
    expect(snapshotGain({ k: 1, fade: 4 }, { k: 1, fade: 4 })).toBe(1);
  });
});
