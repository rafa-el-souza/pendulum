// The first piece's twins (docs/decisions.md, decision 92): copies of the
// chain born a hair apart, which fan out to show chaos (decision 20), dealt
// out to workers on the device's cores (decision 51). They are born when the
// chain is let go, born again as they fade (decision 43) and on the music's
// beats (decision 46), held near the chain or leashed to it (decision 64),
// and painted by their place in the fan (decision 23). In one place, what is
// sent to the workers each frame and what comes back from them: the time to
// advance, in pieces for the trails, and the twins' tips along it, drawn into
// the trails (decisions 21 and 68); and the strobe's flashes in it, which
// stamp each twin where it is at their instants (decisions 50 and 100).

import type { Rgb } from "../core/color.ts";
import type { Controls } from "../core/controls.ts";
import { paletteAt } from "../core/palettes.ts";
import type { Parameter } from "../core/parameters.ts";
import type { Look } from "../core/routes.ts";
import {
  shareOf,
  type TwinFlash,
  type TwinHold,
  type TwinReport,
} from "../core/twin-share.ts";
import {
  TwinWorkers,
  inWorker,
  sharesFor,
  workerBudget,
  type FrameRhythm,
} from "../core/twin-workers.ts";
import { pivotsOver } from "../core/twin-curves.ts";
import {
  Doubling,
  Fading,
  bornApart,
  bornPerFrame,
  bornWidth,
  fanPlace,
  fromPivot,
  widened,
} from "../core/twins.ts";
import type { Drive } from "../physics/drive.ts";
import { TRAIL_MOST, layerOf, type Drawing } from "./drawing.ts";
import type { Motion } from "./motion.ts";
import {
  FADE,
  FADE_REACH,
  HELD_STEP,
  HOLD,
  LEASHED_STEP,
  LEASH_RATE,
  LOOK,
  MEASURED_WIDEST,
  NEAR_SPREAD,
  PALETTE,
  SPREAD,
  TRAIL,
  TWIN_COUNT,
  doublingSaid,
  doublingShown,
} from "./parameters.ts";

// The twins (decision 20): how many are wanted, and how far apart they are
// born, are controls (decisions 22 and 25); those their budget cannot carry
// are dropped, and time never slows for them. In the workers that carry them
// (decision 51), each may take the frame's free time, until TWIN_MARGIN_MS
// before the screen's next frame, none while the frames come late, at least
// TWIN_LEAST_MS and at most TWIN_MOST_MS; while the frames come late, the
// workers together keep at least TWIN_LOCAL_MS, the main line's, so that a
// device with few cores carries no fewer twins than before them (decision
// 52). On the main line, where no worker can run, TWIN_LOCAL_MS.
const TWIN_MOST_MS = 10;
const TWIN_LEAST_MS = 1;
const TWIN_MARGIN_MS = 2;
const TWIN_LOCAL_MS = 4;
// The twins' trails (decision 21) are drawn in this many pieces to the
// simulated second, so that a fast tip draws a curve; a tip that moves
// farther than TRAIL_JUMP metres in one piece has jumped (core/curves.ts).
const TWIN_TRAIL_RATE = 240;

/**
 * The pieces a frame of `simulated` seconds is sent to the twins in, each
 * ending in a point of their trails (decision 21): none for a frame of events
 * alone, and one piece when the trails are off (`trail` 0), as there are no
 * trails to draw.
 */
export function twinPieces(simulated: number, trail: number): number {
  if (simulated <= 0) return 0;
  if (trail === 0) return 1;
  return Math.min(8, Math.max(1, Math.ceil(simulated * TWIN_TRAIL_RATE)));
}

/** How bright each of `count` twins' trails is drawn: faint, so that where many run together they read as one. */
export function twinTrailLight(count: number): number {
  return Math.min(0.35, Math.max(0.03, 1.2 / Math.sqrt(Math.max(1, count))));
}

/** What the twins read of the piece. */
export interface TwinsHooks {
  /** A control's value, as the settings have it. */
  value(parameter: Parameter): number;
  /** Whether the twins and the trails are lit (decision 27). */
  readonly lit: boolean;
  /** What the music adds to the light this frame (decision 46). */
  readonly look: Look;
  /** `color` with as much of the bass's note as the music's mode gives to `to`. */
  tinted(color: Rgb, to: "chain" | "twins"): Rgb;
  /** The bass's note and how much of it the music's mode gives to `to` now; none while it gives none. */
  tint(
    to: "chain" | "twins",
  ): { readonly color: Rgb; readonly amount: number } | null;
  /** The colours of the ground asked for (decision 41). */
  readonly colors: { readonly chain: Rgb };
  /** What the frame shows, and the trails the twins' tips draw into (decision 90). */
  readonly drawing: Drawing;
  /** The row's controls, which show how many twins there are, and the lens's number. */
  readonly controls: Controls;
  /** Whether the frames come steady, the view unchanged for two of them (decision 67). */
  steady(): boolean;
}

/** The piece's twins. */
export interface Twins {
  /** The workers that move them (decision 51). */
  readonly workers: TwinWorkers;
  /** Each twin's light while they fade (decision 43). */
  readonly fading: Fading;
  /** How many twins move now. */
  readonly count: number;
  /** Whether what happened to them waits to be sent. */
  readonly pending: boolean;
  /** The time each worker may take in a frame now, in ms (decision 52). */
  readonly budget: number;
  /** Twin `j`'s colour, by its place in the fan, from the palette asked for (decision 23). */
  color(j: number): Rgb | undefined;
  /** Each twin painted anew from the palette asked for. */
  paint(): void;
  /** New twins are asked for, to be born once the frame is drawn (decision 51). */
  spawn(): void;
  /** Every twin put out. */
  clear(): void;
  /** Time the other way for the twins too (decision 28): what the lens measured no longer holds. */
  reverse(): void;
  /** The lens measures afresh (decision 64). */
  measureAfresh(): void;
  /** The chain went from `before` masses to `n`: the twins move to `n` too, as many as the budget carries. */
  setMasses(before: number, n: number): void;
  /** Once the frame is drawn, `simulated` seconds after the last: the twins asked for are born, and while they fade and the music beats, born again (decisions 43 and 46). */
  born(simulated: number): void;
  /** The twins' controls: how many move, and the lens's number. */
  show(): void;
  /** Sends the workers the frame just computed, `simulated` seconds from where the shake stood at `phase`, at the time `now`, with the strobe's `flashes` in it; none sends what happened alone. */
  send(
    simulated: number,
    phase: number,
    now: number,
    flashes?: readonly TwinFlash[],
  ): void;
  /** Takes what the workers sent back since the last frame into the trails. */
  take(): void;
}

/**
 * The twins of the chain of `motion`, their workers' time budgeted against
 * the screen's `rhythm` (decision 52), as `hooks` say.
 */
export function mountTwins(
  motion: Motion,
  rhythm: FrameRhythm,
  hooks: TwinsHooks,
): Twins {
  const value = (parameter: Parameter): number => hooks.value(parameter);
  // The twins, dealt out to workers on all the device's cores but one
  // (decision 51), with a first guess of a twin's cost that the measured
  // cost replaces in a few frames; and whether new twins are asked for, to
  // be born once the frame is drawn. Should the workers fail, the twins go
  // back to the main line, lost, and are born again.
  let spawnPending = false;
  const twins = new TwinWorkers({
    shares: sharesFor(navigator.hardwareConcurrency),
    n: motion.chain.n,
    budget: TWIN_MOST_MS,
    cost: 0.002 * (motion.chain.n / 2) ** 1.5,
    open: inWorker,
    lost: () => {
      spawnPending = true;
      // the curves the workers last sent back still open stay (decision 97)
      hooks.drawing.curves()?.workersLost(twins.shares);
    },
  });
  // the time each worker may take in a frame, eased over the frames
  let twinBudget = TWIN_MOST_MS;
  // the colour of each twin by its place in the fan
  const mostTwins = Math.max(...TWIN_COUNT.values);
  let fanColors: Rgb[] = [];
  /** Each twin's colour, by its place in the fan, from the palette asked for. */
  function paint(): void {
    const palette = paletteAt(value(PALETTE));
    fanColors = Array.from({ length: mostTwins }, (_, j) =>
      palette.color(fanPlace(j)),
    );
  }
  paint();
  // While the twins fade (decision 43), each one's light, which falls as it
  // parts from the chain; those gone dark are born again on the chain.
  const fading = new Fading(mostTwins);
  // While the twins are held (decision 64), the width of the fan as it was
  // born, which the lens lets it keep if wider than its own, and the time
  // differences take to double, as the lens measures it; shown for twins
  // born near the chain.
  let widthBorn = 0;
  let bornNear = true;
  const doubling = new Doubling();
  // where the chain's masses are, for twins born from it and those that fade
  // (decision 43)
  let x = new Float64Array(motion.chain.n);
  let y = new Float64Array(motion.chain.n);
  // the next twin a beat has born again, in turn round the fan, while the
  // twins stay
  let bornNext = 0;
  // Where the pivot was at each instant of the twins' reports, and how it
  // moved, x then y for each (decision 75): the same for every twin of a
  // frame, worked out once, for the command they were sent with.
  let twinPivots = new Float64Array(2);
  let twinPivotSpeeds = new Float64Array(2);
  let twinPivotsOf: {
    drive: Drive | null;
    pieces: number;
    time: number;
  } | null = null;

  /** The twins' control: the number asked for, or the fewer the budget carries, in the tone of a value held back. */
  function showTwins(): void {
    const { controls } = hooks;
    const asked = value(TWIN_COUNT);
    if (hooks.lit && !motion.held && twins.count < asked) {
      controls.showValue(TWIN_COUNT.id, asked, { reached: twins.count });
    } else {
      controls.showValue(TWIN_COUNT.id, asked);
    }
    // held, the time differences take to double, once the lens has measured
    // it, for twins born near the chain and a lens no wider than its number
    // holds for (decision 64)
    const seconds =
      value(FADE) === HELD_STEP &&
      bornNear &&
      value(HOLD) <= MEASURED_WIDEST &&
      twins.count > 0
        ? doubling.seconds
        : null;
    if (seconds === null) {
      controls.showValue(FADE.id, value(FADE));
    } else {
      controls.showValue(FADE.id, HELD_STEP, {
        text: doublingShown(seconds),
        words: doublingSaid(seconds),
      });
    }
  }

  /**
   * Twins `js` born of the chain as it is now, each at its place in a fan
   * `spread` wide, and each to fade from how far it looks from the chain as
   * it is born (decision 63).
   */
  function bear(js: readonly number[], spread: number): number {
    twins.born(js, motion.state, spread);
    motion.chain.positions(motion.state.theta, x, y);
    const reach = fromPivot(x, y, motion.chain.totalLength);
    for (const j of js) fading.born(j, bornApart(j, spread, reach));
    // what the lens measured was of the twins before
    if (js.length > 0) doubling.clear();
    return reach;
  }

  /** Twins of the chain as it is now, as many as their budget carries, while the light is on. */
  function bearTwins(): void {
    spawnPending = false;
    twins.clear();
    const count = hooks.lit
      ? Math.min(value(TWIN_COUNT), twins.affordable())
      : 0;
    const spread = value(SPREAD);
    const reach = bear(
      Array.from({ length: count }, (_, j) => j),
      spread,
    );
    fading.relight();
    // held, the fan may be as wide as it was born (decision 64), and its
    // number is shown only for twins born near the chain
    widthBorn = bornWidth(count, spread, reach);
    bornNear = spread <= NEAR_SPREAD;
  }

  /**
   * While the twins fade (decision 43), those gone dark are born again on the
   * chain as it is, each at its place in the fan, and where the budget
   * carries more twins than there are, new ones are born too: at most a
   * sixty-fourth of them in a frame, so that they come out of the chain as a
   * plume.
   */
  function bearAgain(): void {
    const carried = Math.min(value(TWIN_COUNT), twins.affordable());
    const most = bornPerFrame(carried);
    const born = fading.gone(Math.min(twins.count, carried), most);
    for (let j = twins.count; born.length < most && j < carried; j++) {
      born.push(j);
      fading.light[j] = 1;
    }
    // the fan opens wider as the music asks (decision 49), to a whole turn
    bear(born, widened(value(SPREAD), hooks.look.spread));
  }

  /**
   * A share of the twins born again from the chain as it is, on a beat of
   * the music (decision 46): while they fade, the dimmest first, a puff out
   * of the chain; while they stay, in turn round the fan, so that every one
   * comes back in its time.
   */
  function bornOnBeat(share: number): void {
    const alive = twins.count;
    const count = Math.min(alive, Math.round(share * alive));
    if (count === 0) return;
    let chosen: number[];
    if (value(FADE) === 1) {
      chosen = Array.from({ length: alive }, (_, j) => j)
        .sort((a, b) => (fading.light[a] ?? 1) - (fading.light[b] ?? 1))
        .slice(0, count);
    } else {
      chosen = Array.from({ length: count }, (_, k) => (bornNext + k) % alive);
      bornNext = (bornNext + count) % alive;
    }
    for (const j of chosen) fading.light[j] = 1;
    // the fan opens wider as the music asks (decision 49), to a whole turn
    bear(chosen, widened(value(SPREAD), hooks.look.spread));
  }

  /**
   * Sends the twins' workers the frame just computed (decision 51): the
   * time it simulated, in pieces for their trails, shaken as the chain was
   * from where the shake stood as it began (decision 36), and under the
   * music's forces as it was (decision 74); where the chain is
   * at its end, for the light of twins that fade (decision 43); and the time
   * each worker may take: the frame's free time until a little before the
   * screen's next frame, none while the frames come late, and then at
   * least a share of the main line's own budget among the workers, eased
   * over the frames so that one slow frame cuts no twins; or the main
   * line's own budget. And the strobe's `flashes` in the frame, while it
   * stamps the twins (decision 100). No time sends what happened to the
   * twins alone.
   */
  function sendTwins(
    simulated: number,
    phase: number,
    now: number,
    flashes: readonly TwinFlash[] = [],
  ): void {
    // in one piece when there are no trails to draw
    const pieces = twinPieces(simulated, value(TRAIL));
    const shakes = motion.twinShakes(phase, simulated, pieces);
    const { chain, state } = motion;
    let at: Float64Array | null = null;
    if (value(FADE) === 1) {
      chain.positions(state.theta, x, y);
      at = new Float64Array(2 * chain.n);
      at.set(x);
      at.set(y, chain.n);
    }
    // held near the chain as it is at the frame's end (decision 64)
    const life = value(FADE);
    let hold: TwinHold | null = null;
    if (life === HELD_STEP || life === LEASHED_STEP) {
      const theta = Float64Array.from(state.theta);
      const omega = Float64Array.from(state.omega);
      hold =
        life === HELD_STEP
          ? {
              kind: "lens",
              width: Math.max(value(HOLD), widthBorn),
              theta,
              omega,
            }
          : {
              kind: "leash",
              slack: value(HOLD),
              rate: LEASH_RATE,
              theta,
              omega,
            };
    }
    const free = workerBudget(
      rhythm.free(performance.now() - now, TWIN_MARGIN_MS),
      twins.shares,
      rhythm.late,
      { least: TWIN_LEAST_MS, most: TWIN_MOST_MS, floor: TWIN_LOCAL_MS },
    );
    // a gesture's frames do not move it (decision 67)
    if (hooks.steady()) twinBudget += 0.1 * (free - twinBudget);
    twins.setBudget(twins.local ? TWIN_LOCAL_MS : twinBudget);
    const { drawing } = hooks;
    const sharp = drawing.curves();
    const clock =
      sharp !== null && value(LOOK) !== 1 ? drawing.stepClock : null;
    const layers = drawing.layers();
    const lineLayer = layerOf(layers, "twins", "lines");
    const lines = clock !== null && lineLayer !== undefined;
    // the strobe's flashes stamp the parts of each twin its layer says, where
    // each is at their instants (decision 100)
    const stamped = layerOf(layers, "twins", "stamps");
    const stamps =
      stamped !== undefined && flashes.length > 0 && simulated > 0
        ? { parts: stamped.parts, flashes }
        : null;
    // Where the trails keep curves and the twins draw lines, each worker
    // joins its own twins' curves (decision 97), and stamps them there
    // (decision 100), in the trails' light times each layer's own (decision
    // 102), the music's, each twin's own while they fade, the palette and the
    // music's tint, as the frame computed now has them.
    const trailLight = twinTrailLight(twins.count);
    const joining =
      lines || (stamps !== null && sharp !== null)
        ? {
            light: trailLight * (lineLayer?.light ?? 1),
            stampLight: trailLight * (stamped?.light ?? 1),
            music: 1 + Math.min(TRAIL_MOST, hooks.look.trail),
            palette: value(PALETTE),
            tint: hooks.tint("twins"),
            lines,
          }
        : null;
    const fades = value(FADE) === 1;
    twins.send(
      {
        time: simulated,
        pieces,
        g: motion.g,
        shakes,
        chain: at,
        hold,
        whole: value(LOOK) !== 1,
        // kept as curves, each tip's velocity with its place, and the step's
        // instant (decision 68)
        clock,
        // the music's forces over the same time (decision 74)
        drive: simulated > 0 ? motion.drive : null,
        budget: twins.local ? TWIN_LOCAL_MS : twinBudget,
        curves: null,
        stamps,
      },
      joining === null
        ? undefined
        : (w) => ({ ...joining, shine: fades ? shineOf(w) : null }),
    );
  }

  /** The own light of each twin of share `w` while they fade (decision 43), by its place in the share. */
  function shineOf(w: number): Float64Array {
    const shares = twins.shares;
    const count = shareOf(twins.count, w, shares);
    const shine = new Float64Array(count);
    for (let k = 0; k < count; k++) {
      shine[k] = fading.light[w + k * shares] ?? 1;
    }
    return shine;
  }

  /** The pivot at each of a report's instants, under the command of the frame computed last, unless already worked out. */
  function twinPivotsFor(report: TwinReport): void {
    const { pieces, time } = report;
    const { drive } = motion;
    const known = twinPivotsOf;
    if (
      known !== null &&
      known.drive === drive &&
      known.pieces === pieces &&
      known.time === time
    ) {
      return;
    }
    if (twinPivots.length !== 2 * (pieces + 1)) {
      twinPivots = new Float64Array(2 * (pieces + 1));
      twinPivotSpeeds = new Float64Array(2 * (pieces + 1));
    }
    pivotsOver(drive, pieces, time, twinPivots, twinPivotSpeeds);
    twinPivotsOf = { drive, pieces, time };
  }

  /** Twin `j`'s colour this frame: its place's in the fan, as the music tints it (decision 46). */
  function colorOf(j: number): Rgb {
    return hooks.tinted(fanColors[j] ?? hooks.colors.chain, "twins");
  }

  /**
   * What the twins' workers sent back since the last frame (decision 51):
   * each twin's tip along the frame draws its trail; where its worker sent
   * back where it was at a strobe's flashes, it is stamped there (decision
   * 100); and a twin that fades takes the light of how far it has gone from
   * the chain (decision 43).
   */
  function takeTwins(): void {
    const { drawing } = hooks;
    // faint, so that where many twins' trails run together they read as one,
    // their lines and their stamps each in its layer's light (decision 102)
    const light = twinTrailLight(twins.count);
    // while they fade, each in its own light, which then falls with how far
    // it has gone from the chain
    const fades = value(FADE) === 1;
    // their tips draw lines where the trails' layers have them do so,
    // however the twins are drawn (decision 96)
    const layers = drawing.layers();
    const lineLayer = layerOf(layers, "twins", "lines");
    const tipLines = lineLayer !== undefined;
    const lineLight = light * (lineLayer?.light ?? 1);
    const stampLight = light * (layerOf(layers, "twins", "stamps")?.light ?? 1);
    const music = 1 + Math.min(TRAIL_MOST, hooks.look.trail);
    // held, how much each share's fan stretched, averaged over the shares
    // (decision 64)
    let stretch = 0;
    let stretchTime = 0;
    let measured = 0;
    // where the trails keep curves, which the twins' workers join (decision 97)
    const sharp = drawing.curves();
    twins.take(
      (j, report, k) => {
        if (k === 0 && report.stretchTime > 0) {
          stretch += report.stretch;
          stretchTime += report.stretchTime;
          measured++;
        }
        const color = colorOf(j);
        const shine = fades ? (fading.light[j] ?? 1) : 1;
        const { pieces, tips } = report;
        const at = 2 * (pieces + 1) * k;
        // as pieces of the layers, where the trails keep no curves or its
        // worker joined none (decision 97), where the pivot was at each of the
        // report's instants (decision 75)
        if (
          tipLines &&
          pieces > 0 &&
          (sharp === null || report.curves === null)
        ) {
          twinPivotsFor(report);
          for (let piece = 0; piece < pieces; piece++) {
            const from = at + 2 * piece;
            const p = 2 * piece;
            drawing.piece(
              (tips[from] ?? 0) + (twinPivots[p] ?? 0),
              (tips[from + 1] ?? 0) + (twinPivots[p + 1] ?? 0),
              (tips[from + 2] ?? 0) + (twinPivots[p + 2] ?? 0),
              (tips[from + 3] ?? 0) + (twinPivots[p + 3] ?? 0),
              color,
              lineLight * shine,
            );
          }
        }
        // stamped by the frame's flashes where its worker joined no curves,
        // from where its masses were at each (decision 100)
        const { stamps, stampPlaces } = report;
        if (stamps !== null && stampPlaces.length > 0) {
          const { parts, flashes } = stamps;
          const { n } = report;
          flashes.forEach((flash, f) => {
            drawing.stampTwin(
              parts,
              n,
              stampPlaces,
              2 * n * (k * flashes.length + f),
              flash.x,
              flash.y,
              color,
              stampLight * shine * music,
            );
          });
        }
        if (fades && k < report.apart.length) {
          fading.see(j, report.apart[k] ?? 0, FADE_REACH);
        }
      },
      hooks.steady(),
      // every report's curves, joined by its worker, into the trails after
      // the chain's (decision 97)
      (share, report) => {
        if (sharp !== null && report.curves !== null) {
          sharp.twins.take(share, report.seq, report.curves, sharp);
        }
      },
    );
    if (measured > 0 && value(FADE) === HELD_STEP) {
      doubling.add(stretch / measured, stretchTime / measured);
    }
  }

  return {
    workers: twins,
    fading,
    get count() {
      return twins.count;
    },
    get pending() {
      return twins.pending;
    },
    get budget() {
      return twins.local ? TWIN_LOCAL_MS : twinBudget;
    },
    color: (j) => fanColors[j],
    paint,
    spawn() {
      spawnPending = true;
    },
    clear() {
      twins.clear();
    },
    reverse() {
      twins.reverse();
      // differences shrink as time runs back, until chaos takes over again
      doubling.clear();
    },
    measureAfresh() {
      doubling.clear();
    },
    setMasses(before, n) {
      x = new Float64Array(n);
      y = new Float64Array(n);
      // The twins move to the new number too, in their workers, as many as
      // it carries; back at a number that carries many more than are left,
      // they are born again.
      twins.rescale(before, n);
      twins.keep(twins.affordable());
      twins.resample(n);
      doubling.clear();
      const carried = Math.min(value(TWIN_COUNT), twins.affordable());
      if (!motion.held && twins.count < 0.5 * carried) spawnPending = true;
    },
    born(simulated) {
      // Twins are born once the frame is drawn, of the chain as it is then:
      // those asked for, those gone dark, and the music's (decisions 43, 46).
      if (spawnPending) {
        if (!motion.held) bearTwins();
      } else if (simulated > 0 && hooks.lit && !motion.held) {
        if (value(FADE) === 1) bearAgain();
        if (hooks.look.births > 0) bornOnBeat(hooks.look.births);
      }
    },
    show: showTwins,
    send: sendTwins,
    take: takeTwins,
  };
}
