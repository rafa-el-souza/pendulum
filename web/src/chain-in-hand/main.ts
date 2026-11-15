import "../styles/base.css";

import { tokenColor } from "../core/color.ts";
import { Lines, SegmentBatch } from "../core/lines.ts";
import { mountStage, type Stage } from "../core/stage.ts";
import { fitScale, toWorld } from "../core/view.ts";
import { Chain, createHand, type Hand } from "../physics/chain.ts";
import { Stepper, restingState } from "../physics/step.ts";

// The first piece (docs/decisions.md, decision 4): one chain pendulum to grab
// and throw. For now it has two masses, the number the sketch it was chosen
// from started with; changing the number while it moves, the twins and the
// trail come in later slices.

const G = 9.81;
const MASSES = 2;
// A frame longer than this (a hidden tab, a stall) moves the chain by this
// much only, so that it never jumps.
const LONGEST_FRAME = 1 / 30;
// A pointer that has sent no move for this long has stopped moving.
const STILL_AFTER_MS = 60;

const canvas = document.getElementById("stage");
const notice = document.getElementById("notice");
if (!(canvas instanceof HTMLCanvasElement) || notice === null) {
  throw new Error("the page lacks its #stage canvas or its #notice");
}
const stage = mountStage(canvas, notice);
if (stage !== null) play(stage);

function play({ canvas, gl }: Stage): void {
  const chain = Chain.uniform(MASSES);
  const state = restingState(chain.n);
  const stepper = new Stepper(chain);
  const lines = new Lines(gl);
  const colors = {
    ground: tokenColor("--color-ground"),
    chain: tokenColor("--color-chain"),
    hand: tokenColor("--color-hand"),
    pivot: tokenColor("--color-pivot"),
  };
  const rods = new SegmentBatch(chain.n + 1);
  const dots = new SegmentBatch(chain.n + 2);
  const x = new Float64Array(chain.n);
  const y = new Float64Array(chain.n);

  let hand: Hand | null = null;
  let paused = false;
  const pointer = { id: -1, x: 0, y: 0, vx: 0, vy: 0, at: 0 };

  /** Raised to one side and let go from rest: with two masses or more, a chaotic start. */
  function raise(): void {
    for (let i = 0; i < chain.n; i++) {
      state.theta[i] = 2.2 + (0.7 * i) / Math.max(1, chain.n - 1);
      state.omega[i] = 0;
    }
    hand = null;
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
    // the nearest mass, wherever the press lands
    hand = createHand(chain, chain.nearestMass(state.theta, px, py));
    hand.x = px;
    hand.y = py;
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
    if (event.pointerId !== pointer.id) return;
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
  };
  canvas.addEventListener("pointerup", letGo);
  canvas.addEventListener("pointercancel", letGo);

  // The keyboard: space pauses and resumes, R raises the chain again.
  addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === " ") {
      event.preventDefault();
      paused = !paused;
    } else if (event.key === "r" || event.key === "R") {
      raise();
    }
  });

  function draw(): void {
    const box = canvas.getBoundingClientRect();
    const ratio = box.width > 0 ? canvas.width / box.width : 1;
    const scale = fitScale(box.width, box.height, chain.totalLength) * ratio;
    const rodPixels = (chain.totalLength / chain.n) * (scale / ratio);

    chain.positions(state.theta, x, y);
    rods.clear();
    dots.clear();
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
      // the spring between the held mass and the hand
      const hx = x[hand.index] ?? 0;
      const hy = y[hand.index] ?? 0;
      rods.push(hx, hy, hand.x, hand.y, colors.hand, 0.7);
      dots.push(hand.x, hand.y, hand.x, hand.y, colors.hand, 0.9);
    }
    dots.push(0, 0, 0, 0, colors.pivot, 0.8);

    lines.clear(colors.ground);
    lines.draw(rods, scale, {
      radius: 1.3 * ratio,
      roundEnds: true,
      halo: 5 * ratio,
      haloGain: 0.22,
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
      stepper.advance(state, dt, G, hand);
      const finite =
        state.theta.every(Number.isFinite) &&
        state.omega.every(Number.isFinite);
      if (!finite) raise();
    }
    draw();
  }

  raise();
  requestAnimationFrame(frame);
}
