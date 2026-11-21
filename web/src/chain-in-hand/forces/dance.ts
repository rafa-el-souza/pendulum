import { SURE } from "../../audio/beat.ts";
import type { Signals } from "../../audio/signals.ts";
import { createHand, type Chain, type Gravity } from "../../physics/chain.ts";
import type { Point } from "../../physics/drive.ts";
import { laguerreZero } from "../../physics/modes.ts";
import { handDamping } from "../parameters.ts";
import {
  BEATS,
  DANCE_OPENS,
  alongFigure,
  pointsOf,
  type Choreography,
  type Figure,
  type Lead,
  type Place,
} from "./choreography.ts";
import {
  DRAG_SILENT,
  TAKE_HOLD,
  along,
  ease,
  type ForceFrame,
  type MusicForce,
  type Part,
  type Reading,
} from "./common.ts";
import { SLOW_CROSS, SLOW_SWING_EASE, WIDEST_SWING } from "./swing.ts";

// The dancing hand (docs/decisions.md, decisions 75 and 83): a hand of the
// music holds the tip and leads it round a figure, as the choreography asks.
// Led by a sound heard, it sets off for the figure's next point on the sound;
// led by the beat clock, it reaches each point on its beat. The figure swings
// as far as the loudness, and the place turns it: below, the chain hanging;
// to a side, held level; above, standing. It lets go while the visitor's hand
// holds the chain, and takes hold again over a second. As the dance opens, it
// is decision 75's swing: a side on each kick, crossing in a snap.

/** The dancing hand's grip, a step of the visitor's (decision 18): elastic enough to swing the chain, firm enough to calm it. */
export const DANCE_GRIP = 12;
/** How long a snap takes from one point to the next, in s of real time. */
export const CROSS = 0.12;
/** How fast the figure's size follows the loudness, in s. */
const SWING_EASE = 0.15;
/** How far inward a figure reaches at the widest swing, as a share of the reach. */
export const INWARD = 0.6;
/** How much nearer the pivot the turn goes at the widest swing, as a share of the reach. */
export const TURN_SLACK = 0.5;
/** How long the hand led by the clock takes to come into its figure once the clock is sure, and to go back to the middle when it is not, in s. */
export const ENGAGE = 0.5;
/** A conductor's beat goes through a point 1 + ICTUS times as fast as a smooth move, and 1 − ICTUS times as fast halfway between. */
export const ICTUS = 0.8;
/**
 * A smooth move led by sounds takes the time since the sound before, no
 * less than LEAST_MOVE and no more than MOST_MOVE, in s; the first one, from
 * the middle, FIRST_MOVE.
 */
const LEAST_MOVE = 0.25;
const MOST_MOVE = 1.5;
const FIRST_MOVE = 0.5;
/** The middle of a figure's plane: the chain hanging along the place, at its full reach. */
const MIDDLE: Point = { x: 0, y: 0 };
/** How far round from straight down each place turns the figure, in rad. */
const TURNS: Record<Place, number> = {
  below: 0,
  side: Math.PI / 2,
  above: Math.PI,
};

/** Eases in and out, from 0 to 1. */
function smoothstep(u: number): number {
  return u * u * (3 - 2 * u);
}

/** How far through a step of its figure a conductor's beat is, a share `f` of the step's time in: quick through the points, slow between. */
function ictus(f: number): number {
  return f + (ICTUS * Math.sin(2 * Math.PI * f)) / (2 * Math.PI);
}

/** Whether the sound that leads the hand was heard this frame. */
function sounded(lead: Lead, heard: Signals): boolean {
  switch (lead) {
    case "clock":
      return false;
    case "kick":
      return heard.kick > 0;
    case "snare":
      return heard.snare > 0;
    case "hat":
      return heard.hat > 0;
    case "onset":
      return heard.onset > 0;
    case "hit":
      return heard.hit > 0;
    case "note":
      return heard.note > 0;
    case "bass":
      return heard.bassChange > 0;
  }
}

/** A figure's `k`th point on from its first: the turn's go on round the pivot. */
function pointAt(figure: Figure, k: number): Point {
  if (figure === "turn") return { x: k / 4, y: 0 };
  const points = pointsOf(figure);
  const n = points.length;
  return points[((k % n) + n) % n] ?? MIDDLE;
}

/** Where the hand is `p` points along its figure; before the first, between the middle and it. */
function onFigure(figure: Figure, p: number): Point {
  if (p >= 0) return alongFigure(figure, p / pointsOf(figure).length);
  const first = pointAt(figure, 0);
  const share = Math.max(0, p + 1);
  return { x: first.x * share, y: first.y * share };
}

/** The point the share `s` of the way from `a` to `b`. */
function between(a: Point, b: Point, s: number): Point {
  return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
}

/**
 * The beats a point for which a turn of a figure of `points` points lasts
 * about as long as the chain's slowest swing, seen at `speed` (its frequency
 * squared is λ₁ g / l, PH-7): the nearest of BEATS by their ratio; the
 * longest without gravity.
 */
export function autoBeats(
  chain: Chain,
  g: Gravity,
  bpm: number,
  speed: number,
  points: number,
): number {
  const strength = Math.hypot(g.x, g.y);
  const longest = BEATS[BEATS.length - 1] ?? 1;
  if (strength === 0) return longest;
  const rod = chain.totalLength / chain.n;
  const omega = Math.sqrt((laguerreZero(chain.n, 1) * strength) / rod);
  const swing = (2 * Math.PI) / omega / speed;
  let best = longest;
  let off = Number.POSITIVE_INFINITY;
  for (const beats of BEATS) {
    const turn = (points * beats * 60) / bpm;
    const ratio = Math.abs(Math.log(turn / swing));
    if (ratio < off) {
      best = beats;
      off = ratio;
    }
  }
  return best;
}

/** The dancing hand: where it is in its figure, how far it swings, how firmly it holds, and where its target got to. */
export class Dance implements MusicForce {
  readonly #slow: boolean;
  // The choreography of the frame before, which a change starts afresh.
  #was = "";
  // How far the figure swings, in rad.
  #size = 0;
  // Led by sounds: how many it has heard, the point it goes to, and its way
  // there: a snap from a place in the figure's plane, or a move along the
  // figure, from where it was, in points; how far through it it is, from 0
  // to 1, how long it takes and the time since the sound before, in s.
  #heard = 0;
  #step = -1;
  #from: Point = MIDDLE;
  #to: Point = MIDDLE;
  #fromAlong = -1;
  #toAlong = -1;
  #crossed = 1;
  #cross = CROSS;
  #sinceSound = Number.POSITIVE_INFINITY;
  // Led by the clock: the bars it has counted, the bar the frame before heard
  // the beat in, how far into its figure the hand is (0 to 1), how many
  // points along it the frame before ended, or null before the clock was
  // sure; the beats a point, the points added where "auto" changed them, and
  // the beats a second.
  #bars = 0;
  #lastBar: number | null = null;
  #engaged = 0;
  #along: number | null = null;
  #apart = 1;
  #added = 0;
  #perBeat = 2;
  // How firmly it holds, from 0 to 1; where its target got to at the end of
  // the frame run last, and the frame being run.
  #grip = 0;
  #target: Point | null = null;
  #running: { span: number; from: Point; to: Point } | null = null;

  /** With reduced motion asked for (`slow`), a snap takes a second, and the swing follows the loudness over a second. */
  constructor(slow: boolean) {
    this.#slow = slow;
  }

  drag(silent: boolean): number {
    return silent ? DRAG_SILENT : 0;
  }

  frame(input: ForceFrame, reading: Reading): Part {
    const dance = input.dance ?? DANCE_OPENS;
    const { real, span, chain } = input;
    const { heard } = reading;
    const asked = `${dance.figure} ${dance.lead} ${String(dance.beats)} ${dance.feel}`;
    if (asked !== this.#was) {
      this.#was = asked;
      this.#afresh();
    }

    // where in its figure the hand is as the frame starts and as it ends,
    // and how far it swings then
    let before: Point;
    let after: Point;
    let engagedBefore = 1;
    let engagedAfter = 1;
    const sizeBefore = this.#size;
    if (dance.lead === "clock") {
      engagedBefore = this.#engaged;
      const [start, end] = this.#clock(dance, input, heard);
      engagedAfter = this.#engaged;
      before = this.#clockPlace(dance, start);
      this.#ease(heard, reading, real);
      after = this.#clockPlace(dance, end);
    } else {
      this.#sinceSound += real;
      if (sounded(dance.lead, heard)) {
        const every = typeof dance.beats === "number" ? dance.beats : 1;
        if (this.#heard % Math.max(1, every) === 0) this.#turn(dance);
        this.#heard++;
      }
      before = this.#soundPlace(dance);
      this.#crossed = Math.min(1, this.#crossed + real / this.#cross);
      this.#ease(heard, reading, real);
      after = this.#soundPlace(dance);
    }

    // the hand, which lets go while the visitor's holds
    this.#running = null;
    if (input.held) {
      this.#grip = 0;
      this.#target = null;
      return {};
    }
    this.#grip = Math.min(1, this.#grip + real / TAKE_HOLD);
    const tip = chain.n - 1;
    const reach = chain.totalLength;
    const size = (s: number, engaged: number) =>
      dance.lead === "clock" ? s * engaged : s;
    const from =
      this.#target ??
      this.#world(
        dance,
        before,
        size(sizeBefore, engagedBefore),
        reach,
        reading,
      );
    const to = this.#world(
      dance,
      after,
      size(this.#size, engagedAfter),
      reach,
      reading,
    );
    const grip = createHand(chain, tip, DANCE_GRIP, handDamping(DANCE_GRIP));
    this.#running = { span, from, to };
    return {
      hand: {
        index: tip,
        stiffness: grip.stiffness * this.#grip,
        damping: grip.damping * this.#grip,
        fastest: grip.fastest,
        from,
        to,
      },
    };
  }

  ran(simulated: number): void {
    const running = this.#running;
    if (running !== null) {
      const share = along(simulated, running.span);
      this.#target = {
        x: running.from.x + (running.to.x - running.from.x) * share,
        y: running.from.y + (running.to.y - running.from.y) * share,
      };
    }
    this.#running = null;
  }

  letGo(): void {
    this.#grip = 0;
    this.#target = null;
    this.#running = null;
  }

  /** The figure begins afresh: led by sounds, from the middle; led by the clock, coming into it as the clock is sure. */
  #afresh(): void {
    this.#heard = 0;
    this.#step = -1;
    this.#from = MIDDLE;
    this.#to = MIDDLE;
    this.#fromAlong = -1;
    this.#toAlong = -1;
    this.#crossed = 1;
    this.#cross = CROSS;
    this.#sinceSound = Number.POSITIVE_INFINITY;
    this.#engaged = 0;
    this.#along = null;
  }

  /** The figure's size follows the loudness, as decision 75's swing did. */
  #ease(heard: Signals, reading: Reading, real: number): void {
    const loudness = heard.silent ? 0 : heard.level;
    this.#size = ease(
      this.#size,
      Math.min(WIDEST_SWING, reading.depth * loudness * reading.times),
      real,
      this.#slow ? SLOW_SWING_EASE : SWING_EASE,
    );
  }

  /** How long a snap takes, in s of real time. */
  #snap(): number {
    return this.#slow ? Math.max(CROSS, SLOW_CROSS) : CROSS;
  }

  /** On a sound, the hand sets off for the figure's next point from where it is. */
  #turn(dance: Choreography): void {
    if (dance.feel === "snap") {
      this.#from = this.#soundPlace(dance);
      this.#step += 1;
      this.#to = pointAt(dance.figure, this.#step);
      this.#crossed = 0;
      this.#cross = this.#snap();
    } else {
      this.#fromAlong = this.#soundAlong(dance);
      this.#step += 1;
      this.#toAlong = this.#step;
      this.#crossed = 0;
      const move = Number.isFinite(this.#sinceSound)
        ? Math.min(MOST_MOVE, Math.max(LEAST_MOVE, this.#sinceSound))
        : FIRST_MOVE;
      this.#cross = this.#slow ? Math.max(move, SLOW_CROSS) : move;
    }
    this.#sinceSound = 0;
  }

  /** How many points along its figure a move led by sounds has taken the hand. */
  #soundAlong(dance: Choreography): number {
    const u = this.#crossed;
    const done = dance.feel === "ictus" ? ictus(u) : u;
    return this.#fromAlong + (this.#toAlong - this.#fromAlong) * done;
  }

  /** Where in the figure's plane the hand led by sounds is. */
  #soundPlace(dance: Choreography): Point {
    if (dance.feel === "snap") {
      const u = this.#crossed;
      return {
        x: this.#from.x + (this.#to.x - this.#from.x) * u * u * (3 - 2 * u),
        y: this.#from.y + (this.#to.y - this.#from.y) * u * u * (3 - 2 * u),
      };
    }
    return onFigure(dance.figure, this.#soundAlong(dance));
  }

  /**
   * The clock's frame: the bars counted, the hand coming into its figure or
   * leaving it, and how many points along it the frame starts and ends, or
   * where it was left while the clock is not sure.
   */
  #clock(
    dance: Choreography,
    input: ForceFrame,
    heard: Signals,
  ): [number | null, number | null] {
    const beat = heard.beat;
    if (beat !== null) {
      if (this.#lastBar !== null) {
        if (beat.bar < this.#lastBar - 0.5) this.#bars++;
        else if (beat.bar > this.#lastBar + 0.5) this.#bars--;
      }
      this.#lastBar = beat.bar;
    }
    const sure = beat !== null && !heard.silent && beat.confidence >= SURE;
    if (!sure) {
      this.#engaged = Math.max(0, this.#engaged - input.real / ENGAGE);
      return [this.#along, this.#along];
    }
    const perBeat = beat.bpm / 60;
    const beatsAt = (t: number) => 4 * (this.#bars + beat.bar) + t * perBeat;
    const start = beatsAt(input.from);
    const end = beatsAt(input.from + input.real);
    const wanted =
      dance.beats === "auto"
        ? autoBeats(
            input.chain,
            input.g,
            beat.bpm,
            input.speed,
            pointsOf(dance.figure).length,
          )
        : dance.beats;
    if (this.#engaged === 0 || this.#along === null) {
      // coming in afresh, its first point on a bar's first beat
      this.#apart = wanted;
      this.#added = 0;
    } else if (wanted !== this.#apart) {
      // "auto" changes on a bar's first beat that is a point of both
      const bar = 4 * Math.floor(end / 4);
      const was = bar / this.#apart + this.#added;
      const now = bar / wanted;
      if (
        bar > start &&
        Math.abs(was - Math.round(was)) < 1e-9 &&
        Math.abs(now - Math.round(now)) < 1e-9
      ) {
        this.#added = Math.round(was) - Math.round(now);
        this.#apart = wanted;
      }
    }
    this.#perBeat = perBeat;
    this.#engaged = Math.min(1, this.#engaged + input.real / ENGAGE);
    const first = start / this.#apart + this.#added;
    const last = end / this.#apart + this.#added;
    this.#along = last;
    return [first, last];
  }

  /** Where in the figure's plane the hand led by the clock is, `p` points along it: the middle before the clock was ever sure. */
  #clockPlace(dance: Choreography, p: number | null): Point {
    if (p === null) return MIDDLE;
    const k = Math.floor(p);
    const f = p - k;
    if (dance.feel === "smooth") return onFigure(dance.figure, p);
    if (dance.feel === "ictus") return onFigure(dance.figure, k + ictus(f));
    // a snap, which arrives on the point's beat
    const window = Math.min(1, (this.#snap() * this.#perBeat) / this.#apart);
    const a = pointAt(dance.figure, k);
    if (f <= 1 - window) return a;
    const s = smoothstep((f - (1 - window)) / window);
    return between(a, pointAt(dance.figure, k + 1), s);
  }

  /** Where a point of the figure's plane is, from the pivot, for a figure `size` rad wide on a reach of `reach` m. */
  #world(
    dance: Choreography,
    at: Point,
    size: number,
    reach: number,
    reading: Reading,
  ): Point {
    const share = size / WIDEST_SWING;
    const turned = TURNS[dance.place];
    let angle: number;
    let radius: number;
    if (dance.figure === "turn") {
      angle = turned + 2 * Math.PI * at.x;
      radius = reach * (1 - TURN_SLACK * share);
    } else {
      angle = turned === 0 ? at.x * size : turned + at.x * size;
      radius = reach * (1 - at.y * INWARD * share);
    }
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const { down, side } = reading;
    return {
      x: radius * (c * down.x + s * side.x),
      y: radius * (c * down.y + s * side.y),
    };
  }
}
