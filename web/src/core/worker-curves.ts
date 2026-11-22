// The twins' trails as their workers join them into curves (docs/decisions.md,
// decision 96): where each batch a report brings back goes, by the number of
// the command it answers. The trails kept as curves ask the workers to split
// or forget their curves, and an ask reaches a worker with its next command,
// after it has joined what it was sent before; a report of an earlier
// command, coming back later, is read against the ask. Pure: the trails draw
// what it hands them.

import { SpanBatch } from "./curves.ts";
import type { SpanBytes, TwinCurveReport } from "./twin-share.ts";

/** The trails' batches of a frame, which the twins' curves join after the chain's. */
export interface FrameBatches {
  /** The intervals drawn into the image now. */
  readonly fresh: SpanBatch;
  /** The spans closed, for the window and the coarse image. */
  readonly closed: SpanBatch;
}

/** The twins' curves as their workers send them back. */
export class WorkerCurves {
  /** Intervals of reports joined before the coarse image was born, which it lacks: drawn into it too. */
  readonly freshForCoarse = new SpanBatch(64);
  /** Spans closed of reports joined before the coarse image was born, part of whose light it has: for the window alone. */
  readonly closedForWindow = new SpanBatch(64);
  /** Spans a split closed, for the window alone: before a snapshot's mark that waits, and after it. */
  readonly splitBefore = new SpanBatch(256);
  readonly splitAfter = new SpanBatch(64);
  /** Spans a snapshot's split closed, whose light the coarse image takes too. */
  readonly splitForCoarse = new SpanBatch(256);
  // each share's newest curves still open, and the number of their report
  #open: (SpanBytes | null)[] = [];
  #openSeq: number[] = [];
  // the first command that reaches the workers after each ask: the trails
  // put out, the coarse image born, a snapshot's split awaited (none: -1)
  #forgetFrom = 0;
  #coarseAt = -1;
  #snapshotAt = -1;

  /** Whether a snapshot's mark waits for the workers' split. */
  get awaiting(): boolean {
    return this.#snapshotAt >= 0;
  }

  /** `shares` shares now carry the twins: the curves of those before are let go. */
  reset(shares: number): void {
    this.#open = Array.from({ length: shares }, () => null);
    this.#openSeq = Array.from({ length: shares }, () => 0);
    this.clear();
  }

  /** The workers forget their curves with command `seq`: the trails were put out, and nothing of before is drawn. */
  forget(seq: number): void {
    this.#forgetFrom = seq;
    this.#open.fill(null);
    this.#coarseAt = -1;
    this.#snapshotAt = -1;
    this.clear();
  }

  /** The coarse image is born, and the workers split their curves with command `seq`. */
  coarse(seq: number): void {
    this.#coarseAt = seq;
  }

  /** A snapshot is taken, and the workers split their curves with command `seq`: its mark waits for them. */
  snapshot(seq: number): void {
    this.#snapshotAt = seq;
  }

  /** The snapshot's mark is placed. */
  marked(): void {
    this.#snapshotAt = -1;
  }

  /** Share `share`'s report of command `seq`, its curves joined after the chain's into `into`, or kept aside where they go elsewhere. */
  take(
    share: number,
    seq: number,
    curves: TwinCurveReport,
    into: FrameBatches,
  ): void {
    if (seq < this.#forgetFrom) return;
    into.fresh.append(curves.fresh.bytes, curves.fresh.count);
    if (seq < this.#coarseAt) {
      this.freshForCoarse.append(curves.fresh.bytes, curves.fresh.count);
      this.closedForWindow.append(curves.closed.bytes, curves.closed.count);
    } else {
      into.closed.append(curves.closed.bytes, curves.closed.count);
    }
    const { split } = curves;
    if (this.awaiting && seq > this.#snapshotAt) {
      this.splitAfter.append(split.bytes, split.count);
    } else {
      this.splitBefore.append(split.bytes, split.count);
    }
    if (seq === this.#snapshotAt && seq !== this.#coarseAt) {
      this.splitForCoarse.append(split.bytes, split.count);
    }
    if (seq >= (this.#openSeq[share] ?? 0)) {
      this.#open[share] = curves.open;
      this.#openSeq[share] = seq;
    }
  }

  /** Every share's newest curves still open, into `out`, for a view drawn anew. */
  openSpans(out: SpanBatch): void {
    for (const open of this.#open) {
      if (open !== null) out.append(open.bytes, open.count);
    }
  }

  /** The frame's batches let go, once the trails have them. */
  clear(): void {
    this.freshForCoarse.clear();
    this.closedForWindow.clear();
    this.splitBefore.clear();
    this.splitAfter.clear();
    this.splitForCoarse.clear();
  }
}
