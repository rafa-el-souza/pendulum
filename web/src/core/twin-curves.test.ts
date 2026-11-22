import { describe, expect, it } from "vitest";

import { Merger, SpanBatch } from "./curves.ts";
import { anglesAt, pivotsOver, stampTwin, twinCurve } from "./twin-curves.ts";
import { TWIN_STEP, type TwinReport } from "./twin-share.ts";
import { Chain, gravity } from "../physics/chain.ts";
import { pivotAt, type Drive, type PivotMotion } from "../physics/drive.ts";
import { Stepper, restingState } from "../physics/step.ts";

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
    seq: 0,
    curves: null,
    stamps: null,
    stampPlaces: new Float32Array(0),
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

describe("a twin at a strobe's flash, between the ends of its piece (decision 100)", () => {
  /** Where the tip of a chain at these angles is. */
  function tip(chain: Chain, theta: Float64Array): [number, number] {
    const x = new Float64Array(chain.n);
    const y = new Float64Array(chain.n);
    chain.positions(theta, x, y);
    return [x[chain.n - 1] ?? 0, y[chain.n - 1] ?? 0];
  }

  for (const n of [2, 8]) {
    it(`lands where the twins' own step puts the chain at the flash's instant, far nearer than either end of the piece, with ${String(n)} masses`, () => {
      const chain = Chain.uniform(n);
      const stepper = new Stepper(chain, { maxStep: TWIN_STEP });
      const g = gravity(9.81);
      // the piece's raised start, let go and run a second and a half
      const state = restingState(n);
      for (let i = 0; i < n; i++) {
        state.theta[i] = 2.2 + (0.7 * i) / Math.max(1, n - 1);
      }
      const h = 1 / 240;
      for (let k = 0; k < 360; k++) stepper.advance(state, h, g);
      const angles = new Float64Array(n);
      let worst = 0;
      let nearest = 0;
      for (let piece = 0; piece < 240; piece++) {
        const theta0 = Float64Array.from(state.theta);
        const omega0 = Float64Array.from(state.omega);
        stepper.advance(state, h, g);
        const s = (((piece * 0.618) % 1) * 0.9 + 0.05) * h;
        // the step itself, to the flash's instant, on a copy
        const copy = {
          theta: Float64Array.from(theta0),
          omega: Float64Array.from(omega0),
        };
        stepper.advance(copy, s, g);
        anglesAt(theta0, omega0, state.theta, state.omega, s, h, angles);
        const [ex, ey] = tip(chain, copy.theta);
        const [cx, cy] = tip(chain, angles);
        const [nx, ny] = tip(chain, s < h / 2 ? theta0 : state.theta);
        worst = Math.max(worst, Math.hypot(cx - ex, cy - ey));
        nearest = Math.max(nearest, Math.hypot(nx - ex, ny - ey));
      }
      // within a fifth of a millimetre, where the nearer end of the piece is
      // centimetres off
      expect(worst).toBeLessThan(2e-4);
      expect(worst).toBeLessThan(nearest / 50);
    });
  }

  it("is the piece's first end at its start and its last end at its end, exactly", () => {
    const theta0 = Float64Array.of(0.3, -1.2);
    const omega0 = Float64Array.of(2, -7);
    const theta1 = Float64Array.of(0.31, -1.23);
    const omega1 = Float64Array.of(2.5, -6);
    const out = new Float64Array(2);
    anglesAt(theta0, omega0, theta1, omega1, 0, 1 / 240, out);
    expect(Array.from(out)).toEqual(Array.from(theta0));
    anglesAt(theta0, omega0, theta1, omega1, 1 / 240, 1 / 240, out);
    expect(Array.from(out)).toEqual(Array.from(theta1));
  });
});

describe("a twin stamped by a strobe's flash (decision 100)", () => {
  // two masses hung from a pivot at (0.1, 0.2), from the top: one 0.5 m
  // below, the next half a metre to its right
  const places = Float32Array.of(9, 9, 0, -0.5, 0.5, -0.5);
  const stamped = (parts: "tip" | "masses" | "rods" | "whole") => {
    const batch = new SpanBatch();
    stampTwin(batch, parts, 2, places, 2, 0.1, 0.2, [0.8, 0.4, 0.2], 0.05, 1.5);
    return Array.from({ length: batch.count }, (_, i) => batch.span(i));
  };

  it("stamps its rods as straight spans from the pivot, each as bright at both ends, at the flash's fade, in its colour", () => {
    const rods = stamped("rods");
    expect(rods).toHaveLength(2);
    const [first, second] = rods;
    expect(first?.point).toBe(false);
    expect(first?.x0).toBeCloseTo(0.1, 6);
    expect(first?.y0).toBeCloseTo(0.2, 6);
    expect(first?.x1).toBeCloseTo(0.1, 6);
    expect(first?.y1).toBeCloseTo(-0.3, 6);
    expect(second?.x0).toBeCloseTo(0.1, 6);
    expect(second?.y0).toBeCloseTo(-0.3, 6);
    expect(second?.x1).toBeCloseTo(0.6, 6);
    expect(second?.y1).toBeCloseTo(-0.3, 6);
    // straight: each end's tangent the chord itself
    expect(second?.mx0).toBeCloseTo(0.5, 6);
    expect(second?.mx1).toBeCloseTo(0.5, 6);
    expect(second?.my0).toBeCloseTo(0, 6);
    for (const rod of rods) {
      expect(rod?.l0).toBeCloseTo(0.05, 6);
      expect(rod?.l1).toBeCloseTo(0.05, 6);
      expect(rod?.f0).toBeCloseTo(1.5, 6);
      expect(rod?.f1).toBeCloseTo(1.5, 6);
      expect(rod?.rgb[0]).toBeCloseTo(0.8, 2);
    }
  });

  it("stamps its tip, or every mass, as a point twice as bright, as the chain's are (decision 96)", () => {
    const tip = stamped("tip");
    expect(tip).toHaveLength(1);
    expect(tip[0]?.point).toBe(true);
    expect(tip[0]?.x0).toBeCloseTo(0.6, 6);
    expect(tip[0]?.y0).toBeCloseTo(-0.3, 6);
    expect(tip[0]?.l0).toBeCloseTo(0.1, 6);
    const masses = stamped("masses");
    expect(masses.map((span) => span?.point)).toEqual([true, true]);
    expect(masses[0]?.y0).toBeCloseTo(-0.3, 6);
    expect(masses[0]?.x0).toBeCloseTo(0.1, 6);
  });

  it("stamps the whole of it, each rod then the mass it ends in", () => {
    const whole = stamped("whole");
    expect(whole.map((span) => span?.point)).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(whole[3]?.x0).toBeCloseTo(0.6, 6);
  });
});
