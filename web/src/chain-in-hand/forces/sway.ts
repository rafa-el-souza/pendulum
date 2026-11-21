import type { Gravity } from "../../physics/chain.ts";
import {
  DRAG_PLAYING,
  DRAG_SILENT,
  FEW_MASSES,
  along,
  leaning,
  type ForceFrame,
  type MusicForce,
  type Part,
  type Reading,
} from "./common.ts";
import { Swing } from "./swing.ts";

// The swaying gravity (docs/decisions.md, decision 77): gravity leans to the
// other side on each kick, crossing over the time since the kick before, as
// far as the loudness, less on chains of more than three masses; it turns
// the visitor's gravity and keeps its strength.

/**
 * Gravity crosses over the time since the kick before, in s of real time,
 * no less than LEAST_CROSS and no more than MOST_CROSS: so that it sways in
 * time with the kicks, and neither jolts on two close together nor hangs
 * aside through a long gap. It crosses over FIRST_CROSS on the first kick.
 */
export const LEAST_CROSS = 0.25;
export const MOST_CROSS = 1.5;
export const FIRST_CROSS = 0.5;
/** How fast gravity's swing follows the loudness, in s. */
const LEAN_EASE = 0.5;

/** The swaying gravity: its swing, and where its lean got to. */
export class Sway implements MusicForce {
  readonly #swing: Swing;
  // What gravity's lean came to at the end of the frame run last, and the
  // frame being run.
  #leaned: Gravity | null = null;
  #leaning: { span: number; from: Gravity; to: Gravity } | null = null;

  /** With reduced motion asked for (`slow`), gravity crosses over a second at least. */
  constructor(slow: boolean) {
    this.#swing = new Swing(
      {
        cross: (sinceKick) =>
          Number.isFinite(sinceKick)
            ? Math.min(MOST_CROSS, Math.max(LEAST_CROSS, sinceKick))
            : FIRST_CROSS,
        ease: LEAN_EASE,
        few: (n) => Math.min(1, Math.sqrt(FEW_MASSES / n)),
      },
      slow,
    );
  }

  drag(silent: boolean): number {
    return silent ? DRAG_SILENT : DRAG_PLAYING;
  }

  frame(input: ForceFrame, reading: Reading): Part {
    const { before, after } = this.#swing.step(
      reading.heard,
      input.real,
      input.chain.n,
      reading.depth,
      reading.times,
    );
    const from =
      this.#leaned ?? leaning(input.g, before, reading.down, reading.side);
    const to = leaning(input.g, after, reading.down, reading.side);
    this.#leaning = { span: input.span, from, to };
    return { tilt: [from, to] };
  }

  ran(simulated: number): void {
    const leaning = this.#leaning;
    if (leaning !== null) {
      const share = along(simulated, leaning.span);
      this.#leaned = {
        x: leaning.from.x + (leaning.to.x - leaning.from.x) * share,
        y: leaning.from.y + (leaning.to.y - leaning.from.y) * share,
      };
    }
    this.#leaning = null;
  }

  letGo(): void {
    // gravity holds nothing
  }
}
