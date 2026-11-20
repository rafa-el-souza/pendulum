import type { Signals } from "../audio/signals.ts";

// Routes from what the music says to what it does (docs/decisions.md,
// decisions 46 and 49). A route takes one signal to one target, at a depth,
// and follows it with an attack and a release, so that a beat's spike
// becomes a pulse that fades. A mode is a list of routes, as data, and may
// colour the piece with the note the bass holds; the strength the music's
// group sets multiplies them all. What the routes give is a record a frame
// of what the music adds to the light; it never writes the values of the
// controls. A mode may also name a force, which the piece puts into its
// physics (decisions 75 and 77).

/** The signals a route can take: each from 0 to 1. */
export type Signal =
  | "level"
  | "bass"
  | "mid"
  | "treble"
  | "onset"
  | "kick"
  | "snare"
  | "hat"
  | "hit"
  | "note"
  | "bassChange";

/** What the music adds to the light in a frame. */
export interface Look {
  /** How much brighter and wider the chain's halo is, from 0. */
  readonly glow: number;
  /** How much stronger the trails' light is, as a share of their own, from 0. */
  readonly trail: number;
  /** The share of the twins to be born again from the chain this frame, from 0. */
  readonly births: number;
  /** How much longer the trails last, as a share of the time their control gives, from 0. */
  readonly linger: number;
  /** How much wider the fan opens for the twins born now, in powers of ten, from 0. */
  readonly spread: number;
  /** Whether a strobe flashes this frame, stamping the chain into its trails, where the strobe is on: above 0 when it does. */
  readonly flash: number;
  /** The name of the note the bass holds, from 0 for C to 11 for B, or −1 before any. */
  readonly note: number;
  /** How much of that note's colour the piece takes, from 0 to 1. */
  readonly tint: number;
}

/** What a route can add to. */
export type Target =
  "glow" | "trail" | "births" | "linger" | "spread" | "flash";

export interface Route {
  readonly from: Signal;
  readonly to: Target;
  /** How much of the target the signal at its highest gives, at the middle strength. */
  readonly depth: number;
  /** How long the route takes to follow a rise and a fall, in s: 0 follows at once. */
  readonly attack: number;
  readonly release: number;
  /** The signal counts only above this, what is above stretched from 0 to 1. */
  readonly above?: number;
}

/** What a mode colours with the note the bass holds, and how much at the middle strength. */
export interface Tint {
  readonly to: "chain" | "twins";
  readonly depth: number;
}

/**
 * A force a mode puts into the physics besides its light: the kicks move the
 * pivot aside and back, as a speaker's cone; or a hand of the music holds the
 * tip and swings it from side to side on the kicks (decision 75); or the
 * loudness gives the chain energy, which it loses in silence; or gravity
 * leans from side to side on the kicks (decision 77).
 */
export interface Force {
  readonly kind: "speaker" | "dance" | "breath" | "sway";
  /**
   * At the middle strength: how far a full kick takes the pivot of a chain of
   * a few masses, in m; how far the hand swings, or gravity leans, at full
   * loudness, in rad; or the energy the chain is drawn to at full loudness,
   * in shares of the energy that lifts it, hanging, level.
   */
  readonly depth: number;
}

/** A way for the music to act on the piece. */
export interface Mode {
  /** Its key in the address: lowercase letters. */
  readonly id: string;
  /** Its name in the music's group. */
  readonly name: string;
  readonly routes: readonly Route[];
  readonly tint?: Tint;
  readonly force?: Force;
}

/** No light added: the look while the music does nothing. */
export const UNLIT: Look = {
  glow: 0,
  trail: 0,
  births: 0,
  linger: 0,
  spread: 0,
  flash: 0,
  note: -1,
  tint: 0,
};

/** The strength's five steps, from 1, each a multiple of every route's depth; the middle one leaves them as they are. */
export const STRENGTHS: readonly number[] = [0.25, 0.5, 1, 1.5, 2.25];
/** The step the piece opens at, from 1. */
export const STRENGTH_INITIAL = 3;

/** With reduced motion asked for, no route follows faster than this, in s, and nothing is born or flashes on a beat. */
const SLOW_ATTACK = 0.4;
const SLOW_RELEASE = 1;
/**
 * A note's colour comes in over TINT_ATTACK, in s, while the bass has played
 * one in the last TINT_KEEP, and goes over TINT_RELEASE when it has not.
 */
const TINT_ATTACK = 0.2;
const TINT_KEEP = 1;
const TINT_RELEASE = 1;

/** Follows a mode's routes frame by frame. */
export class Router {
  readonly mode: Mode;
  private readonly slow: boolean;
  /** Where each route has got to, from 0 to 1 of its signal. */
  private readonly followed: Float64Array;
  /** The name of the note the bass holds, or −1; how long since it played one, in s; and how much of its colour shows, from 0 to 1. */
  private note = -1;
  private unheard = Number.POSITIVE_INFINITY;
  private present = 0;

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
    const sum = {
      glow: 0,
      trail: 0,
      births: 0,
      linger: 0,
      spread: 0,
      flash: 0,
    };
    this.mode.routes.forEach((route, i) => {
      if (this.slow && (route.to === "births" || route.to === "flash")) {
        return;
      }
      const signal = heard === null ? 0 : heard[route.from];
      const above = route.above ?? 0;
      const target = Math.max(0, (signal - above) / (1 - above));
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
    return { ...sum, ...this.colour(heard, dt, times) };
  }

  /** The note the bass holds, by its name, and how much of its colour the mode gives. */
  private colour(
    heard: Signals | null,
    dt: number,
    times: number,
  ): { note: number; tint: number } {
    const playing = heard !== null && !heard.silent && heard.bassNote > 0;
    if (playing) {
      this.unheard = 0;
      const name = ((Math.round(heard.bassNote) % 12) + 12) % 12;
      if (this.note < 0 || heard.bassChange > 0) this.note = name;
    } else {
      this.unheard += dt;
    }
    const target = this.unheard <= TINT_KEEP ? 1 : 0;
    let tau = target > this.present ? TINT_ATTACK : TINT_RELEASE;
    if (this.slow) {
      tau = Math.max(tau, target > this.present ? SLOW_ATTACK : SLOW_RELEASE);
    }
    this.present += (1 - Math.exp(-dt / tau)) * (target - this.present);
    const depth = this.mode.tint?.depth ?? 0;
    return {
      note: this.note,
      tint: Math.min(1, depth * this.present * times),
    };
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
