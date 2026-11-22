import { describe, expect, it } from "vitest";

import {
  SNAPSHOT_HALF_LIVES,
  SNAPSHOT_SPANS,
  TrailClock,
  clockAt,
  KEEP_DEFAULT,
  KEEP_MOST,
  keepMeasures,
  readCurves,
  readKeep,
  readMeter,
  readStretch,
  readable,
  snapshotDue,
  snapshotGain,
  snapshotWhen,
  trailMechanism,
} from "./sharp.ts";
import { bufferView } from "./view.ts";

// Trails kept as curves, drawn anew in any view, beside the image carried
// to it (docs/decisions.md, decision 68), which the address asks for as
// layers (decision 71).

describe("which trails an address asks for", () => {
  it("keeps the trails as curves unless the address asks for layers, the image carried (decision 71)", () => {
    expect(readCurves("")).toBe(true);
    expect(readCurves("?trails=sharp")).toBe(true);
    expect(readCurves("?n=3&trails=sharp&zoom=2")).toBe(true);
    expect(readCurves("?trails=")).toBe(true);
    expect(readCurves("?trails=layers")).toBe(false);
    expect(readCurves("?n=3&trails=layers&zoom=2")).toBe(false);
  });

  it("keeps the trails' mechanism, their window, how far their old light stretches and the meter, and nothing else, beside a saved moment", () => {
    expect(keepMeasures("?n=3&trails=sharp&zoom=2&fps=1")).toBe(
      "?trails=sharp&fps=1",
    );
    expect(keepMeasures("?fps=1")).toBe("?fps=1");
    expect(keepMeasures("?n=3&zoom=2")).toBe("");
    expect(keepMeasures("?keep=3&n=3&trails=sharp")).toBe(
      "?trails=sharp&keep=3",
    );
    expect(keepMeasures("?trails=layers&n=3")).toBe("?trails=layers");
    expect(keepMeasures("?stretch=2&n=3&keep=3")).toBe("?keep=3&stretch=2");
  });

  it("lets the light from before the window be stretched as many times as ?stretch= says before it is hidden, from one to sixty-four, a quarter when it says none (decision 72)", () => {
    expect(readStretch("")).toBe(1.25);
    expect(readStretch("?stretch=2")).toBe(2);
    expect(readStretch("?n=3&stretch=1.5&keep=3")).toBe(1.5);
    expect(readStretch("?stretch=64")).toBe(64);
    expect(readStretch("?stretch=100")).toBe(64);
    expect(readStretch("?stretch=0.5")).toBe(1);
    expect(readStretch("?stretch=")).toBe(1.25);
    expect(readStretch("?stretch=far")).toBe(1.25);
  });

  it("asks the curves to keep as many times more spans as ?keep= says, from one to twenty, and ten times when it says none (decisions 70 and 71)", () => {
    expect(KEEP_DEFAULT).toBe(10);
    expect(readKeep("")).toBe(10);
    expect(readKeep("?keep=3")).toBe(3);
    expect(readKeep("?n=3&keep=2.5&trails=sharp")).toBe(2.5);
    expect(KEEP_MOST).toBe(20);
    expect(readKeep("?keep=50")).toBe(20);
    expect(readKeep("?keep=0.5")).toBe(1);
    expect(readKeep("?keep=1")).toBe(1);
    expect(readKeep("?keep=")).toBe(10);
    expect(readKeep("?keep=many")).toBe(10);
  });

  it("shows the meter with ?fps=1", () => {
    expect(readMeter("?fps=1")).toBe(true);
    expect(readMeter("?trails=sharp&fps=1")).toBe(true);
    expect(readMeter("?fps=0")).toBe(false);
    expect(readMeter("")).toBe(false);
  });
});

describe("the trails' mechanism", () => {
  const trails = { mark: false, floating: true };

  it("keeps the trails as curves when asked, without a mark, in half floats, a strobe's as well as lines (decision 91)", () => {
    expect(trailMechanism(true, trails)).toBe("sharp");
    expect(Object.keys(trails)).toEqual(["mark", "floating"]);
  });

  it("carries the image, as layers, when asked, and where the curves cannot yet: a mark, eight bits (decisions 71 and 91)", () => {
    expect(trailMechanism(false, trails)).toBe("layers");
    expect(trailMechanism(true, { ...trails, mark: true })).toBe("layers");
    expect(trailMechanism(true, { ...trails, floating: false })).toBe("layers");
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

  it("come after as many times more spans as the window keeps (decision 70)", () => {
    expect(snapshotDue(0.1, SNAPSHOT_SPANS, 3)).toBe(false);
    expect(snapshotDue(0.1, 3 * SNAPSHOT_SPANS - 1, 3)).toBe(false);
    expect(snapshotDue(0.1, 3 * SNAPSHOT_SPANS, 3)).toBe(true);
    expect(snapshotDue(3, 0, 3)).toBe(true);
  });

  it("wait while the image lacks light from before the window, which a copy would lose, unless the window is full; then the copy is made with that light (decision 70)", () => {
    expect(snapshotWhen(false, false, false)).toBe("no");
    expect(snapshotWhen(false, true, true)).toBe("no");
    expect(snapshotWhen(true, false, false)).toBe("copy");
    expect(snapshotWhen(true, false, true)).toBe("copy");
    expect(snapshotWhen(true, true, false)).toBe("no");
    expect(snapshotWhen(true, true, true)).toBe("compose");
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

describe("the light before the older snapshot, read nearer (decision 69)", () => {
  const at = (zoom: number) => bufferView(1280, 720, 1, { zoom, cx: 0, cy: 0 });

  it("is read from a snapshot, or its coarse image, while the view is at most a quarter nearer than it saw, and again as the view goes farther", () => {
    // Z once from the whole view, then twice
    expect(readable(at(1), at(1.25))).toBe(true);
    expect(readable(at(1), at(1.5625))).toBe(false);
    expect(readable(at(8), at(10))).toBe(true);
    expect(readable(at(8), at(10.1))).toBe(false);
    // farther, however much
    expect(readable(at(8), at(1))).toBe(true);
  });

  it("is read as far as the address lets it be stretched (decision 72)", () => {
    expect(readable(at(1), at(1.5625), 2)).toBe(true);
    expect(readable(at(1), at(2), 2)).toBe(true);
    expect(readable(at(1), at(2.01), 2)).toBe(false);
    expect(readable(at(1), at(64), 64)).toBe(true);
  });

  it("counts a larger canvas as nearer, as the image carried does", () => {
    const small = bufferView(640, 400, 1);
    expect(readable(small, bufferView(704, 440, 1))).toBe(true);
    expect(readable(small, bufferView(1280, 800, 1))).toBe(false);
  });
});
