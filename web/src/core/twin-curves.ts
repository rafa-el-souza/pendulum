// The twins' tips drawn into their trails as curves (docs/decisions.md,
// decisions 21, 68 and 75): where the pivot was at each instant of a report,
// and a twin's tip along a report as samples of a curve. Pure, so that the
// same numbers come out wherever they run.

import type { Rgb } from "./color.ts";
import { TRAIL_JUMP, type Merger, type SpanBatch } from "./curves.ts";
import type { TwinReport } from "./twin-share.ts";
import { pivotAt, type Drive, type PivotMotion } from "../physics/drive.ts";

/**
 * Where the music's kicks had taken the pivot at each of `pieces` + 1
 * instants evenly over `time` seconds of a frame of `drive`, and how it moved,
 * x then y for each, into `places` and `speeds` (decision 75): nowhere
 * without a drive.
 */
export function pivotsOver(
  drive: Drive | null,
  pieces: number,
  time: number,
  places: Float64Array,
  speeds: Float64Array,
): void {
  const then: PivotMotion = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let piece = 0; piece <= pieces; piece++) {
    if (drive === null) {
      then.x = 0;
      then.y = 0;
      then.vx = 0;
      then.vy = 0;
    } else {
      pivotAt(drive, (piece * time) / pieces, then);
    }
    places[2 * piece] = then.x;
    places[2 * piece + 1] = then.y;
    speeds[2 * piece] = then.vx;
    speeds[2 * piece + 1] = then.vy;
  }
}

/**
 * Twin `j`'s tip along a report as samples of a curve (decision 68), into
 * `merger`'s trails, the intervals drawn now into `fresh` and the spans they
 * close into `closed`: the tips of the twin `k`th in the report from `at`,
 * each instant where the pivot was then and moving as it moved (decision 75),
 * from `pivots` and `pivotSpeeds`, x then y for each, at the instant the
 * report's clock gives it, in `color` with `light`. A twin whose trail does
 * not go on from where the report starts begins it there, and one that
 * jumped, born again, starts it anew.
 */
export function twinCurve(
  merger: Merger,
  fresh: SpanBatch,
  closed: SpanBatch,
  j: number,
  report: TwinReport,
  at: number,
  color: Rgb,
  light: number,
  pivots: Float64Array,
  pivotSpeeds: Float64Array,
): void {
  const { pieces, tips, tipSpeeds, clock, time } = report;
  if (clock === null) return;
  const step = time / pieces;
  const x0 = (tips[at] ?? 0) + (pivots[0] ?? 0);
  const y0 = (tips[at + 1] ?? 0) + (pivots[1] ?? 0);
  if (!merger.continues(j, x0, y0, 1e-6)) {
    merger.cut(j, closed);
    merger.sample(
      j,
      x0,
      y0,
      (tipSpeeds[at] ?? 0) + (pivotSpeeds[0] ?? 0),
      (tipSpeeds[at + 1] ?? 0) + (pivotSpeeds[1] ?? 0),
      clock.seconds,
      clock.fade,
      light,
      color,
      fresh,
      closed,
    );
  }
  let bx = x0;
  let by = y0;
  for (let piece = 1; piece <= pieces; piece++) {
    const q = at + 2 * piece;
    const p = 2 * piece;
    const x = (tips[q] ?? 0) + (pivots[p] ?? 0);
    const y = (tips[q + 1] ?? 0) + (pivots[p + 1] ?? 0);
    const seconds = piece * step;
    if (Math.hypot(x - bx, y - by) >= TRAIL_JUMP) {
      merger.cut(j, closed);
    }
    bx = x;
    by = y;
    merger.sample(
      j,
      x,
      y,
      (tipSpeeds[q] ?? 0) + (pivotSpeeds[p] ?? 0),
      (tipSpeeds[q + 1] ?? 0) + (pivotSpeeds[p + 1] ?? 0),
      clock.seconds + seconds,
      clock.fade + seconds * clock.rate,
      light,
      color,
      fresh,
      closed,
    );
  }
}
