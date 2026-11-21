import type { Signals } from "../../audio/signals.ts";
import { ease } from "./common.ts";

// The swing from side to side on the kicks (docs/decisions.md, decisions 75
// and 77), which the dancing hand's target and the swaying gravity each
// follow: on every kick it sets off for the other side from where it is,
// and it swings as far as the loudness.

/** With reduced motion asked for, a crossing takes a second at least, and the swing follows the loudness over a second. */
export const SLOW_CROSS = 1;
const SLOW_SWING_EASE = 1;
/** The widest it swings either way, in rad. */
export const WIDEST_SWING = Math.PI / 3;

/** How a swing crosses and how far it swings, which differ from one force to the other. */
export interface SwingWay {
  /** How long a crossing takes, in s of real time, given the time since the kick before: infinite on the first. */
  readonly cross: (sinceKick: number) => number;
  /** How fast its size follows the loudness, in s. */
  readonly ease: number;
  /** What its size is multiplied by on a chain of `n` masses. */
  readonly few: (n: number) => number;
}

/** A swing from side to side on the kicks, as far as the loudness. */
export class Swing {
  readonly #way: SwingWay;
  readonly #slow: boolean;
  // The side it goes to (−1 or 1, or 0 before the first kick), where its
  // crossing began (from −1 to 1), how far through it it is (from 0 to 1)
  // and how long it takes, in s; the time since the last kick, in s; and how
  // far it swings, in rad.
  #side = 0;
  #from = 0;
  #crossed = 1;
  #cross: number;
  #sinceKick = Number.POSITIVE_INFINITY;
  #swing = 0;

  constructor(way: SwingWay, slow: boolean) {
    this.#way = way;
    this.#slow = slow;
    this.#cross = way.cross(Number.POSITIVE_INFINITY);
  }

  /**
   * The swing over a frame of `real` s: a kick heard sets it off, and its
   * size follows the loudness, `depth` × the loudness × `times` at most.
   * How far from straight down it is as the frame starts and as it ends, in
   * rad.
   */
  step(
    heard: Signals,
    real: number,
    n: number,
    depth: number,
    times: number,
  ): { before: number; after: number } {
    this.#sinceKick += real;
    if (heard.kick > 0) this.#turn();
    const before = this.#angle();
    this.#crossed = Math.min(1, this.#crossed + real / this.#cross);
    const loudness = heard.silent ? 0 : heard.level;
    this.#swing = ease(
      this.#swing,
      Math.min(WIDEST_SWING, depth * loudness * times * this.#way.few(n)),
      real,
      this.#slow ? SLOW_SWING_EASE : this.#way.ease,
    );
    return { before, after: this.#angle() };
  }

  /** On a kick, it sets off for the other side from where it is, over a second at least with reduced motion asked for. */
  #turn(): void {
    this.#from = this.#place();
    this.#side = this.#side > 0 ? -1 : 1;
    this.#crossed = 0;
    const cross = this.#way.cross(this.#sinceKick);
    this.#cross = this.#slow ? Math.max(cross, SLOW_CROSS) : cross;
    this.#sinceKick = 0;
  }

  /** Where it is along its crossing, from −1 to 1, eased in and out. */
  #place(): number {
    const u = this.#crossed;
    return this.#from + (this.#side - this.#from) * u * u * (3 - 2 * u);
  }

  /** How far from straight down it is, in rad. */
  #angle(): number {
    return this.#place() * this.#swing;
  }
}
