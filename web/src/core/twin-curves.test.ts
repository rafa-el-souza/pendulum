import { describe, expect, it } from "vitest";

import { Merger, SpanBatch } from "./curves.ts";
import { pivotsOver, twinCurve } from "./twin-curves.ts";
import type { TwinReport } from "./twin-share.ts";
import { pivotAt, type Drive, type PivotMotion } from "../physics/drive.ts";

// The twins' tips drawn into their trails as curves (decisions 21, 68 and
// 75): where the pivot was at each of a report's instants, and a twin's tip
// along a report as samples of a curve.

describe("the pivot over a report's instants (decision 75)", () => {
  it("is nowhere without a drive", () => {
    const places = new Float64Array(6).fill(9);
    const speeds = new Float64Array(6).fill(9);
    pivotsOver(null, 2, 0.02, places, speeds);
    expect([...places]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([...speeds]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("is where the drive's kicks take it at each of the instants evenly over the time, and moving as they move it", () => {
    const drive: Drive = {
      span: 0.02,
      tilt: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      kicks: [{ start: -0.01, x: 0.003, y: -0.001, attack: 0.01, decay: 0.1 }],
      hands: [],
      drag: [0, 0],
      heat: null,
    };
    const pieces = 4;
    const time = 0.02;
    const places = new Float64Array(2 * (pieces + 1));
    const speeds = new Float64Array(2 * (pieces + 1));
    pivotsOver(drive, pieces, time, places, speeds);
    const then: PivotMotion = { x: 0, y: 0, vx: 0, vy: 0 };
    for (let piece = 0; piece <= pieces; piece++) {
      pivotAt(drive, (piece * time) / pieces, then);
      expect(places[2 * piece]).toBe(then.x);
      expect(places[2 * piece + 1]).toBe(then.y);
      expect(speeds[2 * piece]).toBe(then.vx);
      expect(speeds[2 * piece + 1]).toBe(then.vy);
    }
    expect(places[2 * pieces]).not.toBe(places[0]);
  });
});

/** A report of one twin whose tip goes from (0, -1) along a line at 1 m/s to the right, over `pieces` pieces of `time` s. */
function report(pieces: number, time: number, from = 0): TwinReport {
  const tips = new Float32Array(2 * (pieces + 1));
  const tipSpeeds = new Float32Array(2 * (pieces + 1));
  for (let piece = 0; piece <= pieces; piece++) {
    tips[2 * piece] = from + (piece * time) / pieces;
    tips[2 * piece + 1] = -1;
    tipSpeeds[2 * piece] = 1;
    tipSpeeds[2 * piece + 1] = 0;
  }
  return {
    generation: 0,
    asked: 1,
    count: 1,
    n: 2,
    pieces,
    positions: new Float32Array(0),
    tips,
    tipSpeeds,
    time,
    clock: { seconds: 10, fade: 4, rate: 0.4 },
    apart: new Float64Array(0),
    spent: 0,
    stretch: 0,
    stretchTime: 0,
  };
}

describe("a twin's tip drawn as a curve (decision 68)", () => {
  it("samples the tip at each of the report's instants on its clock, where the pivot was then, and draws each interval now", () => {
    const merger = new Merger();
    const fresh = new SpanBatch();
    const closed = new SpanBatch();
    const pivots = new Float64Array([0, 0.5, 0, 0.5, 0, 0.5]);
    const speeds = new Float64Array(6);
    twinCurve(
      merger,
      fresh,
      closed,
      7,
      report(2, 0.02),
      0,
      [1, 0, 0],
      0.2,
      pivots,
      speeds,
    );
    // two intervals drawn now, from the first sample, on the clock
    expect(fresh.count).toBe(2);
    const first = fresh.span(0);
    const second = fresh.span(1);
    expect(first?.x0).toBeCloseTo(0, 6);
    expect(first?.y0).toBeCloseTo(-0.5, 6);
    expect(second?.x1).toBeCloseTo(0.02, 6);
    expect(first?.f0).toBeCloseTo(4, 6);
    expect(second?.f1).toBeCloseTo(4 + 0.02 * 0.4, 6);
    expect(closed.count).toBe(0);
    // the next report goes on from where this one ended
    expect(merger.continues(7, 0.02, -0.5, 1e-6)).toBe(true);
  });

  it("starts the trail anew where the tip jumped, born again", () => {
    const merger = new Merger();
    const fresh = new SpanBatch();
    const closed = new SpanBatch();
    const still = new Float64Array(6);
    twinCurve(
      merger,
      fresh,
      closed,
      0,
      report(2, 0.02),
      0,
      [1, 1, 1],
      0.2,
      still,
      still,
    );
    fresh.clear();
    // born again a metre away: the span it was drawing ends there
    twinCurve(
      merger,
      fresh,
      closed,
      0,
      report(2, 0.02, 1),
      0,
      [1, 1, 1],
      0.2,
      still,
      still,
    );
    expect(closed.count).toBe(1);
    expect(fresh.count).toBe(2);
    expect(fresh.span(0)?.x0).toBeCloseTo(1, 6);
  });
});
