import { SURE, type BeatAt } from "../../audio/beat.ts";
import type { Signals } from "../../audio/signals.ts";
import { createHand, type Chain, type Gravity } from "../../physics/chain.ts";
import type { Point } from "../../physics/drive.ts";
import { laguerreZero } from "../../physics/modes.ts";
import { HAND, handDamping } from "../parameters.ts";
import {
  BEATS,
  DANCE_OPENS,
  GRIPS,
  SLACKS,
  alongFigure,
  heldMass,
  pointsOf,
  sequenceOf,
  type Choreography,
  type Figure,
  type Grab,
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

// The dancing hand (docs/decisions.md, decisions 75, 83, 85 and 87): a hand
// of the music holds a mass of the chain and leads it round a figure, as the
// choreography asks. Led by a sound heard, it sets off for the figure's next
// point on the sound; led by the beat clock, it reaches each point on its
// beat. The figure swings as far as the loudness, or what else the
// choreography has it follow; the place turns it, below, the chain hanging,
// to a side, held level, or above, standing, and the music can turn its
// middle further. The hand grips the mass as firmly as its step asks, or
// pulsing on the beat, with its target as far from the pivot as the mass
// hangs, or nearer by the slack. Over the bars the clock counts, it can let
// go of the chain on a bar's first beat and catch the mass where it is on
// the third, and bring in the next figure on a bar's first beat. It lets go
// while the visitor's hand holds the chain, and takes hold again over a
// second. As the dance opens, it is decision 75's swing: the tip, a side on
// each kick, crossing in a snap, held throughout, the figure kept.

/** The dancing hand's grip as the dance opens, a step of the visitor's (decision 18): elastic enough to swing the chain, firm enough to calm it. */
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
/** Where its size is fixed, the figure swings as wide as for music as loud as it has been. */
const FIXED_LEVEL = 0.5;
/** Following the kicks, the figure swells as far as each is strong, and shrinks over this long, in s. */
const SWELL_FALL = 0.3;
/**
 * The bass's note an octave from those it played lately turns the figure's
 * middle by this share of the dance's depth, at the middle strength: higher
 * to the right, lower to the left; and no further for notes further.
 */
export const BASS_TURN = 0.5;
/** How long the notes the bass played are remembered, as the middle it turns from, in s. */
const BASS_MEMORY = 8;
/** How far the loudness lifts the figure's middle towards the side for music twice as loud as it has been, at the middle strength, in rad: a quarter of a turn, and no further, nor past standing. */
export const LIFT = Math.PI / 2;
/** How fast the lift follows the loudness, in s. */
const LIFT_EASE = 0.5;
/** How long the hand takes to close on the mass it catches, in s of real time. */
export const CATCH = 0.1;
/** How many beats the hand takes to bring the mass it caught back to its figure, and to glide from one figure to the next. */
const GLIDE = 1;
/**
 * Varying with the loudness, the bar's mean level at which the first figure
 * is picked, and the last: between them, the figures share the levels
 * evenly, and a bar within LEVEL_HOLD of the share of the figure it has keeps
 * it.
 */
const QUIET_BAR = 0.3;
const LOUD_BAR = 0.8;
const LEVEL_HOLD = 0.05;
/**
 * The dance moves the first beat of its bars to the clock's once the clock
 * has held another for this many bars: until then, it keeps its own, so the
 * clock's hesitations over which beat is the bar's first do not shake it.
 */
const HOLD_BARS = 2;
/** A beat reached this little after a frame's end is reached in it, against the sums' rounding, in beats. */
const REACHED = 1e-9;
/** The middle of a figure's plane: the chain hanging along the place, at its full reach. */
const MIDDLE: Point = { x: 0, y: 0 };
/** How far round from straight down each place turns the figure, in rad. */
const TURNS: Record<Place, number> = {
  below: 0,
  side: Math.PI / 2,
  above: Math.PI,
};

/** The damping ratio of the dancing hand's grip at `rate` rad/s: the visitor's hand's at its steps (decision 19), and critical past its firmest. */
function gripDamping(rate: number): number {
  return HAND.values.includes(rate) ? handDamping(rate) : 1;
}

/** How far down the chain its mass `index` hangs from the pivot, along its rods, in m: the chain's length at the tip. */
function reachOf(chain: Chain, index: number): number {
  if (index === chain.n - 1) return chain.totalLength;
  let reach = 0;
  for (let i = 0; i <= index; i++) reach += chain.lengths[i] ?? 0;
  return reach;
}

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

/** The count of the beat `at` from the first, and every `every` after, that the span from `start` to `end`, in beats, reaches; null where it reaches none. */
function reached(
  start: number,
  end: number,
  every: number,
  at: number,
): number | null {
  const k = Math.floor((end - at) / every + REACHED);
  return k * every + at > start + REACHED ? k : null;
}

/** The figure of `n` that a bar as loud as `level` picks, keeping `now` where the level is within LEVEL_HOLD of its share. */
function picked(level: number, n: number, now: number): number {
  const width = (LOUD_BAR - QUIET_BAR) / n;
  const low = now === 0 ? -Infinity : QUIET_BAR + now * width - LEVEL_HOLD;
  const high =
    now === n - 1 ? Infinity : QUIET_BAR + (now + 1) * width + LEVEL_HOLD;
  if (level >= low && level < high) return now;
  return Math.min(n - 1, Math.max(0, Math.floor((level - QUIET_BAR) / width)));
}

/** Where along the chain, from the pivot, its mass `index` is, in m. */
function massAt(chain: Chain, theta: Float64Array, index: number): Point {
  let x = 0;
  let y = 0;
  for (let i = 0; i <= index; i++) {
    const l = chain.lengths[i] ?? 0;
    const angle = theta[i] ?? 0;
    x += l * Math.sin(angle);
    y -= l * Math.cos(angle);
  }
  return { x, y };
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

/** The dancing hand: where it is in its figure, how far it swings, where its middle is, how firmly it holds, and where its target got to. */
export class Dance implements MusicForce {
  readonly #slow: boolean;
  // The choreography of the frame before, which a change starts afresh, and
  // the mass it held, which a change lets go of.
  #was = "";
  #grabbed: Grab = DANCE_OPENS.grab;
  // How far the figure swings, in rad, and the kicks' swell, from 0 to 1.
  #size = 0;
  #swell = 0;
  // How far the figure's middle is turned from its place, in rad; the note
  // the bass played last, and the notes it played lately, or null before any.
  #centre = 0;
  #note = 0;
  #notes: number | null = null;
  // How far the grip's pulse on the beat has come in, from 0 to 1.
  #pulsing = 0;
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
  // The beats counted, one a turn of the clock's beat, and where in the beat
  // the frame before heard it, or null before the clock had a beat; the beat
  // its bars begin on, counted the same way, or null before the clock was
  // sure; how far the bars' events have been taken, in beats, so that the
  // clock drawing its beat back over a bar's first does not bring it twice;
  // and the first beat the clock holds instead, as how many beats later, 0
  // for none, and for how long, in s.
  #beats = 0;
  #lastPhase: number | null = null;
  #first: number | null = null;
  #taken: number | null = null;
  #other = 0;
  #otherFor = 0;
  // Led by the clock: how far into its figure the hand is (0 to 1), how many
  // points along it the frame before ended, or null before the clock was
  // sure; the beats a point, the points added where "auto" changed them, and
  // the beats a second.
  #engaged = 0;
  #along: number | null = null;
  #apart = 1;
  #added = 0;
  #perBeat = 2;
  // Over the bars: the figure the hand traces, and its place among those it
  // varies through; the figure it glides from, and how many beats ahead the
  // count it glides from was; how long ago the glide began as the frame ends
  // and how long it lasts, in s; the bar's
  // loudness, summed over the time it was heard, in s; whether the hand has
  // let go of the chain; and where it caught the mass, and how long ago, in s.
  #figure: Figure = DANCE_OPENS.figure;
  #index = 0;
  #figureWas: Figure = DANCE_OPENS.figure;
  #glideBeats = 0;
  #gliding = Number.POSITIVE_INFINITY;
  #glide = GLIDE / 2;
  #barLevel = 0;
  #barHeard = 0;
  #free = false;
  #caught: Point | null = null;
  #catching = Number.POSITIVE_INFINITY;
  // How firmly it holds, from 0 to 1, and how long it takes to close, in s;
  // where its target got to at the end of the frame run last, and the frame
  // being run.
  #grip = 0;
  #closing = TAKE_HOLD;
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
    const asked = `${dance.figure} ${dance.then.join(" ")} ${dance.lead} ${String(dance.beats)} ${dance.feel}`;
    if (asked !== this.#was) {
      this.#was = asked;
      this.#afresh(dance);
    }
    // asked to hold another mass, it lets go, to take hold of it again
    if (dance.grab !== this.#grabbed) {
      this.#grabbed = dance.grab;
      this.letGo();
    }

    // the beats and the bars counted, and, over them, the figure and the hand
    // letting go and taking hold again
    this.#count(heard, real);
    this.#overBars(dance, input, heard);

    // where in its figure, and in the figure it glides from, the hand is as
    // the frame starts and as it ends, how far it swings then, and where its
    // middle is
    let before: Point;
    let after: Point;
    let beforeWas: Point | null = null;
    let afterWas: Point | null = null;
    let engagedBefore = 1;
    let engagedAfter = 1;
    const sizeBefore = this.#size;
    const centreBefore = this.#centre;
    const glidedBefore = Math.max(0, (this.#gliding - real) / this.#glide);
    const glidedAfter = this.#gliding / this.#glide;
    const gliding = glidedBefore < 1;
    // where the count the hand glides from had it, as many points ahead as
    // that count was beats
    const glided = (p: number | null) =>
      p === null ? null : p + this.#glideBeats / this.#apart;
    if (dance.lead === "clock") {
      engagedBefore = this.#engaged;
      const [start, end] = this.#clock(dance, input, heard);
      engagedAfter = this.#engaged;
      before = this.#clockPlace(dance, this.#figure, start);
      if (gliding)
        beforeWas = this.#clockPlace(dance, this.#figureWas, glided(start));
      this.#express(dance, heard, reading, real);
      after = this.#clockPlace(dance, this.#figure, end);
      if (gliding)
        afterWas = this.#clockPlace(dance, this.#figureWas, glided(end));
    } else {
      this.#sinceSound += real;
      if (sounded(dance.lead, heard)) {
        const every = typeof dance.beats === "number" ? dance.beats : 1;
        if (this.#heard % Math.max(1, every) === 0) this.#turn(dance);
        this.#heard++;
      }
      before = this.#soundPlace(dance, this.#figure);
      if (gliding) beforeWas = this.#soundPlace(dance, this.#figureWas);
      this.#crossed = Math.min(1, this.#crossed + real / this.#cross);
      this.#express(dance, heard, reading, real);
      after = this.#soundPlace(dance, this.#figure);
      if (gliding) afterWas = this.#soundPlace(dance, this.#figureWas);
    }

    // the hand, which lets go while the visitor's holds, and where it has
    // let go of the chain over the bars
    this.#running = null;
    if (input.held) {
      this.#grip = 0;
      this.#closing = TAKE_HOLD;
      this.#target = null;
      this.#free = false;
      this.#caught = null;
      return {};
    }
    if (this.#free) {
      this.#grip = 0;
      this.#target = null;
      return {};
    }
    this.#grip = Math.min(1, this.#grip + real / this.#closing);
    const held = heldMass(dance.grab, chain.n);
    const reach = reachOf(chain, held) * (1 - (SLACKS[dance.slack] ?? 0));
    const size = (s: number, engaged: number) =>
      dance.lead === "clock" ? s * engaged : s;
    // the point, gliding from where the figure before would have it
    const place = (
      now: Point,
      was: Point | null,
      glided: number,
      swing: number,
      centre: number,
    ): Point => {
      const point = this.#world(
        dance,
        this.#figure,
        now,
        swing,
        centre,
        reach,
        reading,
      );
      if (was === null || glided >= 1) return point;
      const old = this.#world(
        dance,
        this.#figureWas,
        was,
        swing,
        centre,
        reach,
        reading,
      );
      return between(old, point, smoothstep(glided));
    };
    const from =
      this.#target ??
      place(
        before,
        beforeWas,
        glidedBefore,
        size(sizeBefore, engagedBefore),
        centreBefore,
      );
    let to = place(
      after,
      afterWas,
      glidedAfter,
      size(this.#size, engagedAfter),
      this.#centre,
    );
    // a mass caught, brought back from where it was to the figure
    if (this.#caught !== null) {
      const back = this.#catching / this.#glide;
      if (back < 1) to = between(this.#caught, to, smoothstep(back));
      else this.#caught = null;
    }
    const rate = GRIPS[dance.grip - 1] ?? DANCE_GRIP;
    const grip = createHand(chain, held, rate, gripDamping(rate));
    const hold = this.#grip * this.#pulse(dance, input, heard);
    this.#running = { span, from, to };
    return {
      hand: {
        index: held,
        stiffness: grip.stiffness * hold,
        damping: grip.damping * hold,
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
    this.#closing = TAKE_HOLD;
    this.#target = null;
    this.#caught = null;
    this.#running = null;
  }

  /** The figure begins afresh, the first of those it varies through: led by sounds, from the middle; led by the clock, coming into it as the clock is sure. */
  #afresh(dance: Choreography): void {
    this.#figure = dance.figure;
    this.#figureWas = dance.figure;
    this.#index = 0;
    this.#gliding = Number.POSITIVE_INFINITY;
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

  /**
   * The beats, counted one a turn of the clock's beat, which holds once the
   * clock is sure; and the first beat of the dance's bars: the clock's, as it
   * is first sure, and the clock's again once it has held another for
   * HOLD_BARS bars, the figure gliding there over a beat.
   */
  #count(heard: Signals, real: number): void {
    const beat = heard.beat;
    if (beat === null) {
      this.#lastPhase = null;
      this.#first = null;
      this.#taken = null;
      return;
    }
    // how many whole beats the clock's bar has gone since its first
    const into = Math.round(4 * beat.bar - beat.phase);
    if (this.#lastPhase === null) this.#beats = into;
    else if (beat.phase < this.#lastPhase - 0.5) this.#beats++;
    else if (beat.phase > this.#lastPhase + 0.5) this.#beats--;
    this.#lastPhase = beat.phase;
    if (heard.silent || beat.confidence < SURE) return;
    const clocks = this.#beats - into;
    if (this.#first === null) {
      this.#first = clocks;
      this.#taken = null;
      return;
    }
    const later = (((clocks - this.#first) % 4) + 4) % 4;
    if (later !== this.#other) {
      this.#other = later;
      this.#otherFor = 0;
    }
    if (later === 0) return;
    this.#otherFor += real;
    if ((this.#otherFor * beat.bpm) / 60 < 4 * HOLD_BARS) return;
    // the nearer way round: on by one or two beats, or back by one
    const by = later <= 2 ? later : later - 4;
    this.#first += by;
    if (this.#taken !== null) this.#taken -= by;
    this.#other = 0;
    this.#otherFor = 0;
    this.#figureWas = this.#figure;
    this.#glideBeats = by;
    this.#gliding = 0;
    this.#glide = (GLIDE * 60) / beat.bpm;
  }

  /** The beats counted at `t` s after the moment the frame heard, from the first of the dance's bars before it. */
  #beatsAt(beat: BeatAt, t: number): number {
    return this.#beats - (this.#first ?? 0) + beat.phase + t * (beat.bpm / 60);
  }

  /**
   * Over the bars, while the clock is sure: on a bar's first beat, the next
   * figure comes in, or the one the bar's loudness picks, and the hand lets
   * go of the chain, as the choreography asks; on the bar's third beat, or as
   * soon as the clock is not sure, the hand that let go catches the mass it
   * held where it is.
   */
  #overBars(dance: Choreography, input: ForceFrame, heard: Signals): void {
    const { real } = input;
    this.#gliding += real;
    this.#catching += real;
    if (!heard.silent) {
      this.#barLevel += heard.level * real;
      this.#barHeard += real;
    }
    const beat = heard.beat;
    const sure = beat !== null && !heard.silent && beat.confidence >= SURE;
    const perBeat = beat === null ? 0 : beat.bpm / 60;
    const at = (t: number) => (beat === null ? 0 : this.#beatsAt(beat, t));
    // from where the events were taken to, never back
    const end = at(input.from + real);
    const start = this.#first === null ? end : (this.#taken ?? at(input.from));
    if (this.#first !== null) this.#taken = Math.max(start, end);
    if (this.#free) {
      const third = sure ? reached(start, end, 4, 2) : null;
      if (!sure || third !== null) {
        const { chain, state } = input;
        this.#free = false;
        this.#caught = massAt(
          chain,
          state.theta,
          heldMass(dance.grab, chain.n),
        );
        this.#target = this.#caught;
        this.#catching = third === null ? 0 : (end - (4 * third + 2)) / perBeat;
        this.#grip = 0;
        this.#closing = CATCH;
      }
    }
    if (!sure) return;
    const one = reached(start, end, 4, 0);
    if (one === null) return;
    const since = (end - 4 * one) / perBeat;
    const level = this.#barHeard > 0 ? this.#barLevel / this.#barHeard : 0;
    this.#barLevel = 0;
    this.#barHeard = 0;
    if (dance.vary !== 0) {
      const sequence = sequenceOf(dance);
      const next =
        dance.vary === "level"
          ? picked(level, sequence.length, this.#index)
          : one % dance.vary === 0
            ? (this.#index + 1) % sequence.length
            : this.#index;
      if (next !== this.#index) {
        this.#index = next;
        this.#figureWas = this.#figure;
        this.#glideBeats = 0;
        this.#figure = sequence[next] ?? dance.figure;
        this.#gliding = since;
        this.#glide = GLIDE / perBeat;
      }
    }
    if (dance.toss !== 0 && one % dance.toss === 0) {
      this.#free = true;
      this.#caught = null;
      this.#glide = GLIDE / perBeat;
    }
  }

  /**
   * What the music changes as the hand goes: the figure's size follows the
   * loudness, as decision 75's swing did, or what else the choreography
   * asks; and its middle turns as the choreography asks, or stays.
   */
  #express(
    dance: Choreography,
    heard: Signals,
    reading: Reading,
    real: number,
  ): void {
    const loudness = this.#follows(dance, heard, real);
    const swing = this.#slow ? SLOW_SWING_EASE : SWING_EASE;
    this.#size = ease(
      this.#size,
      Math.min(WIDEST_SWING, reading.depth * loudness * reading.times),
      real,
      swing,
    );
    let centre = 0;
    let tau = swing;
    if (dance.center === "bass") {
      centre = this.#bassTurn(heard, reading, real);
    } else if (dance.center === "level" && !heard.silent) {
      centre = Math.min(
        LIFT,
        LIFT * heard.level * reading.times,
        Math.PI - TURNS[dance.place],
      );
    }
    if (dance.center === "level") tau = Math.max(swing, LIFT_EASE);
    this.#centre = ease(this.#centre, centre, real, tau);
  }

  /** How loud what the figure's size follows is, from 0 to 1, about a half where it has been, and 0 in the music's silence. */
  #follows(dance: Choreography, heard: Signals, real: number): number {
    // the kicks' swell, which falls between them
    this.#swell = heard.silent
      ? 0
      : Math.max(heard.kick, this.#swell * Math.exp(-real / SWELL_FALL));
    if (heard.silent) return 0;
    switch (dance.size) {
      case "level":
        return heard.level;
      case "fixed":
        return FIXED_LEVEL;
      case "bass":
        return heard.bass;
      case "treble":
        return heard.treble;
      case "kick":
        return this.#swell;
    }
  }

  /**
   * How far the bass's note turns the figure's middle, in rad, from the notes
   * it played lately: to the right for a higher one, to the left for a lower;
   * held while the bass rests, and none in the music's silence.
   */
  #bassTurn(heard: Signals, reading: Reading, real: number): number {
    if (heard.silent) return 0;
    if (heard.bassNote > 0) {
      this.#note = heard.bassNote;
      this.#notes =
        this.#notes === null
          ? heard.bassNote
          : ease(this.#notes, heard.bassNote, real, BASS_MEMORY);
    }
    if (this.#notes === null) return 0;
    const octaves = Math.min(1, Math.max(-1, (this.#note - this.#notes) / 12));
    return octaves * BASS_TURN * reading.depth * reading.times;
  }

  /**
   * How firmly the hand grips this frame, as a share of its step's: pulsing
   * on the beat, fully on each and not at all halfway between, as the frame
   * ends, coming in over ENGAGE as the clock is sure and going as it is not;
   * as firmly throughout otherwise, and where reduced motion is asked for.
   */
  #pulse(dance: Choreography, input: ForceFrame, heard: Signals): number {
    const beat = heard.beat;
    if (dance.pulse === "none" || this.#slow || beat === null) {
      this.#pulsing = 0;
      return 1;
    }
    const sure = !heard.silent && beat.confidence >= SURE;
    this.#pulsing = sure
      ? Math.min(1, this.#pulsing + input.real / ENGAGE)
      : Math.max(0, this.#pulsing - input.real / ENGAGE);
    const phase = beat.phase + ((input.from + input.real) * beat.bpm) / 60;
    return 1 - this.#pulsing * Math.sin(Math.PI * phase) ** 2;
  }

  /** How long a snap takes, in s of real time. */
  #snap(): number {
    return this.#slow ? Math.max(CROSS, SLOW_CROSS) : CROSS;
  }

  /** On a sound, the hand sets off for the figure's next point from where it is. */
  #turn(dance: Choreography): void {
    if (dance.feel === "snap") {
      this.#from = this.#soundPlace(dance, this.#figure);
      this.#step += 1;
      this.#to = pointAt(this.#figure, this.#step);
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

  /** Where in the plane of `figure` the hand led by sounds is. */
  #soundPlace(dance: Choreography, figure: Figure): Point {
    if (dance.feel === "snap") {
      const u = this.#crossed;
      return {
        x: this.#from.x + (this.#to.x - this.#from.x) * u * u * (3 - 2 * u),
        y: this.#from.y + (this.#to.y - this.#from.y) * u * u * (3 - 2 * u),
      };
    }
    return onFigure(figure, this.#soundAlong(dance));
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
    const sure = beat !== null && !heard.silent && beat.confidence >= SURE;
    if (!sure) {
      this.#engaged = Math.max(0, this.#engaged - input.real / ENGAGE);
      return [this.#along, this.#along];
    }
    const perBeat = beat.bpm / 60;
    const start = this.#beatsAt(beat, input.from);
    const end = this.#beatsAt(beat, input.from + input.real);
    const wanted =
      dance.beats === "auto"
        ? autoBeats(
            input.chain,
            input.g,
            beat.bpm,
            input.speed,
            pointsOf(this.#figure).length,
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

  /** Where in the plane of `figure` the hand led by the clock is, `p` points along it: the middle before the clock was ever sure. */
  #clockPlace(dance: Choreography, figure: Figure, p: number | null): Point {
    if (p === null) return MIDDLE;
    const k = Math.floor(p);
    const f = p - k;
    if (dance.feel === "smooth") return onFigure(figure, p);
    if (dance.feel === "ictus") return onFigure(figure, k + ictus(f));
    // a snap, which arrives on the point's beat
    const window = Math.min(1, (this.#snap() * this.#perBeat) / this.#apart);
    const a = pointAt(figure, k);
    if (f <= 1 - window) return a;
    const s = smoothstep((f - (1 - window)) / window);
    return between(a, pointAt(figure, k + 1), s);
  }

  /** Where a point of the plane of `figure` is, from the pivot, for a figure `size` rad wide, its middle turned `centre` rad from its place, on a reach of `reach` m. */
  #world(
    dance: Choreography,
    figure: Figure,
    at: Point,
    size: number,
    centre: number,
    reach: number,
    reading: Reading,
  ): Point {
    const share = size / WIDEST_SWING;
    const turned = TURNS[dance.place] + centre;
    let angle: number;
    let radius: number;
    if (figure === "turn") {
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
