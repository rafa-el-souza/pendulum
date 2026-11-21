import type { BeatAt } from "./beat.ts";
import { Fourier, hann } from "./fft.ts";

// What the piece hears in music (docs/decisions.md, decision 44), one record
// a frame, the same whatever the sound comes from. Each frame hears the
// latest WINDOW samples: how loud they are, the energy in three bands, and
// whether a beat or a note began since the frame before, in each band, from
// how much the spectrum rose (its flux). Each measure is read against the
// music's own past, the last six seconds or so (decision 47), so that music
// played quietly and loudly moves the piece alike, and a microphone of
// unknown gain serves. Over the frames of a moment it tells a drum's hit,
// broad in frequency for an instant, from a note, which lasts, and over the
// latest HEARD samples it follows the note the bass plays (decision 48). It
// is all arithmetic on the samples, so the tests hear made-up sounds with the
// same code the page runs.

/** How many samples a frame's spectrum hears: 43 ms at 48 kHz, 46 at 44.1. */
export const WINDOW = 2048;
/**
 * How many of the latest samples a frame is given: 171 ms at 48 kHz, 186 at
 * 44.1, enough for two periods of the lowest bass note at 96 kHz. The
 * spectrum hears the last WINDOW of them, and the bass's note all it needs.
 */
export const HEARD = 8192;
/**
 * The span, in s, over which a hit is told from a note: the frames of the
 * last SPAN, the one in their middle judged. So hits and notes are heard
 * SPAN / 2 late.
 */
export const SPAN = 0.15;

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
  /**
   * How strong a hit, from a half to 1, something broad in frequency for a
   * moment, as a drum or a cymbal, in the middle or the treble, heard SPAN / 2
   * after it began; 0 when none did. Under 150 Hz, at this window, a kick
   * and a bass note cannot be told apart, and neither is a hit.
   */
  readonly hit: number;
  /** How strong the beginning of a note or a chord, something that lasts between 150 Hz and 4 kHz, heard SPAN / 2 after it; 0 when none began. */
  readonly note: number;
  /** The note the bass plays, under 300 Hz, as a MIDI number with its fraction (A1, 55 Hz, is 33); 0 while it plays none. */
  readonly bassNote: number;
  /** 1 where the bass has begun a note, or gone to another (an octave apart is the same), since the frame before; 0 otherwise. */
  readonly bassChange: number;
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
  /**
   * The beat clock's tempo and where the beat and the bar are (decision 78),
   * moved on to the moment the frame hears, `at` on the clock's own time; null
   * before it has found a tempo, and where there is no clock.
   */
  readonly beat: BeatAt | null;
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
/** Two attacks in one band are at least this far apart, in s; two notes, NOTE_APART. */
const REFRACTORY = 0.09;
const NOTE_APART = 0.15;
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
/**
 * A hit is broad in frequency: a bin's broad part is the median of the bins
 * this many Hz either side. And it is a hit only where the broad part holds
 * at least HIT_SHARE of its band's energy: a piano's hammer is broad for an
 * instant, but its strings hold most of the sound. Measured on four pieces
 * of music, a share of 0.3 kept 69 to 93% of the middle band's hits in the
 * three with drums, and 12% of those of a piano alone.
 */
const BROAD_HZ = 180;
const HIT_SHARE = 0.3;
/**
 * Notes are heard between these frequencies, in Hz, and only in the pieces
 * within NOTE_RANGE_DB of the loudest: a drum's spill into an empty piece
 * rises by many dB, and is no note.
 */
const NOTES = [150, 4000] as const;
const NOTE_RANGE_DB = 24;
/** The bass's notes, in Hz: from C1 to about D4. */
const BASS_LOWEST = 32;
const BASS_HIGHEST = 300;
/** The bass is heard at about this many samples a second, low-passed under BASS_HIGHEST. */
const BASS_RATE = 4000;
/** YIN's threshold: a period is a note where its normalized difference dips under this. */
const BASS_CLEAR = 0.15;
/** A new note of the bass is one it has played this long, in s. */
const BASS_HOLD = 0.04;

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
  hit: 0,
  note: 0,
  bassNote: 0,
  bassChange: 0,
  silent: true,
  loudness: FLOOR_DB,
  bands: { bass: FLOOR_DB, mid: FLOOR_DB, treble: FLOOR_DB },
  beat: null,
};

function decibels(power: number): number {
  return Math.max(FLOOR_DB, 10 * Math.log10(power + 1e-30));
}

/** The share of the way an easing with time constant `tau` goes in `dt`. */
function share(dt: number, tau: number): number {
  return 1 - Math.exp(-dt / tau);
}

/** The median of the first `n` numbers of `values`, which it sorts. */
function median(values: Float64Array, n: number): number {
  for (let i = 1; i < n; i++) {
    const v = values[i] ?? 0;
    let j = i - 1;
    while (j >= 0 && (values[j] ?? 0) > v) {
      values[j + 1] = values[j] ?? 0;
      j--;
    }
    values[j + 1] = v;
  }
  const half = n >> 1;
  return n % 2 === 1
    ? (values[half] ?? 0)
    : 0.5 * ((values[half - 1] ?? 0) + (values[half] ?? 0));
}

/**
 * The median of `values` over the bins `width` either side of each, fewer at
 * the ends, into `out`: the window's values kept sorted in `sorted`, one bin
 * in and one out at each step.
 */
function slidingMedian(
  values: Float64Array,
  width: number,
  out: Float64Array,
  sorted: Float64Array,
): void {
  const n = values.length;
  let count = 0;
  /** Where `v` goes among the sorted values: the first place not below it. */
  const place = (v: number): number => {
    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((sorted[mid] ?? 0) < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const add = (v: number): void => {
    const at = place(v);
    sorted.copyWithin(at + 1, at, count);
    sorted[at] = v;
    count++;
  };
  const drop = (v: number): void => {
    const at = place(v);
    sorted.copyWithin(at, at + 1, count);
    count--;
  };
  for (let j = 0; j < Math.min(n, width); j++) add(values[j] ?? 0);
  for (let k = 0; k < n; k++) {
    if (k + width < n) add(values[k + width] ?? 0);
    if (k - width - 1 >= 0) drop(values[k - width - 1] ?? 0);
    const half = count >> 1;
    out[k] =
      count % 2 === 1
        ? (sorted[half] ?? 0)
        : 0.5 * ((sorted[half - 1] ?? 0) + (sorted[half] ?? 0));
  }
}

/** How much each piece rose since `was`, in dB, summed. */
function rise(now: Float64Array, was: Float64Array | undefined): number {
  let sum = 0;
  now.forEach((db, i) => {
    sum += Math.max(0, db - (was?.[i] ?? db));
  });
  return sum;
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
  private readonly apart: number;

  /** Two attacks at least `apart` s apart. */
  constructor(apart = REFRACTORY) {
    this.apart = apart;
  }

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
    if (ready && heard && flux > threshold && this.quietFor >= this.apart) {
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

/** A frame's spectrum, kept for the span: its magnitudes, and whether the middle and the treble held enough of the sound. */
interface Heard {
  readonly at: number;
  readonly magnitudes: Float64Array;
  readonly holds: { readonly mid: boolean; readonly treble: boolean };
}

/** What the separation made of a frame: its broad parts' pieces in the middle and the treble, and its lasting part's, in dB. */
interface Separated {
  readonly at: number;
  readonly broad: { readonly mid: Float64Array; readonly treble: Float64Array };
  readonly lasting: Float64Array;
}

/**
 * Tells a hit from a note (harmonic and percussive separation by medians,
 * Fitzgerald, 2010). Of the frames of the last SPAN, the one in their middle
 * is judged: in each bin, the median of the bins BROAD_HZ either side is
 * what is broad there, and the median of the span's frames is what lasts;
 * the bin's magnitude is shared between the two by their squares. A hit is
 * an attack of the broad part, a note one of the lasting part.
 */
class Separation {
  private readonly frames: Heard[] = [];
  private readonly before: Separated[] = [];
  private scratch: Float64Array;
  /** Each bin's median across frequency, of the frame judged. */
  private readonly across: Float64Array;
  private readonly broadBins: number;
  private readonly pieces: {
    mid: [number, number][];
    treble: [number, number][];
  };
  private readonly notePieces: [number, number][];
  private readonly hits = { mid: new Attacks(), treble: new Attacks() };
  private readonly notes = new Attacks(NOTE_APART);
  private judged = Number.NEGATIVE_INFINITY;
  /** The bins the separation looks at, from 0. */
  readonly top: number;

  constructor(bin: (hz: number) => number) {
    this.broadBins = Math.max(1, bin(BROAD_HZ));
    this.top = Math.min(WINDOW / 2, bin(BANDS.treble[1]) + this.broadBins);
    this.scratch = new Float64Array(2 * this.broadBins + 2);
    this.across = new Float64Array(this.top);
    this.pieces = {
      mid: piecesOf(bin(BANDS.mid[0]), bin(BANDS.mid[1])),
      treble: piecesOf(bin(BANDS.treble[0]), bin(BANDS.treble[1])),
    };
    this.notePieces = piecesOf(bin(NOTES[0]), bin(NOTES[1]));
  }

  /** Keeps a frame's spectrum, and judges the one in the middle of the span: its hit and its note, or 0. */
  hear(frame: Heard, ready: boolean): { hit: number; note: number } {
    const frames = this.frames;
    frames.push(frame);
    while ((frames[0]?.at ?? frame.at) <= frame.at - SPAN) frames.shift();
    const middle = frames[(frames.length - 1) >> 1];
    if (middle === undefined || middle.at <= this.judged) {
      return { hit: 0, note: 0 };
    }
    const dt = Math.min(LONGEST_GAP, middle.at - this.judged);
    this.judged = middle.at;

    // what is broad and what lasts in each bin, and the bin shared by them
    const top = this.top;
    const width = this.broadBins;
    if (this.scratch.length < frames.length + 1) {
      this.scratch = new Float64Array(2 * frames.length);
    }
    const values = this.scratch;
    const broad = new Float64Array(top);
    const lasting = new Float64Array(top);
    slidingMedian(middle.magnitudes, width, this.across, values);
    for (let k = 0; k < top; k++) {
      const across = this.across[k] ?? 0;
      let n = 0;
      for (const f of frames) values[n++] = f.magnitudes[k] ?? 0;
      const along = median(values, n);
      const a = across * across;
      const b = along * along;
      const m = middle.magnitudes[k] ?? 0;
      const sum = a + b;
      broad[k] = sum > 0 ? (m * a) / sum : 0;
      lasting[k] = sum > 0 ? (m * b) / sum : 0;
    }
    const power = (bins: Float64Array, from: number, to: number): number => {
      let sum = 0;
      for (let k = from; k < to; k++) sum += (bins[k] ?? 0) ** 2;
      return sum;
    };
    const levels = (bins: Float64Array, pieces: [number, number][]) =>
      Float64Array.from(pieces, ([from, to]) =>
        decibels(power(bins, from, to)),
      );

    // each against the frame judged at least FLUX_LAG before
    const then =
      this.before.findLast((s) => s.at <= middle.at - FLUX_LAG) ??
      this.before[0];
    const now: Separated = {
      at: middle.at,
      broad: {
        mid: levels(broad, this.pieces.mid),
        treble: levels(broad, this.pieces.treble),
      },
      lasting: levels(lasting, this.notePieces),
    };
    while ((this.before[0]?.at ?? middle.at) < middle.at - LONGEST_GAP) {
      this.before.shift();
    }
    this.before.push(now);

    let hit = 0;
    for (const band of ["mid", "treble"] as const) {
      const pieces = this.pieces[band];
      const from = pieces[0]?.[0] ?? 0;
      const to = pieces.at(-1)?.[1] ?? 0;
      const whole = power(middle.magnitudes, from, to);
      const broadShare = whole > 0 ? power(broad, from, to) / whole : 0;
      const flux =
        rise(now.broad[band], then?.broad[band]) / Math.max(1, pieces.length);
      const strength = this.hits[band].hear(
        flux,
        dt,
        ready,
        middle.holds[band] && broadShare >= HIT_SHARE,
      );
      hit = Math.max(hit, strength);
    }
    // a note rises in a few pieces only, so their rises are summed, each
    // from no lower than NOTE_RANGE_DB under the loudest piece
    const floor = Math.max(...now.lasting) - NOTE_RANGE_DB;
    const above = (levels: Float64Array) =>
      levels.map((db) => Math.max(floor, db));
    const note = this.notes.hear(
      rise(above(now.lasting), then && above(then.lasting)),
      dt,
      ready,
      middle.holds.mid,
    );
    return { hit, note };
  }

  /** Forgets the frames: after silence, the span starts again. */
  clear(): void {
    this.frames.length = 0;
  }
}

/** A biquad filter's section: b0, b1, b2, a1, a2, with a0 taken as 1. */
type Section = [number, number, number, number, number];

/**
 * Follows the note the bass plays: the sound under BASS_HIGHEST, low-passed
 * and taken at about BASS_RATE, and its period by YIN's difference function
 * (de Cheveigné and Kawahara, 2002) over the last two periods of the lowest
 * note, about 70 ms. A note is a period whose difference dips under
 * BASS_CLEAR; a change, a note of another name held BASS_HOLD.
 */
class BassLine {
  /** The two sections of a fourth-order Butterworth low-pass, each b0, b1, b2, a1, a2. */
  private readonly sections: [Section, Section];
  private readonly step: number;
  private readonly rate: number;
  private readonly shortest: number;
  private readonly longest: number;
  private readonly span: number;
  private readonly low: Float64Array;
  private readonly difference: Float64Array;
  /** The name of the note held (0 for C to 11 for B), or −1; and one heard since `since`, not yet held. */
  private held = -1;
  private next = -1;
  private since = 0;

  constructor(rate: number) {
    const w = (2 * Math.PI * BASS_HIGHEST) / rate;
    const cos = Math.cos(w);
    const sin = Math.sin(w);
    const section = (q: number): Section => {
      const alpha = sin / (2 * q);
      const a0 = 1 + alpha;
      return [
        (1 - cos) / 2 / a0,
        (1 - cos) / a0,
        (1 - cos) / 2 / a0,
        (-2 * cos) / a0,
        (1 - alpha) / a0,
      ];
    };
    // the quality of each section of a fourth-order Butterworth filter
    this.sections = [section(0.5412), section(1.3066)];
    this.step = Math.max(1, Math.round(rate / BASS_RATE));
    this.rate = rate / this.step;
    this.shortest = Math.floor(this.rate / BASS_HIGHEST);
    this.longest = Math.ceil(this.rate / BASS_LOWEST);
    this.span = this.longest + Math.ceil(0.005 * this.rate);
    this.low = new Float64Array(this.span + this.longest + 2);
    this.difference = new Float64Array(this.longest + 2);
  }

  /** The bass's note in the latest samples, as a MIDI number, or 0; and 1 where it has changed. */
  hear(
    samples: Float32Array,
    at: number,
    silent: boolean,
    loudness: number,
  ): { note: number; change: number } {
    const note = silent ? 0 : this.note(samples, loudness);
    if (silent) {
      this.held = -1;
      this.next = -1;
      return { note, change: 0 };
    }
    let change = 0;
    if (note > 0) {
      const name = ((Math.round(note) % 12) + 12) % 12;
      if (name === this.held) {
        this.next = -1;
      } else if (name !== this.next) {
        this.next = name;
        this.since = at;
      }
      if (this.next >= 0 && at - this.since >= BASS_HOLD) {
        this.held = this.next;
        this.next = -1;
        change = 1;
      }
    }
    return { note, change };
  }

  private note(samples: Float32Array, loudness: number): number {
    // low-passed, the filter settled over the samples before those used
    const low = this.low;
    const step = this.step;
    const used = low.length * step;
    const settle = Math.min(
      samples.length - used,
      Math.round(0.02 * step * this.rate),
    );
    let from = samples.length - used - settle;
    if (from < 0) return 0;
    const [[b0, b1, b2, a1, a2], [c0, c1, c2, d1, d2]] = this.sections;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    let z1 = 0;
    let z2 = 0;
    let j = 0;
    for (let i = from; i < samples.length; i++) {
      const x = samples[i] ?? 0;
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      const z = c0 * y + c1 * y1 + c2 * y2 - d1 * z1 - d2 * z2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      z2 = z1;
      z1 = z;
      if (i >= samples.length - used && (samples.length - 1 - i) % step === 0) {
        low[j++] = z;
      }
    }
    from = low.length - this.span;
    let energy = 0;
    for (let i = from; i < low.length; i++) energy += (low[i] ?? 0) ** 2;
    const db = decibels(energy / this.span);
    if (db < BAND_FLOOR_DB || db - loudness < BAND_SHARE_DB) return 0;

    // the difference of the latest samples with those a period before,
    // normalized by its mean over the shorter periods
    const d = this.difference;
    let total = 0;
    let found = -1;
    for (let tau = 1; tau <= this.longest + 1; tau++) {
      let sum = 0;
      for (let i = from; i < low.length; i++) {
        const e = (low[i] ?? 0) - (low[i - tau] ?? 0);
        sum += e * e;
      }
      total += sum;
      d[tau] = total > 0 ? (sum * tau) / total : 1;
    }
    for (let tau = this.shortest; tau <= this.longest; tau++) {
      if ((d[tau] ?? 1) < BASS_CLEAR) {
        while (tau < this.longest && (d[tau + 1] ?? 1) < (d[tau] ?? 1)) tau++;
        found = tau;
        break;
      }
    }
    if (found < 0) return 0;
    // the dip's bottom between samples, by a parabola
    const a = d[found - 1] ?? 1;
    const b = d[found] ?? 1;
    const c = d[found + 1] ?? 1;
    const curve = a - 2 * b + c;
    const period = found + (curve > 0 ? (0.5 * (a - c)) / curve : 0);
    return 69 + 12 * Math.log2(this.rate / period / 440);
  }
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
  private readonly separation: Separation;
  private readonly bassLine: BassLine;
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
    this.separation = new Separation(bin);
    this.bassLine = new BassLine(rate);
    // one side of the spectrum, the window's mean square taken out
    const meanSquare = this.window.reduce((sum, w) => sum + w * w, 0) / WINDOW;
    this.norm = 2 / (WINDOW * WINDOW * meanSquare);
  }

  /**
   * What the latest HEARD samples, the last of them sounding at `at` s,
   * say. A frame no later than the one before says nothing new, and gets
   * the same record back.
   */
  hear(samples: Float32Array, at: number): Signals {
    if (samples.length !== HEARD) {
      throw new Error(`a frame hears ${String(HEARD)} samples`);
    }
    const first = this.before.length === 0;
    if (!first && at <= this.last.at) return this.last;
    // the first frame counts as one of sixty to the second, so that it moves
    // the levels too
    const dt = first ? 1 / 60 : Math.min(LONGEST_GAP, at - this.last.at);

    const offset = HEARD - WINDOW;
    let square = 0;
    for (let i = 0; i < WINDOW; i++) {
      const x = samples[offset + i] ?? 0;
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
      flux[band] =
        rise(levels, then?.levels[band]) / Math.max(1, pieces.length);
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

    // the magnitudes, for the separation of hits from notes
    const magnitudes = new Float64Array(this.separation.top);
    for (let k = 0; k < magnitudes.length; k++) {
      magnitudes[k] = Math.sqrt(
        ((this.re[k] ?? 0) ** 2 + (this.im[k] ?? 0) ** 2) * this.norm,
      );
    }
    if (this.silent) this.separation.clear();
    const { hit, note } = this.separation.hear(
      { at, magnitudes, holds: { mid: holds("mid"), treble: holds("treble") } },
      ready,
    );
    const bass = this.bassLine.hear(samples, at, this.silent, loudness);

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
      hit,
      note,
      bassNote: bass.note,
      bassChange: bass.change,
      silent: this.silent,
      loudness,
      bands,
      // the beat clock hears the samples elsewhere (source.ts)
      beat: null,
    };
    return this.last;
  }
}
