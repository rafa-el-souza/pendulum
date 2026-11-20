import type { Signals } from "../audio/signals.ts";
import { STRENGTHS, type Force } from "../core/routes.ts";
import { createHand, type Chain, type Gravity } from "../physics/chain.ts";
import type { Drive, Kick, MusicHand, Point } from "../physics/drive.ts";
import { handDamping } from "./parameters.ts";

// The music's forces on the first piece (docs/decisions.md, decision 75),
// each the force of a mode of the music's group, beside its light: the speaker,
// whose kicks take the pivot aside and back, and the dancing hand, which
// holds the tip and swings it to the other side on every kick. They keep the
// music's pace, as its light does: a kick lasts as long on the clock at any
// speed of the piece, so that in slow motion the chain feels it shorter and
// sooner after the one before. No force acts without a source playing, and
// a paused piece takes none: then the physics is the paper's, without
// friction. The sizes and times are placeholders, from the probe of the
// music's physics, which the author settles by seeing.

/**
 * A kick's rise and fall, in s of real time: it reaches its size 46 ms
 * after it begins, and falls back over about 0.3 s.
 */
export const KICK_ATTACK = 0.015;
export const KICK_DECAY = 0.1;
/**
 * The speaker's kicks are full on chains of up to this many masses, and
 * smaller by the square root of the ratio on longer ones, whose fast
 * motions they pump.
 */
export const FEW_MASSES = 3;
/** A kick is let go of this many of its decays after it began, fallen to under a millionth. */
const KICK_LIFE = 14;
/**
 * The drag, in 1/s, while music plays and in its silence, followed over
 * DRAG_EASE s. The speaker's is light while it plays, enough to keep the
 * fast motions its kicks pump on long chains within bounds while leaving
 * the chain alive between kicks; the dancing hand needs none then, its
 * damper taking what it gives. In silence both calm the chain within a few
 * seconds: the hand's damper alone leaves the masses between the pivot and
 * the tip it holds swinging, on chains of more than a few masses, for more
 * than six seconds.
 */
export const DRAG_PLAYING = 0.2;
export const DRAG_SILENT = 2;
const DRAG_EASE = 0.3;
/** The dancing hand's grip, a step of the visitor's (decision 18): elastic enough to swing the chain, firm enough to calm it. */
export const DANCE_GRIP = 12;
/** How long the hand's target takes to cross to the other side, in s of real time, and with reduced motion asked for. */
export const CROSS = 0.12;
export const SLOW_CROSS = 1;
/** How fast the hand's swing follows the loudness, in s, and with reduced motion asked for. */
const SWING_EASE = 0.15;
const SLOW_SWING_EASE = 1;
/** The widest the hand swings either way, in rad. */
export const WIDEST_SWING = Math.PI / 3;
/** How long the hand takes to take hold again, in s of real time, from letting go. */
export const TAKE_HOLD = 1;

/** What a frame gives the music's forces. */
export interface ForceFrame {
  /** What the music says this frame, or null while no source plays. */
  readonly heard: Signals | null;
  /** The force of the music's mode, if it has one. */
  readonly force: Force | undefined;
  /** The music's strength, its step from 1. */
  readonly strength: number;
  /** The real time since the frame before, in s. */
  readonly real: number;
  /** The piece's time the frame asks for, in s, and how fast that runs against the clock. */
  readonly span: number;
  readonly speed: number;
  readonly chain: Chain;
  readonly g: Gravity;
  /** Whether the visitor's hand holds the chain: the music's lets go while it does. */
  readonly held: boolean;
}

/** A kick on the piece's own clock: when it began, in s. */
interface Kicked {
  readonly at: number;
  readonly x: number;
  readonly y: number;
  readonly attack: number;
  readonly decay: number;
}

const NO_TILT: Gravity = { x: 0, y: 0 };

/** Follows `to` from `from` over `dt` s, as a first-order lag of `tau` s. */
function ease(from: number, to: number, dt: number, tau: number): number {
  return from + (to - from) * (1 - Math.exp(-dt / tau));
}

/** Down along gravity, as a unit vector, straight down when there is none; and the side, a right angle from it, to the right as one looks down. */
function directions(g: Gravity): { down: Point; side: Point } {
  const strength = Math.hypot(g.x, g.y);
  const down =
    strength > 0 ? { x: g.x / strength, y: g.y / strength } : { x: 0, y: -1 };
  return { down, side: { x: -down.y, y: down.x } };
}

/** The point `reach` m from the pivot, `angle` rad from straight down towards the side. */
function onArc(angle: number, reach: number, down: Point, side: Point): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: reach * (c * down.x + s * side.x),
    y: reach * (c * down.y + s * side.y),
  };
}

/** The music's forces, frame by frame: the command each frame puts into the physics (decision 74). */
export class MusicForces {
  readonly #slow: boolean;
  // the piece's time, summed over the frames run, in s, and the kicks still
  // moving the pivot, each from when it began on it
  #clock = 0;
  #kicks: Kicked[] = [];
  #drag = 0;
  // The dancing hand: the side its target goes to (−1 or 1, or 0 before the
  // first kick), where its crossing began (from −1 to 1) and how far through
  // it it is (from 0 to 1); how far it swings, in rad; how firmly it holds,
  // from 0 to 1; where its target got to at the end of the frame run last,
  // and the frame being run.
  #side = 0;
  #from = 0;
  #crossed = 1;
  #swing = 0;
  #grip = 0;
  #target: Point | null = null;
  #running: { span: number; from: Point; to: Point } | null = null;

  /** With reduced motion asked for (`slow`), the pivot kicks nothing and the hand crosses over a second. */
  constructor(options: { slow?: boolean } = {}) {
    this.#slow = options.slow ?? false;
  }

  /** Whether kicks are still moving the pivot. */
  get kicking(): boolean {
    return this.#kicks.length > 0;
  }

  /** What the music puts into the physics over the frame about to be run, or none. */
  frame(input: ForceFrame): Drive | null {
    const { heard, real, span, chain } = input;
    const kind = heard === null ? undefined : input.force?.kind;
    const depth = input.force?.depth ?? 0;
    const times = STRENGTHS[input.strength - 1] ?? 1;
    const { down, side } = directions(input.g);

    // the speaker: a kick heard takes the pivot aside, across gravity, as far
    // as it is strong; and either force's drag follows the music, heavier in
    // its silence
    if (kind === "speaker" && heard !== null && heard.kick > 0 && !this.#slow) {
      const size =
        depth *
        Math.min(1, Math.sqrt(FEW_MASSES / chain.n)) *
        times *
        heard.kick;
      this.#kicks.push({
        at: this.#clock,
        x: size * side.x,
        y: size * side.y,
        attack: KICK_ATTACK * input.speed,
        decay: KICK_DECAY * input.speed,
      });
    }
    const dragFrom = this.#drag;
    if (kind === undefined) {
      this.#drag = 0;
    } else {
      const wanted =
        heard?.silent === true
          ? DRAG_SILENT
          : kind === "speaker"
            ? DRAG_PLAYING
            : 0;
      this.#drag = ease(this.#drag, wanted, real, DRAG_EASE);
    }

    // the dancing hand, which lets go while the visitor's holds
    const hands: MusicHand[] = [];
    this.#running = null;
    if (kind === "dance" && heard !== null) {
      if (heard.kick > 0) this.#turn();
      const before = this.#angle();
      const cross = this.#slow ? SLOW_CROSS : CROSS;
      this.#crossed = Math.min(1, this.#crossed + real / cross);
      const loudness = heard.silent ? 0 : heard.level;
      this.#swing = ease(
        this.#swing,
        Math.min(WIDEST_SWING, depth * loudness * times),
        real,
        this.#slow ? SLOW_SWING_EASE : SWING_EASE,
      );
      const after = this.#angle();
      if (input.held) {
        this.#grip = 0;
        this.#target = null;
      } else {
        this.#grip = Math.min(1, this.#grip + real / TAKE_HOLD);
        const tip = chain.n - 1;
        const reach = chain.totalLength;
        const from = this.#target ?? onArc(before, reach, down, side);
        const to = onArc(after, reach, down, side);
        const grip = createHand(
          chain,
          tip,
          DANCE_GRIP,
          handDamping(DANCE_GRIP),
        );
        hands.push({
          index: tip,
          stiffness: grip.stiffness * this.#grip,
          damping: grip.damping * this.#grip,
          fastest: grip.fastest,
          from,
          to,
        });
        this.#running = { span, from, to };
      }
    } else {
      this.letGo();
      this.#side = 0;
      this.#from = 0;
      this.#crossed = 1;
      this.#swing = 0;
    }

    const kicks: Kick[] = this.#kicks.map((kick) => ({
      start: kick.at - this.#clock,
      x: kick.x,
      y: kick.y,
      attack: kick.attack,
      decay: kick.decay,
    }));
    if (
      kicks.length === 0 &&
      hands.length === 0 &&
      dragFrom === 0 &&
      this.#drag === 0
    ) {
      return null;
    }
    return {
      span,
      tilt: [NO_TILT, NO_TILT],
      kicks,
      hands,
      drag: [dragFrom, this.#drag],
      heat: null,
    };
  }

  /**
   * The frame was run for `simulated` s of the piece's time, its span or
   * less: the clock goes on, the kicks that have faded are let go, and the
   * hand's target is where the frame left it.
   */
  ran(simulated: number): void {
    const running = this.#running;
    if (running !== null) {
      const along =
        running.span > 0 ? Math.min(1, simulated / running.span) : 1;
      this.#target = {
        x: running.from.x + (running.to.x - running.from.x) * along,
        y: running.from.y + (running.to.y - running.from.y) * along,
      };
    }
    this.#running = null;
    this.#clock += simulated;
    this.#kicks = this.#kicks.filter(
      (kick) => this.#clock - kick.at < KICK_LIFE * kick.decay,
    );
  }

  /** The hand lets go, to take hold again from where its path is, over a second: as the chain starts again or changes. */
  letGo(): void {
    this.#grip = 0;
    this.#target = null;
    this.#running = null;
  }

  /** On a kick, the hand's target sets off for the other side from where it is. */
  #turn(): void {
    this.#from = this.#place();
    this.#side = this.#side > 0 ? -1 : 1;
    this.#crossed = 0;
  }

  /** Where the target is along its crossing, from −1 to 1, eased in and out. */
  #place(): number {
    const u = this.#crossed;
    return this.#from + (this.#side - this.#from) * u * u * (3 - 2 * u);
  }

  /** How far from straight down the target is, in rad. */
  #angle(): number {
    return this.#place() * this.#swing;
  }
}
