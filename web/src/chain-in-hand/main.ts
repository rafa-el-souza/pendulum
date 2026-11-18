import "../styles/base.css";

import { cssColor, type Rgb } from "../core/color.ts";
import { mountControls } from "../core/controls.ts";
import { groundAt, mixColors } from "../core/grounds.ts";
import { Lines, SegmentBatch } from "../core/lines.ts";
import { mountLinkCard, shareLink } from "../core/link.ts";
import { mountMusicCard } from "../core/music.ts";
import {
  Router,
  UNLIT,
  readMusic,
  writeMusic,
  type Look,
} from "../core/routes.ts";
import { fanPalette, noteColor } from "../core/palettes.ts";
import { keyAction, stepValue, type Parameter } from "../core/parameters.ts";
import { mountStage, type Stage } from "../core/stage.ts";
import {
  EARTH,
  TensionShades,
  earthWeights,
  tensionScale,
  tensionScaleAt,
} from "../core/tension.ts";
import { LightTarget, Trails, fadeAfter } from "../core/trails.ts";
import {
  FrameRhythm,
  TwinWorkers,
  inWorker,
  sharesFor,
  workerBudget,
} from "../core/twin-workers.ts";
import { Fading, bornPerFrame, fanPlace } from "../core/twins.ts";
import { fitScale, toWorld } from "../core/view.ts";
import { Chain, createHand, type Hand } from "../physics/chain.ts";
import { startInMode } from "../physics/modes.ts";
import { resample } from "../physics/resample.ts";
import {
  PeriodTension,
  Stepper,
  restingState,
  reverseMotion,
  type Shake,
} from "../physics/step.ts";
import { PIECES } from "../pieces.ts";
import { addressOf, openingOf, type Saved } from "./address.ts";
import {
  AMPLITUDE,
  FADE,
  FADE_REACH,
  GRAVITY,
  GROUND,
  HAND,
  LIGHT,
  LOOK,
  MASSES,
  MODE,
  PALETTE,
  PARAMETERS,
  RIBBON,
  SAVED_START,
  SCALE,
  SHAKE,
  SPREAD,
  STYLE,
  TENSION,
  TILT,
  TIME,
  TRAIL,
  TWIN_COUNT,
  gravityOf,
  handDamping,
  MARK_STEP,
  radians,
  shakeOf,
  trailFade,
} from "./parameters.ts";
import { MODES, modeOf } from "./music.ts";
import { titleOf } from "./title.ts";

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
// several scales (decision 41). The twins can stay, or fade as chaos carries
// them off from the chain and be born again on it, a plume (decision 43).
// The piece can listen to music, from the microphone, a file, a tab's sound
// or a beat of its own, and a card shows what it hears (decisions 44 and
// 45); the music lights the chain, its trails and its twins (decision 46).

// A frame longer than this (a hidden tab, a stall) moves the chain by this
// much only, so that it never jumps.
const LONGEST_FRAME = 1 / 30;
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
// The trails (decision 21): a frame's motion is drawn in this many pieces to
// the simulated second, so that a fast tip draws a curve. A tip that moves
// farther than TRAIL_JUMP metres in one piece has jumped (raised again, or
// given other masses), and leaves no trail across the jump. How long they
// last is a control (decision 22).
const TRAIL_RATE = 480;
const TWIN_TRAIL_RATE = 240;
const TRAIL_JUMP = 0.5;
// The colour of the tension (decision 35): each rod's place on the scale moves
// this share of the way to that of its tension every frame, a few frames to
// follow a change, as the hand's line eases its pull.
const TENSION_EASE = 0.25;
// The shaken pivot (decision 36): the chain starts standing this far off
// upright, in rad, and the pivot is drawn as a streak this long either way
// along the shake, in m: a sign of the shake, which is a millimetre.
const STANDING_LEAN = 0.1;
const PIVOT_STREAK = 0.025;
// What the music adds to the light (decisions 46 and 49), at most: the
// chain's halo grows to this many more pixels and this much more gain, never
// a flash over a large area, and the trails' light to this many times its
// own. A note's colour comes in over NOTE_EASE, in s, or NOTE_EASE_SLOW with
// reduced motion asked for.
const GLOW_MOST = 3;
const GLOW_RADIUS = 4;
const GLOW_GAIN = 0.3;
const TRAIL_MOST = 2;
const NOTE_EASE = 0.08;
const NOTE_EASE_SLOW = 1;
// The trails of a strobe (decision 50): the whole chain stamped this many
// times a second of simulated time, each copy this light. The twins as dust:
// each tip a point this many pixels wide, which swells as the music lights
// the halo.
const STROBE_RATE = 12;
const STROBE_LIGHT = 0.45;
const DUST_RADIUS = 1.4;
// How long the share button shows that the address was copied, in ms.
const COPIED_MS = 2000;
// The piece's name, which begins the page's title (decision 37).
const NAME =
  PIECES.find(({ id }) => id === "chain-in-hand")?.title ?? document.title;

const canvas = document.getElementById("stage");
const notice = document.getElementById("notice");
if (!(canvas instanceof HTMLCanvasElement) || notice === null) {
  throw new Error("the page lacks its #stage canvas or its #notice");
}

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
  const { values } = opened;
  const value = (p: Parameter): number => values.get(p.id) ?? p.initial;

  let chain = Chain.uniform(value(MASSES));
  let state = restingState(chain.n);
  // the gravity the chain and its twins are under, as its controls ask
  let g = gravityOf(value(GRAVITY), value(TILT));
  let stepper = new Stepper(chain);
  const lines = new Lines(gl);
  // the ground asked for, and the colours that stand out from it (decision 41)
  const opening = groundAt(value(GROUND));
  const colors: { ground: Rgb; chain: Rgb; hand: Rgb; pivot: Rgb } = {
    ground: opening.ground,
    chain: opening.chain,
    hand: opening.hand,
    pivot: opening.pivot,
  };
  const rods = new SegmentBatch(chain.n);
  // The twins, dealt out to workers on all the device's cores but one
  // (decision 51), with a first guess of a twin's cost that the measured
  // cost replaces in a few frames; and whether new twins are asked for, to
  // be born once the frame is drawn. Should the workers fail, the twins go
  // back to the main line, lost, and are born again.
  let spawnPending = false;
  const twins = new TwinWorkers({
    shares: sharesFor(navigator.hardwareConcurrency),
    n: chain.n,
    budget: TWIN_MOST_MS,
    cost: 0.002 * (chain.n / 2) ** 1.5,
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
  const fan = new SegmentBatch(value(TWIN_COUNT) * chain.n);
  // the twins as dust: their tips alone (decision 50)
  const dust = new SegmentBatch(value(TWIN_COUNT));
  const dots = new SegmentBatch(chain.n + 2);
  // the hand's spring, drawn stronger the harder the hand pulls
  const spring = new SegmentBatch(1);
  const pull = new Float64Array(2);
  let strength = 0;
  let x = new Float64Array(chain.n);
  let y = new Float64Array(chain.n);
  // the trails, the pieces drawn into them this frame, and where each ends
  const trails = new Trails(gl);
  // With the sketch's light on the whole frame, the frame's lines are drawn
  // here first, and go through the trails' curve with them (decision 24).
  const scene = new LightTarget(gl);
  let wholeFrame = opened.switches.get("sketch") ?? false;
  // The twins and the trails, lit or put out by one switch; their controls
  // keep their values, and stepping one of them lights them again.
  let lit = opened.switches.get("light") ?? true;
  const LIGHT_CONTROLS: ReadonlySet<Parameter> = new Set(LIGHT);
  const trail = new SegmentBatch(4096);
  // where each mass of the chain was at the end of the last piece of trail
  let ends = new Float64Array(2 * chain.n);
  // The colour of the tension (decision 35), off until it is switched on:
  // each rod's tension averaged over the motion of the frame, or of the
  // instant when no time went by, in Earth weights of what the rod holds.
  let tensionShown = opened.switches.get("tension") ?? false;
  let weights = earthWeights(chain);
  let shades = new TensionShades(chain.n);
  let pieceTension = new Float64Array(chain.n);
  let frameTension = new Float64Array(chain.n);
  let tensionScratch = new Float64Array(chain.n);
  let tensionColor = tensionScale(colors.chain, tensionScaleAt(value(SCALE)));
  // each rod's colour, worked out once a frame for its rod, its mass and the
  // trail the mass leaves
  let rodColors: Rgb[] = [];
  // The shaken pivot (decision 36): where in its cycle the shake is, carried
  // from frame to frame, and each rod's tension over whole periods of it,
  // which the colour of the tension shows while the pivot shakes.
  let shakePhase = 0;
  let meter = new PeriodTension(chain.n);
  /** The shake the controls ask for, from `phase`, or none while the pivot is still. */
  function shakeAt(phase: number): Shake | null {
    return shakeOf(value(SHAKE), value(TILT), phase);
  }

  let hand: Hand | null = null;
  // whether the chain still swings in the mode it started in, the hand not
  // having held it since: it then starts again in that mode on another
  // number of masses (decision 33)
  let inMode = false;
  // the moment saved in the address, where the chain starts while there is
  // one (decision 34), with how the screen around it was (decision 38)
  let saved: Saved | null = opened.saved;
  let paused = false;
  // whether time runs backwards: every motion reversed since it last ran
  // forwards (decision 28)
  let backwards = false;
  // the speed time actually ran at lately, as a share of the speed asked for
  let reached = 1;
  // The frame computed a frame ahead while there are twins (decision 51):
  // the time it simulated, and whether a strobe flashed in it. It is shown at
  // the next frame, with the twins its workers bring back meanwhile; the
  // chain as the screen shows it until then is kept, for a moment saved.
  let ahead: { simulated: number; flashed: boolean } | null = null;
  const shown = {
    theta: new Float64Array(chain.n),
    omega: new Float64Array(chain.n),
    phase: 0,
  };
  // the screen's rhythm, and how late the frames come against it, for the
  // time the twins' workers may take (decision 51)
  const rhythm = new FrameRhythm();
  const pointer = { id: -1, x: 0, y: 0, vx: 0, vy: 0, at: 0 };
  // What the music does (decision 46): its mode and strength, from the
  // address, the routes that follow it, and what they add to the light this
  // frame. With reduced motion asked for, pulses become slow waves.
  const tune = readMusic(
    MODES.map(({ id }) => id),
    location.search,
  );
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let router = new Router(modeOf(tune.mode), { slow: still.matches });
  let look: Look = UNLIT;
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
  // the simulated time since a strobe last stamped the chain (decision 50)
  let strobeClock = 0;

  /** The chain's trails go on from where its masses are now; each twin's goes on from where its worker says it is (decision 51). */
  function resetTrailEnds(): void {
    chain.positions(state.theta, x, y);
    ends = new Float64Array(2 * chain.n);
    for (let i = 0; i < chain.n; i++) {
      ends[2 * i] = x[i] ?? 0;
      ends[2 * i + 1] = y[i] ?? 0;
    }
  }

  /** The chain as the screen shows it now, kept while the next frame is computed ahead (decision 51). */
  function keepShown(): void {
    if (shown.theta.length !== chain.n) {
      shown.theta = new Float64Array(chain.n);
      shown.omega = new Float64Array(chain.n);
    }
    shown.theta.set(state.theta);
    shown.omega.set(state.omega);
    shown.phase = shakePhase;
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
    if (!lit || value(TRAIL) === 0) return;
    if (Math.hypot(bx - ax, by - ay) < TRAIL_JUMP) {
      // stronger as the music asks (decision 46)
      const music = 1 + Math.min(TRAIL_MOST, look.trail);
      trail.push(ax, ay, bx, by, color, light * music);
    }
  }

  /**
   * The whole chain as it is now, stamped into the trails, as a strobe's
   * flash leaves it (decision 50): each rod in its colour, brighter as the
   * music asks.
   */
  function stamp(color: Rgb): void {
    const music = 1 + Math.min(TRAIL_MOST, look.trail);
    let ax = 0;
    let ay = 0;
    for (let i = 0; i < chain.n; i++) {
      const bx = x[i] ?? 0;
      const by = y[i] ?? 0;
      const rod = tensionShown ? (rodColors[i] ?? color) : color;
      trail.push(ax, ay, bx, by, rod, STROBE_LIGHT * music);
      ax = bx;
      ay = by;
    }
  }

  /** The twins' control: the number asked for, or the fewer the budget carries, in the tone of a value held back. */
  function showTwins(): void {
    const asked = value(TWIN_COUNT);
    if (lit && hand === null && twins.count < asked) {
      controls.showValue(TWIN_COUNT.id, asked, { reached: twins.count });
    } else {
      controls.showValue(TWIN_COUNT.id, asked);
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

  /** Twins of the chain as it is now, as many as their budget carries, while the light is on. */
  function bearTwins(): void {
    spawnPending = false;
    twins.clear();
    const count = lit ? Math.min(value(TWIN_COUNT), twins.affordable()) : 0;
    twins.born(
      Array.from({ length: count }, (_, j) => j),
      state,
      value(SPREAD),
    );
    fading.relight();
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
    // the fan opens wider as the music asks (decision 49)
    twins.born(born, state, value(SPREAD) * 10 ** look.spread);
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
    // the fan opens wider as the music asks (decision 49)
    twins.born(chosen, state, value(SPREAD) * 10 ** look.spread);
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
    const mode = Math.min(value(MODE), chain.n);
    if (saved !== null) {
      state = {
        theta: Float64Array.from(saved.state.theta),
        omega: Float64Array.from(saved.state.omega),
      };
      shakePhase = saved.phase;
    } else if (mode > 0) {
      state = startInMode(chain.n, mode, radians(value(AMPLITUDE)), down);
    } else if (value(SHAKE) > 0) {
      state.theta.fill(down + Math.PI - STANDING_LEAN);
      state.omega.fill(0);
    } else {
      for (let i = 0; i < chain.n; i++) {
        state.theta[i] = down + 2.2 + (0.7 * i) / Math.max(1, chain.n - 1);
        state.omega[i] = 0;
      }
    }
    hand = null;
    inMode = saved === null && mode > 0;
    meter = new PeriodTension(chain.n);
    setBackwards(saved?.backwards ?? false);
    trails.clear();
    // the frame computed ahead, and the twins, belong to the motion before
    ahead = null;
    trail.clear();
    twins.clear();
    resetTrailEnds();
    spawnTwins();
    showStart();
  }

  /**
   * The start's controls: with a moment saved, the start says the chain
   * starts there; without, a mode the chain lacks shows the highest it has,
   * held back. The amplitude, which only a mode has, shows faint while the
   * chain starts raised or from the moment saved, where it has nothing to do.
   */
  function showStart(): void {
    const mode = value(MODE);
    if (saved !== null) controls.showValue(MODE.id, SAVED_START);
    else if (mode > chain.n) {
      controls.showValue(MODE.id, mode, { reached: chain.n });
    } else controls.showValue(MODE.id, mode);
    controls.showValue(AMPLITUDE.id, value(AMPLITUDE), {
      idle: saved !== null || mode === 0,
    });
  }

  /** Which masses draw the trails, faint with a strobe's, which stamps the whole chain (decision 50). */
  function showRibbon(): void {
    controls.showValue(RIBBON.id, value(RIBBON), { idle: value(STYLE) === 1 });
  }

  /** A hand on mass `index`, with the grip the hand's control asks for, where `at` is and moving as it moves. */
  function holding(
    index: number,
    at: { x: number; y: number; vx: number; vy: number },
  ): Hand {
    const rate = value(HAND);
    const held = createHand(chain, index, rate, handDamping(rate));
    held.x = at.x;
    held.y = at.y;
    held.vx = at.vx;
    held.vy = at.vy;
    return held;
  }

  /** The same motion on another number of masses, the hand keeping hold of the same place along the chain. */
  function setMasses(n: number): void {
    if (n === chain.n) return;
    const before = chain;
    const moved = resample(before, state, n);
    chain = moved.chain;
    state = moved.state;
    stepper = new Stepper(chain);
    x = new Float64Array(n);
    y = new Float64Array(n);
    weights = earthWeights(chain);
    shades = new TensionShades(n);
    rodColors = Array.from({ length: n }, () => colors.chain);
    meter = new PeriodTension(n);
    pieceTension = new Float64Array(n);
    frameTension = new Float64Array(n);
    tensionScratch = new Float64Array(n);
    if (hand !== null) {
      const along = (hand.index + 1) / before.n;
      const index = Math.min(n - 1, Math.max(0, Math.round(along * n) - 1));
      hand = holding(index, hand);
    }
    // The twins move to the new number too, in their workers, as many as it
    // carries; back at a number that carries many more than are left, they
    // are born again.
    twins.rescale(before.n, n);
    twins.keep(twins.affordable());
    twins.resample(n);
    const carried = Math.min(value(TWIN_COUNT), twins.affordable());
    if (hand === null && twins.count < 0.5 * carried) spawnTwins();
    resetTrailEnds();
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
      if (hand === null) spawnTwins();
    } else {
      twins.clear();
      trails.clear();
      trail.clear();
    }
    controls.showAction("light", on ? "light" : "dark", "Light", on);
    showTwins();
  }

  /** The tension's colours as the row shows them, one control (decision 53): off, or the scale. */
  function tensionAt(): number {
    return tensionShown ? value(SCALE) : TENSION.initial;
  }

  /** Each rod painted by its tension, or the chain in its own colour; the switch says which. */
  function setTensionShown(on: boolean): void {
    tensionShown = on;
    // switched on, the colours come up from the chain's own over a few frames
    if (on) {
      shades = new TensionShades(chain.n);
      rodColors = Array.from({ length: chain.n }, () => colors.chain);
      meter = new PeriodTension(chain.n);
    }
    controls.showValue(TENSION.id, tensionAt());
  }

  /** The time button says which way a press would take time. */
  function setBackwards(on: boolean): void {
    backwards = on;
    controls.showAction(
      "reverse",
      on ? "forward" : "rewind",
      on ? "Run time forwards" : "Run time backwards",
    );
  }

  /**
   * Time the other way: the chain and its twins keep their places and move
   * the opposite way, and so retrace their motion (decision 28). Not while
   * the hand holds the chain, whose damper would give energy backwards.
   */
  function reverseTime(): void {
    if (hand !== null) return;
    reverseMotion(state);
    twins.reverse();
    // the shake runs back too: its pivot keeps its place and moves the other
    // way, which is its phase turned over
    shakePhase = -shakePhase;
    // and so does the chain the screen shows while the next frame is
    // computed ahead (decision 51)
    reverseMotion(shown);
    shown.phase = -shown.phase;
    meter = new PeriodTension(chain.n);
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

  /** Each switch, on or off, by its id in the address (decision 38). */
  function switches(): Map<string, boolean> {
    return new Map([
      ["light", lit],
      ["tension", tensionShown],
      ["sketch", wholeFrame],
    ]);
  }

  /**
   * The moment as it is now goes into the address, with the screen around
   * it, and the chain starts there from now on (decisions 34 and 38): exactly
   * as the address holds it, seven digits to a number, so that the address
   * opened again starts the same.
   */
  function save(): void {
    // the chain the screen shows, while the next frame is computed ahead
    // (decision 51)
    const screen = ahead !== null && shown.theta.length === chain.n;
    const now: Saved = {
      state: screen ? shown : state,
      paused,
      backwards,
      phase: screen ? shown.phase : shakePhase,
      savedAt: Date.now(),
    };
    saved = openingOf("", addressOf(values, switches(), now, "")).saved;
    keepAddress();
    showStart();
  }

  /** The moment saved is forgotten, and leaves the address. */
  function forget(): void {
    if (saved === null) return;
    saved = null;
    keepAddress();
  }

  /** The page's title names the screen (decision 38). */
  function showTitle(): void {
    document.title = titleOf(NAME, values, switches(), saved);
  }

  /**
   * The address says what the screen is now: with a moment saved, its code
   * after the "#"; without, the values and the switches that differ from the
   * opening (decision 38). The title follows, the button says whether a
   * moment is kept, and an open QR code shows the new address (decision 40).
   */
  function keepAddress(): void {
    // the music's mode and strength stay in the readable part, outside the
    // saved moment's code (decision 46)
    const ids = MODES.map(({ id }) => id);
    const search = writeMusic(ids, location.search, tune.mode, tune.strength);
    const part = addressOf(values, switches(), saved, search);
    const tuned =
      saved === null ? "" : writeMusic(ids, "", tune.mode, tune.strength);
    history.replaceState(null, "", `${location.pathname}${tuned}${part}`);
    showTitle();
    showSave();
    card.update(location.href, document.title);
  }

  // The address shared, or shown as a QR code (decision 40), in the ground's
  // colours.
  const cardColors = {
    dark: cssColor(colors.ground),
    light: cssColor(colors.chain),
  };
  const card = mountLinkCard(cardColors);
  // What the piece listens to, and the card that shows it hearing (decision
  // 44), with what the music does and how strongly (decision 46).
  const music = mountMusicCard({
    modes: MODES,
    mode: tune.mode,
    strength: tune.strength,
    changed(mode, strength) {
      tune.mode = mode;
      tune.strength = strength;
      router = new Router(modeOf(mode), { slow: still.matches });
      keepAddress();
    },
  });

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
    tensionColor = tensionScale(colors.chain, tensionScaleAt(value(SCALE)));
    cardColors.dark = cssColor(colors.ground);
    cardColors.light = cssColor(colors.chain);
  }
  dress();
  let copiedTimer = 0;
  /** Shares the address as it is, with the title; where it was copied, the button and a word say so a moment. */
  async function share(): Promise<void> {
    const done = await shareLink(location.href, document.title);
    if (done === "copied") {
      card.say("Link copied");
      controls.showAction("share", "copied", "Link copied");
      clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => {
        controls.showAction("share", "share", "Share this page's address");
      }, COPIED_MS);
    } else if (done === "failed") {
      card.say("The link could not be copied");
    }
  }

  function showSave(): void {
    controls.showAction(
      "save",
      saved === null ? "save" : "saved",
      saved === null
        ? "Save this moment"
        : "Save this moment over the one saved",
    );
  }

  function step(parameter: Parameter, direction: 1 | -1): void {
    // the tension's colours, one control in the row, step the switch and the
    // scale the address keeps apart: off, then each scale (decision 53)
    if (parameter === TENSION) {
      const next = stepValue(TENSION, tensionAt(), direction);
      if (next !== TENSION.initial) {
        values.set(SCALE.id, next);
        tensionColor = tensionScale(colors.chain, tensionScaleAt(next));
      }
      setTensionShown(next !== TENSION.initial);
      showStart();
      keepAddress();
      return;
    }
    const before = value(parameter);
    // with a moment saved, the start's first step forgets it and goes back
    // to the start it had before, rather than to the next one
    const next =
      parameter === MODE && saved !== null
        ? before
        : stepValue(parameter, before, direction);
    values.set(parameter.id, next);
    // a moment saved belongs to a chain of so many masses, and choosing a
    // start, a mode or the amplitude of one, starts there instead
    const chooses =
      parameter === MODE || (parameter === AMPLITUDE && value(MODE) > 0);
    if (parameter === MASSES || chooses) forget();
    if (parameter === MASSES) setMasses(next);
    // the chain and its twins fall another way, or harder, from where they are
    if (parameter === GRAVITY || parameter === TILT) {
      g = gravityOf(value(GRAVITY), value(TILT));
    }
    // a new grip takes hold at once, where the hand is
    if (parameter === HAND && hand !== null) hand = holding(hand.index, hand);
    // another number of twins, another spread, or twins that fade or stay,
    // are born at once from the chain as it is, unless the hand holds it;
    // trails turned off go dark, to start afresh
    const twinsAgain =
      parameter === TWIN_COUNT || parameter === SPREAD || parameter === FADE;
    if (twinsAgain && hand === null) spawnTwins();
    if (parameter === TRAIL && next === 0) {
      trails.clear();
      trail.clear();
    }
    // leaving the step that leaves a mark puts the mark out (decision 42)
    if (parameter === TRAIL && before === MARK_STEP) trails.clearMark();
    // another mode, or another amplitude of one, starts the chain again in it
    if (chooses) start();
    // a pivot that starts to shake stands the chain on its head at once; a
    // shake that changes or stops leaves the chain where it is, and a chain
    // standing falls when it stops
    if (parameter === SHAKE) {
      meter = new PeriodTension(chain.n);
      if (before === 0 && next > 0) start();
    }
    // another palette colours the twins at once; the trails they left keep
    // their colours and fade
    if (parameter === PALETTE) paint();
    // another ground dresses the piece at once; another scale paints the
    // tension in it, and turns its colours on (decision 41)
    if (parameter === GROUND) dress();
    if (parameter === SCALE) {
      tensionColor = tensionScale(colors.chain, tensionScaleAt(next));
      if (!tensionShown) setTensionShown(true);
    }
    if (!lit && LIGHT_CONTROLS.has(parameter)) setLit(true);
    // the scale shows in the tension's colours, one control (decision 53)
    if (parameter === SCALE) controls.showValue(TENSION.id, tensionAt());
    else controls.showValue(parameter.id, next);
    showStart();
    showRibbon();
    keepAddress();
  }

  /** A switch turned the other way, which the address and the title follow (decision 38). */
  function toggle(id: "light" | "tension" | "sketch"): void {
    if (id === "light") setLit(!lit);
    else if (id === "tension") setTensionShown(!tensionShown);
    else {
      setWholeFrame(!wholeFrame);
      // its button in the screen's group says whether it is on (decision 54)
      controls.showAction(
        "sketch",
        wholeFrame ? "sketched" : "sketch",
        "The sketch's light",
        wholeFrame,
      );
    }
    keepAddress();
  }

  // The row of controls (decisions 31 and 54): the pause and the light,
  // which act on the whole piece, then the groups, each opening its own row:
  // time and where the chain starts, the chain, the twins, the trails, the
  // music's card, and the screen.
  const controls = mountControls(
    [
      [
        {
          id: "pause",
          label: "Pause",
          icon: "pause",
          keys: [" "],
          keysShown: "␣",
        },
        {
          id: "light",
          label: "Light",
          icon: "light",
          keys: ["l", "L"],
          keysShown: "L",
          pressed: lit,
        },
      ],
      [
        {
          id: "time",
          label: "Time and the start",
          icon: "hourglass",
          controls: [
            {
              id: "start",
              label: "Start again",
              icon: "raise",
              keys: ["r", "R"],
              keysShown: "R",
            },
            {
              id: "save",
              label: "Save this moment",
              icon: "save",
              keys: ["s", "S"],
              keysShown: "S",
            },
            MODE,
            AMPLITUDE,
            {
              id: "reverse",
              label: "Run time backwards",
              icon: "rewind",
              keys: ["b", "B"],
              keysShown: "B",
            },
            TIME,
          ],
        },
        {
          id: "chain",
          label: "The chain",
          icon: "masses",
          // the tension's colours, one control in place of the switch and
          // the scale (decision 53)
          controls: [MASSES, HAND, GRAVITY, TILT, SHAKE, TENSION],
        },
        {
          id: "twins",
          label: "The twins",
          icon: "fan",
          controls: [TWIN_COUNT, SPREAD, FADE, LOOK, PALETTE],
        },
        {
          id: "trails",
          label: "The trails",
          icon: "comet",
          controls: [TRAIL, STYLE, RIBBON],
        },
        {
          id: "music",
          label: "Music",
          icon: "music",
          keys: ["w", "W"],
          keysShown: "W",
        },
        {
          id: "screen",
          label: "The screen",
          icon: "frame",
          controls: [
            GROUND,
            {
              id: "sketch",
              label: "The sketch's light",
              icon: wholeFrame ? "sketched" : "sketch",
              keys: ["g", "G"],
              keysShown: "G",
              pressed: wholeFrame,
            },
            {
              id: "share",
              label: "Share this page's address",
              icon: "share",
              keys: ["h", "H"],
              keysShown: "H",
            },
            {
              id: "qr",
              label: "QR code of this page's address",
              icon: "qr",
              keys: ["o", "O"],
              keysShown: "O",
            },
          ],
        },
      ],
    ],
    {
      step,
      act(id) {
        if (id === "pause") setPaused(!paused);
        else if (id === "reverse") reverseTime();
        else if (id === "light" || id === "sketch") toggle(id);
        else if (id === "save") save();
        else if (id === "share") void share();
        else if (id === "qr") card.toggle(location.href, document.title);
        else if (id === "music") music.toggle();
        else start();
      },
    },
  );
  for (const parameter of PARAMETERS) {
    // the scale shows in the tension's colours, which the switch's turn shows
    if (parameter !== SCALE) controls.showValue(parameter.id, value(parameter));
  }
  showRibbon();
  // the switches as the address asks for them
  setLit(lit);
  setTensionShown(tensionShown);
  showSave();
  showTitle();
  // the button shows for a moment as the piece opens, so that it is found
  controls.wake();

  function world(event: PointerEvent): [number, number] {
    const box = canvas.getBoundingClientRect();
    return toWorld(
      event.clientX - box.left,
      event.clientY - box.top,
      box.width,
      box.height,
      fitScale(box.width, box.height, chain.totalLength),
    );
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (pointer.id !== -1) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const [px, py] = world(event);
    // Grabbing the chain sets it going again, if it was paused, forwards, and
    // ends its twins; letting it go gives it new ones.
    if (paused) setPaused(false);
    if (backwards) setBackwards(false);
    inMode = false;
    twins.clear();
    // the nearest mass, wherever the press lands
    hand = holding(chain.nearestMass(state.theta, px, py), {
      x: px,
      y: py,
      vx: 0,
      vy: 0,
    });
    Object.assign(pointer, {
      id: event.pointerId,
      x: px,
      y: py,
      vx: 0,
      vy: 0,
      at: event.timeStamp,
    });
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointer.id) {
      // a pointer moving over the stage, not holding the chain, wakes the controls
      if (event.pointerType === "mouse") controls.wake();
      return;
    }
    const [px, py] = world(event);
    const dt = Math.max(1e-3, (event.timeStamp - pointer.at) / 1000);
    // A smoothed velocity, so that the throw has the speed of the gesture.
    const blend = Math.min(1, dt / 0.03);
    pointer.vx += blend * ((px - pointer.x) / dt - pointer.vx);
    pointer.vy += blend * ((py - pointer.y) / dt - pointer.vy);
    pointer.x = px;
    pointer.y = py;
    pointer.at = event.timeStamp;
  });

  const letGo = (event: PointerEvent): void => {
    if (event.pointerId !== pointer.id) return;
    pointer.id = -1;
    hand = null;
    spawnTwins();
    // on a touch screen, lifting the finger is what wakes the controls
    if (event.pointerType !== "mouse") controls.wake();
  };
  canvas.addEventListener("pointerup", letGo);
  canvas.addEventListener("pointercancel", letGo);

  addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // A focused button takes its own Space and Enter.
    const onButton = event.target instanceof HTMLButtonElement;
    if (onButton && (event.key === " " || event.key === "Enter")) return;
    // a key held with Shift by where it is, or what a key types (decision 53)
    const action = keyAction(PARAMETERS, {
      key: event.key,
      code: event.code,
      shiftKey: event.shiftKey,
    });
    if (action !== null) {
      event.preventDefault();
      step(action.parameter, action.direction);
      // the value the key changed comes into sight, alone; the scale's in
      // the tension's colours
      controls.choose(
        action.parameter === SCALE ? TENSION.id : action.parameter.id,
      );
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      setPaused(!paused);
    } else if (event.key === "r" || event.key === "R") {
      start();
    } else if (event.key === "s" || event.key === "S") {
      save();
    } else if (event.key === "h" || event.key === "H") {
      void share();
    } else if (event.key === "o" || event.key === "O") {
      card.toggle(location.href, document.title);
    } else if (event.key === "b" || event.key === "B") {
      reverseTime();
    } else if (event.key === "l" || event.key === "L") {
      toggle("light");
    } else if (event.key === "t" || event.key === "T") {
      toggle("tension");
      controls.choose(TENSION.id);
    } else if (event.key === "g" || event.key === "G") {
      toggle("sketch");
    } else if (event.key === "w" || event.key === "W") {
      music.toggle();
    } else {
      return;
    }
    controls.wake();
  });

  /** Draws a frame; `simulated` seconds of motion went by since the last one. */
  function draw(simulated: number): void {
    const box = canvas.getBoundingClientRect();
    const ratio = box.width > 0 ? canvas.width / box.width : 1;
    const scale = fitScale(box.width, box.height, chain.totalLength) * ratio;
    const rodPixels = (chain.totalLength / chain.n) * (scale / ratio);

    // The twins, faint, so that many together read as one bright chain and
    // only the fringes of the fan show colour; while they fade, each in its
    // own light, and those gone dark not at all.
    fan.clear();
    dust.clear();
    const faint = Math.min(
      0.5,
      Math.max(0.05, 2.2 / Math.sqrt(Math.max(1, twins.count))),
    );
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
      const color = tinted(fanColors[j] ?? colors.chain, "twins");
      if (asDust) {
        const end = 2 * (report.pieces + 1) * (k + 1) - 2;
        const px = report.tips[end] ?? 0;
        const py = report.tips[end + 1] ?? 0;
        dust.push(px, py, px, py, color, speck * shine);
        return;
      }
      const { n, positions } = report;
      const base = 2 * n * k;
      if (positions.length < base + 2 * n) return;
      let tx = 0;
      let ty = 0;
      for (let i = 0; i < n; i++) {
        const bx = positions[base + 2 * i] ?? 0;
        const by = positions[base + 2 * i + 1] ?? 0;
        fan.push(tx, ty, bx, by, color, faint * shine);
        tx = bx;
        ty = by;
      }
    });

    chain.positions(state.theta, x, y);
    rods.clear();
    dots.clear();
    spring.clear();
    const chainColor = tinted(colors.chain, "chain");
    let ax = 0;
    let ay = 0;
    for (let i = 0; i < chain.n; i++) {
      const bx = x[i] ?? 0;
      const by = y[i] ?? 0;
      const color = tensionShown ? (rodColors[i] ?? colors.chain) : chainColor;
      rods.push(ax, ay, bx, by, color, 0.9);
      // the masses, while the rods are long enough to tell them apart, each
      // in the colour of the rod it hangs from
      if (rodPixels >= 12) dots.push(bx, by, bx, by, color, 1);
      ax = bx;
      ay = by;
    }
    if (hand !== null) {
      // How hard the hand pulls, in weights of the whole chain on Earth, eased
      // over a few frames so that a jittery pointer does not flicker: a hand
      // that lifts the chain on Earth pulls about one weight, one that whirls
      // it several. Under other gravity the same pull shows the same.
      chain.handForce(state.theta, state.omega, hand, pull);
      const weights =
        Math.hypot(pull[0] ?? 0, pull[1] ?? 0) / (chain.totalMass * EARTH);
      strength += 0.25 * (1 - Math.exp(-weights) - strength);
      // the spring between the held mass and the hand
      const hx = x[hand.index] ?? 0;
      const hy = y[hand.index] ?? 0;
      spring.push(hx, hy, hand.x, hand.y, colors.hand, 0.35 + 0.65 * strength);
      dots.push(
        hand.x,
        hand.y,
        hand.x,
        hand.y,
        colors.hand,
        0.6 + 0.4 * strength,
      );
    } else {
      strength = 0;
    }
    // the pivot, drawn as a streak along its line while it shakes
    const shaking = shakeAt(0);
    const sx = shaking === null ? 0 : PIVOT_STREAK * shaking.x;
    const sy = shaking === null ? 0 : PIVOT_STREAK * shaking.y;
    dots.push(-sx, -sy, sx, sy, colors.pivot, 0.8);

    // The trails fade by the time that went by and take this frame's pieces;
    // the step that leaves a mark keeps the brightest of them too (decision
    // 42).
    const trailStep = lit ? value(TRAIL) : 0;
    const { halfLife, mark } = trailFade(trailStep);
    if (simulated > 0 && trailStep > 0) {
      // they last longer as the music asks (decision 49)
      trails.begin(fadeAfter(simulated, halfLife * (1 + look.linger)));
      lines.draw(trail, scale, { radius: 0.9 * ratio, roundEnds: false });
      trails.end();
      if (mark) {
        trails.beginMark();
        lines.draw(trail, scale, {
          radius: 0.9 * ratio,
          roundEnds: false,
          keep: true,
        });
        trails.end();
      }
    }
    if (wholeFrame) {
      // the frame's lines, then all of it through the curve
      scene.bind(true);
      drawLines(scale, ratio, rodPixels);
      scene.unbind();
      lines.clear(colors.ground);
      trails.show(scene, mark);
    } else {
      // the trails through the curve, under the chains
      lines.clear(colors.ground);
      if (trailStep > 0) trails.show(undefined, mark);
      drawLines(scale, ratio, rodPixels);
    }
  }

  /** The frame's lines: the twins, the chain, the hand's spring and the dots. */
  function drawLines(scale: number, ratio: number, rodPixels: number): void {
    lines.draw(fan, scale, {
      radius: 0.7 * ratio,
      roundEnds: chain.n <= 64,
    });
    // the twins as dust, each point swelling as the music lights the halo
    // (decision 50)
    const pulse = Math.min(1, look.glow);
    lines.draw(dust, scale, {
      radius: DUST_RADIUS * (1 + pulse) * ratio,
      roundEnds: true,
      halo: 3 * ratio,
      haloGain: 0.2 + 0.4 * pulse,
    });
    // Past 64 rods the ends are cut flat, so that rods laid end to end make
    // one even line instead of beads where their round ends overlap.
    // the halo widens and brightens as the music lights it (decision 46)
    const glow = Math.min(GLOW_MOST, look.glow);
    lines.draw(rods, scale, {
      radius: (chain.n > 64 ? 1.0 : 1.3) * ratio,
      roundEnds: chain.n <= 64,
      halo: (5 + GLOW_RADIUS * glow) * ratio,
      haloGain: 0.22 + GLOW_GAIN * glow,
    });
    lines.draw(spring, scale, {
      radius: (0.8 + 1.4 * strength) * ratio,
      roundEnds: true,
      halo: 5 * ratio,
      haloGain: 0.2 + 0.3 * strength,
    });
    lines.draw(dots, scale, {
      radius: Math.min(4.5, Math.max(2, 0.2 * rodPixels)) * ratio,
      roundEnds: true,
      halo: 6 * ratio,
      haloGain: 0.25,
    });
  }

  /**
   * The chain's motion over a frame of dt seconds, in pieces that each end
   * in a point of its trails (decision 21), with a strobe's flashes
   * (decision 50), the valve that shows time slowed (decision 15) and the
   * colour of its tension (decision 35): the time it simulated, and whether
   * a strobe flashed. The music flashes the strobe on its kicks when
   * `flashes`.
   */
  function advanceChain(
    dt: number,
    now: number,
    flashes: boolean,
  ): { simulated: number; flashed: boolean } {
    let simulated = 0;
    if (tensionShown) frameTension.fill(0);
    if (hand !== null) {
      if (now - pointer.at > STILL_AFTER_MS) {
        pointer.vx = 0;
        pointer.vy = 0;
      }
      hand.x = pointer.x;
      hand.y = pointer.y;
      hand.vx = pointer.vx;
      hand.vy = pointer.vy;
    }
    // The chain moves in pieces, each ending in a point of its trail.
    const asked = dt * value(TIME);
    const deadline = performance.now() + PHYSICS_BUDGET_MS;
    const pieces = Math.min(16, Math.max(4, Math.ceil(asked * TRAIL_RATE)));
    // The tip draws, and with the ribbon every mass does (decision 26), the
    // others fainter the more there are, so that the ribbon stays light.
    const firstDrawing = value(RIBBON) === 1 ? 0 : chain.n - 1;
    const chainColor = tinted(colors.chain, "chain");
    // a strobe's trails stamp the whole chain instead (decision 50)
    const strobe = lit && value(TRAIL) > 0 && value(STYLE) === 1;
    let flashed = false;
    const ribbonLight = 0.55 * Math.min(1, 2.2 / Math.sqrt(chain.n));
    for (let piece = 0; piece < pieces; piece++) {
      const want = asked / pieces;
      const shake = shakeAt(shakePhase);
      const moved = stepper.advance(state, want, g, {
        hand,
        deadline,
        meanTension: tensionShown && shake === null ? pieceTension : null,
        shake,
        periodTension: tensionShown ? meter : null,
      });
      simulated += moved.simulated;
      if (shake !== null) {
        shakePhase =
          (shakePhase + shake.rate * moved.simulated) % (2 * Math.PI);
      }
      if (tensionShown && shake === null) {
        for (let i = 0; i < chain.n; i++) {
          frameTension[i] =
            (frameTension[i] ?? 0) + moved.simulated * (pieceTension[i] ?? 0);
        }
      }
      chain.positions(state.theta, x, y);
      for (let i = 0; i < chain.n; i++) {
        const bx = x[i] ?? 0;
        const by = y[i] ?? 0;
        if (i >= firstDrawing && !strobe) {
          const light = i === chain.n - 1 ? 0.55 : ribbonLight;
          const ax = ends[2 * i] ?? bx;
          const ay = ends[2 * i + 1] ?? by;
          // with the tension's colours, in the colour of the rod it hangs from
          const color = tensionShown
            ? (rodColors[i] ?? colors.chain)
            : chainColor;
          trailPiece(ax, ay, bx, by, color, light);
        }
        ends[2 * i] = bx;
        ends[2 * i + 1] = by;
      }
      // at even times of the motion, unless the music flashes the strobe
      if (strobe && !flashes) {
        strobeClock += moved.simulated;
        if (strobeClock >= 1 / STROBE_RATE) {
          strobeClock %= 1 / STROBE_RATE;
          stamp(chainColor);
          flashed = true;
        }
      }
      // out of time: the rest of the frame is slow motion (decision 15)
      if (moved.simulated < want * 0.999) break;
    }
    // on a kick, while the music flashes the strobe
    if (strobe && flashes && look.flash > 0) {
      stamp(chainColor);
      flashed = true;
    }
    const finite =
      state.theta.every(Number.isFinite) && state.omega.every(Number.isFinite);
    if (!finite) start();

    // The valve: when the machine keeps time below the speed asked for,
    // the time control shows the speed reached, and comes into sight
    // unless the visitor is reading another value in the open row.
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
    easeTension(simulated);
    return { simulated, flashed };
  }

  /**
   * Each rod's colour eases toward its tension (decision 35): over whole
   * periods of a shaking pivot, over the motion of `simulated` seconds, or
   * of the instant when none went by.
   */
  function easeTension(simulated: number): void {
    if (!tensionShown) return;
    if (value(SHAKE) > 0) {
      // over whole periods of the shake, where its swing averages out; until
      // one has closed, the colours wait
      if (meter.closed) shades.ease(meter.mean, weights, TENSION_EASE);
    } else {
      // the tension over the frame's motion, or of the instant when none
      if (simulated > 0) {
        for (let i = 0; i < chain.n; i++) {
          frameTension[i] = (frameTension[i] ?? 0) / simulated;
        }
      } else {
        chain.solve(
          state.theta,
          state.omega,
          g,
          tensionScratch,
          frameTension,
          hand,
        );
      }
      shades.ease(frameTension, weights, TENSION_EASE);
    }
    for (let i = 0; i < chain.n; i++) {
      rodColors[i] = tensionColor(shades.places[i] ?? 0);
    }
  }

  /**
   * Sends the twins' workers the frame just computed (decision 51): the
   * time it simulated, in pieces for their trails, shaken as the chain was
   * from where the shake stood as it began (decision 36); where the chain is
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
    const rate = 2 * Math.PI * value(SHAKE);
    const shakes = Array.from({ length: pieces }, (_, piece) =>
      shakeAt(phase + (rate * piece * simulated) / pieces),
    );
    let at: Float64Array | null = null;
    if (value(FADE) === 1) {
      chain.positions(state.theta, x, y);
      at = new Float64Array(2 * chain.n);
      at.set(x);
      at.set(y, chain.n);
    }
    const free = workerBudget(
      rhythm.free(performance.now() - now, TWIN_MARGIN_MS),
      twins.shares,
      rhythm.late,
      { least: TWIN_LEAST_MS, most: TWIN_MOST_MS, floor: TWIN_LOCAL_MS },
    );
    twinBudget += 0.1 * (free - twinBudget);
    twins.setBudget(twins.local ? TWIN_LOCAL_MS : twinBudget);
    twins.send({
      time: simulated,
      pieces,
      g,
      shakes,
      chain: at,
      whole: value(LOOK) !== 1,
      budget: twins.local ? TWIN_LOCAL_MS : twinBudget,
    });
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
    // their tips draw lines, save as dust, which draws none, and under a
    // strobe, whose flashes stamp them as points
    const strobe = lit && value(TRAIL) > 0 && value(STYLE) === 1;
    const tipLines = !strobe && value(LOOK) !== 1;
    const music = 1 + Math.min(TRAIL_MOST, look.trail);
    twins.take((j, report, k) => {
      const color = tinted(fanColors[j] ?? colors.chain, "twins");
      const shine = fades ? (fading.light[j] ?? 1) : 1;
      const { pieces, tips } = report;
      const at = 2 * (pieces + 1) * k;
      if (tipLines) {
        for (let piece = 0; piece < pieces; piece++) {
          const from = at + 2 * piece;
          trailPiece(
            tips[from] ?? 0,
            tips[from + 1] ?? 0,
            tips[from + 2] ?? 0,
            tips[from + 3] ?? 0,
            color,
            light * shine,
          );
        }
      }
      if (flashed && pieces > 0) {
        const px = tips[at + 2 * pieces] ?? 0;
        const py = tips[at + 2 * pieces + 1] ?? 0;
        trail.push(px, py, px, py, color, 2 * light * shine * music);
      }
      if (fades && k < report.apart.length) {
        fading.see(j, report.apart[k] ?? 0, FADE_REACH);
      }
    });
  }

  let last = performance.now();
  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(LONGEST_FRAME, Math.max(0, (now - last) / 1000));
    const real = Math.min(0.25, Math.max(0, (now - last) / 1000));
    rhythm.frame(now - last);
    last = now;
    // what the music says this frame, which the card's meter shows, paused
    // or not, and what it adds to the light, in real time (decision 46)
    const heard = music.hear();
    look = router.look(heard, real, tune.strength);
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
      trail.clear();
      // The chain alone, now: the hand holds it, or no twins move with it.
      // Twins that do wait a frame, and the chain with them (decision 51).
      if (running && twins.count === 0) {
        ({ simulated, flashed } = advanceChain(dt, now, flashes));
      } else {
        easeTension(0);
      }
    }
    takeTwins(flashed);
    draw(simulated);

    // Twins are born once the frame is drawn, of the chain as it is then:
    // those asked for, those gone dark, and the music's (decisions 43, 46).
    if (spawnPending) {
      if (hand === null) bearTwins();
    } else if (simulated > 0 && lit && hand === null) {
      if (value(FADE) === 1) bearAgain();
      if (look.births > 0) bornOnBeat(look.births);
    }
    showTwins();

    // The next frame is computed now while there are twins: their workers
    // bring them back by then, and the two are drawn at one instant
    // (decision 51).
    if (running && twins.count > 0 && hand === null) {
      keepShown();
      const phase = shakePhase;
      trail.clear();
      const next = advanceChain(dt, now, flashes);
      // unless the motion broke down, and the chain started again
      if (twins.count > 0) {
        sendTwins(next.simulated, phase, now);
        ahead = next;
      }
    }
    // what happened to the twins while time stands, sent alone
    if (twins.pending) sendTwins(0, shakePhase, now);
  }

  start();
  // a moment saved paused opens paused, as it was
  if (saved?.paused === true) setPaused(true);
  requestAnimationFrame(frame);
}
