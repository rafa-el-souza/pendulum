import "../styles/base.css";

import { tokenColor } from "../core/color.ts";
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
import { fitScale, toWorld } from "../core/view.ts";
import { Chain, createHand, type Hand } from "../physics/chain.ts";
import { resample } from "../physics/resample.ts";
import { Stepper, restingState } from "../physics/step.ts";
import { HAND, MASSES, PARAMETERS, TIME, handDamping } from "./parameters.ts";

// The first piece (docs/decisions.md, decision 4): one chain pendulum to grab
// and throw, whose number of masses changes while it moves, under a time that
// runs as fast as the visitor asks and the machine allows (decision 15), held
// by a hand from elastic to firm (decision 18). The twins and the trail come
// in later slices.

const G = 9.81;
// A frame longer than this (a hidden tab, a stall) moves the chain by this
// much only, so that it never jumps.
const LONGEST_FRAME = 1 / 30;
// A pointer that has sent no move for this long has stopped moving.
const STILL_AFTER_MS = 60;
// The physics of one frame may take this long; past it, time runs slower
// than asked, and the time control shows how much (decision 15).
const PHYSICS_BUDGET_MS = 6;

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
  const dots = new SegmentBatch(chain.n + 2);
  // the hand's spring, drawn stronger the harder the hand pulls
  const spring = new SegmentBatch(1);
  const pull = new Float64Array(2);
  let strength = 0;
  let x = new Float64Array(chain.n);
  let y = new Float64Array(chain.n);

  let hand: Hand | null = null;
  let paused = false;
  // the speed time actually ran at lately, as a share of the speed asked for
  let reached = 1;
  const pointer = { id: -1, x: 0, y: 0, vx: 0, vy: 0, at: 0 };

  /** Raised to one side and let go from rest: with two masses or more, a chaotic start. */
  function raise(): void {
    for (let i = 0; i < chain.n; i++) {
      state.theta[i] = 2.2 + (0.7 * i) / Math.max(1, chain.n - 1);
      state.omega[i] = 0;
    }
    hand = null;
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
    if (hand !== null) {
      const along = (hand.index + 1) / before.n;
      const index = Math.min(n - 1, Math.max(0, Math.round(along * n) - 1));
      hand = holding(index, hand);
    }
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
    // Grabbing the chain sets it going again, if it was paused.
    if (paused) setPaused(false);
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

  function draw(): void {
    const box = canvas.getBoundingClientRect();
    const ratio = box.width > 0 ? canvas.width / box.width : 1;
    const scale = fitScale(box.width, box.height, chain.totalLength) * ratio;
    const rodPixels = (chain.totalLength / chain.n) * (scale / ratio);

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

    lines.clear(colors.ground);
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
      const asked = dt * value(TIME);
      const { simulated } = stepper.advance(
        state,
        asked,
        G,
        hand,
        performance.now() + PHYSICS_BUDGET_MS,
      );
      const finite =
        state.theta.every(Number.isFinite) &&
        state.omega.every(Number.isFinite);
      if (!finite) raise();

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
    draw();
  }

  raise();
  requestAnimationFrame(frame);
}
