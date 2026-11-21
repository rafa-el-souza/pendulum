import { Fourier, hann } from "./fft.ts";

// The beat clock (docs/decisions.md, decision 78): the music's tempo, where in
// the beat and in the bar of four it is, and how sure the clock is of it.
// It hears the samples in order, as the browser's audio line gives them, and
// every HOP it measures how much the spectrum rose: the attacks' envelope.
// The tempo is the delay at which that envelope best matches itself (its
// autocorrelation, kept as a running sum over the last few seconds), among
// tempi near 120 a minute. Where the beats fall is found by a comb whose teeth
// are a beat apart, laid over the last BEATS beats of the envelope; a hand
// goes round at the tempo and is drawn a little to the comb each hop, so that
// it keeps time through a beat or two of nothing, and the tempo it keeps
// grows finer than a hop. The first beat of a bar is the one that has
// brought the most bass over the last bars. It is all arithmetic on the
// samples, so the tests hear made-up sounds with the code the page runs.
// The sizes are the session's, from a bench on the demonstration beat, click
// trains and four pieces of music (decision 78).

/** The name the clock's processor goes by on the audio line (beat.worklet.ts). */
export const BEAT_PROCESSOR = "beat-clock";
/** How sure the clock is, from 0 to 1, where the piece shows its tempo and keeps time with it. */
export const SURE = 0.8;
/** How often the envelope is measured, in s. */
export const HOP = 0.01;
/** How long a window the envelope's spectrum hears, in s: the nearest power of two in samples. */
const WINDOW_SECONDS = 0.0213;
/** The rise is measured against the spectrum this many hops before. */
const LAG = 2;
/** The pieces of the spectrum more than this many dB under the loudest count as that much under it: a hiss's rises are no attack. */
const RANGE_DB = 60;
/** The pieces count as bass below this, in Hz: where a kick drum is. */
const BASS_TOP = 150;
/** How long the envelope's autocorrelation remembers, in s. */
const MEMORY = 3;
/** The tempi the clock can find, in beats a minute, and the one it leans to, with the lean's width in octaves. */
const SLOWEST = 50;
const FASTEST = 220;
const LEANS_TO = 120;
const LEAN_WIDTH = 0.5;
/** A tempo is chosen again every this many hops. */
const CHOOSE_EVERY = 5;
/** A tempo within this share of the one kept is the same; another is taken once it has held SWITCH_AFTER s. */
const SAME = 0.04;
const SWITCH_AFTER = 1.5;
/** The comb looks back over this many beats, each older one weighing FADE of the one after it. */
const BEATS = 6;
const FADE = 0.8;
/** How much of the comb's correction the hand takes each hop, to its phase and to its tempo. */
const PHASE_PULL = 0.03;
const TEMPO_PULL = 0.002;
/** The envelope rises this long after an attack begins, in s: the comb reads it that much later. */
const LATE = 0.01;
/** How long the clock's sureness takes to follow how steadily the comb agrees with the hand, in s. */
const SURE_TIME = 2;
/** How much of a bar's first beat each bar's bass weighs against the bars before. */
const BAR_KEEP = 0.75;
/** The bass of a beat is the most the envelope's bass rose within this many hops of it. */
const BAR_NEAR = 3;

/** What the clock says. */
export interface Beat {
  /** The tempo, in beats a minute. */
  readonly bpm: number;
  /** Where in the beat, from 0 on a beat to 1 at the next. */
  readonly phase: number;
  /** Where in the bar of four, from 0 on its first beat to 1 at the next bar's. */
  readonly bar: number;
  /** How sure, from 0 to 1: how steadily the beats have been falling where the clock has them, over the last seconds. */
  readonly confidence: number;
}

/** What the clock says at a moment: `at`, in s, on the clock of the samples it hears. */
export interface BeatAt extends Beat {
  readonly at: number;
}

/** The record moved on, or back, to time `t`, in s: the beat and the bar turned at its tempo. */
export function beatAt(beat: BeatAt, t: number): Beat {
  const beats = ((t - beat.at) * beat.bpm) / 60;
  const turn = (x: number) => x - Math.floor(x);
  return {
    bpm: beat.bpm,
    phase: turn(beat.phase + beats),
    bar: turn(beat.bar + beats / 4),
    confidence: beat.confidence,
  };
}

function decibels(power: number): number {
  return 10 * Math.log10(power + 1e-30);
}

/** Hears music sample by sample, and keeps its beat. */
export class BeatClock {
  readonly #rate: number;
  readonly #hopSamples: number;
  readonly #fourier: Fourier;
  readonly #window: Float64Array;
  readonly #re: Float64Array;
  readonly #im: Float64Array;
  /** The latest samples, a window's worth, round and round. */
  readonly #ring: Float32Array;
  #written = 0;
  #sinceHop = 0;
  /** The spectrum's pieces, a third of an octave wide or two bins, as bins [from, to); the first #bassPieces of them are bass. */
  readonly #pieces: [number, number][];
  readonly #bassPieces: number;
  /** The pieces' levels at the last LAG hops, oldest first. */
  readonly #levels: Float64Array[] = [];
  /** The envelope, its bass, and the envelope less its mean, for the last few seconds, round and round. */
  readonly #envelope: Float64Array;
  readonly #bass: Float64Array;
  readonly #centred: Float64Array;
  #hops = 0;
  #mean = 0;
  /** The envelope's autocorrelation at each delay in hops, a running sum that forgets over MEMORY. */
  readonly #correlation: Float64Array;
  readonly #shortest: number;
  readonly #longest: number;
  /** The beat's length in hops, 0 before there is a tempo; and a tempo found that is not it, and for how long. */
  #period = 0;
  #other = 0;
  #otherFor = 0;
  /** Whether the hand is to start where the comb finds the beat: a tempo was just found, or taken anew. */
  #anew = false;
  /** Where the hand is in the beat, and how many beats it has gone round. */
  #phase = 0;
  #count = 0;
  /** How steadily the comb agrees with the hand, eased, from −1 to 1. */
  #agree = 0;
  /** Each beat of the bar's bass, eased over the bars; and the beats whose bass is yet to be weighed: their count and their hop. */
  readonly #barBass = [0, 0, 0, 0];
  readonly #toWeigh: { count: number; hop: number }[] = [];
  #first = 0;
  #now: BeatAt | null = null;

  constructor(rate: number) {
    this.#rate = rate;
    this.#hopSamples = Math.round(HOP * rate);
    const n = 2 ** Math.round(Math.log2(WINDOW_SECONDS * rate));
    this.#fourier = new Fourier(n);
    this.#window = hann(n);
    this.#re = new Float64Array(n);
    this.#im = new Float64Array(n);
    this.#ring = new Float32Array(n);
    const binHz = rate / n;
    const bin = (hz: number) =>
      Math.min(n / 2, Math.max(1, Math.round(hz / binHz)));
    const top = bin(Math.min(16_000, rate / 2));
    const pieces: [number, number][] = [];
    for (let start = bin(30); start < top;) {
      const end = Math.min(
        top,
        Math.max(start + 2, Math.round(start * 2 ** (1 / 3))),
      );
      pieces.push([start, end]);
      start = end;
    }
    this.#pieces = pieces;
    this.#bassPieces = Math.max(
      1,
      pieces.filter(([, to]) => to <= bin(BASS_TOP) + 1).length,
    );
    this.#shortest = Math.floor(60 / FASTEST / HOP);
    this.#longest = Math.ceil(60 / SLOWEST / HOP);
    // the comb reaches back BEATS of the slowest beats, and the bar's bass
    // BAR_NEAR hops either side of a beat
    const kept = (BEATS + 1) * this.#longest + 2 * BAR_NEAR + 2;
    this.#envelope = new Float64Array(kept);
    this.#bass = new Float64Array(kept);
    this.#centred = new Float64Array(this.#longest + 2);
    this.#correlation = new Float64Array(this.#longest + 2);
  }

  /** What the clock says as of the last sample heard, or null before it has found a tempo. */
  get now(): BeatAt | null {
    return this.#now;
  }

  /** Hears `samples`, in order after those heard before, the last of them sounding at `at` s. */
  hear(samples: Float32Array, at: number): void {
    const n = this.#ring.length;
    for (let i = 0; i < samples.length; i++) {
      this.#ring[this.#written % n] = samples[i] ?? 0;
      this.#written++;
      if (++this.#sinceHop >= this.#hopSamples) {
        this.#sinceHop = 0;
        this.#hop(at - (samples.length - 1 - i) / this.#rate);
      }
    }
  }

  /** The envelope `back` hops ago, between hops by a straight line; 0 before the first. */
  #envelopeAt(back: number): number {
    const kept = this.#envelope.length;
    const i = Math.floor(back);
    if (back < 0 || i + 1 >= Math.min(this.#hops, kept)) return 0;
    const f = back - i;
    const a = this.#envelope[(this.#hops - 1 - i) % kept] ?? 0;
    const b = this.#envelope[(this.#hops - 2 - i) % kept] ?? 0;
    return a + f * (b - a);
  }

  /** One hop, its last sample at `t` s: the envelope, the tempo, the hand and the bar. */
  #hop(t: number): void {
    const n = this.#ring.length;
    for (let i = 0; i < n; i++) {
      this.#re[i] =
        (this.#ring[(this.#written + i) % n] ?? 0) * (this.#window[i] ?? 0);
      this.#im[i] = 0;
    }
    this.#fourier.transform(this.#re, this.#im);
    // each piece's level, no lower than RANGE_DB under the loudest
    const levels = new Float64Array(this.#pieces.length);
    let loudest = Number.NEGATIVE_INFINITY;
    this.#pieces.forEach(([from, to], j) => {
      let power = 0;
      for (let k = from; k < to; k++) {
        power += (this.#re[k] ?? 0) ** 2 + (this.#im[k] ?? 0) ** 2;
      }
      levels[j] = decibels(power);
      loudest = Math.max(loudest, levels[j] ?? loudest);
    });
    const floor = loudest - RANGE_DB;
    for (let j = 0; j < levels.length; j++) {
      levels[j] = Math.max(floor, levels[j] ?? floor);
    }
    // how much the pieces rose since LAG hops before, in dB, on average
    const then = this.#levels.length >= LAG ? this.#levels[0] : undefined;
    let rise = 0;
    let bassRise = 0;
    if (then !== undefined) {
      for (let j = 0; j < levels.length; j++) {
        const up = Math.max(
          0,
          (levels[j] ?? 0) - Math.max(floor, then[j] ?? floor),
        );
        rise += up;
        if (j < this.#bassPieces) bassRise += up;
      }
    }
    this.#levels.push(levels);
    if (this.#levels.length > LAG) this.#levels.shift();
    const value = rise / levels.length;
    const kept = this.#envelope.length;
    this.#envelope[this.#hops % kept] = value;
    this.#bass[this.#hops % kept] = bassRise / this.#bassPieces;
    this.#hops++;

    // the autocorrelation of the envelope less its mean, forgetting over MEMORY
    const forget = HOP / MEMORY;
    this.#mean += forget * (value - this.#mean);
    const lags = this.#centred.length;
    const x = value - this.#mean;
    this.#centred[this.#hops % lags] = x;
    for (let tau = 0; tau < lags && tau < this.#hops; tau++) {
      const before = this.#centred[(this.#hops - tau + lags) % lags] ?? 0;
      this.#correlation[tau] =
        (1 - forget) * (this.#correlation[tau] ?? 0) + x * before;
    }
    if (this.#hops % CHOOSE_EVERY === 0) this.#choose();
    this.#follow(t);
  }

  /** The tempo: the delay at which the envelope best matches itself, leaning to LEANS_TO; a new one taken once it has held. */
  #choose(): void {
    if (this.#hops < 2 * this.#longest) return;
    const c = this.#correlation;
    const zero = c[0] ?? 0;
    if (!(zero > 0)) return;
    let best = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let tau = this.#shortest; tau <= this.#longest; tau++) {
      const bpm = 60 / (tau * HOP);
      const lean = Math.exp(
        -0.5 * (Math.log2(bpm / LEANS_TO) / LEAN_WIDTH) ** 2,
      );
      const score = (lean * (c[tau] ?? 0)) / zero;
      if (score > bestScore) {
        bestScore = score;
        best = tau;
      }
    }
    if (!(bestScore > 0)) return;
    // the peak between hops, by a parabola through it and its neighbours
    const a = c[best - 1] ?? 0;
    const b = c[best] ?? 0;
    const d = c[best + 1] ?? 0;
    const curve = a - 2 * b + d;
    const found = best + (curve < 0 ? (0.5 * (a - d)) / curve : 0);
    if (this.#period === 0) {
      this.#period = found;
      this.#anew = true;
      return;
    }
    if (Math.abs(found / this.#period - 1) < SAME) {
      this.#other = 0;
      this.#otherFor = 0;
    } else if (this.#other > 0 && Math.abs(found / this.#other - 1) < SAME) {
      this.#otherFor += CHOOSE_EVERY * HOP;
      if (this.#otherFor >= SWITCH_AFTER) {
        this.#period = found;
        this.#anew = true;
        this.#other = 0;
        this.#otherFor = 0;
      }
    } else {
      this.#other = found;
      this.#otherFor = 0;
    }
  }

  /** The hand goes round a hop, drawn to where the comb finds the beats; and the bar's first beat is weighed. */
  #follow(t: number): void {
    const period = this.#period;
    if (period === 0) return;
    const before = this.#phase;
    this.#phase += 1 / period;
    // the comb, laid at each phase in half hops: how much envelope its
    // teeth gather, back over the last BEATS beats
    const steps = Math.ceil(2 * period);
    const late = LATE / HOP;
    let bestSince = 0;
    let most = Number.NEGATIVE_INFINITY;
    let sum = 0;
    for (let k = 0; k < steps; k++) {
      const since = (k / steps) * period;
      let gathered = 0;
      let weight = 1;
      for (let b = 0; b < BEATS; b++) {
        gathered += weight * this.#envelopeAt(since + b * period - late);
        weight *= FADE;
      }
      sum += gathered;
      if (gathered > most) {
        most = gathered;
        bestSince = since;
      }
    }
    // a hand set going at a tempo just found starts at the comb's beat:
    // drawn there from anywhere, it would pull the tempo out of true
    if (this.#anew) {
      this.#anew = false;
      this.#phase = Math.floor(this.#phase) + bestSince / period;
    }
    // how far the comb's beat is from the hand's, in beats, from −½ to ½,
    // and how clearly the comb finds it
    let off = bestSince / period - (this.#phase - Math.floor(this.#phase));
    off -= Math.round(off);
    const clear = most > 0 ? (most - sum / steps) / most : 0;
    this.#phase += PHASE_PULL * off * clear;
    this.#period *= 1 - TEMPO_PULL * off * clear;
    const ease = HOP / SURE_TIME;
    this.#agree +=
      ease *
      (Math.cos(2 * Math.PI * off) * Math.min(1, 4 * clear) - this.#agree);
    const turned = Math.floor(this.#phase) - Math.floor(before);
    this.#phase -= Math.floor(this.#phase);
    if (turned > 0) {
      this.#count++;
      this.#toWeigh.push({ count: this.#count, hop: this.#hops });
    } else if (turned < 0) {
      // drawn back across a beat it had just counted: it counts it again
      // when it goes on across it
      if (this.#toWeigh.at(-1)?.count === this.#count) this.#toWeigh.pop();
      this.#count--;
    }
    // a beat's bass is weighed once the hops after it are heard
    while (
      this.#toWeigh.length > 0 &&
      this.#hops - (this.#toWeigh[0]?.hop ?? 0) >= BAR_NEAR
    ) {
      const beat = this.#toWeigh.shift();
      if (beat === undefined) break;
      let most = 0;
      const kept = this.#bass.length;
      for (let back = 0; back <= 2 * BAR_NEAR; back++) {
        const hop = this.#hops - 1 - back;
        if (hop >= 0) most = Math.max(most, this.#bass[hop % kept] ?? 0);
      }
      const place = beat.count % 4;
      this.#barBass[place] = BAR_KEEP * (this.#barBass[place] ?? 0) + most;
      this.#first = this.#barBass.indexOf(Math.max(...this.#barBass));
    }
    const inBar = (((this.#count - this.#first) % 4) + 4) % 4;
    this.#now = {
      at: t,
      bpm: 60 / (this.#period * HOP),
      phase: this.#phase,
      bar: (inBar + this.#phase) / 4,
      confidence: Math.max(0, this.#agree),
    };
  }
}
