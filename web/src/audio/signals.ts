import { Fourier, hann } from "./fft.ts";

// What the piece hears in music (docs/decisions.md, decision 44), one record
// a frame, the same whatever the sound comes from. Each frame hears the
// latest WINDOW samples: how loud they are, the energy in three bands, and
// whether a beat or a note began since the frame before, in each band, from
// how much the spectrum rose (its flux). Each measure is read against the
// music's own past, the last six seconds or so (decision 47), so that music
// played quietly and loudly moves the piece alike, and a microphone of
// unknown gain serves. It is all arithmetic on the samples, so the tests hear made-up
// sounds with the same code the page runs.

/** How many samples a frame hears: 43 ms at 48 kHz, 46 at 44.1. */
export const WINDOW = 2048;

/** The three bands, in Hz: the kick drum and the bass; voices and most instruments; cymbals and air. */
export const BANDS = {
  bass: [30, 150],
  mid: [150, 4000],
  treble: [4000, 16000],
} as const;

export type Band = keyof typeof BANDS;

/** What a frame of music says. */
export interface Signals {
  /** When the last sample heard sounded, in s on the clock of its source. */
  readonly at: number;
  /** How loud, from 0 to 1, against how loud the music has been: about a half where it has been, and eased as it falls. */
  readonly level: number;
  /** The energy in each band, the same way, each against its own. */
  readonly bass: number;
  readonly mid: number;
  readonly treble: number;
  /** How strong an attack in any band that began since the frame before, from a half to 1; 0 when none did. */
  readonly onset: number;
  /** The same in each band, which is where a kick drum, a snare and a hi-hat strike. */
  readonly kick: number;
  readonly snare: number;
  readonly hat: number;
  /** Whether there is no music: everything above stays at 0 while there is none. */
  readonly silent: boolean;
  /** How loud the sound arrives, before any gain: decibels from full scale. */
  readonly loudness: number;
  /** The power in each band before any gain, in decibels from full scale. */
  readonly bands: {
    readonly bass: number;
    readonly mid: number;
    readonly treble: number;
  };
}

/** The lowest a power reads, in dB from full scale: silence. */
const FLOOR_DB = -120;
/**
 * How long the music's past is remembered, in s: the time constant of its
 * loudness. A placeholder of the session's, which the author settles by
 * seeing: on four pieces of music, 4, 6 and 8 s read alike within a few
 * hundredths, and only a part that got louder told them apart.
 */
const GAIN_TIME = 6;
/** How many dB the levels span, a half of it either side of the music's own loudness. */
const RANGE_DB = 24;
/** How fast a level follows a rise and a fall, in s. */
const RISE = 0.01;
const FALL = 0.15;
/** Below this loudness for SILENCE_HOLD the music has stopped; above SOUND_DB it is back, in dB. */
const SILENCE_DB = -60;
const SOUND_DB = -57;
const SILENCE_HOLD = 0.3;
/** How long the flux's habits are remembered, in s. */
const FLUX_TIME = 1.5;
/** An attack is a flux this many deviations above its mean, and this many dB more. */
const FLUX_DEVIATIONS = 2.5;
const FLUX_MARGIN_DB = 3;
/** Two attacks in one band are at least this far apart, in s. */
const REFRACTORY = 0.09;
/** The flux's habits are learned this long, in s of sound, before any attack is heard. */
const WARM_UP = 0.5;
/**
 * A band that holds this many dB less than the whole sound strikes no
 * attack, since what rises in it is another band's spill; nor one quieter
 * than BAND_FLOOR_DB from full scale, where what rises is a hiss.
 */
const BAND_SHARE_DB = -30;
const BAND_FLOOR_DB = -68;
/** The longest gap between two frames that the easing and the habits take as such, in s. */
const LONGEST_GAP = 0.25;
/**
 * The flux is the rise since the spectrum heard at least this long before,
 * in s, rather than since the frame before: so it is about the same however
 * often frames come, and an attack shows its rise in one frame.
 */
const FLUX_LAG = 0.03;

/** All quiet: the record before anything is heard, and of silence. */
export const QUIET: Signals = {
  at: 0,
  level: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  onset: 0,
  kick: 0,
  snare: 0,
  hat: 0,
  silent: true,
  loudness: FLOOR_DB,
  bands: { bass: FLOOR_DB, mid: FLOOR_DB, treble: FLOOR_DB },
};

function decibels(power: number): number {
  return Math.max(FLOOR_DB, 10 * Math.log10(power + 1e-30));
}

/** The share of the way an easing with time constant `tau` goes in `dt`. */
function share(dt: number, tau: number): number {
  return 1 - Math.exp(-dt / tau);
}

/**
 * A measure in dB, read against its own past, from 0 to 1, and eased. The
 * past is the mean of all the music heard until there has been GAIN_TIME of
 * it, and forgets at that pace from then on: so the first moments of a song,
 * often far quieter than the rest, weigh as little as any other.
 */
class Gauge {
  /** The music's own loudness in this measure, once there has been some. */
  private past: number | null = null;
  /** How long the music has been heard, in s. */
  private heard = 0;
  value = 0;

  /** Hears `db` after `dt` s; silence lets the value fall and leaves the past as it was. */
  hear(db: number, dt: number, silent: boolean): number {
    let target = 0;
    if (!silent) {
      this.heard += dt;
      this.past ??= db;
      const weight = Math.max(share(dt, GAIN_TIME), dt / this.heard);
      this.past += weight * (db - this.past);
      target = Math.min(1, Math.max(0, 0.5 + (db - this.past) / RANGE_DB));
    }
    this.value +=
      share(dt, target > this.value ? RISE : FALL) * (target - this.value);
    // what is left of a fall to silence is silence
    if (silent && this.value < 1e-3) this.value = 0;
    return this.value;
  }
}

/**
 * Hears the attacks in one band: the band's flux, how much its pieces rose
 * since the frame before, against the flux's own habits.
 */
class Attacks {
  private mean = 0;
  private deviation = 0;
  /** How much of the habits is learned, from 0: the averages are read divided by it, so that they start true. */
  private learned = 0;
  private quietFor = Number.POSITIVE_INFINITY;

  /**
   * The strength of an attack at this flux, or 0: none until the habits are
   * learned (`ready`), nor while the band holds too little of the sound
   * (`heard`).
   */
  hear(flux: number, dt: number, ready: boolean, heard: boolean): number {
    const mean = this.learned > 0 ? this.mean / this.learned : 0;
    const deviation = this.learned > 0 ? this.deviation / this.learned : 0;
    const threshold = mean + FLUX_DEVIATIONS * deviation + FLUX_MARGIN_DB;
    this.quietFor += dt;
    let strength = 0;
    if (ready && heard && flux > threshold && this.quietFor >= REFRACTORY) {
      strength = Math.min(1, flux / (2 * threshold));
      this.quietFor = 0;
    }
    // the habits are learned from the flux cut at the threshold, so that the
    // attacks themselves do not raise it, where frames come few a second
    const seen = Math.min(flux, threshold);
    const a = share(dt, FLUX_TIME);
    this.learned += a * (1 - this.learned);
    this.deviation += a * (Math.abs(seen - mean) - this.deviation);
    this.mean += a * (seen - this.mean);
    return strength;
  }
}

/** A band's pieces, a third of an octave wide or two bins where that is less, as bins [from, to). */
function piecesOf(from: number, to: number): [number, number][] {
  const pieces: [number, number][] = [];
  for (let start = from; start < to;) {
    const end = Math.min(
      to,
      Math.max(start + 2, Math.round(start * 2 ** (1 / 3))),
    );
    pieces.push([start, end]);
    start = end;
  }
  return pieces;
}

/** Hears music frame by frame, as Signals. */
export class Hearing {
  private readonly fourier = new Fourier(WINDOW);
  private readonly window = hann(WINDOW);
  private readonly re = new Float64Array(WINDOW);
  private readonly im = new Float64Array(WINDOW);
  /** Each band's bins [from, to) and its pieces. */
  private readonly bins: Record<Band, [number, number]>;
  private readonly pieces: Record<Band, [number, number][]>;
  /** Each piece's power at the frames of the last moment, in dB, oldest first. */
  private readonly before: {
    at: number;
    levels: Record<Band, Float64Array>;
  }[] = [];
  private readonly gauges = {
    level: new Gauge(),
    bass: new Gauge(),
    mid: new Gauge(),
    treble: new Gauge(),
  };
  private readonly attacks = {
    bass: new Attacks(),
    mid: new Attacks(),
    treble: new Attacks(),
  };
  /** A power in the transform, as the mean square of the samples it comes from. */
  private readonly norm: number;
  private last: Signals = QUIET;
  private silent = true;
  private quietFor = 0;
  private heardFor = 0;
  /** The samples' rate, in Hz. */
  readonly rate: number;

  constructor(rate: number) {
    this.rate = rate;
    const binHz = rate / WINDOW;
    const half = WINDOW / 2;
    const bin = (hz: number) =>
      Math.min(half, Math.max(1, Math.round(hz / binHz)));
    const bands = Object.keys(BANDS) as Band[];
    this.bins = Object.fromEntries(
      bands.map((band) => [band, [bin(BANDS[band][0]), bin(BANDS[band][1])]]),
    ) as Record<Band, [number, number]>;
    this.pieces = Object.fromEntries(
      bands.map((band) => [band, piecesOf(...this.bins[band])]),
    ) as Record<Band, [number, number][]>;
    // one side of the spectrum, the window's mean square taken out
    const meanSquare = this.window.reduce((sum, w) => sum + w * w, 0) / WINDOW;
    this.norm = 2 / (WINDOW * WINDOW * meanSquare);
  }

  /**
   * What the latest WINDOW samples, the last of them sounding at `at` s,
   * say. A window no later than the one before says nothing new, and gets
   * the same record back.
   */
  hear(samples: Float32Array, at: number): Signals {
    if (samples.length !== WINDOW) {
      throw new Error(`a frame hears ${String(WINDOW)} samples`);
    }
    const first = this.before.length === 0;
    if (!first && at <= this.last.at) return this.last;
    // the first frame counts as one of sixty to the second, so that it moves
    // the levels too
    const dt = first ? 1 / 60 : Math.min(LONGEST_GAP, at - this.last.at);

    let square = 0;
    for (let i = 0; i < WINDOW; i++) {
      const x = samples[i] ?? 0;
      square += x * x;
      this.re[i] = x * (this.window[i] ?? 0);
      this.im[i] = 0;
    }
    const loudness = decibels(square / WINDOW);
    if (loudness > SOUND_DB) {
      this.silent = false;
      this.quietFor = 0;
    } else if (loudness < SILENCE_DB) {
      this.quietFor += dt;
      if (this.quietFor >= SILENCE_HOLD) this.silent = true;
    }
    this.fourier.transform(this.re, this.im);

    const power = (from: number, to: number): number => {
      let sum = 0;
      for (let k = from; k < to; k++) {
        sum += (this.re[k] ?? 0) ** 2 + (this.im[k] ?? 0) ** 2;
      }
      return sum * this.norm;
    };
    const bands = {
      bass: decibels(power(...this.bins.bass)),
      mid: decibels(power(...this.bins.mid)),
      treble: decibels(power(...this.bins.treble)),
    };

    // how much each band's pieces rose since the frame at least FLUX_LAG
    // before (or the oldest kept, at first), in dB
    while ((this.before[0]?.at ?? at) < at - LONGEST_GAP) this.before.shift();
    const then =
      this.before.findLast((frame) => frame.at <= at - FLUX_LAG) ??
      this.before[0];
    const now = {} as Record<Band, Float64Array>;
    const flux = { bass: 0, mid: 0, treble: 0 };
    for (const band of Object.keys(flux) as Band[]) {
      const pieces = this.pieces[band];
      const levels = Float64Array.from(pieces, ([from, to]) =>
        decibels(power(from, to)),
      );
      const was = then?.levels[band] ?? levels;
      let rise = 0;
      levels.forEach((db, i) => {
        rise += Math.max(0, db - (was[i] ?? db));
      });
      flux[band] = rise / Math.max(1, pieces.length);
      now[band] = levels;
    }
    this.before.push({ at, levels: now });

    if (!this.silent) this.heardFor += dt;
    const ready = !this.silent && this.heardFor >= WARM_UP;
    const holds = (band: Band) =>
      bands[band] > BAND_FLOOR_DB && bands[band] - loudness > BAND_SHARE_DB;
    const kick = this.attacks.bass.hear(flux.bass, dt, ready, holds("bass"));
    const snare = this.attacks.mid.hear(flux.mid, dt, ready, holds("mid"));
    const hat = this.attacks.treble.hear(
      flux.treble,
      dt,
      ready,
      holds("treble"),
    );

    this.last = {
      at,
      level: this.gauges.level.hear(loudness, dt, this.silent),
      bass: this.gauges.bass.hear(bands.bass, dt, this.silent),
      mid: this.gauges.mid.hear(bands.mid, dt, this.silent),
      treble: this.gauges.treble.hear(bands.treble, dt, this.silent),
      onset: Math.max(kick, snare, hat),
      kick,
      snare,
      hat,
      silent: this.silent,
      loudness,
      bands,
    };
    return this.last;
  }
}
