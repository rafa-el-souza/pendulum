// How the world sits on a canvas. The world is in metres, with the pivot at
// the origin and y up; the canvas in pixels, from its top left corner, y
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

/** The point in metres under a point of the canvas, in pixels of the same kind as its size and scale. */
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

/**
 * What a target of light sees (decision 66): its size in pixels and its
 * pixels per metre, with the pivot at its centre.
 */
export interface View {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

/**
 * The view of a canvas's drawing buffer, its scale fitting `reach` metres
 * into the buffer's own pixels (decision 66). In the frame where the window
 * has changed and the buffer has not yet, a scale taken from the canvas's
 * box and its buffer together mixes two sizes.
 */
export function bufferView(width: number, height: number, reach: number): View {
  return { width, height, scale: fitScale(width, height, reach) };
}

/**
 * Where each pixel of the view `to` reads a target seen as `from`, so that
 * both see the same point of the world: the target's texture coordinates
 * are the pixel, at its centre, times `[kx, ky]` plus `[mx, my]`.
 */
export function carryMap(
  from: View,
  to: View,
): [kx: number, ky: number, mx: number, my: number] {
  const ratio = from.scale / to.scale;
  return [
    ratio / from.width,
    ratio / from.height,
    (from.width - ratio * to.width) / 2 / from.width,
    (from.height - ratio * to.height) / 2 / from.height,
  ];
}

/** What a change of view asks of light kept in pixels: to hold it and carry it, to carry it from what is held, to let what is held go, or to clear it. */
export type ViewStep =
  | { readonly act: "hold" | "carry"; readonly from: View }
  | { readonly act: "let go" }
  | { readonly act: "clear" };

function sameView(a: View, b: View): boolean {
  return a.width === b.width && a.height === b.height && a.scale === b.scale;
}

/**
 * A canvas's views frame by frame, as runs of changes (decision 66). At a
 * run's first change, light kept in pixels is held as it was, in the view
 * it was in; every change of the run is carried from what is held, so that
 * the light is read once however many changes the run has, instead of once
 * a change, each blurring it a little more; the run ends, and what is held
 * can go, once the view has stayed for `settle` frames. A view grown more
 * than `limit` times the least scale the light it would read was drawn at
 * asks for the light to be cleared instead: lines drawn a pixel or two wide
 * come out wider in proportion, and past that they read as wide, soft bands
 * beside the new ones. The run ends there, and the next change holds anew.
 * The least scale goes with the light: what is held keeps the least of the
 * light it held; carried, the light is what was held and what is drawn on
 * it in the new view; so that runs each growing a little add up, and a run
 * that shrinks and grows back reads only what was held at the larger view.
 */
export class ViewRuns {
  readonly #settle: number;
  readonly #limit: number;
  #last: View | null = null;
  #held: View | null = null;
  #still = 0;
  // the least scale the light shown, and the light held, were drawn at
  #least = Number.POSITIVE_INFINITY;
  #heldLeast = Number.POSITIVE_INFINITY;

  constructor(settle: number, limit = Number.POSITIVE_INFINITY) {
    this.#settle = settle;
    this.#limit = limit;
  }

  /** Takes the frame's view, and says what its light asks for, if anything. */
  see(view: View): ViewStep | null {
    const last = this.#last;
    this.#last = view;
    if (last === null) {
      this.#least = view.scale;
      return null;
    }
    if (sameView(last, view)) {
      if (this.#held === null) return null;
      this.#still++;
      if (this.#still < this.#settle) return null;
      this.#held = null;
      return { act: "let go" };
    }
    this.#still = 0;
    const read = this.#held === null ? this.#least : this.#heldLeast;
    if (view.scale / read > this.#limit) {
      this.#held = null;
      this.#least = view.scale;
      return { act: "clear" };
    }
    this.#least = Math.min(read, view.scale);
    if (this.#held === null) {
      this.#held = last;
      this.#heldLeast = read;
      return { act: "hold", from: last };
    }
    return { act: "carry", from: this.#held };
  }
}
