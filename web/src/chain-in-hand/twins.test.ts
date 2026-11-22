import { describe, expect, it } from "vitest";

import { Merger, SpanBatch } from "../core/curves.ts";
import type { TwinReport } from "../core/twin-share.ts";
import { pivotAt, type Drive, type PivotMotion } from "../physics/drive.ts";
import { pivotsOver, twinCurve, twinPieces, twinTrailLight } from "./twins.ts";

// The first piece's twins (docs/decisions.md, decision 92): what is sent to
// their workers each frame, and how what comes back is drawn into the
// trails, in one place (decisions 21, 51, 68 and 75).

describe("the pieces the twins are sent in (decisions 21 and 51)", () => {
  it("are none for events alone, one with the trails off, and 240 to the second, from one to eight", () => {
    expect(twinPieces(0, 2.5)).toBe(0);
    expect(twinPieces(-1, 2.5)).toBe(0);
    expect(twinPieces(1 / 60, 0)).toBe(1);
    expect(twinPieces(1 / 240, 2.5)).toBe(1);
    expect(twinPieces(1e-4, 2.5)).toBe(1);
    expect(twinPieces(1 / 60, 2.5)).toBe(4);
    expect(twinPieces(1 / 30, 2.5)).toBe(8);
    expect(twinPieces(0.25, 2.5)).toBe(8);
  });
});

describe("the light of the twins' trails (decision 21)", () => {
  it("is fainter the more twins there are, from 0.35 down to 0.03", () => {
    expect(twinTrailLight(0)).toBe(0.35);
    expect(twinTrailLight(1)).toBe(0.35);
    expect(twinTrailLight(64)).toBeCloseTo(0.15, 15);
    expect(twinTrailLight(512)).toBeCloseTo(1.2 / Math.sqrt(512), 15);
    expect(twinTrailLight(4096)).toBe(0.03);
  });
});

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
