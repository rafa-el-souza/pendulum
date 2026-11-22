import "../styles/base.css";

import type { Signals } from "../audio/signals.ts";
import { cssColor, type Rgb } from "../core/color.ts";
import { groundAt, mixColors } from "../core/grounds.ts";
import { Meter } from "../core/meter.ts";
import { Router, UNLIT, type Look } from "../core/routes.ts";
import { fanPalette, noteColor } from "../core/palettes.ts";
import type { Parameter } from "../core/parameters.ts";
import { readMeter, type SharpTrails } from "../core/sharp.ts";
import { mountStage, type Stage } from "../core/stage.ts";
import type { TwinHold, TwinReport } from "../core/twin-share.ts";
import {
  FrameRhythm,
  TwinWorkers,
  inWorker,
  sharesFor,
  workerBudget,
} from "../core/twin-workers.ts";
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
import { Touches, readWait, type Spot } from "../core/touches.ts";
import {
  WHOLE_VIEW,
  bufferView,
  fitScale,
  panBy,
  pinched,
  readCamera,
  toWorld,
  zoomAbout,
  zoomWritten,
  type Camera,
  type PinchStart,
  type View,
} from "../core/view.ts";
import { countVisit } from "../core/visits.ts";
import type { Drive, PivotMotion } from "../physics/drive.ts";
import { startInMode } from "../physics/modes.ts";
import { openingOf, type Saved } from "./address.ts";
import { TRAIL_JUMP, TRAIL_MOST, layerOf, mountDrawing } from "./drawing.ts";
import {
  AMPLITUDE,
  FADE,
  FADE_REACH,
  GRAVITY,
  GROUND,
  HAND,
  HELD_STEP,
  HOLD,
  LEASHED_STEP,
  LEASH_RATE,
  LOOK,
  MASSES,
  MEASURED_WIDEST,
  MODE,
  NEAR_SPREAD,
  PALETTE,
  SCALE,
  SHAKE,
  SPREAD,
  TENSION,
  TILT,
  TIME,
  TRAIL,
  TWIN_COUNT,
  ZOOM,
  doublingSaid,
  doublingShown,
  gravityOf,
  MARK_STEP,
  radians,
} from "./parameters.ts";
import { Motion } from "./motion.ts";
import { modeOf } from "./music.ts";
import { mountRow } from "./row.ts";
import {
  Settings,
  choosesStart,
  type Act,
  type PieceEvent,
} from "./settings.ts";

// The first piece (docs/decisions.md, decision 4): one chain pendulum to grab
// and throw, whose number of masses changes while it moves, under a time that
// runs as fast as the visitor asks and the machine allows (decision 15) and a
// gravity from none to Jupiter's, pointing any way (decision 29), held by a
// hand from elastic to firm (decision 18), with twins born a hair apart
// that fan out to show chaos (decision 20) in a palette of the visitor's
// choice (decision 23), and trails of light behind the tips of the chain and
// of its twins (decision 21), or of every mass of the chain (decision 26),
// which can leave a mark that stays (decision 42).
// One switch puts out the twins and the trails and lights them again
// (decision 27), and time can run backwards (decision 28). A key passes the
// whole frame through the sketch's light, to compare (decision 24). The
// controls wait behind one small button (decision 31). The chain starts, and
// starts again, raised to one side or at rest in one of the paper's normal
// modes (decision 33), or from a moment saved in the address (decision 34).
// A switch paints each rod by its tension (decision 35). The pivot can be
// shaken along gravity's line, fast enough that the chain stands on its head
// (decision 36). The address carries the switches too, and a saved moment the
// whole screen, which the page's title names (decision 38); it can be shared,
// and shown as a QR code (decision 40). The ground is one of several dark
// ones, each with its chain's colours, and the tension's colours one of
// several scales (decision 41). The twins fade as chaos carries them off
// from the chain and are born again on it, a plume, as the piece opens, or
// they can stay (decisions 43 and 58).
// The piece can listen to music, from the microphone, a file, a tab's sound
// or a beat of its own, and a card shows what it hears (decisions 44 and
// 45); the music lights the chain, its trails and its twins (decision 46).
// The view comes up to sixty-four times nearer, by the wheel, a trackpad's
// pinch, Z and X, or two fingers, and moves with the middle button, Space and
// a drag, or two fingers; a finger waits a moment before it grabs, and the
// address carries the view (decision 67). The screen's group shows the zoom,
// with its − and + as X and Z, and a button for the whole view, which Shift
// and X bring back too (decision 73).

// A frame longer than this (a hidden tab, a stall) moves the chain by this
// much only, so that it never jumps.
const LONGEST_FRAME = 1 / 30;
// How much nearer Z brings the camera, and X farther, about the middle of the
// canvas (decision 67).
const ZOOM_STEP = 1.25;
// A pointer that has sent no move for this long has stopped moving.
const STILL_AFTER_MS = 60;
// The physics of one frame may take this long; past it, time runs slower
// than asked, and the time control shows how much (decision 15).
const PHYSICS_BUDGET_MS = 6;
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
// The trails (decision 21): a frame's motion is drawn in the pieces the
// motion goes in (motion.ts), and the twins' in this many to the simulated
// second, so that a fast tip draws a curve. A tip that moves farther than
// TRAIL_JUMP metres in one piece has jumped (raised again, or given other
// masses), and leaves no trail across the jump (drawing.ts). How long they
// last is a control (decision 22).
const TWIN_TRAIL_RATE = 240;
// The shaken pivot (decision 36): the chain starts standing this far off
// upright, in rad.
const STANDING_LEAN = 0.1;
// A note's colour comes in over NOTE_EASE, in s, or NOTE_EASE_SLOW with
// reduced motion asked for (decision 48).
const NOTE_EASE = 0.08;
const NOTE_EASE_SLOW = 1;

const canvas = document.getElementById("stage");
const notice = document.getElementById("notice");
if (!(canvas instanceof HTMLCanvasElement) || notice === null) {
  throw new Error("the page lacks its #stage canvas or its #notice");
}

// The visit is counted, or not (decision 84), and the address's switch for
// counting leaves the address before the piece reads it.
countVisit();

// The light's colors come from the stylesheet, which the browser may still be
// applying when this module runs (WebKit did so in CI, and a token read as
// empty). So the piece starts once the page has loaded.
function begin(): void {
  if (!(canvas instanceof HTMLCanvasElement) || notice === null) return;
  const stage = mountStage(canvas, notice);
  if (stage !== null) play(stage);
}
if (document.readyState === "complete") begin();
else addEventListener("load", begin, { once: true });

function play({ canvas, gl }: Stage): void {
  // what the address opens: the controls, the switches, and a moment saved
  // in it, if any (decision 38)
  const opened = openingOf(location.search, location.hash);
  // what the row and the keys change, which the address carries (decision
  // 88)
  const settings = new Settings(opened, location.search);
  const { values } = settings;
  const value = (p: Parameter): number => values.get(p.id) ?? p.initial;

  // With reduced motion asked for, the music's pulses become slow waves
  // (decision 46), and its forces kick nothing (decision 75).
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  // The chain's motion (decision 80): where it is and how it moves, under the
  // gravity its controls ask for, with the visitor's hand, the shaken pivot
  // and the music's forces, frame by frame; the chain and its twins are
  // under the same gravity.
  const motion = new Motion(value(MASSES), {
    g: gravityOf(value(GRAVITY), value(TILT)),
    shake: { hertz: value(SHAKE), degrees: value(TILT) },
    slow: still.matches,
  });
  // the ground asked for, and the colours that stand out from it (decision 41)
  const opening = groundAt(value(GROUND));
  const colors: { ground: Rgb; chain: Rgb; hand: Rgb; pivot: Rgb } = {
    ground: opening.ground,
    chain: opening.chain,
    hand: opening.hand,
    pivot: opening.pivot,
  };
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
    },
  });
  // the time each worker may take in a frame, eased over the frames
  let twinBudget = TWIN_MOST_MS;
  // the colour of each twin by its place in the fan
  const mostTwins = Math.max(...TWIN_COUNT.values);
  let fanColors: Rgb[] = [];
  /** Each twin's colour, by its place in the fan, from the palette asked for. */
  function paint(): void {
    const palette = fanPalette(value(PALETTE));
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
  // where the chain's masses are, for the twins that fade (decision 43)
  let x = new Float64Array(motion.chain.n);
  let y = new Float64Array(motion.chain.n);
  let wholeFrame = opened.switches.get("sketch") ?? false;
  // The twins and the trails, lit or put out by one switch; their controls
  // keep their values, and stepping one of them lights them again.
  let lit = opened.switches.get("light") ?? true;
  // What the frame shows and the trails its motion leaves (decision 90): the
  // chain, its twins, the hand and the pivot, the trails in layers, kept as
  // curves unless the address asks for layers (decision 71), and the tension's
  // colours, off until they are switched on (decision 35); and a meter that
  // says what the trails cost on the device.
  const drawing = mountDrawing(
    gl,
    canvas,
    motion,
    twins,
    fading,
    {
      value,
      get lit() {
        return lit;
      },
      get wholeFrame() {
        return wholeFrame;
      },
      get look() {
        return look;
      },
      tinted,
      colors,
      fanColor: (j) => fanColors[j],
      get handShown() {
        return settings.choreography.shown;
      },
    },
    location.search,
    opened.switches.get("tension") ?? false,
  );
  const fpsMeter = readMeter(location.search) ? new Meter(document.body) : null;
  if (drawing.sharp !== null) drawing.sharp.measuring = fpsMeter !== null;

  // whether the chain still swings in the mode it started in, the hand not
  // having held it since: it then starts again in that mode on another
  // number of masses (decision 33)
  let inMode = false;
  let paused = false;
  // whether time runs backwards: every motion reversed since it last ran
  // forwards (decision 28)
  let backwards = false;
  // the speed time actually ran at lately, as a share of the speed asked for
  let reached = 1;
  // The frame computed a frame ahead while there are twins (decision 51):
  // the time it simulated, and whether a strobe flashed in it. It is shown at
  // the next frame, with the twins its workers bring back meanwhile; the
  // motion keeps the chain as the screen shows it until then, for a moment
  // saved.
  let ahead: { simulated: number; flashed: boolean } | null = null;
  // the screen's rhythm, and how late the frames come against it, for the
  // time the twins' workers may take (decision 51)
  const rhythm = new FrameRhythm();
  const pointer = { id: -1, x: 0, y: 0, vx: 0, vy: 0, at: 0 };
  // How the piece is looked at (decision 67): the camera the address asks
  // for, the whole view otherwise; the fingers on the stage, which wait
  // before they grab so that two can pinch; a drag that moves the view; and
  // how many frames have gone by since the view last changed, while which
  // the twins' budget learns nothing.
  let camera: Camera = readCamera(location.search, motion.chain.totalLength);
  const touches = new Touches(readWait(location.search));
  let pinch: PinchStart | null = null;
  let panning: { id: number; x: number; y: number } | null = null;
  let spaceHeld = false;
  let spaceUsed = false;
  let safariPinch: { zoom: number } | null = null;
  let viewStill = Number.POSITIVE_INFINITY;
  let addressTimer = 0;
  // What the music does (decision 46): its mode and strength, from the
  // address, the routes that follow it, and what they add to the light this
  // frame. How the music's hand dances (decision 83) is the settings' too.
  const { tune } = settings;
  let router = new Router(modeOf(tune.mode), { slow: still.matches });
  let look: Look = UNLIT;
  // What the music says this frame, which its forces take (decisions 75 and
  // 77, in the motion); and whether they act, which turns time backwards off.
  let heardNow: Signals | null = null;
  let forcing = false;
  // the colour of the note the bass holds, as it eases from the note before
  let noteShown: Rgb | null = null;

  /** `color` with as much of the bass's note as the music's mode gives to `to`. */
  function tinted(color: Rgb, to: "chain" | "twins"): Rgb {
    if (router.mode.tint?.to !== to || noteShown === null || look.tint <= 0) {
      return color;
    }
    return mixColors(color, noteShown, look.tint);
  }
  // the next twin a beat has born again, in turn round the fan, while the
  // twins stay
  let bornNext = 0;

  /** The twins' control: the number asked for, or the fewer the budget carries, in the tone of a value held back. */
  function showTwins(): void {
    const asked = value(TWIN_COUNT);
    if (lit && !motion.held && twins.count < asked) {
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
   * New twins are asked for: they are born once the frame has been drawn,
   * of the chain as it is then, so that the chain and its twins are always
   * drawn at one instant (decision 51).
   */
  function spawnTwins(): void {
    spawnPending = true;
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
    const count = lit ? Math.min(value(TWIN_COUNT), twins.affordable()) : 0;
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
    bear(born, widened(value(SPREAD), look.spread));
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
    bear(chosen, widened(value(SPREAD), look.spread));
  }

  /**
   * The chain starts again where its controls say: from the moment saved in
   * the address, as it was, with its time running the way it ran and the
   * shake where it was in its cycle (decisions 34 and 38); or let go from rest about gravity
   * as it points now (decision 33), raised to one side, a chaotic start with
   * two masses or more, or in a normal mode of the paper, its largest angle
   * the amplitude asked for, in the highest mode the chain has if it has
   * fewer masses than the mode asked for; or, raised while the pivot shakes,
   * standing straight on its head, leaning a little (decision 36).
   */
  function start(): void {
    const down = radians(value(TILT));
    const n = motion.chain.n;
    const mode = Math.min(value(MODE), n);
    // the hands let go, the music's to take hold again from where its path
    // is (decision 75), and the tension is measured afresh
    const { saved } = settings;
    if (saved !== null) {
      motion.apply({
        kind: "start",
        theta: Float64Array.from(saved.state.theta),
        omega: Float64Array.from(saved.state.omega),
        phase: saved.phase,
      });
    } else if (mode > 0) {
      const { theta, omega } = startInMode(
        n,
        mode,
        radians(value(AMPLITUDE)),
        down,
      );
      motion.apply({ kind: "start", theta, omega, phase: null });
    } else {
      const theta = new Float64Array(n);
      if (value(SHAKE) > 0) {
        theta.fill(down + Math.PI - STANDING_LEAN);
      } else {
        for (let i = 0; i < n; i++) {
          theta[i] = down + 2.2 + (0.7 * i) / Math.max(1, n - 1);
        }
      }
      motion.apply({
        kind: "start",
        theta,
        omega: new Float64Array(n),
        phase: null,
      });
    }
    inMode = saved === null && mode > 0;
    setBackwards(saved?.backwards ?? false);
    drawing.clearTrails();
    // the frame computed ahead, and the twins, belong to the motion before
    ahead = null;
    twins.clear();
    // the chain's trails go on from where its masses are now; each twin's
    // from where its worker says it is (decision 51)
    drawing.resetEnds();
    spawnTwins();
    row.showStart();
  }

  /** The same motion on another number of masses, the hand keeping hold of the same place along the chain, and the music's taking hold of the new tip (decision 75). */
  function setMasses(n: number): void {
    const before = motion.chain.n;
    if (n === before) return;
    motion.apply({ kind: "masses", n });
    x = new Float64Array(n);
    y = new Float64Array(n);
    drawing.setMasses(n);
    // The twins move to the new number too, in their workers, as many as it
    // carries; back at a number that carries many more than are left, they
    // are born again.
    twins.rescale(before, n);
    twins.keep(twins.affordable());
    twins.resample(n);
    doubling.clear();
    const carried = Math.min(value(TWIN_COUNT), twins.affordable());
    if (!motion.held && twins.count < 0.5 * carried) spawnTwins();
    drawing.resetEnds();
    // a chain still swinging in the mode it started in starts again in that
    // mode of the new chain (decision 33)
    if (inMode) start();
  }

  /** The sketch's light on the whole frame, or on the trails alone; the page says which. */
  function setWholeFrame(on: boolean): void {
    wholeFrame = on;
    document.documentElement.dataset.light = on ? "frame" : "trails";
  }
  setWholeFrame(wholeFrame);

  /** The twins and the trails lit, or put out; the switch says which. */
  function setLit(on: boolean): void {
    lit = on;
    if (on) {
      if (!motion.held) spawnTwins();
    } else {
      twins.clear();
      drawing.clearTrails();
    }
    showTwins();
  }

  /** Each rod painted by its tension, or the chain in its own colour; the switch says which. */
  function setTensionShown(on: boolean): void {
    // switched on, the colours come up from the chain's own over a few
    // frames, and the tension is measured afresh
    drawing.showTension(on);
    if (on) motion.apply({ kind: "measure afresh" });
  }

  /** The time button says which way a press would take time. */
  function setBackwards(on: boolean): void {
    backwards = on;
    controls.showAction(
      "reverse",
      on ? "reversed" : "reverse",
      on ? "Run time forwards" : "Run time backwards",
    );
  }

  /**
   * Time the other way: the chain and its twins keep their places and move
   * the opposite way, and so retrace their motion (decision 28). Not while
   * the hand holds the chain, whose damper would give energy backwards, nor
   * while the music acts on it as a force, whose drag and hand would
   * (decision 75).
   */
  function reverseTime(): void {
    if (motion.held || forcing) return;
    // the shake runs back too: its pivot keeps its place and moves the other
    // way, which is its phase turned over; and so does the chain the screen
    // shows while the next frame is computed ahead (decision 51)
    motion.apply({ kind: "reverse" });
    twins.reverse();
    // differences shrink as time runs back, until chaos takes over again
    doubling.clear();
    setBackwards(!backwards);
  }

  function setPaused(value: boolean): void {
    paused = value;
    controls.showAction(
      "pause",
      paused ? "play" : "pause",
      paused ? "Resume" : "Pause",
    );
  }

  /**
   * What an event of the row or the keys does to the chain, its twins, its
   * trails and its colours (decision 88), once the settings have taken it;
   * the row shows it, and the address and the title follow.
   */
  function answer(event: PieceEvent): void {
    if (event.kind === "value") {
      changed(event.parameter, event.value, event.was);
    } else if (event.kind === "switch") {
      if (event.id === "light") setLit(event.on);
      else if (event.id === "tension") setTensionShown(event.on);
      else setWholeFrame(event.on);
    } else if (event.kind === "music") {
      // the routes follow the music's mode and strength (decisions 46 and 76)
      router = new Router(modeOf(event.mode), { slow: still.matches });
    } else if (event.kind === "act") {
      acted(event.id);
    }
  }

  /** A control gone from `before` to `next`. */
  function changed(parameter: Parameter, next: number, before: number): void {
    // the tension's colours, one control in the row: off, or a scale, which
    // paints the tension in it (decision 53)
    if (parameter === TENSION) {
      if (next !== TENSION.initial) drawing.paintTension(next);
      setTensionShown(next !== TENSION.initial);
      return;
    }
    const chooses = choosesStart(parameter, values);
    if (parameter === MASSES) setMasses(next);
    // the chain and its twins fall another way, or harder, from where they
    // are; the pivot shakes along gravity's line
    if (parameter === GRAVITY || parameter === TILT) {
      motion.apply({
        kind: "gravity",
        g: gravityOf(value(GRAVITY), value(TILT)),
      });
    }
    if (parameter === SHAKE || parameter === TILT) {
      motion.apply({
        kind: "shake",
        hertz: value(SHAKE),
        degrees: value(TILT),
      });
    }
    // a new grip takes hold at once, where the hand is
    if (parameter === HAND && motion.held) {
      motion.apply({ kind: "grip", grip: next });
    }
    // another number of twins, another spread, or twins that fade or stay,
    // are born at once from the chain as it is, unless the hand holds it;
    // trails turned off go dark, to start afresh
    const twinsAgain =
      parameter === TWIN_COUNT || parameter === SPREAD || parameter === FADE;
    if (twinsAgain && !motion.held) spawnTwins();
    // another lens measures afresh (decision 64)
    if (parameter === HOLD) doubling.clear();
    if (parameter === TRAIL && next === 0) drawing.clearTrails();
    // leaving the step that leaves a mark puts the mark out (decision 42)
    if (parameter === TRAIL && before === MARK_STEP) drawing.clearMark();
    // another mode, or another amplitude of one, starts the chain again in it
    if (chooses) start();
    // a pivot that starts to shake stands the chain on its head at once; a
    // shake that changes or stops leaves the chain where it is, and a chain
    // standing falls when it stops
    if (parameter === SHAKE) {
      motion.apply({ kind: "measure afresh" });
      if (before === 0 && next > 0) start();
    }
    // another palette colours the twins at once; the trails they left keep
    // their colours and fade
    if (parameter === PALETTE) paint();
    // another ground dresses the piece at once; another scale paints the
    // tension in it (decision 41), and its switch turns its colours on
    if (parameter === GROUND) dress();
    if (parameter === SCALE) drawing.paintTension(next);
  }

  /** An action of the row or a key; saving, sharing and the QR code are the row's. */
  function acted(id: Act): void {
    if (id === "pause") setPaused(!paused);
    else if (id === "reverse") reverseTime();
    else if (id === "start") start();
    // the zoom's − and +, as Z and X, about the middle (decision 73)
    else if (id === "nearer") zoomMiddle(ZOOM_STEP);
    else if (id === "farther") zoomMiddle(1 / ZOOM_STEP);
    else if (id === "whole") wholeView();
  }

  /** The moment as the screen shows it, to be saved: the chain the screen shows, while the next frame is computed ahead (decision 51), from a snapshot of the motion. */
  function moment(): Omit<Saved, "savedAt"> {
    const shot = motion.snapshot();
    const { shown } = shot;
    const screen = ahead !== null && shown.theta.length === shot.n;
    return {
      state: screen ? shown : shot,
      paused,
      backwards,
      phase: screen ? shown.phase : shot.phase,
    };
  }

  // The row of controls, its keys and the address (decision 88).
  const row = mountRow(settings, {
    answer,
    get masses() {
      return motion.chain.n;
    },
    get floating() {
      return drawing.floating;
    },
    get camera() {
      return camera;
    },
    moment,
  });
  const { controls, music } = row;

  /**
   * Dresses the piece in the ground asked for (decision 41): the canvas, the
   * page and the row in its colours, the chain, the hand and the pivot in
   * theirs, and the tension's scale around the chain's colour. The trails
   * already drawn keep their colours and fade.
   */
  function dress(): void {
    const ground = groundAt(value(GROUND));
    colors.ground = ground.ground;
    colors.chain = ground.chain;
    colors.hand = ground.hand;
    colors.pivot = ground.pivot;
    const tokens: [string, Rgb][] = [
      ["--color-ground", ground.ground],
      ["--color-ink", ground.ink],
      ["--color-ink-muted", ground.inkMuted],
      ["--color-link", ground.ink],
      ["--color-chain", ground.chain],
      ["--color-hand", ground.hand],
      ["--color-pivot", ground.pivot],
    ];
    for (const [name, color] of tokens) {
      document.documentElement.style.setProperty(name, cssColor(color));
    }
    drawing.paintTension(value(SCALE));
  }
  dress();
  showZoom();
  // the switches as the address asks for them
  setLit(lit);
  setTensionShown(drawing.tensionShown);

  /**
   * The view the frame is drawn in: the drawing buffer's alone (decision
   * 66), as the camera sees it (decision 67).
   */
  function seen(): View {
    return bufferView(
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      motion.chain.totalLength,
      camera,
    );
  }

  /**
   * The camera's own view, its point exactly at the centre, which the
   * gestures work in, so that a point held under the mouse or the fingers
   * does not drift by the whole pixels the drawn view is moved to.
   */
  function cameraView(): View {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    return {
      width,
      height,
      scale: fitScale(width, height, motion.chain.totalLength) * camera.zoom,
      cx: camera.cx,
      cy: camera.cy,
    };
  }

  /** The drawing buffer's pixel under a point of the page, as the canvas shows it. */
  function bufferPoint(clientX: number, clientY: number): [number, number] {
    const box = canvas.getBoundingClientRect();
    return [
      box.width > 0
        ? ((clientX - box.left) * gl.drawingBufferWidth) / box.width
        : 0,
      box.height > 0
        ? ((clientY - box.top) * gl.drawingBufferHeight) / box.height
        : 0,
    ];
  }

  /** The point of the world under a point of the page, in the view the frame is drawn in. */
  function world(at: Spot): [number, number] {
    return toWorld(...bufferPoint(at.x, at.y), seen());
  }

  /** Where a pointer is on the page. */
  function spotOf(event: PointerEvent): Spot {
    return { x: event.clientX, y: event.clientY };
  }

  /**
   * The camera has moved (decision 67): the address follows once it stays,
   * not at every frame of a gesture.
   */
  function viewMoved(): void {
    clearTimeout(addressTimer);
    addressTimer = window.setTimeout(() => {
      row.keepAddress();
    }, 300);
    showZoom();
  }

  /** The zoom in its control, and the whole view's button faint while the view is whole (decision 73). */
  function showZoom(): void {
    controls.showValue(ZOOM.id, camera.zoom);
    controls.showIdle("whole", zoomWritten(camera.zoom) <= 1);
  }

  /**
   * Whether the view has stayed for the last two frames: a frame that
   * changed it, and the next, take longer than the screen's rhythm, and
   * would teach the twins' budget to carry fewer of them (decision 67).
   */
  function steady(): boolean {
    return viewStill >= 2;
  }

  /** The camera `factor` times nearer about a point of the page, which stays under it. */
  function zoomAt(clientX: number, clientY: number, factor: number): void {
    const [wx, wy] = toWorld(...bufferPoint(clientX, clientY), cameraView());
    camera = zoomAbout(camera, wx, wy, factor, motion.chain.totalLength);
    viewMoved();
  }

  /** The camera nearer or farther about the middle of the canvas, by Z and X. */
  function zoomMiddle(factor: number): void {
    const box = canvas.getBoundingClientRect();
    zoomAt(box.left + box.width / 2, box.top + box.height / 2, factor);
  }

  /** The whole view at once, by its button or Shift with X (decision 73). */
  function wholeView(): void {
    camera = WHOLE_VIEW;
    viewMoved();
  }

  /**
   * A press, or a finger that has waited, grabs the chain where it is: it
   * sets the chain going again, if it was paused, forwards, and ends its
   * twins; letting it go gives it new ones.
   */
  function grab(id: number, at: Spot, time: number): void {
    const [px, py] = world(at);
    if (paused) setPaused(false);
    if (backwards) setBackwards(false);
    inMode = false;
    twins.clear();
    // the nearest mass, wherever the press lands, in the pivot's frame,
    // where the music's kicks have taken it (decision 75)
    motion.apply({ kind: "grab", x: px, y: py, grip: value(HAND) });
    Object.assign(pointer, { id, x: px, y: py, vx: 0, vy: 0, at: time });
  }

  /** Two fingers begin to pinch: the point of the world between them stays between them. */
  function beginPinch(): void {
    const pair = touches.pair;
    if (pair === null) return;
    pinch = {
      camera,
      world: toWorld(...bufferPoint(pair.x, pair.y), cameraView()),
      distance: pair.distance,
    };
  }

  /** The camera the two fingers ask for now. */
  function followPinch(): void {
    const pair = touches.pair;
    if (pair === null || pinch === null) return;
    camera = pinched(
      pinch,
      ...bufferPoint(pair.x, pair.y),
      pair.distance,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      motion.chain.totalLength,
    );
    viewMoved();
  }

  /** The hand follows the pointer that holds the chain, with a smoothed velocity. */
  function follow(event: PointerEvent): void {
    const [px, py] = world(spotOf(event));
    const dt = Math.max(1e-3, (event.timeStamp - pointer.at) / 1000);
    // A smoothed velocity, so that the throw has the speed of the gesture.
    const blend = Math.min(1, dt / 0.03);
    pointer.vx += blend * ((px - pointer.x) / dt - pointer.vx);
    pointer.vy += blend * ((py - pointer.y) / dt - pointer.vy);
    pointer.x = px;
    pointer.y = py;
    pointer.at = event.timeStamp;
  }

  /** Holds `event`'s pointer to the canvas, which a pointer the page made up cannot be. */
  function capture(event: PointerEvent): void {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // a pointer no device made, as a test's
    }
  }

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    // a finger waits before it grabs, so that a second can pinch (decision 67)
    if (event.pointerType === "touch") {
      capture(event);
      if (
        touches.down(event.pointerId, spotOf(event), event.timeStamp) ===
        "pinch"
      ) {
        beginPinch();
      }
      return;
    }
    if (pointer.id !== -1 || panning !== null) return;
    capture(event);
    // the middle button, or any with Space held, moves the view and does
    // not grab (decision 67)
    if (event.button === 1 || spaceHeld) {
      panning = { id: event.pointerId, x: event.clientX, y: event.clientY };
      spaceUsed = true;
      canvas.style.cursor = "grabbing";
      return;
    }
    grab(event.pointerId, spotOf(event), event.timeStamp);
  });

  // the middle button scrolls the page by itself in some browsers
  canvas.addEventListener("mousedown", (event) => {
    if (event.button === 1) event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (panning !== null && event.pointerId === panning.id) {
      const box = canvas.getBoundingClientRect();
      const kx = box.width > 0 ? gl.drawingBufferWidth / box.width : 1;
      const ky = box.height > 0 ? gl.drawingBufferHeight / box.height : 1;
      camera = panBy(
        camera,
        (event.clientX - panning.x) * kx,
        (event.clientY - panning.y) * ky,
        cameraView().scale,
        motion.chain.totalLength,
      );
      panning.x = event.clientX;
      panning.y = event.clientY;
      viewMoved();
      return;
    }
    if (event.pointerType === "touch") {
      const asked = touches.move(event.pointerId, spotOf(event));
      if (asked === "grab") {
        const holder = touches.holder;
        if (holder !== null) grab(holder.id, holder.spot, event.timeStamp);
        return;
      }
      if (asked === "pinch") {
        followPinch();
        return;
      }
    }
    if (event.pointerId !== pointer.id) {
      // a pointer moving over the stage, not holding the chain, wakes the controls
      if (event.pointerType === "mouse") controls.wake();
      return;
    }
    follow(event);
  });

  const letGo = (event: PointerEvent): void => {
    if (panning !== null && event.pointerId === panning.id) {
      panning = null;
      canvas.style.cursor = spaceHeld ? "grab" : "";
      return;
    }
    if (event.pointerType === "touch") {
      const lifted = touches.up(event.pointerId);
      if (lifted === "end") pinch = null;
      // a tap, too short to grab, wakes the controls as a lifted finger does
      if (lifted === "tap") controls.wake();
      if (lifted !== "let go") return;
    }
    if (event.pointerId !== pointer.id) return;
    pointer.id = -1;
    motion.apply({ kind: "let go" });
    spawnTwins();
    // on a touch screen, lifting the finger is what wakes the controls
    if (event.pointerType !== "mouse") controls.wake();
  };
  canvas.addEventListener("pointerup", letGo);
  canvas.addEventListener("pointercancel", letGo);

  // The wheel, and a trackpad's pinch, which comes as the wheel with Ctrl,
  // zoom about the mouse (decision 67); sliding two fingers on a trackpad
  // zooms too.
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (safariPinch !== null) return;
      const per = event.ctrlKey
        ? 0.01
        : event.deltaMode === 1
          ? 0.05
          : event.deltaMode === 2
            ? 1
            : 0.002;
      zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * per));
    },
    { passive: false },
  );

  // Safari on a Mac gives a trackpad's pinch events of its own, with how
  // far the fingers have spread since they began; on a touch screen the
  // fingers themselves pinch.
  interface SafariPinch extends Event {
    readonly scale: number;
    readonly clientX: number;
    readonly clientY: number;
  }
  canvas.addEventListener("gesturestart", (event) => {
    event.preventDefault();
    if (touches.count === 0) safariPinch = { zoom: camera.zoom };
  });
  canvas.addEventListener("gesturechange", (event) => {
    event.preventDefault();
    if (safariPinch === null) return;
    const { scale, clientX, clientY } = event as SafariPinch;
    if (!(scale > 0)) return;
    zoomAt(clientX, clientY, (safariPinch.zoom * scale) / camera.zoom);
  });
  canvas.addEventListener("gestureend", (event) => {
    event.preventDefault();
    safariPinch = null;
  });

  // Space pauses as it is let go, unless it moved the view while held
  // (decision 67); a window left with Space held forgets it.
  addEventListener("keyup", (event) => {
    if (event.key !== " " || !spaceHeld) return;
    spaceHeld = false;
    if (panning === null) canvas.style.cursor = "";
    if (!spaceUsed) setPaused(!paused);
  });
  addEventListener("blur", () => {
    spaceHeld = false;
    if (panning === null) canvas.style.cursor = "";
  });

  addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // A focused button takes its own Space and Enter.
    const onButton = event.target instanceof HTMLButtonElement;
    if (onButton && (event.key === " " || event.key === "Enter")) return;
    // the row's keys, its controls' and its actions' (decision 88)
    if (row.key(event)) return;
    // Space, held, moves the view with a drag, and pressed alone pauses
    // (decision 67)
    if (event.key !== " ") return;
    event.preventDefault();
    if (!event.repeat) {
      spaceHeld = true;
      spaceUsed = false;
      if (panning === null) canvas.style.cursor = "grab";
    }
    controls.wake();
  });

  /**
   * The chain's motion over a frame of dt seconds (decision 80), its record
   * drawn into the trails, the valve that shows time slowed (decision 15) and
   * the colour of its tension (decision 35): the time it simulated, and
   * whether a strobe flashed. The music flashes the strobe on its kicks when
   * `flashes`.
   */
  function advanceChain(
    dt: number,
    now: number,
    flashes: boolean,
    ahead: boolean,
  ): { simulated: number; flashed: boolean } {
    // a pointer that has stopped moving holds the chain still where it is
    if (motion.held && now - pointer.at > STILL_AFTER_MS) {
      pointer.vx = 0;
      pointer.vy = 0;
    }
    // kept as curves (decision 68), the step begins on the samples' clock
    const speeds = drawing.beginStep();
    // the music's forces over the frame, which each piece feels from where
    // it starts in it, and its twins the same (decision 74)
    const moved = motion.advance({
      real: dt,
      speed: value(TIME),
      deadline: performance.now() + PHYSICS_BUDGET_MS,
      heard: heardNow,
      force: router.mode.force,
      strength: tune.strength,
      dance: settings.choreography,
      pointer,
      tension: drawing.tensionShown,
      speeds,
      ahead,
    });
    const flashed = drawing.record(moved, flashes);
    if (moved.broke) start();

    // The valve: when the machine keeps time below the speed asked for,
    // the time control shows the speed reached, and comes into sight
    // unless the visitor is reading another value in the open row.
    const { simulated, asked } = moved;
    const wasHeld = reached < 0.97;
    reached += 0.1 * (simulated / asked - reached);
    const held = reached < 0.97;
    const speed = value(TIME);
    if (held) {
      controls.showValue(TIME.id, speed, {
        reached: Math.round(speed * reached * 100) / 100,
      });
      if (!wasHeld) controls.notice(TIME.id);
    } else if (wasHeld) {
      controls.showValue(TIME.id, speed);
    }
    drawing.easeTension(simulated);
    return { simulated, flashed };
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
   * line's own budget. No time sends what happened to the twins alone.
   */
  function sendTwins(simulated: number, phase: number, now: number): void {
    // in one piece when there are no trails to draw
    const pieces =
      simulated <= 0
        ? 0
        : value(TRAIL) === 0
          ? 1
          : Math.min(8, Math.max(1, Math.ceil(simulated * TWIN_TRAIL_RATE)));
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
    if (steady()) twinBudget += 0.1 * (free - twinBudget);
    twins.setBudget(twins.local ? TWIN_LOCAL_MS : twinBudget);
    twins.send({
      time: simulated,
      pieces,
      g: motion.g,
      shakes,
      chain: at,
      hold,
      whole: value(LOOK) !== 1,
      // kept as curves, each tip's velocity with its place, and the step's
      // instant (decision 68)
      clock:
        drawing.curves() !== null && value(LOOK) !== 1
          ? drawing.stepClock
          : null,
      // the music's forces over the same time (decision 74)
      drive: simulated > 0 ? motion.drive : null,
      budget: twins.local ? TWIN_LOCAL_MS : twinBudget,
    });
  }

  // Where the pivot was at each instant of the twins' reports, and how it
  // moved, x then y for each (decision 75): the same for every twin of a
  // frame, worked out once, for the command they were sent with.
  const pivotThen: PivotMotion = { x: 0, y: 0, vx: 0, vy: 0 };
  let twinPivots = new Float64Array(2);
  let twinPivotSpeeds = new Float64Array(2);
  let twinPivotsOf: {
    drive: Drive | null;
    pieces: number;
    time: number;
  } | null = null;

  /** The pivot at each of a report's instants, under the command of the frame computed last, unless already worked out. */
  function twinPivotsFor(report: TwinReport): void {
    const { pieces, time } = report;
    const known = twinPivotsOf;
    if (
      known !== null &&
      known.drive === motion.drive &&
      known.pieces === pieces &&
      known.time === time
    ) {
      return;
    }
    if (twinPivots.length !== 2 * (pieces + 1)) {
      twinPivots = new Float64Array(2 * (pieces + 1));
      twinPivotSpeeds = new Float64Array(2 * (pieces + 1));
    }
    for (let piece = 0; piece <= pieces; piece++) {
      motion.pivotAt((piece * time) / pieces, pivotThen);
      twinPivots[2 * piece] = pivotThen.x;
      twinPivots[2 * piece + 1] = pivotThen.y;
      twinPivotSpeeds[2 * piece] = pivotThen.vx;
      twinPivotSpeeds[2 * piece + 1] = pivotThen.vy;
    }
    twinPivotsOf = { drive: motion.drive, pieces, time };
  }

  /**
   * What the twins' workers sent back since the last frame (decision 51):
   * each twin's tip along the frame draws its trail, a strobe's flash
   * stamps it as a point (decision 50), and a twin that fades takes the
   * light of how far it has gone from the chain (decision 43).
   */
  function takeTwins(flashed: boolean): void {
    // faint, so that where many twins' trails run together they read as one
    const light = Math.min(
      0.35,
      Math.max(0.03, 1.2 / Math.sqrt(Math.max(1, twins.count))),
    );
    // while they fade, each in its own light, which then falls with how far
    // it has gone from the chain
    const fades = value(FADE) === 1;
    // their tips draw lines where the trails' layers have them do so: not
    // as dust, which draws none, nor under a strobe, whose flashes stamp
    // them as points (decision 50)
    const tipLines = layerOf(drawing.layers(), "twins", "lines") !== undefined;
    const music = 1 + Math.min(TRAIL_MOST, look.trail);
    // held, how much each share's fan stretched, averaged over the shares
    // (decision 64)
    let stretch = 0;
    let stretchTime = 0;
    let measured = 0;
    twins.take((j, report, k) => {
      if (k === 0 && report.stretchTime > 0) {
        stretch += report.stretch;
        stretchTime += report.stretchTime;
        measured++;
      }
      const color = tinted(fanColors[j] ?? colors.chain, "twins");
      const shine = fades ? (fading.light[j] ?? 1) : 1;
      const { pieces, tips } = report;
      const at = 2 * (pieces + 1) * k;
      // where the pivot was at each of the report's instants (decision 75)
      if (pieces > 0) twinPivotsFor(report);
      const curves = tipLines ? drawing.curves() : null;
      if (curves !== null && report.clock !== null && pieces > 0) {
        twinCurve(curves, j, report, at, color, light * shine * music);
      } else if (tipLines) {
        for (let piece = 0; piece < pieces; piece++) {
          const from = at + 2 * piece;
          const p = 2 * piece;
          drawing.piece(
            (tips[from] ?? 0) + (twinPivots[p] ?? 0),
            (tips[from + 1] ?? 0) + (twinPivots[p + 1] ?? 0),
            (tips[from + 2] ?? 0) + (twinPivots[p + 2] ?? 0),
            (tips[from + 3] ?? 0) + (twinPivots[p + 3] ?? 0),
            color,
            light * shine,
          );
        }
      }
      if (flashed && pieces > 0) {
        const p = 2 * pieces;
        const px = (tips[at + p] ?? 0) + (twinPivots[p] ?? 0);
        const py = (tips[at + p + 1] ?? 0) + (twinPivots[p + 1] ?? 0);
        drawing.point(px, py, color, 2 * light * shine * music);
      }
      if (fades && k < report.apart.length) {
        fading.see(j, report.apart[k] ?? 0, FADE_REACH);
      }
    }, steady());
    if (measured > 0 && value(FADE) === HELD_STEP) {
      doubling.add(stretch / measured, stretchTime / measured);
    }
  }

  /**
   * Twin `j`'s tip along a report as samples of a curve (decision 68), each
   * piece at the instant its report's clock gives it: a twin whose trail
   * does not go on from where the report starts begins it there, and one
   * that jumped, born again, starts it anew.
   */
  function twinCurve(
    curves: SharpTrails,
    j: number,
    report: TwinReport,
    at: number,
    color: Rgb,
    light: number,
  ): void {
    const merger = curves.twins;
    const { fresh, closed } = curves;
    const { pieces, tips, tipSpeeds, clock, time } = report;
    if (clock === null) return;
    const step = time / pieces;
    // each instant's tip where the pivot was then, moving as it moved
    // (decision 75)
    const x0 = (tips[at] ?? 0) + (twinPivots[0] ?? 0);
    const y0 = (tips[at + 1] ?? 0) + (twinPivots[1] ?? 0);
    if (!merger.continues(j, x0, y0, 1e-6)) {
      merger.cut(j, closed);
      merger.sample(
        j,
        x0,
        y0,
        (tipSpeeds[at] ?? 0) + (twinPivotSpeeds[0] ?? 0),
        (tipSpeeds[at + 1] ?? 0) + (twinPivotSpeeds[1] ?? 0),
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
      const x = (tips[q] ?? 0) + (twinPivots[p] ?? 0);
      const y = (tips[q + 1] ?? 0) + (twinPivots[p + 1] ?? 0);
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
        (tipSpeeds[q] ?? 0) + (twinPivotSpeeds[p] ?? 0),
        (tipSpeeds[q + 1] ?? 0) + (twinPivotSpeeds[p + 1] ?? 0),
        clock.seconds + seconds,
        clock.fade + seconds * clock.rate,
        light,
        color,
        fresh,
        closed,
      );
    }
  }

  let last = performance.now();
  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(LONGEST_FRAME, Math.max(0, (now - last) / 1000));
    const real = Math.min(0.25, Math.max(0, (now - last) / 1000));
    // a frame that followed a change of the view is no measure of the
    // screen's rhythm (decision 67)
    if (steady()) rhythm.frame(now - last);
    last = now;
    // a finger that has waited long enough grabs the chain (decision 67)
    if (touches.due(now) === "grab") {
      const holder = touches.holder;
      if (holder !== null) grab(holder.id, holder.spot, now);
    }
    // what the music says this frame, which the music's panel shows, paused
    // or not, and what it adds to the light, in real time (decision 46)
    const heard = music.hear();
    look = router.look(heard, real, tune.strength);
    // and to its forces (decision 75), which turn time backwards off while
    // they act: a mode with a force while a source plays, or kicks going on
    heardNow = heard;
    const acting =
      (router.mode.force !== undefined && heard !== null) || motion.kicking;
    if (acting !== forcing) {
      forcing = acting;
      controls.showIdle("reverse", forcing);
    }
    // the music flashes a strobe on its kicks while it plays in a mode that
    // does, and not with reduced motion asked for (decision 50)
    const flashes =
      heard !== null &&
      !heard.silent &&
      !still.matches &&
      router.mode.routes.some(({ to }) => to === "flash");
    if (look.note >= 0) {
      const color = noteColor(look.note);
      const ease = still.matches ? NOTE_EASE_SLOW : NOTE_EASE;
      noteShown =
        noteShown === null
          ? color
          : mixColors(noteShown, color, 1 - Math.exp(-real / ease));
    }
    const running = !paused && dt > 0;
    let simulated = 0;
    let flashed = false;
    if (ahead !== null) {
      // the frame computed at the last one, its twins back from the workers
      ({ simulated, flashed } = ahead);
      ahead = null;
    } else {
      drawing.clearPieces();
      // The chain alone, now: the hand holds it, or no twins move with it.
      // Twins that do wait a frame, and the chain with them (decision 51).
      if (running && twins.count === 0) {
        ({ simulated, flashed } = advanceChain(dt, now, flashes, false));
      } else {
        drawing.easeTension(0);
      }
    }
    takeTwins(flashed);
    // the view the frame is drawn in, and whether it changed (decision 67)
    const viewChanged = drawing.draw(simulated, seen(), camera.zoom <= 1);
    viewStill = viewChanged ? 0 : viewStill + 1;
    const { sharp, mechanism } = drawing;
    fpsMeter?.frame(now, {
      remake: sharp?.remakeMs ?? null,
      mechanism,
      megabytes: (sharp?.bytes ?? 0) / 1e6,
      kept: mechanism === "sharp" ? (sharp?.kept ?? null) : null,
    });

    // Twins are born once the frame is drawn, of the chain as it is then:
    // those asked for, those gone dark, and the music's (decisions 43, 46).
    if (spawnPending) {
      if (!motion.held) bearTwins();
    } else if (simulated > 0 && lit && !motion.held) {
      if (value(FADE) === 1) bearAgain();
      if (look.births > 0) bornOnBeat(look.births);
    }
    showTwins();
    // the music's icon rises with the sound's three bands while the piece
    // listens (decision 76)
    controls.showLevels(
      "music",
      heard === null ? null : [heard.bass, heard.mid, heard.treble],
    );

    // The next frame is computed now while there are twins: their workers
    // bring them back by then, and the two are drawn at one instant
    // (decision 51).
    if (running && twins.count > 0 && !motion.held) {
      const phase = motion.shakePhase;
      drawing.clearPieces();
      // the motion keeps the chain the screen shows as it runs ahead
      const next = advanceChain(dt, now, flashes, true);
      // unless the motion broke down, and the chain started again
      if (twins.count > 0) {
        sendTwins(next.simulated, phase, now);
        ahead = next;
      }
    }
    // what happened to the twins while time stands, sent alone
    if (twins.pending) sendTwins(0, motion.shakePhase, now);
  }

  start();
  // a moment saved paused opens paused, as it was
  if (settings.saved?.paused === true) setPaused(true);
  requestAnimationFrame(frame);
}
