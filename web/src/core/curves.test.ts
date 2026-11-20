import { describe, expect, it } from "vitest";

import type { Rgb } from "./color.ts";
import {
  MERGE_MOST,
  MERGE_REACH,
  MERGE_TOLERANCE,
  Merger,
  SpanBatch,
  bendOf,
  hermiteAt,
  piecesFor,
  strays,
  type Span,
} from "./curves.ts";

// Trails kept as curves (docs/decisions.md, decision 68): each span of a
// trail keeps its ends' positions and velocities, a cubic Hermite curve, so
// that it can be drawn anew, as fine, in any view.

const WHITE: Rgb = [1, 1, 1];

/** A span from its batch, its fields by name. */
function only(batch: SpanBatch, index = 0): Span {
  const span = batch.span(index);
  if (span === null) throw new Error(`no span ${String(index)}`);
  return span;
}

describe("a span's curve", () => {
  const span: Span = {
    x0: 0.1,
    y0: -0.2,
    x1: 0.3,
    y1: -0.1,
    mx0: 0.2,
    my0: 0.3,
    mx1: 0.1,
    my1: -0.2,
    rgb: WHITE,
    l0: 1,
    l1: 1,
    f0: 0,
    f1: 0,
  };

  it("runs from its first end to its last, leaving each along its tangent", () => {
    expect(hermiteAt(span, 0)).toEqual([0.1, -0.2]);
    const [x1, y1] = hermiteAt(span, 1);
    expect(x1).toBeCloseTo(0.3, 15);
    expect(y1).toBeCloseTo(-0.1, 15);
    const h = 1e-6;
    const [ax, ay] = hermiteAt(span, h);
    expect((ax - 0.1) / h).toBeCloseTo(0.2, 4);
    expect((ay + 0.2) / h).toBeCloseTo(0.3, 4);
    const [bx, by] = hermiteAt(span, 1 - h);
    expect((x1 - bx) / h).toBeCloseTo(0.1, 4);
    expect((y1 - by) / h).toBeCloseTo(-0.2, 4);
  });

  it("bends most at an end, as the shader takes it, by the second derivative there", () => {
    // the second derivative by differences at both ends
    const h = 1e-4;
    const second = (u: number): number => {
      const [ax, ay] = hermiteAt(span, u - h);
      const [bx, by] = hermiteAt(span, u);
      const [cx, cy] = hermiteAt(span, u + h);
      return Math.hypot(
        (ax - 2 * bx + cx) / h ** 2,
        (ay - 2 * by + cy) / h ** 2,
      );
    };
    expect(bendOf(span)).toBeCloseTo(Math.max(second(h), second(1 - h)), 2);
  });

  it("is cut into as few straight pieces as keep each within the tolerance of the curve, from one to the most", () => {
    // a chord over a share du of the span strays at most bend du² / 8
    expect(piecesFor(0, 0.05, 16)).toBe(1);
    for (const bend of [0.3, 2, 40, 600]) {
      const k = piecesFor(bend, 0.05, 16);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(16);
      if (k < 16) expect(bend / (8 * k * k)).toBeLessThanOrEqual(0.05);
      if (k > 1) expect(bend / (8 * (k - 1) ** 2)).toBeGreaterThan(0.05);
    }
    expect(piecesFor(1e6, 0.05, 16)).toBe(16);
  });

  it("says how far it is from a point at a share of its length", () => {
    const [x, y] = hermiteAt(span, 0.3);
    expect(strays(span, 0.3, x, y)).toBeCloseTo(0, 15);
    expect(strays(span, 0.3, x + 3e-6, y + 4e-6)).toBeCloseTo(5e-6, 12);
  });
});

describe("a batch of spans", () => {
  it("keeps each span's ends, tangents, colour, light and fade clock, and grows", () => {
    const batch = new SpanBatch(2);
    for (let i = 0; i < 5; i++) {
      batch.push(i, 2, 3, 4, 5, 6, 7, 8, [1, 0.5, 0], 0.25, 0.75, 10 + i, 11);
    }
    expect(batch.count).toBe(5);
    const span = only(batch, 4);
    expect([span.x0, span.y0, span.x1, span.y1]).toEqual([4, 2, 3, 4]);
    expect([span.mx0, span.my0, span.mx1, span.my1]).toEqual([5, 6, 7, 8]);
    expect(span.rgb[0]).toBe(1);
    expect(span.rgb[1]).toBeCloseTo(0.5, 2);
    expect(span.rgb[2]).toBe(0);
    expect([span.l0, span.l1, span.f0, span.f1]).toEqual([0.25, 0.75, 14, 11]);
    batch.clear();
    expect(batch.count).toBe(0);
    expect(batch.span(0)).toBeNull();
  });
});

/** Samples of a point going round a circle of radius r at w radians a second, every dt seconds from t0. */
function* circle(
  r: number,
  w: number,
  dt: number,
  count: number,
  t0 = 0,
): Generator<[x: number, y: number, vx: number, vy: number, t: number]> {
  for (let i = 0; i < count; i++) {
    const t = t0 + i * dt;
    yield [
      r * Math.cos(w * t),
      r * Math.sin(w * t),
      -r * w * Math.sin(w * t),
      r * w * Math.cos(w * t),
      t,
    ];
  }
}

describe("the merger (decision 68)", () => {
  it("joins a trail's samples into spans whose curves pass within the tolerance of every sample they skip, and sends every interval out at once", () => {
    const merger = new Merger();
    const fresh = new SpanBatch(64);
    const closed = new SpanBatch(64);
    const samples = [...circle(0.5, 2 * Math.PI, 1 / 480, 200)];
    for (const [x, y, vx, vy, t] of samples) {
      merger.sample(0, x, y, vx, vy, t, t / 2.5, 0.5, WHITE, fresh, closed);
    }
    // every interval at once, in order, from sample to sample
    expect(fresh.count).toBe(samples.length - 1);
    for (let i = 0; i < fresh.count; i++) {
      const span = only(fresh, i);
      const [ax, ay] = samples[i] ?? [];
      const [bx, by] = samples[i + 1] ?? [];
      expect(span.x0).toBeCloseTo(ax ?? Number.NaN, 6);
      expect(span.y1).toBeCloseTo(by ?? Number.NaN, 6);
      expect(span.x1).toBeCloseTo(bx ?? Number.NaN, 6);
      expect(span.y0).toBeCloseTo(ay ?? Number.NaN, 6);
    }
    // far fewer spans than intervals, each within the reach, and the skipped
    // samples on the curve
    merger.splitAll(closed);
    expect(closed.count).toBeLessThan(fresh.count / 3);
    let at = 0;
    for (let i = 0; i < closed.count; i++) {
      const span = only(closed, i);
      expect(
        Math.hypot(span.x1 - span.x0, span.y1 - span.y0),
      ).toBeLessThanOrEqual(MERGE_REACH + 1e-9);
      // the samples it runs over, by their times
      const first = samples[at];
      let last = at;
      while (
        last + 1 < samples.length &&
        Math.hypot(
          (samples[last]?.[0] ?? 0) - span.x1,
          (samples[last]?.[1] ?? 0) - span.y1,
        ) > 1e-6
      ) {
        last++;
      }
      expect(last - at).toBeLessThanOrEqual(MERGE_MOST);
      const t0 = first?.[4] ?? 0;
      const T = (samples[last]?.[4] ?? 0) - t0;
      for (let s = at + 1; s < last; s++) {
        const [x, y, , , t] = samples[s] ?? [];
        const u = ((t ?? 0) - t0) / T;
        expect(strays(span, u, x ?? 0, y ?? 0)).toBeLessThanOrEqual(
          MERGE_TOLERANCE,
        );
      }
      at = last;
    }
    expect(at).toBe(samples.length - 1);
  });

  it("gives a span the velocities at its ends times its time as tangents, and its light and fade clock at its ends", () => {
    const merger = new Merger();
    const fresh = new SpanBatch();
    const closed = new SpanBatch();
    // a straight line at a steady speed: one span
    for (let i = 0; i <= 4; i++) {
      merger.sample(
        3,
        0.001 * i,
        0,
        0.5,
        0,
        0.002 * i,
        0.1 + 0.001 * i,
        0.5 + 0.01 * i,
        WHITE,
        fresh,
        closed,
      );
    }
    merger.splitAll(closed);
    expect(closed.count).toBe(1);
    const span = only(closed);
    expect(span.mx0).toBeCloseTo(0.5 * 0.008, 9);
    expect(span.mx1).toBeCloseTo(0.5 * 0.008, 9);
    expect(span.my0).toBe(0);
    expect(span.l0).toBeCloseTo(0.5, 6);
    expect(span.l1).toBeCloseTo(0.54, 6);
    expect(span.f0).toBeCloseTo(0.1, 6);
    expect(span.f1).toBeCloseTo(0.104, 6);
  });

  it("closes a span at the last sample when the next strays from its curve, and opens the next there", () => {
    const merger = new Merger();
    const fresh = new SpanBatch();
    const closed = new SpanBatch();
    // along x, then a sharp turn up
    for (let i = 0; i <= 3; i++) {
      merger.sample(
        0,
        0.001 * i,
        0,
        0.5,
        0,
        0.002 * i,
        0,
        1,
        WHITE,
        fresh,
        closed,
      );
    }
    merger.sample(0, 0.003, 0.001, 0, 0.5, 0.008, 0, 1, WHITE, fresh, closed);
    expect(closed.count).toBe(1);
    const first = only(closed);
    expect(first.x1).toBeCloseTo(0.003, 9);
    expect(first.y1).toBe(0);
    merger.splitAll(closed);
    const next = only(closed, 1);
    expect(next.x0).toBeCloseTo(0.003, 9);
    expect(next.y0).toBe(0);
    // leaving along x, as the last span came in, and arriving along y
    expect(next.my0).toBe(0);
    expect(next.mx1).toBe(0);
  });

  it("closes a span at a change of colour, at light that does not run straight within 2%, or at a fade clock that does not", () => {
    const run = (
      colour: (i: number) => Rgb,
      light: (i: number) => number,
      clock: (i: number) => number,
    ): number => {
      const merger = new Merger();
      const fresh = new SpanBatch();
      const closed = new SpanBatch();
      for (let i = 0; i <= 6; i++) {
        merger.sample(
          0,
          0.001 * i,
          0,
          0.5,
          0,
          0.002 * i,
          clock(i),
          light(i),
          colour(i),
          fresh,
          closed,
        );
      }
      merger.splitAll(closed);
      return closed.count;
    };
    const steady = (): number => 1;
    const linear = (i: number): number => 0.01 * i;
    expect(run(() => WHITE, steady, linear)).toBe(1);
    expect(run((i) => (i < 3 ? WHITE : [1, 0, 0]), steady, linear)).toBe(2);
    // light that rises by a tenth halfway along
    expect(
      run(
        () => WHITE,
        (i) => (i < 3 ? 1 : 1.1),
        linear,
      ),
    ).toBeGreaterThan(1);
    // a half-life that changes halfway along: the clock bends
    expect(
      run(
        () => WHITE,
        steady,
        (i) => (i < 3 ? 0.01 * i : 0.02 + 0.05 * (i - 2)),
      ),
    ).toBeGreaterThan(1);
  });

  it("keeps a span's chord within the reach, and its intervals to the most", () => {
    const merger = new Merger();
    const fresh = new SpanBatch();
    const closed = new SpanBatch();
    // a straight line, a centimetre an interval: spans of at most 7 cm
    for (let i = 0; i <= 40; i++) {
      merger.sample(
        0,
        0.01 * i,
        0,
        5,
        0,
        0.002 * i,
        0,
        1,
        WHITE,
        fresh,
        closed,
      );
    }
    // and another, slow, a tenth of a millimetre an interval: 16 at most
    for (let i = 0; i <= 40; i++) {
      merger.sample(
        1,
        0.0001 * i,
        0,
        0.05,
        0,
        0.002 * i,
        0,
        1,
        WHITE,
        fresh,
        closed,
      );
    }
    merger.splitAll(closed);
    for (let i = 0; i < closed.count; i++) {
      const span = only(closed, i);
      expect(
        Math.hypot(span.x1 - span.x0, span.y1 - span.y0),
      ).toBeLessThanOrEqual(MERGE_REACH + 1e-9);
      expect(span.x1 - span.x0).toBeLessThanOrEqual(MERGE_MOST * 0.01 + 1e-9);
    }
    const slow = Array.from({ length: closed.count }, (_, i) =>
      only(closed, i),
    ).filter((span) => span.x1 - span.x0 < 0.005);
    expect(
      slow.map((span) => Math.round((span.x1 - span.x0) / 0.0001)),
    ).toEqual([16, 16, 8]);
  });

  it("cuts a trail where it is, and says whether a point goes on from its newest sample", () => {
    const merger = new Merger();
    const fresh = new SpanBatch();
    const closed = new SpanBatch();
    merger.sample(7, 0, 0, 1, 0, 0, 0, 1, WHITE, fresh, closed);
    merger.sample(7, 0.001, 0, 1, 0, 0.001, 0, 1, WHITE, fresh, closed);
    expect(merger.continues(7, 0.001, 0, 1e-9)).toBe(true);
    expect(merger.continues(7, 0.2, 0, 1e-9)).toBe(false);
    expect(merger.continues(8, 0, 0, 1)).toBe(false);
    merger.cut(7, closed);
    expect(closed.count).toBe(1);
    expect(merger.continues(7, 0.001, 0, 1e-9)).toBe(false);
    // a sample after a cut opens a new span, drawing no interval yet
    merger.sample(7, 0.3, 0, 1, 0, 0.002, 0, 1, WHITE, fresh, closed);
    expect(fresh.count).toBe(1);
  });

  it("splits every open span at its newest sample, gives the open spans as they are, and forgets them without closing", () => {
    const merger = new Merger();
    const fresh = new SpanBatch();
    const closed = new SpanBatch();
    for (const id of [0, 2]) {
      for (let i = 0; i <= 2; i++) {
        merger.sample(
          id,
          0.001 * i,
          0.1 * id,
          1,
          0,
          0.001 * i,
          0,
          1,
          WHITE,
          fresh,
          closed,
        );
      }
    }
    const open = new SpanBatch();
    merger.openSpans(open);
    expect(open.count).toBe(2);
    merger.splitAll(closed);
    expect(closed.count).toBe(2);
    // split, each trail goes on from where it was split
    open.clear();
    merger.openSpans(open);
    expect(open.count).toBe(0);
    expect(merger.continues(0, 0.002, 0, 1e-9)).toBe(true);
    merger.sample(0, 0.003, 0, 1, 0, 0.003, 0, 1, WHITE, fresh, closed);
    merger.openSpans(open);
    expect(open.count).toBe(1);
    expect(only(open).x0).toBeCloseTo(0.002, 9);
    merger.forget();
    open.clear();
    merger.openSpans(open);
    expect(open.count).toBe(0);
    expect(closed.count).toBe(2);
  });
});
