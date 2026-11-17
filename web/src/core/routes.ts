import type { Signals } from "../audio/signals.ts";

// Routes from what the music says to what it does (docs/decisions.md,
// decision 46). A route takes one signal to one target, at a depth, and
// follows it with an attack and a release, so that a beat's spike becomes a
// pulse that fades. A mode is a list of routes, as data, and the strength
// the card sets multiplies them all. What the routes give is a record a
// frame of what the music adds to the light; it never writes the values of
// the controls. Only the light so far: forces come later, in their own
// record.

/** The signals a route can take. */
export type Signal =
  "level" | "bass" | "mid" | "treble" | "onset" | "kick" | "snare" | "hat";

/** What the music adds to the light in a frame. */
export interface Look {
  /** How much brighter and wider the chain's halo is, from 0. */
  readonly glow: number;
  /** How much stronger the trails' light is, as a share of their own, from 0. */
  readonly trail: number;
  /** The share of the twins to be born again from the chain this frame, from 0. */
  readonly births: number;
}

export type Target = keyof Look;

export interface Route {
  readonly from: Signal;
  readonly to: Target;
  /** How much of the target the signal at its highest gives, at the middle strength. */
  readonly depth: number;
  /** How long the route takes to follow a rise and a fall, in s: 0 follows at once. */
  readonly attack: number;
  readonly release: number;
}

/** A way for the music to act on the piece. */
export interface Mode {
  /** Its key in the address: lowercase letters. */
  readonly id: string;
  /** Its name on the card. */
  readonly name: string;
  readonly routes: readonly Route[];
}

/** No light added: the look while the music does nothing. */
export const UNLIT: Look = { glow: 0, trail: 0, births: 0 };

/** The strength's five steps, from 1, each a multiple of every route's depth; the middle one leaves them as they are. */
export const STRENGTHS: readonly number[] = [0.25, 0.5, 1, 1.5, 2.25];
/** The step the piece opens at, from 1. */
export const STRENGTH_INITIAL = 3;

/** With reduced motion asked for, no route follows faster than this, in s, and nothing is born on a beat. */
const SLOW_ATTACK = 0.4;
const SLOW_RELEASE = 1;

/** Follows a mode's routes frame by frame. */
export class Router {
  readonly mode: Mode;
  private readonly slow: boolean;
  /** Where each route has got to, from 0 to 1 of its signal. */
  private readonly followed: Float64Array;

  constructor(mode: Mode, options: { slow?: boolean } = {}) {
    this.mode = mode;
    this.slow = options.slow ?? false;
    this.followed = new Float64Array(mode.routes.length);
  }

  /**
   * The look of a frame `dt` s after the one before, from what was heard,
   * or null when nothing was, at strength step `strength`, from 1.
   */
  look(heard: Signals | null, dt: number, strength: number): Look {
    const times = STRENGTHS[strength - 1] ?? 1;
    const sum = { glow: 0, trail: 0, births: 0 };
    this.mode.routes.forEach((route, i) => {
      if (this.slow && route.to === "births") return;
      const target = heard === null ? 0 : heard[route.from];
      const was = this.followed[i] ?? 0;
      let tau = target > was ? route.attack : route.release;
      if (this.slow) {
        tau = Math.max(tau, target > was ? SLOW_ATTACK : SLOW_RELEASE);
      }
      const now =
        tau > 0 ? was + (1 - Math.exp(-dt / tau)) * (target - was) : target;
      this.followed[i] = now;
      sum[route.to] += route.depth * now * times;
    });
    return sum;
  }
}

/** The mode and the strength an address carries ("?music=none&strength=4"); anything else as the piece opens, at the first mode. */
export function readMusic(
  modes: readonly string[],
  search: string,
): { mode: string; strength: number } {
  const query = new URLSearchParams(search);
  const asked = query.get("music") ?? "";
  const step = Number(query.get("strength"));
  return {
    mode: modes.includes(asked) ? asked : (modes[0] ?? ""),
    strength:
      Number.isInteger(step) && step >= 1 && step <= STRENGTHS.length
        ? step
        : STRENGTH_INITIAL,
  };
}

/** The search part of an address carrying the mode and the strength where they differ from how the piece opens, after whatever else `search` carried. */
export function writeMusic(
  modes: readonly string[],
  search: string,
  mode: string,
  strength: number,
): string {
  const query = new URLSearchParams(search);
  query.delete("music");
  query.delete("strength");
  if (mode !== modes[0]) query.set("music", mode);
  if (strength !== STRENGTH_INITIAL) query.set("strength", String(strength));
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}
