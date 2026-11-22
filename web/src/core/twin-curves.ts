// The twins' tips drawn into their trails as curves (docs/decisions.md,
// decisions 21, 68 and 75): where the pivot was at each instant of a report,
// and a twin's tip along a report as samples of a curve. And a twin stamped
// by a strobe's flash (decision 100): where it is at the flash's instant,
// between the ends of its piece, and its stamps. Pure, so that the same
// numbers come out wherever they run.

import type { Rgb } from "./color.ts";
import {
  TRAIL_JUMP,
  lengthOf,
  pushPoint,
  pushStraight,
  type Merger,
  type SpanBatch,
} from "./curves.ts";
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
  report: Pick<TwinReport, "pieces" | "tips" | "tipSpeeds" | "clock" | "time">,
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
    if (lengthOf(x - bx, y - by) >= TRAIL_JUMP) {
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

/** Which parts of a twin a strobe's flash stamps (decision 96): its tip, or every mass, as points; its rods; or the whole of it. */
export type StampParts = "tip" | "masses" | "rods" | "whole";

/**
 * A chain's angles `s` seconds into a piece of `h` seconds, into `out`, from
 * its angles and their rates at the piece's two ends (decision 100): the cubic
 * that meets both ends with both rates, Hermite's, where the twins' own step
 * leaves no point, as at a strobe's flash. Exactly the first end at 0 and the
 * last at `h`.
 */
export function anglesAt(
  theta0: ArrayLike<number>,
  omega0: ArrayLike<number>,
  theta1: ArrayLike<number>,
  omega1: ArrayLike<number>,
  s: number,
  h: number,
  out: Float64Array,
): void {
  const u = h > 0 ? Math.min(1, Math.max(0, s / h)) : 1;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = (u3 - 2 * u2 + u) * h;
  const h01 = 3 * u2 - 2 * u3;
  const h11 = (u3 - u2) * h;
  for (let i = 0; i < out.length; i++) {
    out[i] =
      h00 * (theta0[i] ?? 0) +
      h10 * (omega0[i] ?? 0) +
      h01 * (theta1[i] ?? 0) +
      h11 * (omega1[i] ?? 0);
  }
}

/**
 * A twin stamped by a strobe's flash into `batch` (decision 100), as the
 * chain is (decisions 91 and 96): its n masses at `places` from `at`, x then
 * y for each, from the top, hung from the pivot at (`px`, `py`); as `parts`
 * says, its rods as straight spans in `light`, and its tip or every mass as
 * points twice as bright, each rod before the mass it ends in, at the fade
 * clock `fade`, the flash's instant.
 */
export function stampTwin(
  batch: SpanBatch,
  parts: StampParts,
  n: number,
  places: ArrayLike<number>,
  at: number,
  px: number,
  py: number,
  color: Rgb,
  light: number,
  fade: number,
): void {
  const rods = parts === "rods" || parts === "whole";
  // the masses stamped as points, from the first: the tip alone, or all
  const firstPoint = parts === "tip" ? n - 1 : parts === "rods" ? n : 0;
  let ax = px;
  let ay = py;
  for (let i = 0; i < n; i++) {
    const bx = (places[at + 2 * i] ?? 0) + px;
    const by = (places[at + 2 * i + 1] ?? 0) + py;
    if (rods) pushStraight(batch, ax, ay, bx, by, color, light, fade);
    if (i >= firstPoint) pushPoint(batch, bx, by, color, 2 * light, fade);
    ax = bx;
    ay = by;
  }
}
