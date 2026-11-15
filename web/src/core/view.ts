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
