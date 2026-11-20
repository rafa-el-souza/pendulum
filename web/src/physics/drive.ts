// What the music puts into the chain's physics over a frame (docs/decisions.md,
// decision 74): one record of plain numbers, a function of the time into the
// frame, which the chain and its twins each evaluate at every stage of their
// own steps, so that both feel the same force at the same instant, though
// they move in pieces of their own (decision 20). A worker takes it as it is,
// and a tape of the motion could keep it.
//
// None of it is in the paper. Gravity, and a pivot that accelerates, enter
// the tension route as gravity in the pivot's frame (PH-4, decision 36); a
// hand pulls on the mass it holds; a drag slows every mass in proportion to
// it. Every value that changes within the frame changes linearly, from its
// value as the frame starts to its value as it ends, save the kicks, whose
// shape is a formula of the time since each began. The kicks move the pivot
// itself, which the drawing shows (decision 75).

import type { Gravity, Hand } from "./chain.ts";

/** A place, or how one moves, x then y, in m or m/s, from the pivot, y up. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The pivot kicked out and back: `kickPlace` of the way to its size and back,
 * from `start`, in s from the frame's start, before 0 for a kick that began
 * in an earlier frame.
 */
export interface Kick {
  readonly start: number;
  /** Where it takes the pivot at its height, in m from its place. */
  readonly x: number;
  readonly y: number;
  /** How long it takes to rise, and to fall back by e, in s. */
  readonly attack: number;
  readonly decay: number;
}

/** A hand of the music, on a spring and a damper as the visitor's (`createHand`), its target moving in a line over the frame. */
export interface MusicHand {
  /** The mass it holds, counted from the top, from 0. */
  readonly index: number;
  /** In N/m, N s/m, and the fastest rate it adds to the motion, in rad/s. */
  readonly stiffness: number;
  readonly damping: number;
  readonly fastest: number;
  /** Where its target is as the frame starts and as it ends, in m from the pivot. */
  readonly from: Point;
  readonly to: Point;
}

/**
 * The thermostat: a drag with a sign, gain × (E − target) / max(E, floor)
 * per second, E being the chain's energy above it hanging at rest, so that
 * the energy is drawn to the target at about the gain, whatever it is.
 */
export interface Heat {
  /** The energy it draws the chain to as the frame starts and as it ends, in J above rest. */
  readonly target: readonly [number, number];
  /** In 1/s. */
  readonly gain: number;
  /** The least energy it divides by, in J, so that near rest it pulls hard but not without end. */
  readonly floor: number;
}

/** What the music puts into the chain's physics over a frame. */
export interface Drive {
  /** The simulated time it spans from the frame's start, in s. */
  readonly span: number;
  /** What it adds to gravity as the frame starts and as it ends, in m/s²: a gravity it turns, less gravity. */
  readonly tilt: readonly [Gravity, Gravity];
  readonly kicks: readonly Kick[];
  readonly hands: readonly MusicHand[];
  /** A drag on every mass in proportion to it, in 1/s, as the frame starts and as it ends. */
  readonly drag: readonly [number, number];
  readonly heat: Heat | null;
}

/** A hand whose every field can be written, to hold where a music hand is at an instant. */
export type WritableHand = { -readonly [K in keyof Hand]: Hand[K] };

/** The height of (1 − e^(−s/attack))³ e^(−s/decay), at s = attack ln(1 + 3 decay / attack). */
function kickHeight(attack: number, decay: number): number {
  const ratio = (3 * decay) / attack;
  return (ratio / (1 + ratio)) ** 3 * (1 + ratio) ** (-attack / decay);
}

/**
 * Where a kick takes the pivot `s` s after it began, as a share of its size:
 * (1 − e^(−s/attack))³ e^(−s/decay), over its height, from 0 at its start,
 * rising with no jolt to 1, and back towards 0.
 */
export function kickPlace(s: number, attack: number, decay: number): number {
  if (!(s > 0)) return 0;
  return (
    ((1 - Math.exp(-s / attack)) ** 3 * Math.exp(-s / decay)) /
    kickHeight(attack, decay)
  );
}

/** How fast a kick moves the pivot `s` s after it began, per metre of its size, in 1/s: the derivative of `kickPlace`. */
export function kickSpeed(s: number, attack: number, decay: number): number {
  if (!(s > 0)) return 0;
  const rise = Math.exp(-s / attack);
  const up = 1 - rise;
  return (
    (Math.exp(-s / decay) *
      ((3 * up * up * rise) / attack - (up * up * up) / decay)) /
    kickHeight(attack, decay)
  );
}

/** Where the pivot is, from its place, and how fast it moves, in m and m/s, x then y, y up. */
export interface PivotMotion {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Where the music's kicks have taken the pivot `t` s into the frame, and how
 * fast it moves there, written to out (decision 75): the sum of every kick's
 * place and speed along its line. The physics runs in the pivot's frame; the
 * drawing adds this, so that the chain, its twins and their trails hang
 * from where the pivot is.
 */
export function pivotAt(drive: Drive, t: number, out: PivotMotion): void {
  out.x = 0;
  out.y = 0;
  out.vx = 0;
  out.vy = 0;
  for (const kick of drive.kicks) {
    const s = t - kick.start;
    const place = kickPlace(s, kick.attack, kick.decay);
    const speed = kickSpeed(s, kick.attack, kick.decay);
    out.x += place * kick.x;
    out.y += place * kick.y;
    out.vx += speed * kick.x;
    out.vy += speed * kick.y;
  }
}

/** How a kick accelerates the pivot `s` s after it began, per metre of its size, in 1/s²: the second derivative of `kickPlace`. */
export function kickPull(s: number, attack: number, decay: number): number {
  if (!(s > 0)) return 0;
  const rise = Math.exp(-s / attack);
  const fall = Math.exp(-s / decay);
  const up = 1 - rise;
  const place = up * up * up;
  const speed = (3 * up * up * rise) / attack;
  const curve = (3 * up * rise * (3 * rise - 1)) / (attack * attack);
  return (
    (fall * (curve - (2 * speed) / decay + place / (decay * decay))) /
    kickHeight(attack, decay)
  );
}

/** How far into its span `t` s is, from 0 to its length; none for a span of no time. */
function share(drive: Drive, t: number): number {
  return drive.span > 0 ? t / drive.span : 0;
}

/** What the music's tilt adds to gravity `t` s into the frame, written to out, in m/s². */
export function musicTilt(
  drive: Drive,
  t: number,
  out: { x: number; y: number },
): void {
  const along = share(drive, t);
  const [start, end] = drive.tilt;
  out.x = start.x + (end.x - start.x) * along;
  out.y = start.y + (end.y - start.y) * along;
}

/**
 * What the music adds to gravity `t` s into the frame, in the pivot's frame,
 * written to out: its tilt, less the acceleration of every kick of the pivot.
 */
export function musicPull(
  drive: Drive,
  t: number,
  out: { x: number; y: number },
): void {
  musicTilt(drive, t, out);
  for (const kick of drive.kicks) {
    const pull = kickPull(t - kick.start, kick.attack, kick.decay);
    out.x -= pull * kick.x;
    out.y -= pull * kick.y;
  }
}

/** The music's drag `t` s into the frame, in 1/s. */
export function musicDrag(drive: Drive, t: number): number {
  const [start, end] = drive.drag;
  return start + (end - start) * share(drive, t);
}

/** Where a music hand's target is `t` s into the frame, and how fast it moves, written to out with its grip. */
export function handAt(
  hand: MusicHand,
  drive: Drive,
  t: number,
  out: WritableHand,
): void {
  const along = share(drive, t);
  const { from, to } = hand;
  out.index = hand.index;
  out.stiffness = hand.stiffness;
  out.damping = hand.damping;
  out.fastest = hand.fastest;
  out.x = from.x + (to.x - from.x) * along;
  out.y = from.y + (to.y - from.y) * along;
  out.vx = drive.span > 0 ? (to.x - from.x) / drive.span : 0;
  out.vy = drive.span > 0 ? (to.y - from.y) / drive.span : 0;
}

/**
 * The thermostat's drag `t` s into the frame, in 1/s, for a chain whose
 * energy above rest is `energy`, in J, measured along gravity as the music
 * tilts it (`Chain.energyAboveRest`).
 */
export function heatDrag(
  heat: Heat,
  drive: Drive,
  t: number,
  energy: number,
): number {
  const [from, to] = heat.target;
  const target = from + (to - from) * share(drive, t);
  return (heat.gain * (energy - target)) / Math.max(energy, heat.floor);
}

/** The fastest rate the command adds to the motion, in rad/s, for the substep: its hands' and its kicks', the inverse of each one's attack. */
export function driveRate(drive: Drive): number {
  let rate = 0;
  for (const hand of drive.hands) rate = Math.max(rate, hand.fastest);
  for (const kick of drive.kicks) rate = Math.max(rate, 1 / kick.attack);
  return rate;
}
