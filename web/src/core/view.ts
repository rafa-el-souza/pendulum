// How the world sits on a canvas. The world is in metres, with the pivot at
// the origin and y up; the canvas in pixels, from its top left corner, y
// down. A camera (decision 67) looks at a point of the world, which sits at
// the canvas's centre, from as near as its zoom: at the whole view, the
// pivot, as the piece opens.

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

/**
 * What a target of light sees (decisions 66 and 67): its size in pixels,
 * its pixels per metre, the point of the world at its centre, in metres, and
 * how many times nearer than the whole view the camera brings it, of which
 * its scale is the size's own times this.
 */
export interface View {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly cx: number;
  readonly cy: number;
  readonly zoom: number;
}

/**
 * How the piece is looked at (decision 67): how many times nearer than the
 * whole view, and the point of the world at the centre of the canvas.
 */
export interface Camera {
  readonly zoom: number;
  readonly cx: number;
  readonly cy: number;
}

/** The whole view, the pivot at the centre, as the piece opens. */
export const WHOLE_VIEW: Camera = { zoom: 1, cx: 0, cy: 0 };

/** The nearest the camera comes: sixty-four times the whole view (decision 67). */
export const MOST_ZOOM = 64;

/** The point in metres under a pixel of the view, counted from its top left. */
export function toWorld(x: number, y: number, view: View): [number, number] {
  return [
    view.cx + (x - view.width / 2) / view.scale,
    view.cy + (view.height / 2 - y) / view.scale,
  ];
}

/** The pixel of the view, counted from its top left, where a point in metres is drawn. */
export function toPixel(wx: number, wy: number, view: View): [number, number] {
  return [
    view.width / 2 + (wx - view.cx) * view.scale,
    view.height / 2 - (wy - view.cy) * view.scale,
  ];
}

/** A box of a canvas's pixels: from the left, from the bottom, wide and high, as WebGL cuts drawing to one. */
export type Box = readonly [number, number, number, number];

/**
 * The view's pixels within `reach` pixels of the pivot, wherever the camera
 * puts it, as a box cut at the view's edges (decisions 62 and 67): whole
 * pixels, every one the reach touches, counted from the bottom.
 */
export function reachBox(view: View, reach: number): Box {
  const px = view.width / 2 - view.cx * view.scale;
  const py = view.height / 2 - view.cy * view.scale;
  const x0 = Math.max(0, Math.floor(px - reach));
  const y0 = Math.max(0, Math.floor(py - reach));
  const x1 = Math.min(view.width, Math.ceil(px + reach));
  const y1 = Math.min(view.height, Math.ceil(py + reach));
  return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
}

/**
 * The view of a canvas's drawing buffer, its scale fitting `reach` metres
 * into the buffer's own pixels times the camera's zoom (decision 66). In the
 * frame where the window has changed and the buffer has not yet, a scale
 * taken from the canvas's box and its buffer together mixes two sizes. The
 * camera's point is put at the centre to a whole pixel (decision 67): a view
 * that moves at the same scale then moves its light by whole pixels, which
 * are carried as they are.
 */
export function bufferView(
  width: number,
  height: number,
  reach: number,
  camera: Camera = WHOLE_VIEW,
): View {
  const scale = fitScale(width, height, reach) * camera.zoom;
  const whole = (at: number): number =>
    scale > 0 ? Math.round(at * scale) / scale : 0;
  return {
    width,
    height,
    scale,
    cx: whole(camera.cx),
    cy: whole(camera.cy),
    zoom: camera.zoom,
  };
}

/**
 * Where each pixel of the view `to` reads a target seen as `from`, so that
 * both see the same point of the world: the target's texture coordinates
 * are the pixel, at its centre and counted from the bottom, times
 * `[kx, ky]` plus `[mx, my]`.
 */
export function carryMap(
  from: View,
  to: View,
): [kx: number, ky: number, mx: number, my: number] {
  const ratio = from.scale / to.scale;
  return [
    ratio / from.width,
    ratio / from.height,
    ((from.width - ratio * to.width) / 2 + (to.cx - from.cx) * from.scale) /
      from.width,
    ((from.height - ratio * to.height) / 2 + (to.cy - from.cy) * from.scale) /
      from.height,
  ];
}

/**
 * The camera within its bounds (decision 67): no farther than the whole
 * view, nor nearer than MOST_ZOOM, and its point no farther from the pivot
 * than `reach` times 1 - 1 / zoom, so that the whole view looks at the pivot
 * and a nearer one never strays past the disc the chain can reach. What is
 * not a number is the whole view, or the pivot.
 */
export function clampCamera(camera: Camera, reach: number): Camera {
  const zoom = Number.isFinite(camera.zoom)
    ? Math.min(MOST_ZOOM, Math.max(1, camera.zoom))
    : 1;
  let cx = Number.isFinite(camera.cx) ? camera.cx : 0;
  let cy = Number.isFinite(camera.cy) ? camera.cy : 0;
  const most = reach * (1 - 1 / zoom);
  const off = Math.hypot(cx, cy);
  if (most <= 0) {
    cx = 0;
    cy = 0;
  } else if (off > most) {
    cx = (cx * most) / off;
    cy = (cy * most) / off;
  }
  return { zoom, cx, cy };
}

/**
 * The camera `factor` times nearer about the point `wx`, `wy` of the world,
 * which stays where it was on the screen unless a bound moves it.
 */
export function zoomAbout(
  camera: Camera,
  wx: number,
  wy: number,
  factor: number,
  reach: number,
): Camera {
  const zoom = Math.min(MOST_ZOOM, Math.max(1, camera.zoom * factor));
  const k = camera.zoom / zoom;
  return clampCamera(
    { zoom, cx: wx - (wx - camera.cx) * k, cy: wy - (wy - camera.cy) * k },
    reach,
  );
}

/**
 * The camera after a drag of `dx`, `dy` pixels of a view at `scale` pixels
 * a metre, y down: its point moves against the drag, so that the world
 * follows the hand.
 */
export function panBy(
  camera: Camera,
  dx: number,
  dy: number,
  scale: number,
  reach: number,
): Camera {
  return clampCamera(
    {
      zoom: camera.zoom,
      cx: camera.cx - dx / scale,
      cy: camera.cy + dy / scale,
    },
    reach,
  );
}

/** Two fingers as they landed: the camera then, the point of the world between them, and how far apart they were. */
export interface PinchStart {
  readonly camera: Camera;
  readonly world: readonly [number, number];
  readonly distance: number;
}

/**
 * The camera two fingers ask for, now `distance` apart with their middle at
 * `x`, `y` (pixels of a `width` by `height` view, from its top left): as
 * many times nearer as they have spread, and the point that was between
 * them between them still, unless a bound moves it.
 */
export function pinched(
  start: PinchStart,
  x: number,
  y: number,
  distance: number,
  width: number,
  height: number,
  reach: number,
): Camera {
  const spread = start.distance > 0 ? distance / start.distance : 1;
  const zoom = Math.min(
    MOST_ZOOM,
    Math.max(1, start.camera.zoom * (spread > 0 ? spread : 1)),
  );
  const scale = fitScale(width, height, reach) * zoom;
  return clampCamera(
    {
      zoom,
      cx: start.world[0] - (x - width / 2) / scale,
      cy: start.world[1] - (height / 2 - y) / scale,
    },
    reach,
  );
}

/** A comma that an address's search carries encoded, as a comma, which it may carry as it is. */
export function withCommas(search: string): string {
  return search.replaceAll("%2C", ",");
}

/**
 * The camera an address carries ("?zoom=8&at=0.12345,-0.85432", decision
 * 67), within its bounds; the whole view when it carries none, and the
 * pivot when its point is not two numbers.
 */
export function readCamera(search: string, reach: number): Camera {
  const query = new URLSearchParams(search);
  const zoom = Number(query.get("zoom") ?? Number.NaN);
  if (!Number.isFinite(zoom)) return WHOLE_VIEW;
  const at = (query.get("at") ?? "").split(",").map(Number);
  const [cx = 0, cy = 0] =
    at.length === 2 && at.every((n) => Number.isFinite(n)) ? at : [];
  return clampCamera({ zoom, cx, cy }, reach);
}

/**
 * The search part of an address carrying the camera, after whatever else
 * `search` carried: nothing at the whole view; else the zoom to a hundredth,
 * and its point, when it is not the pivot, to ten micrometres.
 */
export function writeCamera(search: string, camera: Camera): string {
  const query = new URLSearchParams(search);
  query.delete("zoom");
  query.delete("at");
  const zoom = Number(camera.zoom.toFixed(2));
  if (zoom > 1) {
    query.set("zoom", String(zoom));
    const cx = Number(camera.cx.toFixed(5)) || 0;
    const cy = Number(camera.cy.toFixed(5)) || 0;
    if (cx !== 0 || cy !== 0) query.set("at", `${String(cx)},${String(cy)}`);
  }
  const text = withCommas(query.toString());
  return text === "" ? "" : `?${text}`;
}

/** What a change of view asks of light kept in pixels: to hold it and carry it, to carry it from what is held, to let what is held go, or to clear it. */
export type ViewStep =
  | { readonly act: "hold" | "carry"; readonly from: View }
  | { readonly act: "let go" }
  | { readonly act: "clear" };

function sameView(a: View, b: View): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.scale === b.scale &&
    a.cx === b.cx &&
    a.cy === b.cy
  );
}

/** The scale a view's size gives it, without the camera's zoom (decision 67). */
function sized(view: View): number {
  return view.scale / view.zoom;
}

/** Whether every point `inner` sees, `outer` sees too. */
function covers(outer: View, inner: View): boolean {
  const slack = 1 + 1e-9;
  const ox = outer.width / 2 / outer.scale;
  const oy = outer.height / 2 / outer.scale;
  const ix = inner.width / 2 / inner.scale;
  const iy = inner.height / 2 / inner.scale;
  return (
    Math.abs(inner.cx - outer.cx) + ix <= ox * slack &&
    Math.abs(inner.cy - outer.cy) + iy <= oy * slack
  );
}

/**
 * A canvas's views frame by frame, as runs of changes (decision 66). At a
 * run's first change, light kept in pixels is held as it was, in the view
 * it was in; every change of the run is carried from what is held, so that
 * the light is read once however many changes the run has, instead of once
 * a change, each blurring it a little more; the run ends, and what is held
 * can go, once the view has stayed for `settle` frames. A canvas grown
 * more than `limit` times the least scale its size gave the light it would
 * read asks for the light to be cleared instead: lines drawn a pixel or two
 * wide come out wider in proportion, and past that they read as wide, soft
 * bands beside the new ones. The run ends there, and the next change holds
 * anew. The least scale goes with the light: what is held keeps the least
 * of the light it held; carried, the light is what was held and what is
 * drawn on it in the new view; so that runs each growing a little add up,
 * and a run that shrinks and grows back reads only what was held at the
 * larger view. The camera's zoom does not count towards the limit
 * (decision 67).
 *
 * A change of the camera alone, the drawing buffer's size the same, holds
 * the light anew as it last was when the view has come twice as near as
 * what is held, or sees past it (decision 67): light drawn during a gesture
 * that nears is then kept at no less than half the view's resolution, and
 * light drawn where the held view did not see, as the view moves or goes
 * farther, is kept at all. Moved at the same scale, light moves by whole
 * pixels (bufferView), and is carried as it is.
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
      this.#least = sized(view);
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
    const shown = this.#least;
    const held = this.#held;
    const read = held === null ? shown : this.#heldLeast;
    if (sized(view) / read > this.#limit) {
      this.#held = null;
      this.#least = sized(view);
      return { act: "clear" };
    }
    const camera = last.width === view.width && last.height === view.height;
    if (
      held === null ||
      (camera && (view.scale >= 2 * held.scale || !covers(held, view)))
    ) {
      // the light shown becomes what is held
      this.#held = last;
      this.#heldLeast = shown;
      this.#least = Math.min(shown, sized(view));
      return { act: "hold", from: last };
    }
    this.#least = Math.min(read, sized(view));
    return { act: "carry", from: held };
  }
}
