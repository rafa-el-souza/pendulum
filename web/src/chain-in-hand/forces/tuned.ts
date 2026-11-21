import { SURE, type BeatAt } from "../../audio/beat.ts";
import type { Chain, Gravity } from "../../physics/chain.ts";
import type { Point } from "../../physics/drive.ts";
import { laguerreZero } from "../../physics/modes.ts";
import { GRAVITY } from "../parameters.ts";
import {
  DRAG_SILENT,
  KICK_ATTACK,
  along,
  ease,
  type ForceFrame,
  type MusicForce,
  type Part,
  type Pivot,
  type Reading,
} from "./common.ts";

// The tuned chain (docs/decisions.md, decision 79): while the beat clock is
// sure of the beat, it sets gravity's strength for the chain's slowest mode
// to swing once a bar, and pushes the pivot across gravity on the beats, two
// to a side. Its pushes are the pivot's kicks, and outlast it.

/**
 * The tuned chain's drag while the music plays, in 1/s: light enough for its
 * slowest mode to build over the beats, the probe's (decision 79).
 */
export const TUNED_DRAG = 0.1;
/** How fast gravity's strength follows the tempo, and goes back, in s of real time. */
const TUNE_EASE = 1;
/**
 * How long a tuned push takes to come back, in s of real time: about half a
 * second, the next beat's push coming before it is back, so that the pivot
 * is held to a side over the bar's half. On the chain's slowest mode it gives
 * about twice what a push that comes back as fast as a kick's gives.
 */
export const TUNED_DECAY = 0.5;
/** The most gravity the piece offers, in m/s²: past it, the tuned chain swings once every two bars, or four. */
const MOST_GRAVITY = Math.max(...GRAVITY.values);
/** Two beats pushed closer than this share of a beat are one, as when the clock moves on a little. */
const SAME_BEAT = 0.5;

/**
 * The gravity, in m/s², under which the slowest mode of an equal chain swings
 * once every `beats` beats at `bpm` beats a minute, as seen at `speed`: its
 * squared frequency is λ₁ g / l, λ₁ the first zero of the Laguerre
 * polynomial of the chain's degree (PH-7). Twice as many beats a swing where
 * that asks for more gravity than the piece offers.
 */
export function tunedGravity(
  chain: Chain,
  bpm: number,
  speed: number,
  beats = 4,
): { g: number; beats: number } {
  const rod = chain.totalLength / chain.n;
  const lambda = laguerreZero(chain.n, 1);
  let per = beats;
  for (;;) {
    const omega = (2 * Math.PI * bpm) / 60 / per / speed;
    const g = (omega * omega * rod) / lambda;
    if (g <= MOST_GRAVITY || per >= 64 * beats) return { g, beats: per };
    per *= 2;
  }
}

/** The tuned chain: gravity's strength as it follows the tempo, the beats it has pushed, and where its lean got to. */
export class Tuned implements MusicForce {
  readonly #slow: boolean;
  // Gravity's strength as it follows the tempo, or null before it acts; when
  // the last beat it pushed fell, on the beat clock's time; and how many bars
  // it has pushed, which side a pair of bars takes.
  #tuned: number | null = null;
  #pushedAt = Number.NEGATIVE_INFINITY;
  #bars = 0;
  // What gravity's lean came to at the end of the frame run last, and the
  // frame being run.
  #leaned: Gravity | null = null;
  #leaning: { span: number; from: Gravity; to: Gravity } | null = null;

  /** With reduced motion asked for (`slow`), it pushes nothing. */
  constructor(slow: boolean) {
    this.#slow = slow;
  }

  drag(silent: boolean): number {
    return silent ? DRAG_SILENT : TUNED_DRAG;
  }

  frame(input: ForceFrame, reading: Reading, pivot: Pivot): Part {
    const { heard, depth, times, down, side } = reading;
    const beat = heard.beat;
    const sure = beat !== null && !heard.silent && beat.confidence >= SURE;
    const strength = Math.hypot(input.g.x, input.g.y);
    const tuning = sure
      ? tunedGravity(input.chain, beat.bpm, input.speed)
      : null;
    const was = this.#tuned ?? strength;
    this.#tuned = ease(was, tuning?.g ?? strength, input.real, TUNE_EASE);
    const from = this.#leaned ?? {
      x: (was - strength) * down.x,
      y: (was - strength) * down.y,
    };
    const to = {
      x: (this.#tuned - strength) * down.x,
      y: (this.#tuned - strength) * down.y,
    };
    this.#leaning = { span: input.span, from, to };
    if (sure && tuning !== null && !this.#slow) {
      this.#push(beat, input, tuning.beats, depth * times, side, pivot);
    }
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

  /**
   * The pushes in the frame to be run: one on each beat that falls in it, at
   * its moment, `size` m across gravity, to the first side on the bar's first
   * two beats and to the other on its last two; where a swing takes more than
   * a bar, the bars of each swing's half push alike.
   */
  #push(
    beat: BeatAt,
    input: ForceFrame,
    beats: number,
    size: number,
    side: Point,
    pivot: Pivot,
  ): void {
    const perSecond = beat.bpm / 60;
    const start = beat.phase + input.from * perSecond;
    const end = start + input.real * perSecond;
    for (let k = Math.floor(start) + 1; k <= end; k++) {
      // when it falls, in s of real time after the frame starts, and on the
      // beat clock's time
      const after = (k - start) / perSecond;
      const at = beat.at + input.from + after;
      if (at - this.#pushedAt < SAME_BEAT / perSecond) continue;
      this.#pushedAt = at;
      const inBar =
        ((Math.round((beat.bar + (input.from + after) * (perSecond / 4)) * 4) %
          4) +
          4) %
        4;
      if (inBar === 0) this.#bars++;
      const bars = beats / 4;
      const first =
        bars <= 1
          ? inBar < 2
          : Math.floor((this.#bars - 1) / (bars / 2)) % 2 === 0;
      const way = first ? 1 : -1;
      pivot.kick({
        at: pivot.clock + after * input.speed,
        x: way * size * side.x,
        y: way * size * side.y,
        attack: KICK_ATTACK * input.speed,
        decay: TUNED_DECAY * input.speed,
      });
    }
  }
}
