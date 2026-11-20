import type { Signals } from "../audio/signals.ts";
import { STRENGTHS, type Force } from "../core/routes.ts";
import { createHand, type Chain, type Gravity } from "../physics/chain.ts";
import type { Drive, Heat, Kick, MusicHand, Point } from "../physics/drive.ts";
import type { ChainState } from "../physics/step.ts";
import { handDamping } from "./parameters.ts";

// The music's forces on the first piece (docs/decisions.md, decisions 75 and
// 77), each the force of a mode of the music's group, beside its light: the
// speaker, whose kicks take the pivot aside and back; the dancing hand, which
// holds the tip and swings it to the other side on every kick; the breath,
// which draws the chain's energy to the loudness; and the swaying gravity,
// which leans to the other side on every kick. They keep the music's pace, as
// its light does: a kick lasts as long on the clock at any speed of the
// piece, so that in slow motion the chain feels it shorter and sooner after
// the one before. No force acts without a source playing, and a paused piece
// takes none: then the physics is the paper's, without friction. The sizes
// and times are placeholders, from the probe of the music's physics, which
// the author settles by seeing.

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
 * the chain alive between kicks, and so is the swaying gravity's; the
 * dancing hand needs none then, its damper taking what it gives. In silence
 * the three calm the chain within a few seconds: the hand's damper alone
 * leaves the masses between the pivot and the tip it holds swinging, on
 * chains of more than a few masses, for more than six seconds. The breath
 * needs none: it draws the chain to rest itself.
 */
export const DRAG_PLAYING = 0.2;
export const DRAG_SILENT = 2;
const DRAG_EASE = 0.3;
/** The dancing hand's grip, a step of the visitor's (decision 18): elastic enough to swing the chain, firm enough to calm it. */
export const DANCE_GRIP = 12;
/** How long the hand's target takes to cross to the other side, in s of real time, and, for it and gravity, with reduced motion asked for. */
export const CROSS = 0.12;
export const SLOW_CROSS = 1;
/**
 * Gravity crosses over the time since the kick before, in s of real time,
 * no less than LEAST_CROSS and no more than MOST_CROSS: so that it sways in
 * time with the kicks, and neither jolts on two close together nor hangs
 * aside through a long gap. It crosses over FIRST_CROSS on the first kick.
 */
export const LEAST_CROSS = 0.25;
export const MOST_CROSS = 1.5;
export const FIRST_CROSS = 0.5;
/** How fast the hand's swing follows the loudness, and gravity's, in s, and either with reduced motion asked for. */
const SWING_EASE = 0.15;
const LEAN_EASE = 0.5;
const SLOW_SWING_EASE = 1;
/** The widest the hand swings, or gravity leans, either way, in rad. */
export const WIDEST_SWING = Math.PI / 3;
/** How long the hand, or the breath, takes to take hold again, in s of real time, from letting go. */
export const TAKE_HOLD = 1;
/**
 * The breath's thermostat (decision 74's): how fast it draws the energy to
 * its target, in 1/s, and the least energy it divides by, as a share of the
 * energy that lifts the hanging chain level.
 */
export const BREATH_GAIN = 3;
export const BREATH_FLOOR = 0.01;
/**
 * A chain hanging at rest has no motion for a drag to grow: while its energy
 * is under SEED_ENERGY of the one that lifts it level, the breath leans
 * gravity SEED_LEAN rad for a frame, too little to be seen, to set it going.
 */
export const SEED_LEAN = 0.01;
const SEED_ENERGY = 1e-9;
/** Earth's gravity, in m/s², which gives the breath its scale where there is none. */
const EARTH = 9.81;

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
  /** Where the chain is and how it moves as the frame starts. */
  readonly state: ChainState;
  readonly g: Gravity;
  /** Whether the visitor's hand holds the chain: the music's, and the breath, let go while it does. */
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

/** What gravity `g` turned `angle` rad from `down` towards `side` adds to it, keeping its strength: nothing without gravity. */
function leaning(g: Gravity, angle: number, down: Point, side: Point): Gravity {
  const strength = Math.hypot(g.x, g.y);
  if (strength === 0) return NO_TILT;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: strength * (c * down.x + s * side.x) - g.x,
    y: strength * (c * down.y + s * side.y) - g.y,
  };
}

/** The drag a force asks for while the music plays and in its silence, in 1/s. */
function dragOf(kind: Force["kind"], silent: boolean): number {
  if (kind === "breath") return 0;
  if (silent) return DRAG_SILENT;
  return kind === "dance" ? 0 : DRAG_PLAYING;
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
  // The force of the frame before, whose swing a change of force starts
  // afresh.
  #was: Force["kind"] | undefined = undefined;
  // The swing of the dancing hand's target and of the swaying gravity: the
  // side it goes to (−1 or 1, or 0 before the first kick), where its crossing
  // began (from −1 to 1), how far through it it is (from 0 to 1) and how long
  // it takes, in s; the time since the last kick, in s; and how far it
  // swings, in rad.
  #side = 0;
  #from = 0;
  #crossed = 1;
  #cross = CROSS;
  #sinceKick = Number.POSITIVE_INFINITY;
  #swing = 0;
  // How firmly the hand, or the breath, holds, from 0 to 1; where the hand's
  // target got to at the end of the frame run last, and the frame being run.
  #grip = 0;
  #target: Point | null = null;
  #running: { span: number; from: Point; to: Point } | null = null;
  // What gravity's lean, and the breath's target energy, came to at the end
  // of the frame run last, and the frame being run.
  #leaned: Gravity | null = null;
  #leaning: { span: number; from: Gravity; to: Gravity } | null = null;
  #aimed: number | null = null;
  #aiming: { span: number; from: number; to: number } | null = null;

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
    const { heard, real, span, chain, g } = input;
    const kind = heard === null ? undefined : input.force?.kind;
    if (kind !== this.#was) {
      this.#was = kind;
      this.#still();
    }
    const depth = input.force?.depth ?? 0;
    const times = STRENGTHS[input.strength - 1] ?? 1;
    const { down, side } = directions(input.g);

    // the speaker: a kick heard takes the pivot aside, across gravity, as far
    // as it is strong; and the forces' drag follows the music, heavier in its
    // silence
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
      this.#drag = ease(
        this.#drag,
        dragOf(kind, heard?.silent === true),
        real,
        DRAG_EASE,
      );
    }

    // the swing from side to side on the kicks, of the dancing hand's target
    // or of gravity, as far as the loudness: gravity less on longer chains,
    // whose fast motions it pumps
    let before = 0;
    let after = 0;
    if ((kind === "dance" || kind === "sway") && heard !== null) {
      this.#sinceKick += real;
      if (heard.kick > 0) this.#turn(kind);
      before = this.#angle();
      this.#crossed = Math.min(1, this.#crossed + real / this.#cross);
      const loudness = heard.silent ? 0 : heard.level;
      const few =
        kind === "sway" ? Math.min(1, Math.sqrt(FEW_MASSES / chain.n)) : 1;
      this.#swing = ease(
        this.#swing,
        Math.min(WIDEST_SWING, depth * loudness * times * few),
        real,
        this.#slow ? SLOW_SWING_EASE : kind === "sway" ? LEAN_EASE : SWING_EASE,
      );
      after = this.#angle();
    }

    // the dancing hand, which lets go while the visitor's holds
    const hands: MusicHand[] = [];
    this.#running = null;
    if (kind === "dance") {
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
    }

    // gravity, leaning from where the frame before left it
    let tilt: [Gravity, Gravity] = [NO_TILT, NO_TILT];
    this.#leaning = null;
    if (kind === "sway") {
      const from = this.#leaned ?? leaning(g, before, down, side);
      const to = leaning(g, after, down, side);
      tilt = [from, to];
      this.#leaning = { span, from, to };
    }

    // the breath: the chain's energy drawn to the loudness, times the energy
    // that lifts it level, from where the frame before left its target; it
    // lets go while the visitor's hand holds, and a chain at rest is given a
    // lean of gravity to set it going
    let heat: Heat | null = null;
    this.#aiming = null;
    if (kind === "breath" && heard !== null) {
      const strength = Math.hypot(g.x, g.y);
      const lift = (strength > 0 ? strength : EARTH) * chain.hangingMoment;
      const to = depth * (heard.silent ? 0 : heard.level) * times * lift;
      const from = this.#aimed ?? to;
      this.#aiming = { span, from, to };
      if (input.held) {
        this.#grip = 0;
      } else {
        this.#grip = Math.min(1, this.#grip + real / TAKE_HOLD);
        heat = {
          target: [from, to],
          gain: BREATH_GAIN * this.#grip,
          floor: BREATH_FLOOR * lift,
        };
        const { theta, omega } = input.state;
        if (
          to > heat.floor &&
          chain.energyAboveRest(theta, omega, g) < SEED_ENERGY * lift
        ) {
          const seed = leaning(g, SEED_LEAN, down, side);
          tilt = [seed, seed];
        }
      }
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
      this.#drag === 0 &&
      heat === null &&
      tilt[0] === NO_TILT &&
      tilt[1] === NO_TILT
    ) {
      return null;
    }
    return {
      span,
      tilt,
      kicks,
      hands,
      drag: [dragFrom, this.#drag],
      heat,
    };
  }

  /**
   * The frame was run for `simulated` s of the piece's time, its span or
   * less: the clock goes on, the kicks that have faded are let go, and the
   * hand's target, gravity's lean and the breath's target are where the
   * frame left them.
   */
  ran(simulated: number): void {
    const along = (span: number) =>
      span > 0 ? Math.min(1, simulated / span) : 1;
    const running = this.#running;
    if (running !== null) {
      const share = along(running.span);
      this.#target = {
        x: running.from.x + (running.to.x - running.from.x) * share,
        y: running.from.y + (running.to.y - running.from.y) * share,
      };
    }
    this.#running = null;
    const leaning = this.#leaning;
    if (leaning !== null) {
      const share = along(leaning.span);
      this.#leaned = {
        x: leaning.from.x + (leaning.to.x - leaning.from.x) * share,
        y: leaning.from.y + (leaning.to.y - leaning.from.y) * share,
      };
    }
    this.#leaning = null;
    const aiming = this.#aiming;
    if (aiming !== null) {
      this.#aimed =
        aiming.from + (aiming.to - aiming.from) * along(aiming.span);
    }
    this.#aiming = null;
    this.#clock += simulated;
    this.#kicks = this.#kicks.filter(
      (kick) => this.#clock - kick.at < KICK_LIFE * kick.decay,
    );
  }

  /** The hand, or the breath, lets go, to take hold again from where the hand's path is, over a second: as the chain starts again or changes. */
  letGo(): void {
    this.#grip = 0;
    this.#target = null;
    this.#running = null;
  }

  /** A force begins, or none is left: the hand lets go, and the swing, the lean and the breath's target start afresh. */
  #still(): void {
    this.letGo();
    this.#side = 0;
    this.#from = 0;
    this.#crossed = 1;
    this.#cross = CROSS;
    this.#sinceKick = Number.POSITIVE_INFINITY;
    this.#swing = 0;
    this.#leaned = null;
    this.#leaning = null;
    this.#aimed = null;
    this.#aiming = null;
  }

  /**
   * On a kick, the hand's target, or gravity, sets off for the other side
   * from where it is: the hand over CROSS, gravity over the time since the
   * kick before; either over a second at least with reduced motion asked for.
   */
  #turn(kind: "dance" | "sway"): void {
    this.#from = this.#place();
    this.#side = this.#side > 0 ? -1 : 1;
    this.#crossed = 0;
    let cross = CROSS;
    if (kind === "sway") {
      cross = Number.isFinite(this.#sinceKick)
        ? Math.min(MOST_CROSS, Math.max(LEAST_CROSS, this.#sinceKick))
        : FIRST_CROSS;
    }
    this.#cross = this.#slow ? Math.max(cross, SLOW_CROSS) : cross;
    this.#sinceKick = 0;
  }

  /** Where the swing is along its crossing, from −1 to 1, eased in and out. */
  #place(): number {
    const u = this.#crossed;
    return this.#from + (this.#side - this.#from) * u * u * (3 - 2 * u);
  }

  /** How far from straight down the hand's target, or gravity, is, in rad. */
  #angle(): number {
    return this.#place() * this.#swing;
  }
}
