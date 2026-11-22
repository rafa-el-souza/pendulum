// The first piece's drawing (docs/decisions.md, decision 90): the chain, its
// twins, the hand and the pivot, and the trails they leave, in the light of
// the trails, the twins and the sketch. Every frame's motion is drawn into the
// trails (decision 21), kept as curves or as the image carried (decisions 66,
// 68 and 71); a strobe stamps the whole chain (decisions 50 and 91); each rod can be
// painted by its tension (decision 35).
//
// The trails are drawn in layers: what leaves each (the chain or its twins),
// how (lines along the paths, or stamps on a strobe's flashes) and which
// parts (the tip, every mass, the rods). The controls of the trails say which
// layers there are; every layer draws into the one image of the trails.

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
import {
  EARTH,
  TensionShades,
  earthWeights,
  tensionScale,
  tensionScaleAt,
} from "../core/tension.ts";
import { LightTarget, Trails, fadeAfter } from "../core/trails.ts";
import type { TwinClock } from "../core/twin-share.ts";
import type { TwinWorkers } from "../core/twin-workers.ts";
import { twinShine, type Fading } from "../core/twins.ts";
import { reachBox, type View } from "../core/view.ts";
import type { Motion, Moved } from "./motion.ts";
import {
  DRAWN,
  FADE,
  LOOK,
  RIBBON,
  SCALE,
  SHAKE,
  STYLE,
  TRAIL,
  TWIN_COUNT,
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
// The trails of a strobe (decision 50): the whole chain stamped this many
// times a second of simulated time, each copy this light. The twins as dust:
// each tip a point this many pixels wide, which swells as the music lights
// the halo.
const STROBE_RATE = 12;
const STROBE_LIGHT = 0.45;
const DUST_RADIUS = 1.4;
// How far past a mass's place its light can reach on the frame, in CSS
// pixels: the rods' widest halo with the music at its most, whose glow a line
// draws out to three spreads (lines.ts), and a pixel for the line's edge.
// Every other line, dot and point of dust reaches less (decision 62).
const GLOW_REACH = 3 * (5 + GLOW_RADIUS * GLOW_MOST) + 1;

/** What leaves a layer of the trails: the chain, or its twins. */
export type TrailTarget = "chain" | "twins";

/** How a layer leaves its light: lines along the paths its parts take (decision 21), or stamps of them on a strobe's flashes (decision 50). */
export type TrailMark = "lines" | "stamps";

/** Which parts of the target leave a layer: the tip, every mass (decision 26), or the rods. */
export type TrailParts = "tip" | "masses" | "rods";

/** A layer of the trails: what leaves it, how, and which parts. */
export interface TrailLayer {
  readonly target: TrailTarget;
  readonly mark: TrailMark;
  readonly parts: TrailParts;
}

const CHAIN_TIP: TrailLayer = { target: "chain", mark: "lines", parts: "tip" };
const CHAIN_MASSES: TrailLayer = {
  target: "chain",
  mark: "lines",
  parts: "masses",
};
const TWIN_TIPS: TrailLayer = { target: "twins", mark: "lines", parts: "tip" };
const CHAIN_STAMPS: TrailLayer = {
  target: "chain",
  mark: "stamps",
  parts: "rods",
};
const TWIN_STAMPS: TrailLayer = {
  target: "twins",
  mark: "stamps",
  parts: "tip",
};
const STROBE: readonly TrailLayer[] = [CHAIN_STAMPS, TWIN_STAMPS];
const TIP_ALONE: readonly TrailLayer[] = [CHAIN_TIP];
const MASSES_ALONE: readonly TrailLayer[] = [CHAIN_MASSES];
const TIPS: readonly TrailLayer[] = [CHAIN_TIP, TWIN_TIPS];
const MASSES_AND_TIPS: readonly TrailLayer[] = [CHAIN_MASSES, TWIN_TIPS];

/**
 * The layers of the trails the controls ask for, while the trails are lit
 * and last: a strobe's stamps of the chain's rods and of each twin's tip
 * (decisions 50 and 53); or lines from the chain's tip, or from every mass
 * with the ribbon (decision 26), and from each twin's tip, save twins drawn
 * as dust, which leave none (decision 50).
 */
export function trailLayers(
  style: number,
  ribbon: number,
  look: number,
): readonly TrailLayer[] {
  if (style === 1) return STROBE;
  if (look === 1) return ribbon === 1 ? MASSES_ALONE : TIP_ALONE;
  return ribbon === 1 ? MASSES_AND_TIPS : TIPS;
}

/** The layer of `layers` that `target` leaves by `mark`, if any. */
export function layerOf(
  layers: readonly TrailLayer[],
  target: TrailTarget,
  mark: TrailMark,
): TrailLayer | undefined {
  return layers.find((layer) => layer.target === target && layer.mark === mark);
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
  /** The step's record drawn into the trails (decision 80); whether a strobe flashed. The music flashes the strobe on its kicks when `flashes`. */
  record(moved: Moved, flashes: boolean): boolean;
  /** A piece of trail from (ax, ay) to (bx, by), unless the point jumped. */
  piece(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    color: Rgb,
    light: number,
  ): void;
  /** A point of light into the trails, as a strobe's flash stamps a twin's tip (decision 50). */
  point(x: number, y: number, color: Rgb, light: number): void;
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
    tensionScaleAt(value(SCALE)),
  );
  // each rod's colour, worked out once a frame for its rod, its mass and the
  // trail the mass leaves
  let rodColors: Rgb[] = [];
  // the simulated time since a strobe last stamped the chain (decision 50)
  let strobeClock = 0;

  /** The layers of the trails now: none while they are put out or off. */
  function layers(): readonly TrailLayer[] {
    if (!hooks.lit || value(TRAIL) === 0) return [];
    return trailLayers(value(STYLE), value(RIBBON), value(LOOK));
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
   * The whole chain stamped into the trails, as a strobe's flash leaves it
   * (decision 50), from the pivot at (`px`, `py`) (decision 75), its masses
   * in `positions` from `at`, x then y for each: each rod in its colour,
   * brighter as the music asks; kept as curves, a straight span each, at the
   * flash's instant on the samples' clock (decision 91).
   */
  function stamp(
    curves: SharpTrails | null,
    color: Rgb,
    px: number,
    py: number,
    positions: Float64Array,
    at: number,
  ): void {
    const music = 1 + Math.min(TRAIL_MOST, hooks.look.trail);
    let ax = px;
    let ay = py;
    for (let i = 0; i < motion.chain.n; i++) {
      const bx = positions[at + 2 * i] ?? 0;
      const by = positions[at + 2 * i + 1] ?? 0;
      const rod = tensionShown ? (rodColors[i] ?? color) : color;
      if (curves !== null) {
        curves.stamp(ax, ay, bx, by, rod, STROBE_LIGHT * music);
      } else {
        trail.push(ax, ay, bx, by, rod, STROBE_LIGHT * music);
      }
      ax = bx;
      ay = by;
    }
  }

  /**
   * A frame's record drawn into the trails (decision 80), by the chain's
   * layers: lines, each piece ending in a point of them (decision 21), from
   * where each drawing mass's trail ended, the tip, or every mass with the
   * ribbon (decision 26); kept as curves, at the piece's instant on the
   * samples' clock (decision 68); or a strobe's stamps of the whole chain, at
   * even times of the motion, or on the music's kicks when `flashes`
   * (decision 50). Whether a strobe flashed.
   */
  function drawMoved(
    moved: Moved,
    curves: SharpTrails | null,
    flashes: boolean,
  ): boolean {
    const n = motion.chain.n;
    const now = layers();
    const drawn = layerOf(now, "chain", "lines");
    const stamped = layerOf(now, "chain", "stamps") !== undefined;
    // The tip draws, and with the ribbon every mass does (decision 26), the
    // others fainter the more there are, so that the ribbon stays light.
    const firstDrawing = drawn?.parts === "masses" ? 0 : n - 1;
    const chainColor = hooks.tinted(hooks.colors.chain, "chain");
    let flashed = false;
    const ribbonLight = 0.55 * Math.min(1, 2.2 / Math.sqrt(n));
    const { positions, pivots, velocities, startVelocities } = moved;
    for (let piece = 0; piece < moved.pieces; piece++) {
      const at = 2 * n * piece;
      const ran = moved.times[piece] ?? 0;
      const seconds = curves?.clock.seconds ?? 0;
      const fade = curves?.clock.fade ?? 0;
      if (curves !== null) curves.clock.advance(ran);
      for (let i = 0; i < n; i++) {
        const bx = positions[at + 2 * i] ?? 0;
        const by = positions[at + 2 * i + 1] ?? 0;
        if (drawn !== undefined && i >= firstDrawing) {
          const light = i === n - 1 ? 0.55 : ribbonLight;
          const ax = ends[2 * i] ?? bx;
          const ay = ends[2 * i + 1] ?? by;
          // with the tension's colours, in the colour of the rod it hangs from
          const color = tensionShown
            ? (rodColors[i] ?? hooks.colors.chain)
            : chainColor;
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
        ends[2 * i] = bx;
        ends[2 * i + 1] = by;
      }
      // at even times of the motion, unless the music flashes the strobe
      if (stamped && !flashes) {
        strobeClock += ran;
        if (strobeClock >= 1 / STROBE_RATE) {
          strobeClock %= 1 / STROBE_RATE;
          stamp(
            curves,
            chainColor,
            pivots[2 * piece] ?? 0,
            pivots[2 * piece + 1] ?? 0,
            positions,
            at,
          );
          flashed = true;
        }
      }
    }
    // on a kick, while the music flashes the strobe, the chain as the frame
    // ends, from where the pivot is then
    if (stamped && flashes && hooks.look.flash > 0) {
      const { pivot } = motion;
      stamp(
        curves,
        chainColor,
        pivot.x,
        pivot.y,
        positions,
        2 * n * (moved.pieces - 1),
      );
      flashed = true;
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
        },
      );
      if (mark) {
        trails.addMark((into) => {
          lines.draw(trail, into, {
            radius: 0.9 * ratio,
            roundEnds: false,
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
    },
    clearPieces() {
      trail.clear();
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
      tensionColor = tensionScale(hooks.colors.chain, tensionScaleAt(scale));
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
    point(px, py, color, light) {
      trail.push(px, py, px, py, color, light);
    },
    draw,
  };
}
