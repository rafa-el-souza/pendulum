import {
  DRAG_PLAYING,
  DRAG_SILENT,
  FEW_MASSES,
  KICK_ATTACK,
  KICK_DECAY,
  type ForceFrame,
  type MusicForce,
  type Part,
  type Pivot,
  type Reading,
} from "./common.ts";

// The speaker (docs/decisions.md, decision 75): a kick heard takes the
// pivot aside, across gravity, as far as it is strong, less on longer
// chains, and back. Its kicks are the pivot's, and outlast the speaker.

/** The speaker: what it has is in the pivot's kicks. */
export class Speaker implements MusicForce {
  readonly #slow: boolean;

  /** With reduced motion asked for (`slow`), it kicks nothing. */
  constructor(slow: boolean) {
    this.#slow = slow;
  }

  drag(silent: boolean): number {
    return silent ? DRAG_SILENT : DRAG_PLAYING;
  }

  frame(input: ForceFrame, reading: Reading, pivot: Pivot): Part {
    const { heard, depth, times, side } = reading;
    if (heard.kick > 0 && !this.#slow) {
      const size =
        depth *
        Math.min(1, Math.sqrt(FEW_MASSES / input.chain.n)) *
        times *
        heard.kick;
      pivot.kick({
        at: pivot.clock,
        x: size * side.x,
        y: size * side.y,
        attack: KICK_ATTACK * input.speed,
        decay: KICK_DECAY * input.speed,
      });
    }
    return {};
  }

  ran(): void {
    // its kicks are the pivot's
  }

  letGo(): void {
    // it holds nothing
  }
}
