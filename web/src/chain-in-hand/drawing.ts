// The first piece's drawing (docs/decisions.md, decision 90): the chain, its
// twins, the hand and the pivot, and the trails they leave, in the light of
// the trails, the twins and the sketch. Every frame's motion is drawn into the
// trails (decision 21), kept as curves or as the image carried (decisions 66,
// 68 and 71); a strobe stamps the chain and the twins (decisions 50, 91 and
// 100); each rod can be painted by its tension (decision 35).
//
// The trails are drawn in layers (decision 96): what leaves each (the chain
// or its twins), how (lines along the paths, or stamps on a strobe's
// flashes) and which parts (the tip, every mass, the rods, or the whole of
// it). The four controls of the trails' layers say which there are, and each
// layer's light how bright it is drawn (decision 102); every layer draws into
// the one image of the trails.

import type { Rgb } from "../core/color.ts";
import { Lines, SegmentBatch } from "../core/lines.ts";
import type { Parameter } from "../core/parameters.ts";
import type { Stages } from "../core/perf.ts";
import type { Look } from "../core/routes.ts";
import {
  SharpTrails,
  readCurves,
  readKeep,
  readStretch,
  trailMechanism,
  type Mechanism,
} from "../core/sharp.ts";
import { TRAIL_JUMP } from "../core/curves.ts";
import { paletteAt } from "../core/palettes.ts";
import {
  EARTH,
  TensionShades,
  earthWeights,
  tensionScale,
} from "../core/tension.ts";
import { LightTarget, Trails, fadeAfter } from "../core/trails.ts";
import type { StampParts } from "../core/twin-curves.ts";
import type { TwinClock, TwinFlash } from "../core/twin-share.ts";
import type { TwinWorkers } from "../core/twin-workers.ts";
import { twinShine, type Fading } from "../core/twins.ts";
import { reachBox, type View } from "../core/view.ts";
import type { Motion, Moved } from "./motion.ts";
import {
  DRAWN,
  FADE,
  LINES,
  LINES_LIGHT,
  LOOK,
  SCALE,
  SHAKE,
  STROBE,
  STROBE_LIGHT,
  TRAIL,
  TWIN_COUNT,
  TWIN_LINES,
  TWIN_LINES_LIGHT,
  TWIN_STROBE,
  TWIN_STROBE_LIGHT,
  WHITE,
  massesDrawn,
  rodsDrawn,
  trailFade,
  whiteAfter,
} from "./parameters.ts";

// The colour of the tension (decision 35): each rod's place on the scale moves
// this share of the way to that of its tension every frame, a few frames to
// follow a change, as the hand's line eases its pull.
const TENSION_EASE = 0.25;
// The shaken pivot (decision 36) is drawn as a streak this long either way
// along the shake, in m: a sign of the shake, which is a millimetre.
const PIVOT_STREAK = 0.025;
// What the music adds to the light (decisions 46 and 49), at most: the
// chain's halo grows to this many more pixels and this much more gain, never
// a flash over a large area, and the trails' light to this many times its
// own.
const GLOW_MOST = 3;
const GLOW_RADIUS = 4;
const GLOW_GAIN = 0.3;
export const TRAIL_MOST = 2;
// The trails of a strobe (decision 50): the chain stamped this many times a
// second of simulated time, each rod this light, and each mass stamped as a
// point this light (decision 96). The twins as dust: each tip a point this
// many pixels wide, which swells as the music lights the halo.
const STROBE_RATE = 12;
const STROBE_ROD = 0.45;
const STROBE_POINT = 0.9;
const DUST_RADIUS = 1.4;
// The veil of the rods (decision 96): each rod stamped at every piece of the
// step, each end as bright as it moved over the piece, up to VEIL_LIGHT for
// VEIL_STEP metres or more, so that where it goes slowly the stamps run
// together into an even surface, the pivot no brighter than the rest, and
// where it goes fast they part into a fan of streaks. Carried as the image,
// a rod whose ends differ is drawn in pieces, up to VEIL_CUTS, each as bright
// as its middle, so that its light steps finely enough not to show rings.
const VEIL_LIGHT = 0.12;
const VEIL_STEP = 0.005;
const VEIL_CUTS = 8;
// How far past a mass's place its light can reach on the frame, in CSS
// pixels: the rods' widest halo with the music at its most, whose glow a line
// draws out to three spreads (lines.ts), and a pixel for the line's edge.
// Every other line, dot and point of dust reaches less (decision 62).
const GLOW_REACH = 3 * (5 + GLOW_RADIUS * GLOW_MOST) + 1;

/** What leaves a layer of the trails: the chain, or its twins. */
export type TrailTarget = "chain" | "twins";

/** How a layer leaves its light: lines along the paths its parts take (decision 21), or stamps of them on a strobe's flashes (decision 50). */
export type TrailMark = "lines" | "stamps";

/** Which parts of the target leave a layer: the tip, every mass (decision 26), the rods, or the whole of it, masses and rods (decision 96). */
export type TrailParts = "tip" | "masses" | "rods" | "whole";

/** A layer of the trails: what leaves it, how, and which parts; and how bright it is drawn, as a share of the light it is born with (decision 102). */
export interface TrailLayer {
  readonly target: TrailTarget;
  readonly mark: TrailMark;
  readonly parts: TrailParts;
  readonly light: number;
}

// The parts a layer comes from, by the value of its control, from 1: 0 is
// none of them (decision 96).
const PARTS: readonly TrailParts[] = ["tip", "masses", "rods", "whole"];

// Each layer's controls, in the row's order (decisions 96 and 102): what
// leaves it, how, the control of the parts it comes from, and its light.
const ASKED: readonly (readonly [
  TrailTarget,
  TrailMark,
  Parameter,
  Parameter,
])[] = [
  ["chain", "lines", LINES, LINES_LIGHT],
  ["chain", "stamps", STROBE, STROBE_LIGHT],
  ["twins", "lines", TWIN_LINES, TWIN_LINES_LIGHT],
  ["twins", "stamps", TWIN_STROBE, TWIN_STROBE_LIGHT],
];

// every layer made once, and every list of them, so that a frame makes none
const LAYERS = new Map<string, TrailLayer>();
const LISTS = new Map<string, readonly TrailLayer[]>();

/** The layer `target` leaves by `mark` from the parts of `value`, in `light`, if any. */
function layerAt(
  target: TrailTarget,
  mark: TrailMark,
  value: number,
  light: number,
): TrailLayer | null {
  const parts = PARTS[value - 1];
  if (parts === undefined) return null;
  const key = `${target} ${mark} ${parts} ${String(light)}`;
  let layer = LAYERS.get(key);
  if (layer === undefined) {
    layer = { target, mark, parts, light };
    LAYERS.set(key, layer);
  }
  return layer;
}

/**
 * The layers of the trails the controls ask for as `value` has them, while
 * the trails are lit and last (decision 96): the chain's lines and its
 * strobe's stamps, then the twins', each from the parts its control steps
 * to, or none, in its own light (decision 102). Lines and stamps of one
 * target are drawn together; how the twins are drawn, as chains or as dust,
 * leaves their trails as these say.
 */
export function trailLayers(
  value: (parameter: Parameter) => number,
): readonly TrailLayer[] {
  let key = "";
  for (const [, , parts, light] of ASKED) {
    key += `${String(value(parts))} ${String(value(light))} `;
  }
  let list = LISTS.get(key);
  if (list === undefined) {
    list = ASKED.map(([target, mark, parts, light]) =>
      layerAt(target, mark, value(parts), value(light)),
    ).filter((layer) => layer !== null);
    LISTS.set(key, list);
  }
  return list;
}

/** The layer of `layers` that `target` leaves by `mark`, if any. */
export function layerOf(
  layers: readonly TrailLayer[],
  target: TrailTarget,
  mark: TrailMark,
): TrailLayer | undefined {
  return layers.find((layer) => layer.target === target && layer.mark === mark);
}

/**
 * How bright an end of a rod of the veil is (decision 96), as a share of
 * VEIL_LIGHT, for a piece over which it moved (dx, dy): as far as it went
 * over VEIL_STEP, up to all of it; none across a jump (decision 21).
 */
export function veilShine(dx: number, dy: number): number {
  const moved = Math.hypot(dx, dy);
  if (moved >= TRAIL_JUMP) return 0;
  return VEIL_LIGHT * Math.min(1, moved / VEIL_STEP);
}

/** What the drawing reads of the piece as it draws. */
export interface DrawingHooks {
  /** A control's value, as the settings have it. */
  value(parameter: Parameter): number;
  /** Whether the twins and the trails are lit (decision 27). */
  readonly lit: boolean;
  /** Whether the sketch's light takes the whole frame (decision 24). */
  readonly wholeFrame: boolean;
  /** What the music adds to the light this frame (decision 46). */
  readonly look: Look;
  /** `color` with as much of the bass's note as the music's mode gives to `to`. */
  tinted(color: Rgb, to: "chain" | "twins"): Rgb;
  /** The colours of the ground asked for (decision 41). */
  readonly colors: {
    readonly ground: Rgb;
    readonly chain: Rgb;
    readonly hand: Rgb;
    readonly pivot: Rgb;
  };
  /** Twin `j`'s colour, by its place in the fan (decision 23). */
  fanColor(j: number): Rgb | undefined;
  /** Whether the music's hand is shown while it holds the tip (decision 83). */
  readonly handShown: boolean;
  /** What times the frame's stages, where the address asks for the recorder (decision 94); none otherwise. */
  readonly stages: Stages | null;
}

/** The piece's drawing: what the frame shows, and the trails its motion leaves. */
export interface Drawing {
  /** How the trails meet a new view now (decision 71). */
  readonly mechanism: Mechanism;
  /** The trails kept as curves, where the address does not ask for layers (decision 71); none otherwise. */
  readonly sharp: SharpTrails | null;
  /** Whether the browser can draw light into half floats, where dense light keeps its colour (decision 61). */
  readonly floating: boolean;
  /** Whether each rod is painted by its tension (decision 35). */
  readonly tensionShown: boolean;
  /** Where the step drawn now began on the samples' clock of the curves (decision 68); none before. */
  readonly stepClock: TwinClock | null;
  /** The layers of the trails now: none while they are put out or off. */
  layers(): readonly TrailLayer[];
  /** The trails kept as curves, while they are the trails' mechanism and are drawn (decision 68); none otherwise. */
  curves(): SharpTrails | null;
  /** Every trail put out at once, the curves kept of them (decision 68), and the frame's pieces. */
  clearTrails(): void;
  /** The frame's pieces of trail let go, to be drawn anew. */
  clearPieces(): void;
  /** The mark put out (decision 42). */
  clearMark(): void;
  /** The chain's trails go on from where its masses are now. */
  resetEnds(): void;
  /** The chain has `n` masses now: its tension is weighed afresh. */
  setMasses(n: number): void;
  /** Each rod painted by its tension, or the chain in its own colour; switched on, the colours come up from the chain's own. */
  showTension(on: boolean): void;
  /** The tension painted in scale `scale`, around the chain's colour (decision 41). */
  paintTension(scale: number): void;
  /** Each rod's colour eases toward its tension, over the motion of `simulated` seconds, or of the instant when none went by. */
  easeTension(simulated: number): void;
  /** A step of the motion begins: kept as curves, on the samples' clock (decision 68). Whether the curves take the masses' velocities. */
  beginStep(): boolean;
  /**
   * The step's record drawn into the trails (decision 80), and the strobe's
   * flashes in it, which stamp the twins too (decision 100). The music flashes
   * the strobe on its kicks when `flashes`.
   */
  record(moved: Moved, flashes: boolean): readonly TwinFlash[];
  /** A piece of trail from (ax, ay) to (bx, by), unless the point jumped. */
  piece(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    color: Rgb,
    light: number,
  ): void;
  /**
   * A twin stamped by a strobe's flash, as its worker sent back where its n
   * masses were (decision 100): from `places` at `at`, x then y for each, from
   * the top, hung from the pivot at (px, py); as `parts` says, its rods in
   * `light` and its tip or every mass as points twice as bright.
   */
  stampTwin(
    parts: StampParts,
    n: number,
    places: ArrayLike<number>,
    at: number,
    px: number,
    py: number,
    color: Rgb,
    light: number,
  ): void;
  /** Draws a frame in `view`, the whole one when `whole`; `simulated` seconds of motion went by since the last. Whether the view changed. */
  draw(simulated: number, view: View, whole: boolean): boolean;
}

/**
 * The drawing of the chain of `motion` and the twins of `twins`, whose light
 * fades as `fading` has it (decision 43), on the canvas of `gl`, as `hooks`
 * say; the trails kept as the address `search` asks (decisions 68 to 72), and
 * the tension's colours shown as `tension` says.
 */
export function mountDrawing(
  gl: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
  motion: Motion,
  twins: TwinWorkers,
  fading: Fading,
  hooks: DrawingHooks,
  search: string,
  tension: boolean,
): Drawing {
  const value = (parameter: Parameter): number => hooks.value(parameter);
  const lines = new Lines(gl);
  const rods = new SegmentBatch(motion.chain.n);
  const fan = new SegmentBatch(value(TWIN_COUNT) * motion.chain.n);
  // the twins as dust: their tips alone (decision 50)
  const dust = new SegmentBatch(value(TWIN_COUNT));
  const dots = new SegmentBatch(motion.chain.n + 2);
  // the hand's spring, drawn stronger the harder the hand pulls
  const spring = new SegmentBatch(1);
  const pull = new Float64Array(2);
  let strength = 0;
  let x = new Float64Array(motion.chain.n);
  let y = new Float64Array(motion.chain.n);
  // the trails, the pieces drawn into them this frame, and where each ends
  const trails = new Trails(gl);
  // With the sketch's light on the whole frame, the frame's lines are drawn
  // here first, and go through the trails' curve with them (decision 24).
  const scene = new LightTarget(gl);
  // While dense light keeps its colour (decision 61), the twins' lines are
  // drawn here first, and go to the canvas through the curve. A browser that
  // cannot draw into half floats has eight bits here, which cut the light at
  // full as the canvas does: there white comes in at once, as before.
  const twinLight = new LightTarget(gl);
  twinLight.fit();
  const trail = new SegmentBatch(4096);
  // the points stamped into the trails this frame, drawn with round ends: a
  // piece of no length with cut ends has no light (decision 96)
  const trailPoints = new SegmentBatch(256);
  // where each mass of the chain was at the end of the last piece of trail
  let ends = new Float64Array(2 * motion.chain.n);
  // Trails kept as curves, drawn anew in any view (decision 68), a strobe's
  // stamps too (decision 91), unless the address asks for layers, the image
  // carried to each view (decision 71), which a mark still uses. The curves take each
  // drawing mass's velocity with its place, from the motion's record; each
  // step of the motion begins at a point of the samples' clock, which the
  // twins computed with it take, and fades the trails by its half-lives.
  const sharp = readCurves(search)
    ? new SharpTrails(
        gl,
        trails,
        twins,
        motion.chain.totalLength,
        readKeep(search),
        readStretch(search),
      )
    : null;
  let mechanism: Mechanism = "layers";
  let stepClock: TwinClock | null = null;
  let stepFade = 0;
  // the curves the step drawn now draws into, if any
  let stepCurves: SharpTrails | null = null;
  // The colour of the tension (decision 35), off until it is switched on:
  // each rod's tension averaged over the motion of the frame, or of the
  // instant when no time went by, in Earth weights of what the rod holds.
  let tensionShown = tension;
  let weights = earthWeights(motion.chain);
  let shades = new TensionShades(motion.chain.n);
  let rodTension = new Float64Array(motion.chain.n);
  let tensionScratch = new Float64Array(motion.chain.n);
  let tensionColor = tensionScale(
    hooks.colors.chain,
    paletteAt(value(SCALE)).colors,
  );
  // each rod's colour, worked out once a frame for its rod, its mass and the
  // trail the mass leaves
  let rodColors: Rgb[] = [];
  // the simulated time since a strobe last stamped the chain (decision 50)
  let strobeClock = 0;
  // where the pivot was at the end of the last piece, for the veil
  const lastPivot = new Float64Array([motion.pivot.x, motion.pivot.y]);

  /** The layers of the trails now: none while they are put out or off. */
  function layers(): readonly TrailLayer[] {
    if (!hooks.lit || value(TRAIL) === 0) return [];
    return trailLayers(value);
  }

  /** Every trail put out at once, and the curves kept of them (decision 68). */
  function clearTrails(): void {
    trails.clear();
    sharp?.clear();
  }

  /** The chain's trails go on from where its masses are now. */
  function resetEnds(): void {
    const n = motion.chain.n;
    motion.positions(x, y);
    ends = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) {
      ends[2 * i] = x[i] ?? 0;
      ends[2 * i + 1] = y[i] ?? 0;
    }
    lastPivot[0] = motion.pivot.x;
    lastPivot[1] = motion.pivot.y;
  }

  /** A point of light into the trails at (px, py), as a strobe's flash stamps a mass or a twin's tip: kept as curves, a span of no length that the curves draw round (decision 96), or among the frame's points. */
  function trailPoint(
    curves: SharpTrails | null,
    px: number,
    py: number,
    color: Rgb,
    light: number,
  ): void {
    if (curves !== null) curves.point(px, py, color, light);
    else trailPoints.push(px, py, px, py, color, light);
  }

  /**
   * A rod of the veil (decision 96), from (ax, ay) to (bx, by), its ends this
   * light: kept as curves, a straight span whose light runs from one end's to
   * the other's; carried as the image, in as many pieces, up to VEIL_CUTS, as
   * keep each step of light between them small, each as bright as its middle.
   */
  function veilRod(
    curves: SharpTrails | null,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    color: Rgb,
    lightA: number,
    lightB: number,
  ): void {
    if (lightA <= 0 && lightB <= 0) return;
    if (curves !== null) {
      curves.stamp(ax, ay, bx, by, color, lightA, lightB);
      return;
    }
    const cuts = Math.min(
      VEIL_CUTS,
      Math.max(
        1,
        Math.ceil(
          (VEIL_CUTS * Math.abs(lightB - lightA)) / Math.max(lightA, lightB),
        ),
      ),
    );
    for (let k = 0; k < cuts; k++) {
      const u0 = k / cuts;
      const u1 = (k + 1) / cuts;
      const middle = (k + 0.5) / cuts;
      trail.push(
        ax + (bx - ax) * u0,
        ay + (by - ay) * u0,
        ax + (bx - ax) * u1,
        ay + (by - ay) * u1,
        color,
        lightA + (lightB - lightA) * middle,
      );
    }
  }

  /** A piece of trail from (ax, ay) to (bx, by), unless the point jumped. */
  function trailPiece(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    color: Rgb,
    light: number,
  ): void {
    if (!hooks.lit || value(TRAIL) === 0) return;
    if (Math.hypot(bx - ax, by - ay) < TRAIL_JUMP) {
      // stronger as the music asks (decision 46)
      const music = 1 + Math.min(TRAIL_MOST, hooks.look.trail);
      trail.push(ax, ay, bx, by, color, light * music);
    }
  }

  /** The trails kept as curves, while they are the trails' mechanism and are drawn (decision 68); none otherwise. */
  function curvesNow(): SharpTrails | null {
    return mechanism === "sharp" && hooks.lit && value(TRAIL) > 0
      ? sharp
      : null;
  }

  /**
   * Mass `i`'s piece of trail as samples of a curve (decision 68), from where
   * it was, at `seconds` and `fade` on the samples' clock, to where it is now,
   * each mass's velocities at the two ends in `starts` and `speeds`, x then y
   * for each, from `startAt` and `speedAt`; a mass that jumped starts its
   * trail anew, and one whose trail does not go on from where the piece
   * starts begins it there.
   */
  function curvePiece(
    curves: SharpTrails,
    i: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    seconds: number,
    fade: number,
    color: Rgb,
    light: number,
    starts: Float64Array,
    startAt: number,
    speeds: Float64Array,
    speedAt: number,
  ): void {
    const merger = curves.chain;
    const { fresh, closed, clock } = curves;
    // stronger as the music asks (decision 46)
    const shine = light * (1 + Math.min(TRAIL_MOST, hooks.look.trail));
    if (Math.hypot(bx - ax, by - ay) >= TRAIL_JUMP) {
      merger.cut(i, closed);
    } else if (!merger.continues(i, ax, ay, 1e-9)) {
      merger.cut(i, closed);
      merger.sample(
        i,
        ax,
        ay,
        starts[startAt + 2 * i] ?? 0,
        starts[startAt + 2 * i + 1] ?? 0,
        seconds,
        fade,
        shine,
        color,
        fresh,
        closed,
      );
    }
    merger.sample(
      i,
      bx,
      by,
      speeds[speedAt + 2 * i] ?? 0,
      speeds[speedAt + 2 * i + 1] ?? 0,
      clock.seconds,
      clock.fade,
      shine,
      color,
      fresh,
      closed,
    );
  }

  /**
   * The chain stamped into the trails, as a strobe's flash leaves it
   * (decisions 50 and 96), from the pivot at (`px`, `py`) (decision 75), its
   * masses in `positions` from `at`, x then y for each, as `layer`'s parts
   * say: its rods, each in its colour; its tip, or every mass, as points; or
   * the whole chain, rods and masses; in the layer's light (decision 102),
   * brighter as the music asks; kept as curves, straight spans and points, at
   * the flash's instant on the samples' clock (decision 91).
   */
  function stamp(
    curves: SharpTrails | null,
    layer: TrailLayer,
    color: Rgb,
    px: number,
    py: number,
    positions: Float64Array,
    at: number,
  ): void {
    const { parts } = layer;
    const light = layer.light * (1 + Math.min(TRAIL_MOST, hooks.look.trail));
    const n = motion.chain.n;
    const rods = parts === "rods" || parts === "whole";
    // the masses stamped as points, from the first: the tip alone, or all
    const firstPoint = parts === "tip" ? n - 1 : parts === "rods" ? n : 0;
    let ax = px;
    let ay = py;
    for (let i = 0; i < n; i++) {
      const bx = positions[at + 2 * i] ?? 0;
      const by = positions[at + 2 * i + 1] ?? 0;
      const rod = tensionShown ? (rodColors[i] ?? color) : color;
      if (rods) stampRod(curves, ax, ay, bx, by, rod, STROBE_ROD * light);
      if (i >= firstPoint) {
        trailPoint(curves, bx, by, rod, STROBE_POINT * light);
      }
      ax = bx;
      ay = by;
    }
  }

  /** A rod stamped by a strobe's flash: kept as curves, a straight span (decision 91), or among the frame's pieces. */
  function stampRod(
    curves: SharpTrails | null,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    color: Rgb,
    light: number,
  ): void {
    if (curves !== null) curves.stamp(ax, ay, bx, by, color, light);
    else trail.push(ax, ay, bx, by, color, light);
  }

  /** A twin stamped by a strobe's flash from where its worker sent back its masses (decision 100), as the chain is. */
  function stampTwin(
    parts: StampParts,
    n: number,
    places: ArrayLike<number>,
    at: number,
    px: number,
    py: number,
    color: Rgb,
    light: number,
  ): void {
    if (!hooks.lit || value(TRAIL) === 0) return;
    const curves = curvesNow();
    const rods = parts === "rods" || parts === "whole";
    // the masses stamped as points, from the first: the tip alone, or all
    const firstPoint = parts === "tip" ? n - 1 : parts === "rods" ? n : 0;
    let ax = px;
    let ay = py;
    for (let i = 0; i < n; i++) {
      const bx = (places[at + 2 * i] ?? 0) + px;
      const by = (places[at + 2 * i + 1] ?? 0) + py;
      if (rods) stampRod(curves, ax, ay, bx, by, color, light);
      if (i >= firstPoint) trailPoint(curves, bx, by, color, 2 * light);
      ax = bx;
      ay = by;
    }
  }

  /**
   * A frame's record drawn into the trails (decision 80), by the chain's
   * layers (decision 96). Lines, each piece ending in a point of them
   * (decision 21), from where each drawing mass's trail ended: the tip, or
   * every mass (decision 26); kept as curves, at the piece's instant on the
   * samples' clock (decision 68). The veil of the rods, each rod stamped at
   * every piece. And a strobe's stamps, at even times of the motion, or on
   * the music's kicks when `flashes` (decision 50), while the chain or the
   * twins are stamped: the strobe's flashes, each with its instant in the
   * frame, the fade's clock then and where the pivot was, for the twins'
   * stamps (decision 100).
   */
  function drawMoved(
    moved: Moved,
    curves: SharpTrails | null,
    flashes: boolean,
  ): TwinFlash[] {
    const n = motion.chain.n;
    const now = layers();
    const drawn = layerOf(now, "chain", "lines");
    const stamped = layerOf(now, "chain", "stamps");
    // the strobe flashes while it stamps the chain or the twins
    const strobing =
      stamped !== undefined || layerOf(now, "twins", "stamps") !== undefined;
    // The tip draws, and every mass does with the masses or the whole chain
    // (decision 26), the others fainter the more there are, so that the
    // ribbon stays light; the rods draw the veil.
    const massLines = drawn !== undefined && drawn.parts !== "rods";
    const firstDrawing =
      drawn?.parts === "masses" || drawn?.parts === "whole" ? 0 : n - 1;
    const veil = drawn?.parts === "rods" || drawn?.parts === "whole";
    const chainColor = hooks.tinted(hooks.colors.chain, "chain");
    const music = 1 + Math.min(TRAIL_MOST, hooks.look.trail);
    const flashed: TwinFlash[] = [];
    // the time into the frame as each piece ends
    let elapsed = 0;
    // the lines in their layer's light (decision 102)
    const linesLight = drawn?.light ?? 1;
    const ribbonLight = 0.55 * Math.min(1, 2.2 / Math.sqrt(n)) * linesLight;
    // the veil fainter the more rods there are, each by the share of the
    // chain it is past two, so that the inner rods, which sweep a small disc
    // over and over, do not burn its middle white
    const veilGain = music * Math.min(1, 2.2 / n) * linesLight;
    const { positions, pivots, velocities, startVelocities } = moved;
    for (let piece = 0; piece < moved.pieces; piece++) {
      const at = 2 * n * piece;
      const ran = moved.times[piece] ?? 0;
      elapsed += ran;
      const seconds = curves?.clock.seconds ?? 0;
      const fade = curves?.clock.fade ?? 0;
      if (curves !== null) curves.clock.advance(ran);
      // the veil's rods go out from the pivot, each end as bright as it moved
      let veilX = pivots[2 * piece] ?? 0;
      let veilY = pivots[2 * piece + 1] ?? 0;
      let veilLight = veil
        ? veilShine(veilX - (lastPivot[0] ?? 0), veilY - (lastPivot[1] ?? 0))
        : 0;
      lastPivot[0] = veilX;
      lastPivot[1] = veilY;
      for (let i = 0; i < n; i++) {
        const bx = positions[at + 2 * i] ?? 0;
        const by = positions[at + 2 * i + 1] ?? 0;
        const ax = ends[2 * i] ?? bx;
        const ay = ends[2 * i + 1] ?? by;
        // with the tension's colours, in the colour of the rod it hangs from
        const color = tensionShown
          ? (rodColors[i] ?? hooks.colors.chain)
          : chainColor;
        if (massLines && i >= firstDrawing) {
          const light = i === n - 1 ? 0.55 * linesLight : ribbonLight;
          if (curves !== null) {
            // from the velocities as the piece began: the frame's start, or
            // the piece before's end
            curvePiece(
              curves,
              i,
              ax,
              ay,
              bx,
              by,
              seconds,
              fade,
              color,
              light,
              piece === 0 ? startVelocities : velocities,
              piece === 0 ? 0 : at - 2 * n,
              velocities,
              at,
            );
          } else {
            trailPiece(ax, ay, bx, by, color, light);
          }
        }
        if (veil) {
          const light = veilShine(bx - ax, by - ay);
          veilRod(
            curves,
            veilX,
            veilY,
            bx,
            by,
            color,
            veilLight * veilGain,
            light * veilGain,
          );
          veilX = bx;
          veilY = by;
          veilLight = light;
        }
        ends[2 * i] = bx;
        ends[2 * i + 1] = by;
      }
      // at even times of the motion, unless the music flashes the strobe
      if (strobing && !flashes) {
        strobeClock += ran;
        if (strobeClock >= 1 / STROBE_RATE) {
          strobeClock %= 1 / STROBE_RATE;
          const px = pivots[2 * piece] ?? 0;
          const py = pivots[2 * piece + 1] ?? 0;
          if (stamped !== undefined) {
            stamp(curves, stamped, chainColor, px, py, positions, at);
          }
          flashed.push({
            at: elapsed,
            fade: curves?.clock.fade ?? 0,
            x: px,
            y: py,
          });
        }
      }
    }
    // on a kick, while the music flashes the strobe, the chain as the frame
    // ends, from where the pivot is then
    if (strobing && flashes && hooks.look.flash > 0) {
      const { pivot } = motion;
      if (stamped !== undefined) {
        stamp(
          curves,
          stamped,
          chainColor,
          pivot.x,
          pivot.y,
          positions,
          2 * n * (moved.pieces - 1),
        );
      }
      flashed.push({
        at: elapsed,
        fade: curves?.clock.fade ?? 0,
        x: pivot.x,
        y: pivot.y,
      });
    }
    return flashed;
  }

  /**
   * Each rod's colour eases toward its tension (decision 35): over whole
   * periods of a shaking pivot, over the motion of `simulated` seconds, or
   * of the instant when none went by.
   */
  function easeTension(simulated: number): void {
    if (!tensionShown) return;
    const { chain, state, meter } = motion;
    if (value(SHAKE) > 0) {
      // over whole periods of the shake, where its swing averages out; until
      // one has closed, the colours wait
      if (meter.closed) shades.ease(meter.mean, weights, TENSION_EASE);
    } else {
      // the tension over the frame's motion, or of the instant when none
      if (simulated > 0) {
        const summed = motion.frameTension;
        for (let i = 0; i < chain.n; i++) {
          rodTension[i] = (summed[i] ?? 0) / simulated;
        }
      } else {
        chain.solve(
          state.theta,
          state.omega,
          motion.g,
          tensionScratch,
          rodTension,
          motion.hand,
        );
      }
      shades.ease(rodTension, weights, TENSION_EASE);
    }
    for (let i = 0; i < chain.n; i++) {
      rodColors[i] = tensionColor(shades.places[i] ?? 0);
    }
  }

  /** Whether dense light keeps its colour now: asked for, where the browser can draw light into half floats (decision 61). */
  function keepsColour(): boolean {
    return value(WHITE) > 0 && twinLight.floating;
  }

  /** Draws a frame; `simulated` seconds of motion went by since the last. Whether the view changed. */
  function draw(simulated: number, view: View, whole: boolean): boolean {
    const { chain, state, pivot } = motion;
    const box = canvas.getBoundingClientRect();
    const ratio = box.width > 0 ? canvas.width / box.width : 1;
    // The view from the drawing buffer alone, and the trails carried to it
    // when it changed (decision 66). In the frame where the window has
    // changed and the buffer not yet, the buffer's view is the one shown.
    // Kept as curves (decision 68), the trails are remade in it instead, a
    // strobe's stamps too (decision 91), unless the curves cannot keep them
    // yet: a mark, or eight bits; the image shown then goes on as the image
    // carried, and back.
    const { stages } = hooks;
    stages?.begin("draw.see");
    const trailStep = hooks.lit ? value(TRAIL) : 0;
    const { halfLife, mark } = trailFade(trailStep);
    if (sharp !== null) {
      const wanted = trailMechanism(true, {
        mark,
        floating: trails.image.floating,
      });
      if (wanted !== mechanism) {
        const frame = { view, whole, fade: 0, radius: 0.9 * ratio };
        if (wanted === "sharp") sharp.start(frame);
        else sharp.stop();
        mechanism = wanted;
        stepFade = 0;
      }
    }
    const changed =
      mechanism === "sharp" && sharp !== null
        ? sharp.see(view)
        : trails.see(view);
    stages?.end("draw.see");
    const scale = view.scale;
    const rodPixels = (chain.totalLength / chain.n) * (scale / ratio);
    // Every mass, twin and trail stays within the chain's length of the
    // pivot, and its glow within GLOW_REACH of that: the passes over a whole
    // target are cut to that box (decision 62). With the sketch's light the
    // hand's spring, wherever the hand is, goes through the scene too.
    const region =
      hooks.wholeFrame && motion.held
        ? null
        : reachBox(
            view,
            (chain.totalLength + Math.hypot(pivot.x, pivot.y)) * scale +
              GLOW_REACH * ratio,
          );
    trails.region = region;

    // The twins, faint, so that many together read as one bright chain and
    // only the fringes of the fan show colour; while they fade, each in its
    // own light, and those gone dark not at all.
    stages?.begin("draw.fan");
    fan.clear();
    dust.clear();
    const faint = twinShine(twins.count);
    const fades = value(FADE) === 1;
    // as dust, each twin its tip alone, a point brighter than a line, and
    // in its own light while the twins fade (decision 53)
    const asDust = value(LOOK) === 1;
    const speck = Math.min(0.8, 6 / Math.sqrt(Math.max(1, twins.count)));
    // each twin where its worker last said it is, at the chain's instant
    // (decision 51)
    twins.each((j, report, k) => {
      const shine = fades ? (fading.light[j] ?? 1) : 1;
      if (shine < 1 / 64) return;
      const color = hooks.tinted(
        hooks.fanColor(j) ?? hooks.colors.chain,
        "twins",
      );
      if (asDust) {
        const end = 2 * (report.pieces + 1) * (k + 1) - 2;
        const px = (report.tips[end] ?? 0) + pivot.x;
        const py = (report.tips[end + 1] ?? 0) + pivot.y;
        dust.push(px, py, px, py, color, speck * shine);
        return;
      }
      const { n, positions } = report;
      const base = 2 * n * k;
      if (positions.length < base + 2 * n) return;
      // from the pivot, where the music's kicks have taken it (decision 75)
      let tx = pivot.x;
      let ty = pivot.y;
      for (let i = 0; i < n; i++) {
        const bx = (positions[base + 2 * i] ?? 0) + pivot.x;
        const by = (positions[base + 2 * i + 1] ?? 0) + pivot.y;
        fan.push(tx, ty, bx, by, color, faint * shine);
        tx = bx;
        ty = by;
      }
    });
    stages?.end("draw.fan");

    motion.positions(x, y);
    rods.clear();
    dots.clear();
    spring.clear();
    const chainColor = hooks.tinted(hooks.colors.chain, "chain");
    // what of the chain is drawn (decision 65): hidden, its rods are as
    // bright as the music's light on the kicks makes them, up to how bright
    // they are drawn, and gone in silence
    const drawn = value(DRAWN);
    const rodLight = rodsDrawn(drawn) ? 1 : Math.min(1, hooks.look.glow);
    const massesShown = massesDrawn(drawn);
    let ax = pivot.x;
    let ay = pivot.y;
    for (let i = 0; i < chain.n; i++) {
      const bx = x[i] ?? 0;
      const by = y[i] ?? 0;
      const color = tensionShown
        ? (rodColors[i] ?? hooks.colors.chain)
        : chainColor;
      rods.push(ax, ay, bx, by, color, 0.9 * rodLight);
      // the masses, while the rods are long enough to tell them apart, each
      // in the colour of the rod it hangs from, unless they are hidden
      if (massesShown && rodPixels >= 12) dots.push(bx, by, bx, by, color, 1);
      ax = bx;
      ay = by;
    }
    // the visitor's hand, or the music's while it holds the tip (decision
    // 75), in the chain's colour, where its choreography shows it (decision
    // 83): hidden, the chain dances by itself
    const holder = motion.hand ?? (hooks.handShown ? motion.musicHand : null);
    if (holder !== null) {
      // How hard the hand pulls, in weights of the whole chain on Earth, eased
      // over a few frames so that a jittery pointer does not flicker: a hand
      // that lifts the chain on Earth pulls about one weight, one that whirls
      // it several. Under other gravity the same pull shows the same.
      chain.handForce(state.theta, state.omega, holder, pull);
      const weights =
        Math.hypot(pull[0] ?? 0, pull[1] ?? 0) / (chain.totalMass * EARTH);
      strength += 0.25 * (1 - Math.exp(-weights) - strength);
      // the spring between the held mass and the hand, which holds in the
      // pivot's frame
      const color = motion.held ? hooks.colors.hand : chainColor;
      const hx = x[holder.index] ?? 0;
      const hy = y[holder.index] ?? 0;
      const px = holder.x + pivot.x;
      const py = holder.y + pivot.y;
      spring.push(hx, hy, px, py, color, 0.35 + 0.65 * strength);
      dots.push(px, py, px, py, color, 0.6 + 0.4 * strength);
    } else {
      strength = 0;
    }
    // the pivot, where the music's kicks have taken it, drawn as a streak
    // along its line while it shakes
    const shaking = motion.shakeAt(0);
    const sx = shaking === null ? 0 : PIVOT_STREAK * shaking.x;
    const sy = shaking === null ? 0 : PIVOT_STREAK * shaking.y;
    dots.push(
      pivot.x - sx,
      pivot.y - sy,
      pivot.x + sx,
      pivot.y + sy,
      hooks.colors.pivot,
      0.8,
    );

    // The trails fade by the time that went by and take this frame's pieces;
    // the step that leaves a mark keeps the brightest of them too (decision
    // 42). Kept as curves, they fade by the half-lives of the step drawn,
    // take its spans and intervals, and are remade if the view changed
    // (decision 68).
    stages?.begin("draw.trails");
    if (mechanism === "sharp" && sharp !== null) {
      if (trailStep > 0) {
        sharp.frame(
          { view, whole, fade: stepFade, radius: 0.9 * ratio },
          performance.now(),
        );
      }
      stepFade = 0;
    } else if (simulated > 0 && trailStep > 0) {
      // they last longer as the music asks (decision 49)
      trails.add(
        fadeAfter(simulated, halfLife * (1 + hooks.look.linger)),
        (into) => {
          lines.draw(trail, into, { radius: 0.9 * ratio, roundEnds: false });
          lines.draw(trailPoints, into, {
            radius: 0.9 * ratio,
            roundEnds: true,
          });
        },
      );
      if (mark) {
        trails.addMark((into) => {
          lines.draw(trail, into, {
            radius: 0.9 * ratio,
            roundEnds: false,
            keep: true,
          });
          lines.draw(trailPoints, into, {
            radius: 0.9 * ratio,
            roundEnds: true,
            keep: true,
          });
        });
      }
    }
    stages?.end("draw.trails");
    stages?.begin("draw.gl");
    // dense light keeps its colour, or turns white at once (decision 61)
    const keeps = keepsColour();
    trails.white = keeps ? whiteAfter(value(WHITE)) : 0;
    if (hooks.wholeFrame) {
      // the frame's lines, then all of it through the curve
      scene.bind(true, region);
      drawTwins(view, ratio);
      drawChain(view, ratio, rodPixels);
      scene.unbind();
      lines.clear(hooks.colors.ground);
      trails.show(scene, mark);
    } else if (keeps) {
      // the trails and the twins through the curve, each apart, under the chain
      const twinsShown = twins.count > 0;
      if (twinsShown) {
        twinLight.bind(true, region);
        drawTwins(view, ratio);
        twinLight.unbind();
      }
      lines.clear(hooks.colors.ground);
      const light = twinsShown ? twinLight : undefined;
      // one pass over the frame for both, where the trails are on
      if (trailStep > 0) trails.show(undefined, mark, light);
      else if (light !== undefined) trails.showLight(light);
      drawChain(view, ratio, rodPixels);
    } else {
      // the trails through the curve, under the chains
      lines.clear(hooks.colors.ground);
      if (trailStep > 0) trails.show(undefined, mark);
      drawTwins(view, ratio);
      drawChain(view, ratio, rodPixels);
    }
    stages?.end("draw.gl");
    return changed;
  }

  /** The twins, as chains or as dust. */
  function drawTwins(view: View, ratio: number): void {
    lines.draw(fan, view, {
      radius: 0.7 * ratio,
      roundEnds: motion.chain.n <= 64,
    });
    // the twins as dust, each point swelling as the music lights the halo
    // (decision 50)
    const pulse = Math.min(1, hooks.look.glow);
    lines.draw(dust, view, {
      radius: DUST_RADIUS * (1 + pulse) * ratio,
      roundEnds: true,
      halo: 3 * ratio,
      haloGain: 0.2 + 0.4 * pulse,
    });
  }

  /** The chain, the hand's spring and the dots. */
  function drawChain(view: View, ratio: number, rodPixels: number): void {
    // Past 64 rods the ends are cut flat, so that rods laid end to end make
    // one even line instead of beads where their round ends overlap.
    // the halo widens and brightens as the music lights it (decision 46)
    const glow = Math.min(GLOW_MOST, hooks.look.glow);
    // rods hidden are drawn only while the music lights them (decision 65)
    const n = motion.chain.n;
    if (rodsDrawn(value(DRAWN)) || glow > 0) {
      lines.draw(rods, view, {
        radius: (n > 64 ? 1.0 : 1.3) * ratio,
        roundEnds: n <= 64,
        halo: (5 + GLOW_RADIUS * glow) * ratio,
        haloGain: 0.22 + GLOW_GAIN * glow,
      });
    }
    lines.draw(spring, view, {
      radius: (0.8 + 1.4 * strength) * ratio,
      roundEnds: true,
      halo: 5 * ratio,
      haloGain: 0.2 + 0.3 * strength,
    });
    lines.draw(dots, view, {
      radius: Math.min(4.5, Math.max(2, 0.2 * rodPixels)) * ratio,
      roundEnds: true,
      halo: 6 * ratio,
      haloGain: 0.25,
    });
  }

  return {
    get mechanism() {
      return mechanism;
    },
    sharp,
    get floating() {
      return twinLight.floating;
    },
    get tensionShown() {
      return tensionShown;
    },
    get stepClock() {
      return stepClock;
    },
    layers,
    curves: curvesNow,
    clearTrails() {
      clearTrails();
      trail.clear();
      trailPoints.clear();
    },
    clearPieces() {
      trail.clear();
      trailPoints.clear();
    },
    clearMark() {
      trails.clearMark();
    },
    resetEnds,
    setMasses(n) {
      x = new Float64Array(n);
      y = new Float64Array(n);
      weights = earthWeights(motion.chain);
      shades = new TensionShades(n);
      rodColors = Array.from({ length: n }, () => hooks.colors.chain);
      rodTension = new Float64Array(n);
      tensionScratch = new Float64Array(n);
    },
    showTension(on) {
      tensionShown = on;
      // switched on, the colours come up from the chain's own over a few frames
      if (on) {
        shades = new TensionShades(motion.chain.n);
        rodColors = Array.from(
          { length: motion.chain.n },
          () => hooks.colors.chain,
        );
      }
    },
    paintTension(scale) {
      tensionColor = tensionScale(hooks.colors.chain, paletteAt(scale).colors);
    },
    easeTension,
    beginStep() {
      // kept as curves (decision 68), the step begins on the samples' clock,
      // fading as long as the trails last, longer as the music asks
      stepCurves = curvesNow();
      if (stepCurves !== null) {
        const { halfLife } = trailFade(value(TRAIL));
        stepClock = stepCurves.clock.begin(halfLife * (1 + hooks.look.linger));
      }
      return stepCurves !== null;
    },
    record(moved, flashes) {
      const curves = stepCurves;
      const flashed = drawMoved(moved, curves, flashes);
      // the half-lives the step fades the trails by, once it is drawn
      if (curves !== null && stepClock !== null) {
        stepFade += curves.clock.fade - stepClock.fade;
      }
      return flashed;
    },
    piece: trailPiece,
    stampTwin,
    draw,
  };
}
