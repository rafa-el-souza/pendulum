import "../styles/base.css";

import { fanColor, tokenColor, type Rgb } from "../core/color.ts";
import { mountControls } from "../core/controls.ts";
import { Lines, SegmentBatch } from "../core/lines.ts";
import {
  keyAction,
  readAddress,
  stepValue,
  writeAddress,
  type Parameter,
} from "../core/parameters.ts";
import { mountStage, type Stage } from "../core/stage.ts";
import { Trails, fadeAfter } from "../core/trails.ts";
import { TwinBudget, bornTwins, fanPlace } from "../core/twins.ts";
import { fitScale, toWorld } from "../core/view.ts";
import { Chain, createHand, type Hand } from "../physics/chain.ts";
import { resample } from "../physics/resample.ts";
import { Stepper, restingState, type ChainState } from "../physics/step.ts";
import {
  HAND,
  MASSES,
  PARAMETERS,
  TIME,
  TRAIL,
  TWIN_COUNT,
  handDamping,
} from "./parameters.ts";

// The first piece (docs/decisions.md, decision 4): one chain pendulum to grab
// and throw, whose number of masses changes while it moves, under a time that
// runs as fast as the visitor asks and the machine allows (decision 15), held
// by a hand from elastic to firm (decision 18), with twins born a hair apart
// that fan out to show chaos (decision 20), and trails of light behind the
// tips of the chain and of its twins (decision 21).

const G = 9.81;
// A frame longer than this (a hidden tab, a stall) moves the chain by this
// much only, so that it never jumps.
const LONGEST_FRAME = 1 / 30;
// A pointer that has sent no move for this long has stopped moving.
const STILL_AFTER_MS = 60;
// The physics of one frame may take this long; past it, time runs slower
// than asked, and the time control shows how much (decision 15).
const PHYSICS_BUDGET_MS = 6;
// The twins (decision 20): how far apart the first and the last are born, in
// radians, the time they may take in a frame, and their longest substep,
// coarser than the chain's. How many are wanted is a control (decision 22);
// those the budget cannot carry are dropped, and time never slows for them.
const TWIN_SPREAD = 1e-3;
const TWIN_BUDGET_MS = 4;
const TWIN_STEP = 1 / 240;
// The trails (decision 21): a frame's motion is drawn in this many pieces to
// the simulated second, so that a fast tip draws a curve. A tip that moves
// farther than TRAIL_JUMP metres in one piece has jumped (raised again, or
// given other masses), and leaves no trail across the jump. How long they
// last is a control (decision 22).
const TRAIL_RATE = 480;
const TWIN_TRAIL_RATE = 240;
const TRAIL_JUMP = 0.5;

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
  const values = readAddress(PARAMETERS, location.search);
  const value = (p: Parameter): number => values.get(p.id) ?? p.initial;

  let chain = Chain.uniform(value(MASSES));
  let state = restingState(chain.n);
  let stepper = new Stepper(chain);
  const lines = new Lines(gl);
  const colors = {
    ground: tokenColor("--color-ground"),
    chain: tokenColor("--color-chain"),
    hand: tokenColor("--color-hand"),
    pivot: tokenColor("--color-pivot"),
  };
  const rods = new SegmentBatch(chain.n);
  // the twins, and the colour of each by its place in the fan
  let twins: ChainState[] = [];
  let twinStepper = new Stepper(chain, { maxStep: TWIN_STEP });
  // a first guess of a twin's cost, which the measured cost replaces in a few frames
  const twinBudget = new TwinBudget(
    TWIN_BUDGET_MS,
    0.002 * (chain.n / 2) ** 1.5,
  );
  const mostTwins = Math.max(...TWIN_COUNT.values);
  const fanColors = Array.from({ length: mostTwins }, (_, j) =>
    fanColor(fanPlace(j)),
  );
  const fan = new SegmentBatch(value(TWIN_COUNT) * chain.n);
  const dots = new SegmentBatch(chain.n + 2);
  // the hand's spring, drawn stronger the harder the hand pulls
  const spring = new SegmentBatch(1);
  const pull = new Float64Array(2);
  let strength = 0;
  let x = new Float64Array(chain.n);
  let y = new Float64Array(chain.n);
  let twinX = new Float64Array(chain.n);
  let twinY = new Float64Array(chain.n);
  // the trails, the pieces drawn into them this frame, and where each ends
  const trails = new Trails(gl);
  const trail = new SegmentBatch(4096);
  const tipAt = new Float64Array(2);
  let tipX = 0;
  let tipY = 0;
  let twinTips = new Float64Array(0);

  let hand: Hand | null = null;
  let paused = false;
  // the speed time actually ran at lately, as a share of the speed asked for
  let reached = 1;
  const pointer = { id: -1, x: 0, y: 0, vx: 0, vy: 0, at: 0 };

  /** Where the tip of a chain at these angles is, written to tipAt. */
  function tip(theta: Float64Array): void {
    let px = 0;
    let py = 0;
    for (let i = 0; i < chain.n; i++) {
      const l = chain.lengths[i] ?? 0;
      px += l * Math.sin(theta[i] ?? 0);
      py -= l * Math.cos(theta[i] ?? 0);
    }
    tipAt[0] = px;
    tipAt[1] = py;
  }

  /** The trails go on from where the tips are now. */
  function resetTrailEnds(): void {
    tip(state.theta);
    tipX = tipAt[0] ?? 0;
    tipY = tipAt[1] ?? 0;
    twinTips = new Float64Array(2 * twins.length);
    twins.forEach((twin, j) => {
      tip(twin.theta);
      twinTips[2 * j] = tipAt[0] ?? 0;
      twinTips[2 * j + 1] = tipAt[1] ?? 0;
    });
  }

  /** A piece of trail from (ax, ay) to where the tip is now, unless the tip jumped. */
  function trailTo(ax: number, ay: number, color: Rgb, light: number): void {
    if (value(TRAIL) === 0) return;
    const bx = tipAt[0] ?? 0;
    const by = tipAt[1] ?? 0;
    if (Math.hypot(bx - ax, by - ay) < TRAIL_JUMP) {
      trail.push(ax, ay, bx, by, color, light);
    }
  }

  /** The twins' control: the number asked for, or the fewer the budget carries, in the tone of a value held back. */
  function showTwins(): void {
    const asked = value(TWIN_COUNT);
    if (hand === null && twins.length < asked) {
      controls.showValue(TWIN_COUNT.id, asked, twins.length);
    } else {
      controls.showValue(TWIN_COUNT.id, asked);
    }
  }

  /** Twins of the chain as it is now, as many as their budget carries. */
  function spawnTwins(): void {
    twins = bornTwins(
      state,
      Math.min(value(TWIN_COUNT), twinBudget.affordable()),
      TWIN_SPREAD,
    );
    resetTrailEnds();
  }

  /** Raised to one side and let go from rest: with two masses or more, a chaotic start. */
  function raise(): void {
    for (let i = 0; i < chain.n; i++) {
      state.theta[i] = 2.2 + (0.7 * i) / Math.max(1, chain.n - 1);
      state.omega[i] = 0;
    }
    hand = null;
    trails.clear();
    spawnTwins();
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
    twinX = new Float64Array(n);
    twinY = new Float64Array(n);
    if (hand !== null) {
      const along = (hand.index + 1) / before.n;
      const index = Math.min(n - 1, Math.max(0, Math.round(along * n) - 1));
      hand = holding(index, hand);
    }
    // The twins move to the new number too, as many as it carries; back at a
    // number that carries many more than are left, they are born again.
    twinStepper = new Stepper(chain, { maxStep: TWIN_STEP });
    twinBudget.rescale(before.n, n);
    twins = twins
      .slice(0, twinBudget.affordable())
      .map((twin) => resample(before, twin, n).state);
    const carried = Math.min(value(TWIN_COUNT), twinBudget.affordable());
    if (hand === null && twins.length < 0.5 * carried) spawnTwins();
    resetTrailEnds();
  }

  function setPaused(value: boolean): void {
    paused = value;
    controls.showAction(
      "pause",
      paused ? "play" : "pause",
      paused ? "Resume" : "Pause",
    );
  }

  function step(parameter: Parameter, direction: 1 | -1): void {
    const next = stepValue(parameter, value(parameter), direction);
    values.set(parameter.id, next);
    if (parameter === MASSES) setMasses(next);
    // a new grip takes hold at once, where the hand is
    if (parameter === HAND && hand !== null) hand = holding(hand.index, hand);
    // another number of twins is born at once from the chain as it is, unless
    // the hand holds it; trails turned off go dark, to start afresh
    if (parameter === TWIN_COUNT && hand === null) spawnTwins();
    if (parameter === TRAIL && next === 0) trails.clear();
    controls.showValue(parameter.id, next);
    const search = writeAddress(PARAMETERS, values, location.search);
    history.replaceState(
      null,
      "",
      `${location.pathname}${search}${location.hash}`,
    );
  }

  const controls = mountControls(
    PARAMETERS,
    [
      {
        id: "pause",
        label: "Pause",
        icon: "pause",
        keys: [" "],
        keysShown: "␣",
      },
      {
        id: "raise",
        label: "Raise the chain again",
        icon: "raise",
        keys: ["r", "R"],
        keysShown: "R",
      },
    ],
    {
      step,
      act(id) {
        if (id === "pause") setPaused(!paused);
        else raise();
      },
    },
  );
  for (const parameter of PARAMETERS) {
    controls.showValue(parameter.id, value(parameter));
  }

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
    // Grabbing the chain sets it going again, if it was paused, and ends its
    // twins; letting it go gives it new ones.
    if (paused) setPaused(false);
    twins = [];
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
    const action = keyAction(PARAMETERS, event.key);
    if (action !== null) {
      event.preventDefault();
      step(action.parameter, action.direction);
    } else if (event.key === " ") {
      event.preventDefault();
      setPaused(!paused);
    } else if (event.key === "r" || event.key === "R") {
      raise();
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
    // only the fringes of the fan show colour.
    fan.clear();
    const faint = Math.min(
      0.5,
      Math.max(0.05, 2.2 / Math.sqrt(Math.max(1, twins.length))),
    );
    twins.forEach((twin, j) => {
      chain.positions(twin.theta, twinX, twinY);
      const color = fanColors[j] ?? colors.chain;
      let tx = 0;
      let ty = 0;
      for (let i = 0; i < chain.n; i++) {
        const bx = twinX[i] ?? 0;
        const by = twinY[i] ?? 0;
        fan.push(tx, ty, bx, by, color, faint);
        tx = bx;
        ty = by;
      }
    });

    chain.positions(state.theta, x, y);
    rods.clear();
    dots.clear();
    spring.clear();
    let ax = 0;
    let ay = 0;
    for (let i = 0; i < chain.n; i++) {
      const bx = x[i] ?? 0;
      const by = y[i] ?? 0;
      rods.push(ax, ay, bx, by, colors.chain, 0.9);
      // the masses, while the rods are long enough to tell them apart
      if (rodPixels >= 12) dots.push(bx, by, bx, by, colors.chain, 1);
      ax = bx;
      ay = by;
    }
    if (hand !== null) {
      // How hard the hand pulls, in weights of the whole chain, eased over a
      // few frames so that a jittery pointer does not flicker: a hand that
      // lifts the chain pulls about one weight, one that whirls it several.
      chain.handForce(state.theta, state.omega, hand, pull);
      const weights =
        Math.hypot(pull[0] ?? 0, pull[1] ?? 0) / (chain.totalMass * G);
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
    dots.push(0, 0, 0, 0, colors.pivot, 0.8);

    // The trails fade by the time that went by, take this frame's pieces, and
    // are shown first, under the chains.
    const halfLife = value(TRAIL);
    if (simulated > 0 && halfLife > 0) {
      trails.begin(fadeAfter(simulated, halfLife));
      lines.draw(trail, scale, { radius: 0.9 * ratio, roundEnds: false });
      trails.end();
    }
    lines.clear(colors.ground);
    if (halfLife > 0) trails.show();
    lines.draw(fan, scale, {
      radius: 0.7 * ratio,
      roundEnds: chain.n <= 64,
    });
    // Past 64 rods the ends are cut flat, so that rods laid end to end make
    // one even line instead of beads where their round ends overlap.
    lines.draw(rods, scale, {
      radius: (chain.n > 64 ? 1.0 : 1.3) * ratio,
      roundEnds: chain.n <= 64,
      halo: 5 * ratio,
      haloGain: 0.22,
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

  let last = performance.now();
  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(LONGEST_FRAME, Math.max(0, (now - last) / 1000));
    last = now;
    trail.clear();
    let simulated = 0;
    if (!paused && dt > 0) {
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
      for (let piece = 0; piece < pieces; piece++) {
        const want = asked / pieces;
        const moved = stepper.advance(state, want, G, hand, deadline);
        simulated += moved.simulated;
        tip(state.theta);
        trailTo(tipX, tipY, colors.chain, 0.55);
        tipX = tipAt[0] ?? 0;
        tipY = tipAt[1] ?? 0;
        // out of time: the rest of the frame is slow motion (decision 15)
        if (moved.simulated < want * 0.999) break;
      }
      const finite =
        state.theta.every(Number.isFinite) &&
        state.omega.every(Number.isFinite);
      if (!finite) raise();

      // The twins live the same simulated time, within their own budget: the
      // ones a frame does not reach, or that the budget cannot carry, are
      // dropped, and time never slows for them (decision 20).
      if (twins.length > 0 && simulated > 0) {
        const start = performance.now();
        const giveUp = start + 4 * TWIN_BUDGET_MS;
        // faint, so that where many twins' trails run together they read as one
        const light = Math.min(
          0.35,
          Math.max(0.03, 1.2 / Math.sqrt(twins.length)),
        );
        // in one piece when there are no trails to draw
        const twinPieces =
          value(TRAIL) === 0
            ? 1
            : Math.min(8, Math.max(1, Math.ceil(simulated * TWIN_TRAIL_RATE)));
        let done = 0;
        for (const twin of twins) {
          if ((done & 7) === 0 && performance.now() > giveUp) break;
          const color = fanColors[done] ?? colors.chain;
          for (let piece = 0; piece < twinPieces; piece++) {
            twinStepper.advance(twin, simulated / twinPieces, G);
            tip(twin.theta);
            trailTo(
              twinTips[2 * done] ?? 0,
              twinTips[2 * done + 1] ?? 0,
              color,
              light,
            );
            twinTips[2 * done] = tipAt[0] ?? 0;
            twinTips[2 * done + 1] = tipAt[1] ?? 0;
          }
          done++;
        }
        twins.length = twinBudget.measured(
          done,
          twins.length,
          performance.now() - start,
        );
      }
      showTwins();

      // The valve: when the machine keeps time below the speed asked for,
      // the time control shows the speed reached, and comes into sight.
      const wasHeld = reached < 0.97;
      reached += 0.1 * (simulated / asked - reached);
      const held = reached < 0.97;
      const speed = value(TIME);
      if (held) {
        controls.showValue(
          TIME.id,
          speed,
          Math.round(speed * reached * 100) / 100,
        );
        if (!wasHeld) controls.wake();
      } else if (wasHeld) {
        controls.showValue(TIME.id, speed);
      }
    }
    draw(simulated);
  }

  raise();
  requestAnimationFrame(frame);
}
