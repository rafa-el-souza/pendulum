import type { Signals } from "../../audio/signals.ts";
import type { Force } from "../../core/routes.ts";
import type { Chain, Gravity } from "../../physics/chain.ts";
import type { Heat, MusicHand, Point } from "../../physics/drive.ts";
import type { ChainState } from "../../physics/step.ts";

// What the music's forces share (docs/decisions.md, decision 82): the frame
// each is given, what each gives back, and the directions they act along.

/**
 * A kick's rise and fall, in s of real time: it reaches its size 46 ms
 * after it begins, and falls back over about 0.3 s.
 */
export const KICK_ATTACK = 0.015;
export const KICK_DECAY = 0.1;
/**
 * The speaker's kicks are full on chains of up to this many masses, and
 * smaller by the square root of the ratio on longer ones, whose fast
 * motions they pump; and so is gravity's sway.
 */
export const FEW_MASSES = 3;
/**
 * The drag, in 1/s, while music plays and in its silence. The speaker's is
 * light while it plays, enough to keep the fast motions its kicks pump on
 * long chains within bounds while leaving the chain alive between kicks,
 * and so is the swaying gravity's; the dancing hand needs none then, its
 * damper taking what it gives. In silence the three calm the chain within a
 * few seconds: the hand's damper alone leaves the masses between the pivot
 * and the tip it holds swinging, on chains of more than a few masses, for
 * more than six seconds. The breath needs none: it draws the chain to rest
 * itself.
 */
export const DRAG_PLAYING = 0.2;
export const DRAG_SILENT = 2;
/** How long the hand, or the breath, takes to take hold again, in s of real time, from letting go. */
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
  /** Where the chain is and how it moves as the frame starts. */
  readonly state: ChainState;
  readonly g: Gravity;
  /** Whether the visitor's hand holds the chain: the music's, and the breath, let go while it does. */
  readonly held: boolean;
  /**
   * Where the frame to be run starts, in s of real time after the moment the
   * music was heard: −real where it ends at that moment, as the chain's does
   * without twins, and 0 where it is run a frame ahead (decision 51).
   */
  readonly from: number;
}

/** What every force reads of a frame alike, worked out once. */
export interface Reading {
  /** What the music says this frame: a force acts only while a source plays. */
  readonly heard: Signals;
  /** The depth of the mode's force, and the multiple the strength asks for. */
  readonly depth: number;
  readonly times: number;
  /** Down along gravity, as a unit vector, and the side, a right angle from it. */
  readonly down: Point;
  readonly side: Point;
}

/** A kick of the pivot on the piece's own clock: when it began, in s, where it takes the pivot at its height, in m, and its rise and fall, in s. */
export interface Kicked {
  readonly at: number;
  readonly x: number;
  readonly y: number;
  readonly attack: number;
  readonly decay: number;
}

/** The pivot's kicks, which outlast the force that kicked: the piece's time on their clock, and how a force adds one. */
export interface Pivot {
  readonly clock: number;
  kick(kicked: Kicked): void;
}

/** What a force puts into the physics over a frame, besides the drag it asks for and the pivot's kicks. */
export interface Part {
  readonly hand?: MusicHand;
  readonly tilt?: readonly [Gravity, Gravity];
  readonly heat?: Heat;
}

/**
 * One of the music's forces, from the frame it begins in: a mode's force
 * begins afresh each time it is chosen or the music starts again.
 */
export interface MusicForce {
  /** The drag it asks for while the music plays, and in its silence, in 1/s. */
  drag(silent: boolean): number;
  /** What it puts into the physics over the frame about to be run. */
  frame(input: ForceFrame, reading: Reading, pivot: Pivot): Part;
  /** The frame was run for `simulated` s of the piece's time, its span or less. */
  ran(simulated: number): void;
  /** Its hand, or the breath, lets go, to take hold again over a second. */
  letGo(): void;
}

/** No lean of gravity. */
export const NO_TILT: Gravity = { x: 0, y: 0 };

/** Follows `to` from `from` over `dt` s, as a first-order lag of `tau` s. */
export function ease(
  from: number,
  to: number,
  dt: number,
  tau: number,
): number {
  return from + (to - from) * (1 - Math.exp(-dt / tau));
}

/** How far through a frame of `span` s the `simulated` s run take it, from 0 to 1. */
export function along(simulated: number, span: number): number {
  return span > 0 ? Math.min(1, simulated / span) : 1;
}

/** Down along gravity, as a unit vector, straight down when there is none; and the side, a right angle from it, to the right as one looks down. */
export function directions(g: Gravity): { down: Point; side: Point } {
  const strength = Math.hypot(g.x, g.y);
  const down =
    strength > 0 ? { x: g.x / strength, y: g.y / strength } : { x: 0, y: -1 };
  return { down, side: { x: -down.y, y: down.x } };
}

/** What gravity `g` turned `angle` rad from `down` towards `side` adds to it, keeping its strength: nothing without gravity. */
export function leaning(
  g: Gravity,
  angle: number,
  down: Point,
  side: Point,
): Gravity {
  const strength = Math.hypot(g.x, g.y);
  if (strength === 0) return NO_TILT;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: strength * (c * down.x + s * side.x) - g.x,
    y: strength * (c * down.y + s * side.y) - g.y,
  };
}
