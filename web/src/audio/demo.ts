// The demonstration beat (docs/decisions.md, decision 44): a kick drum, a
// snare and a bass, made by the page itself as a function of time, with no
// file and no music licence. Rendered to a buffer it plays aloud; heard
// straight from the function, muted, it is the same beat for the tests and
// for captures, frame for frame.
//
// Eight bars at 120 beats a minute, sixteen seconds, coming round: four
// bars of the whole beat, two quieter ones with the kick on the bar alone
// and the bass held, and two of the whole beat again, the last with the
// snare on more of its eighths. Every second bar has a third kick, three
// sixteenths after the second. How it sounds is a placeholder, which the
// author settles by listening.

export const DEMO_BPM = 120;
/** A sixteenth of a bar, in s. */
const STEP = 60 / DEMO_BPM / 4;
const STEPS_IN_BAR = 16;
const BARS = 8;
/** How long the beat lasts before it comes round, in s. */
export const DEMO_SECONDS = BARS * STEPS_IN_BAR * STEP;

/** The bars that are quieter. */
const QUIET_BARS: ReadonlySet<number> = new Set([4, 5]);
/** Each bar's chord, by the frequency of its root in the bass, in Hz: A minor, F, C, G. */
const ROOTS = [55, 43.65, 65.41, 49, 55, 43.65, 65.41, 49];

/** The steps of a bar where each part strikes, and an octave up for the bass's marked ones. */
function bar(index: number): {
  kicks: number[];
  snares: number[];
  bass: [step: number, hz: number][];
} {
  const root = ROOTS[index % BARS] ?? 55;
  if (QUIET_BARS.has(index % BARS)) {
    return { kicks: [0], snares: [], bass: [[0, root]] };
  }
  const kicks = index % 2 === 1 ? [0, 8, 11] : [0, 8];
  const snares = index % BARS === BARS - 1 ? [4, 10, 12, 14] : [4, 12];
  const bass: [number, number][] = [
    [0, root],
    [3, root],
    [6, 2 * root],
    [8, root],
    [11, root],
    [14, 2 * root],
  ];
  return { kicks, snares, bass };
}

const PATTERN = Array.from({ length: BARS }, (_, i) => bar(i));

/** The times of every kick, snare and bass note in the beat, in s from its start. */
export function demoHits(): {
  kicks: number[];
  snares: number[];
  notes: number[];
} {
  const kicks: number[] = [];
  const snares: number[] = [];
  const notes: number[] = [];
  PATTERN.forEach((b, i) => {
    const start = i * STEPS_IN_BAR * STEP;
    kicks.push(...b.kicks.map((s) => start + s * STEP));
    snares.push(...b.snares.map((s) => start + s * STEP));
    notes.push(...b.bass.map(([s]) => start + s * STEP));
  });
  return { kicks, snares, notes };
}

/** Each part's strikes as steps from the beat's start, sorted. */
const STRIKES = (() => {
  const kicks: number[] = [];
  const snares: number[] = [];
  const bass: [number, number][] = [];
  PATTERN.forEach((b, i) => {
    const first = i * STEPS_IN_BAR;
    kicks.push(...b.kicks.map((s) => first + s));
    snares.push(...b.snares.map((s) => first + s));
    bass.push(...b.bass.map(([s, hz]): [number, number] => [first + s, hz]));
  });
  const marked = (steps: number[]) => {
    const set = new Uint8Array(BARS * STEPS_IN_BAR);
    for (const s of steps) set[s] = 1;
    return set;
  };
  return { kicks: marked(kicks), snares: marked(snares), bass };
})();
const ALL_STEPS = BARS * STEPS_IN_BAR;

/** A number in [−1, 1) for each sample of a noise at 48 kHz, the same every time. */
function noise(n: number): number {
  let s = Math.imul(n ^ 0x2545f491, 0x9e3779b1) >>> 0;
  s = Math.imul(s ^ (s >>> 15), 0x85ebca77) >>> 0;
  return ((s ^ (s >>> 13)) >>> 0) / 2 ** 31 - 1;
}
const NOISE_RATE = 48_000;

/** A kick `t` s after it strikes: a thump that falls from 155 Hz to 45. */
function kick(t: number): number {
  const sweep = 0.035;
  const phase =
    2 * Math.PI * (45 * t + 110 * sweep * (1 - Math.exp(-t / sweep)));
  return 0.9 * Math.min(1, t / 0.002) * Math.exp(-t / 0.11) * Math.sin(phase);
}
/** How long a kick and a snare are heard, in s: till they are 75 dB down, so that they end without a click. */
const KICK_LENGTH = 1;

/** A snare `t` s after it strikes: a tone at 190 Hz and a burst of noise, its highs raised. */
function snare(t: number): number {
  const n = Math.floor(t * NOISE_RATE);
  const hiss = 0.5 * (noise(n) - noise(n - 1));
  const start = Math.min(1, t / 0.001);
  return (
    start *
    (0.25 * Math.exp(-t / 0.05) * Math.sin(2 * Math.PI * 190 * t) +
      0.45 * Math.exp(-t / 0.065) * hiss)
  );
}
const SNARE_LENGTH = 0.7;

/** A bass note `t` s after it starts, that lasts `length` s: its root, with two overtones, coming in softly. */
function bassNote(t: number, hz: number, length: number): number {
  const phase = 2 * Math.PI * hz * t;
  const tone =
    Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase);
  const envelope =
    Math.min(1, t / 0.025) *
    Math.exp(-t / 0.35) *
    Math.min(1, (length - t) / 0.015);
  return 0.28 * envelope * tone;
}

/** The step index s, brought into the beat, as 0 to ALL_STEPS − 1. */
function wrapStep(s: number): number {
  return ((s % ALL_STEPS) + ALL_STEPS) % ALL_STEPS;
}

/** The beat at `t` s from its start, from −1 to 1; it comes round every DEMO_SECONDS. */
export function demoSample(t: number): number {
  const at = ((t % DEMO_SECONDS) + DEMO_SECONDS) % DEMO_SECONDS;
  const step = Math.floor(at / STEP);
  let sum = 0;
  // the kicks and snares struck lately, the beat's end before its start
  const back = Math.ceil(Math.max(KICK_LENGTH, SNARE_LENGTH) / STEP);
  for (let k = 0; k <= back; k++) {
    const since = at - (step - k) * STEP;
    const s = wrapStep(step - k);
    if (since < KICK_LENGTH && STRIKES.kicks[s] === 1) sum += kick(since);
    if (since < SNARE_LENGTH && STRIKES.snares[s] === 1) sum += snare(since);
  }
  // the bass note sounding: the last one started, until the next
  const notes = STRIKES.bass;
  let i = notes.length - 1;
  while (i > 0 && (notes[i]?.[0] ?? 0) > step) i--;
  const [start, hz] = notes[i] ?? [0, 55];
  const [next] = notes[i + 1] ?? [ALL_STEPS + (notes[0]?.[0] ?? 0)];
  const since = at - start * STEP;
  if (since >= 0) sum += bassNote(since, hz, (next - start) * STEP);
  // a soft limit, so that a kick on a bass note never clips
  return Math.tanh(1.1 * sum) / Math.tanh(1.1 * 1.6);
}

/** The whole beat, once round, at `rate` samples a second. */
export function renderDemo(rate: number): Float32Array {
  const out = new Float32Array(Math.round(DEMO_SECONDS * rate));
  renderDemoInto(out, rate, 0, out.length);
  return out;
}

/** The beat's samples `from` to `to` at `rate` a second, into `out`: a piece of a rendering done a little at a time. */
export function renderDemoInto(
  out: Float32Array,
  rate: number,
  from: number,
  to: number,
): void {
  for (let i = from; i < to; i++) out[i] = demoSample(i / rate);
}

/** The beat's samples at `rate` ending at `t` s, into `out`, as a frame hears them. */
export function demoWindow(t: number, rate: number, out: Float32Array): void {
  const n = out.length;
  for (let i = 0; i < n; i++) out[i] = demoSample(t - (n - 1 - i) / rate);
}
