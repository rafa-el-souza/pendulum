import { createHand } from "../../physics/chain.ts";
import type { Point } from "../../physics/drive.ts";
import { handDamping } from "../parameters.ts";
import {
  DRAG_SILENT,
  TAKE_HOLD,
  along,
  type ForceFrame,
  type MusicForce,
  type Part,
  type Reading,
} from "./common.ts";
import { Swing } from "./swing.ts";

// The dancing hand (docs/decisions.md, decision 75): a hand of the music
// holds the tip, its target on the arc the tip reaches, crossing to the other
// side on each kick, as far as the loudness. It lets go while the visitor's
// hand holds the chain, and takes hold again over a second.

/** The dancing hand's grip, a step of the visitor's (decision 18): elastic enough to swing the chain, firm enough to calm it. */
export const DANCE_GRIP = 12;
/** How long the hand's target takes to cross to the other side, in s of real time. */
export const CROSS = 0.12;
/** How fast the hand's swing follows the loudness, in s. */
const SWING_EASE = 0.15;

/** The point `reach` m from the pivot, `angle` rad from straight down towards the side. */
function onArc(angle: number, reach: number, down: Point, side: Point): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: reach * (c * down.x + s * side.x),
    y: reach * (c * down.y + s * side.y),
  };
}

/** The dancing hand: its swing, how firmly it holds, and where its target got to. */
export class Dance implements MusicForce {
  readonly #swing: Swing;
  // How firmly it holds, from 0 to 1; where its target got to at the end of
  // the frame run last, and the frame being run.
  #grip = 0;
  #target: Point | null = null;
  #running: { span: number; from: Point; to: Point } | null = null;

  /** With reduced motion asked for (`slow`), the hand crosses over a second. */
  constructor(slow: boolean) {
    this.#swing = new Swing(
      { cross: () => CROSS, ease: SWING_EASE, few: () => 1 },
      slow,
    );
  }

  drag(silent: boolean): number {
    return silent ? DRAG_SILENT : 0;
  }

  frame(input: ForceFrame, reading: Reading): Part {
    const { real, span, chain } = input;
    const { before, after } = this.#swing.step(
      reading.heard,
      real,
      chain.n,
      reading.depth,
      reading.times,
    );
    this.#running = null;
    if (input.held) {
      this.#grip = 0;
      this.#target = null;
      return {};
    }
    this.#grip = Math.min(1, this.#grip + real / TAKE_HOLD);
    const tip = chain.n - 1;
    const reach = chain.totalLength;
    const from =
      this.#target ?? onArc(before, reach, reading.down, reading.side);
    const to = onArc(after, reach, reading.down, reading.side);
    const grip = createHand(chain, tip, DANCE_GRIP, handDamping(DANCE_GRIP));
    this.#running = { span, from, to };
    return {
      hand: {
        index: tip,
        stiffness: grip.stiffness * this.#grip,
        damping: grip.damping * this.#grip,
        fastest: grip.fastest,
        from,
        to,
      },
    };
  }

  ran(simulated: number): void {
    const running = this.#running;
    if (running !== null) {
      const share = along(simulated, running.span);
      this.#target = {
        x: running.from.x + (running.to.x - running.from.x) * share,
        y: running.from.y + (running.to.y - running.from.y) * share,
      };
    }
    this.#running = null;
  }

  letGo(): void {
    this.#grip = 0;
    this.#target = null;
    this.#running = null;
  }
}
