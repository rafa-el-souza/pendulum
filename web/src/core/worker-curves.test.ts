import { describe, expect, it } from "vitest";

import { SpanBatch } from "./curves.ts";
import type { SpanBytes, TwinCurveReport } from "./twin-share.ts";
import { WorkerCurves } from "./worker-curves.ts";

// The twins' curves as their workers send them back (decision 97): each
// batch of a report goes where the trails need it, by the number of the
// command the report answers against the asks the trails made.

/** `count` spans whose first coordinate is `tag`, as bytes handed over. */
function spans(tag: number, count = 1): SpanBytes {
  const batch = new SpanBatch();
  for (let i = 0; i < count; i++) {
    batch.push(tag, i, 0, 0, 0, 0, 0, 0, [1, 1, 1], 1, 1, 0, 0);
  }
  return { bytes: batch.bytes(), count };
}

/** A report's curves, each batch tagged by `tag` and what it is. */
function report(tag: number): TwinCurveReport {
  return {
    fresh: spans(tag + 0.1),
    closed: spans(tag + 0.2),
    split: spans(tag + 0.3),
    open: spans(tag + 0.4),
    stamps: spans(tag + 0.5, 0),
  };
}

/** A report's curves with the twins stamped by a flash (decision 100), tagged as `report` tags them. */
function stamped(tag: number): TwinCurveReport {
  return { ...report(tag), stamps: spans(tag + 0.5) };
}

/** The first coordinates of a batch's spans. */
function tags(batch: SpanBatch): number[] {
  return Array.from(
    { length: batch.count },
    (_, i) => Math.round((batch.span(i)?.x0 ?? 0) * 10) / 10,
  );
}

function trails(): { fresh: SpanBatch; closed: SpanBatch } {
  return { fresh: new SpanBatch(), closed: new SpanBatch() };
}

describe("the twins' curves as their workers send them back (decision 97)", () => {
  it("draws a report's intervals and keeps its closed spans with the chain's, after them, and keeps each share's newest open curves", () => {
    const curves = new WorkerCurves();
    curves.reset(2);
    const into = trails();
    into.fresh.push(-1, 0, 0, 0, 0, 0, 0, 0, [1, 1, 1], 1, 1, 0, 0);
    curves.take(0, 1, report(1), into);
    curves.take(1, 1, report(2), into);
    expect(tags(into.fresh)).toEqual([-1, 1.1, 2.1]);
    expect(tags(into.closed)).toEqual([1.2, 2.2]);
    expect(tags(curves.splitBefore)).toEqual([1.3, 2.3]);
    const open = new SpanBatch();
    curves.openSpans(open);
    expect(tags(open)).toEqual([1.4, 2.4]);
    // a newer report replaces a share's open curves; an older one does not
    curves.take(0, 3, report(3), trails());
    curves.take(0, 2, report(4), trails());
    open.clear();
    curves.openSpans(open);
    expect(tags(open)).toEqual([3.4, 2.4]);
  });

  it("draws a report's stamps now and keeps them, after its intervals and its closed spans, as the chain's stamps are (decision 100)", () => {
    const curves = new WorkerCurves();
    curves.reset(1);
    const into = trails();
    curves.take(0, 1, stamped(1), into);
    expect(tags(into.fresh)).toEqual([1.1, 1.5]);
    expect(tags(into.closed)).toEqual([1.2, 1.5]);
    // and nothing of them is a split or an open curve
    expect(tags(curves.splitBefore)).toEqual([1.3]);
    const open = new SpanBatch();
    curves.openSpans(open);
    expect(tags(open)).toEqual([1.4]);
  });

  it("draws into the coarse image too the stamps of reports joined before it was born, and keeps them for the window alone (decision 100)", () => {
    const curves = new WorkerCurves();
    curves.reset(2);
    curves.coarse(5);
    const into = trails();
    curves.take(1, 4, stamped(1), into);
    curves.take(0, 5, stamped(2), into);
    expect(tags(into.fresh)).toEqual([1.1, 1.5, 2.1, 2.5]);
    expect(tags(curves.freshForCoarse)).toEqual([1.1, 1.5]);
    expect(tags(into.closed)).toEqual([2.2, 2.5]);
    expect(tags(curves.closedForWindow)).toEqual([1.2, 1.5]);
  });

  it("lets go of the stamps of reports joined before the trails were put out (decision 100)", () => {
    const curves = new WorkerCurves();
    curves.reset(1);
    curves.forget(6);
    const into = trails();
    curves.take(0, 5, stamped(2), into);
    expect(into.fresh.count + into.closed.count).toBe(0);
  });

  it("lets go of reports joined before the trails were put out", () => {
    const curves = new WorkerCurves();
    curves.reset(1);
    curves.take(0, 4, report(1), trails());
    curves.forget(6);
    const into = trails();
    curves.take(0, 5, report(2), into);
    expect(into.fresh.count + into.closed.count).toBe(0);
    expect(curves.splitBefore.count).toBe(0);
    const open = new SpanBatch();
    curves.openSpans(open);
    expect(open.count).toBe(0);
    curves.take(0, 6, report(3), into);
    expect(tags(into.fresh)).toEqual([3.1]);
  });

  it("draws into the coarse image too the intervals of reports joined before it was born, and keeps their closed spans for the window alone", () => {
    const curves = new WorkerCurves();
    curves.reset(2);
    curves.coarse(5);
    const into = trails();
    // a late share's report of before the birth
    curves.take(1, 4, report(1), into);
    // one of after it, carrying the birth's split
    curves.take(0, 5, report(2), into);
    expect(tags(into.fresh)).toEqual([1.1, 2.1]);
    expect(tags(curves.freshForCoarse)).toEqual([1.1]);
    expect(tags(into.closed)).toEqual([2.2]);
    expect(tags(curves.closedForWindow)).toEqual([1.2]);
    expect(tags(curves.splitBefore)).toEqual([1.3, 2.3]);
    expect(curves.splitForCoarse.count).toBe(0);
  });

  it("keeps a snapshot's split before its mark, which the coarse image takes too, and the splits of after it for the queue", () => {
    const curves = new WorkerCurves();
    curves.reset(2);
    curves.snapshot(7);
    expect(curves.awaiting).toBe(true);
    curves.take(0, 7, report(1), trails());
    curves.take(0, 8, report(2), trails());
    curves.take(1, 7, report(3), trails());
    expect(tags(curves.splitBefore)).toEqual([1.3, 3.3]);
    expect(tags(curves.splitForCoarse)).toEqual([1.3, 3.3]);
    expect(tags(curves.splitAfter)).toEqual([2.3]);
    curves.marked();
    expect(curves.awaiting).toBe(false);
    curves.clear();
    curves.take(0, 9, report(4), trails());
    expect(tags(curves.splitBefore)).toEqual([4.3]);
    expect(curves.splitAfter.count).toBe(0);
  });

  it("does not give the coarse image a split that is its own birth's, asked in the same frame as a snapshot's", () => {
    const curves = new WorkerCurves();
    curves.reset(1);
    curves.coarse(7);
    curves.snapshot(7);
    curves.take(0, 7, report(1), trails());
    expect(tags(curves.splitBefore)).toEqual([1.3]);
    expect(curves.splitForCoarse.count).toBe(0);
  });

  it("lets go of the frame's batches once the trails have them, and of the open curves of shares no longer there", () => {
    const curves = new WorkerCurves();
    curves.reset(3);
    curves.coarse(9);
    curves.take(2, 8, report(1), trails());
    curves.clear();
    for (const batch of [
      curves.freshForCoarse,
      curves.closedForWindow,
      curves.splitBefore,
      curves.splitAfter,
      curves.splitForCoarse,
    ]) {
      expect(batch.count).toBe(0);
    }
    const open = new SpanBatch();
    curves.openSpans(open);
    expect(tags(open)).toEqual([1.4]);
    curves.reset(1);
    open.clear();
    curves.openSpans(open);
    expect(open.count).toBe(0);
  });
});
