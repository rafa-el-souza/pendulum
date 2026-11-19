// How the world sits on a canvas. The world is in metres, with the pivot at
// the origin and y up; the canvas in CSS pixels, from its top left corner, y
// down. The pivot sits at the canvas's centre.

/**
 * CSS pixels per metre that fit `reach` metres from the pivot in any
 * direction: 46% of the width or 42% of the height, whichever is smaller,
 * which leaves a margin around a chain thrown straight up or sideways.
 */
export function fitScale(
  cssWidth: number,
  cssHeight: number,
  reach: number,
): number {
  return Math.min(0.46 * cssWidth, 0.42 * cssHeight) / reach;
}

/** The point in metres under a point of the canvas, in CSS pixels. */
export function toWorld(
  cssX: number,
  cssY: number,
  cssWidth: number,
  cssHeight: number,
  scale: number,
): [number, number] {
  return [(cssX - cssWidth / 2) / scale, (cssHeight / 2 - cssY) / scale];
}

/** A box of a canvas's pixels: from the left, from the bottom, wide and high, as WebGL cuts drawing to one. */
export type Box = readonly [number, number, number, number];

/**
 * The canvas's pixels within `reach` pixels of its centre, where the pivot
 * is, as a box cut at the canvas's edges (decision 62): whole pixels, every
 * one the reach touches. Symmetric about the centre, so the same from the
 * top as from the bottom.
 */
export function reachBox(width: number, height: number, reach: number): Box {
  const x0 = Math.max(0, Math.floor(width / 2 - reach));
  const y0 = Math.max(0, Math.floor(height / 2 - reach));
  const x1 = Math.min(width, Math.ceil(width / 2 + reach));
  const y1 = Math.min(height, Math.ceil(height / 2 + reach));
  return [x0, y0, x1 - x0, y1 - y0];
}
