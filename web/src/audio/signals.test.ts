import { describe, expect, it } from "vitest";

import { demoSample } from "./demo.ts";
import { HEARD, Hearing, SPAN, type Signals } from "./signals.ts";

// What the piece hears in music (docs/decisions.md, decisions 44 and 48): how
// loud it is, in three bands, and the attacks of its beats and notes, each
// against the music's own loudness of the last seconds; the hits of its drums
// told from the notes that begin; and the note its bass plays. Checked on
// sounds made up for the purpose, heard frame by frame as the page hears them.

const RATE = 48_000;

/** The sound `sound` (a function of time in s), heard `fps` times a second for `seconds`. */
function listen(
  sound: (t: number) => number,
  seconds: number,
  fps = 60,
  rate = RATE,
): Signals[] {
  const hearing = new Hearing(rate);
  const window = new Float32Array(HEARD);
  const heard: Signals[] = [];
  for (let frame = 1; frame <= Math.round(seconds * fps); frame++) {
    const at = frame / fps;
    const last = Math.round(at * rate);
    for (let i = 0; i < HEARD; i++) {
      const t = (last - HEARD + 1 + i) / rate;
      window[i] = t < 0 ? 0 : sound(t);
    }
    heard.push(hearing.hear(window, at));
  }
  return heard;
}

/** A number in [−1, 1) for sample `i`, the same on every run. */
function hiss(i: number): number {
  let s = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35) >>> 0;
  return ((s ^ (s >>> 16)) >>> 0) / 2 ** 31 - 1;
}

/** A quiet hiss at −50 dB below full scale, as a room makes. */
const room = (t: number): number => 0.0045 * hiss(Math.round(t * RATE));

/** A drum hit every `every` s from `first`: `hit` of the time since it. */
function hits(
  every: number,
  first: number,
  hit: (since: number) => number,
): (t: number) => number {
  return (t) => {
    if (t < first) return 0;
    const since = (t - first) % every;
    return hit(since);
  };
}

/** A low thump, as a kick drum: 60 Hz falling fast. */
const thump = (since: number): number =>
  0.8 * Math.exp(-since / 0.12) * Math.sin(2 * Math.PI * 60 * since);

/** A short tick high up, as a closed hi-hat: 9 kHz. */
const tick = (since: number): number =>
  0.3 * Math.exp(-since / 0.015) * Math.sin(2 * Math.PI * 9000 * since);

/** A snare's crack: a burst of noise, its highs raised, falling fast. */
function crack(t: number, since: number): number {
  const i = Math.round(t * RATE);
  return 0.4 * Math.exp(-since / 0.06) * (hiss(i) - hiss(i - 1));
}

/** A closed hi-hat of noise: only its highest part, gone in a few hundredths. */
function chick(t: number, since: number): number {
  const i = Math.round(t * RATE);
  return (
    0.15 * Math.exp(-since / 0.02) * (hiss(i) - 2 * hiss(i - 1) + hiss(i - 2))
  );
}

/** Drums on the quarters of every second: a hat, a snare, a hat, and none on the whole second. */
function drums(t: number): number {
  const since = t % 0.25;
  const quarter = Math.floor(t / 0.25) % 4;
  if (quarter === 2) return crack(t, since);
  if (quarter === 1 || quarter === 3) return chick(t, since);
  return 0;
}

/** An organ's note at `hz`: its root and two overtones. */
function organ(hz: number, t: number): number {
  const phase = 2 * Math.PI * hz * t;
  return (
    Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.33 * Math.sin(3 * phase)
  );
}

/** Chords of three notes, held a second each, coming in and out softly: A minor, F, C, G, and round. */
const CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
  [196, 246.94, 293.66],
];
function chords(t: number): number {
  const since = t % 1;
  const chord = CHORDS[Math.floor(t) % CHORDS.length] ?? [];
  const edge = Math.min(1, since / 0.015, (1 - since) / 0.015);
  return 0.06 * edge * chord.reduce((sum, hz) => sum + organ(hz, t), 0);
}

/** The frequency of MIDI note `note`, in Hz. */
const hz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** The times of the frames whose `key` is an attack. */
function attacks(
  heard: Signals[],
  key: "onset" | "kick" | "snare" | "hat" | "hit" | "note" | "bassChange",
) {
  return heard.filter((s) => s[key] > 0).map((s) => s.at);
}

// Several of these listen to up to a minute of music, frame by frame, and
// take 2 to 4 s on CI's runners, close to the 5 s a test has by default: one
// took 5.07 s on main (2026-11-18). Each has 20 s.
describe("Hearing", { timeout: 20_000 }, () => {
  it("hears a low sine in the bass, a middle one in the middle and a high one in the treble", () => {
    const tone = (hz: number) => (t: number) =>
      0.3 * Math.sin(2 * Math.PI * hz * t);
    const last = (sound: (t: number) => number) => {
      const heard = listen(sound, 2).at(-1);
      if (heard === undefined) throw new Error("nothing heard");
      return heard;
    };
    // each band against its own past, so a band that only ever holds the
    // floor of the transform's leakage reads low, and the tone's reads high
    const low = last((t) => tone(70)(t) + room(t));
    const middle = last((t) => tone(1000)(t) + room(t));
    const high = last((t) => tone(8000)(t) + room(t));
    expect(low.silent).toBe(false);
    expect(low.loudness).toBeCloseTo(20 * Math.log10(0.3 / Math.SQRT2), 0);
    for (const s of [low, middle, high]) {
      for (const band of [s.bass, s.mid, s.treble]) {
        expect(band).toBeGreaterThanOrEqual(0);
        expect(band).toBeLessThanOrEqual(1);
      }
    }
    expect(low.bands.bass - low.bands.treble).toBeGreaterThan(30);
    expect(middle.bands.mid - middle.bands.bass).toBeGreaterThan(30);
    expect(high.bands.treble - high.bands.mid).toBeGreaterThan(30);
  });

  // The first half second of sound teaches the hearing what the flux is like,
  // and no attack is heard in it; the beats below start after it.
  it("finds the attack of every thump of a kick drum, and no others", () => {
    const heard = listen((t) => hits(0.5, 0.75, thump)(t) + room(t), 6);
    const kicks = attacks(heard, "kick");
    const expected = Array.from({ length: 11 }, (_, i) => 0.75 + 0.5 * i);
    expect(kicks).toHaveLength(expected.length);
    kicks.forEach((at, i) => {
      // heard within two frames of the thump
      expect(at - (expected[i] ?? 0)).toBeGreaterThanOrEqual(0);
      expect(at - (expected[i] ?? 0)).toBeLessThan(2.5 / 60);
    });
    // the onset of the whole is the strongest of the bands'
    expect(attacks(heard, "onset")).toEqual(kicks);
    expect(attacks(heard, "hat")).toEqual([]);
    for (const s of heard) expect(s.onset).toBeLessThanOrEqual(1);
  });

  it("finds a hi-hat's ticks in the treble, and not as kicks", () => {
    const heard = listen((t) => hits(0.25, 0.6, tick)(t) + room(t), 4);
    expect(attacks(heard, "hat")).toHaveLength(14);
    expect(attacks(heard, "kick")).toEqual([]);
  });

  it("hears every beat however often frames come, from a slow device's to a fast screen's", () => {
    for (const fps of [12, 30, 144]) {
      const heard = listen((t) => hits(0.5, 0.75, thump)(t) + room(t), 6, fps);
      expect(
        attacks(heard, "kick"),
        `${String(fps)} frames a second`,
      ).toHaveLength(11);
    }
  });

  it("moves the same for music quiet and loud, once it has heard it for a while", () => {
    const music = (gain: number) => (t: number) =>
      gain * (hits(0.5, 0, thump)(t) + 0.2 * Math.sin(2 * Math.PI * 440 * t));
    const quiet = listen(music(0.03), 30);
    const loud = listen(music(1), 30);
    const lastSecond = (heard: Signals[]) => heard.slice(-60);
    const mean = (heard: Signals[], key: "level" | "bass" | "mid") =>
      heard.reduce((sum, s) => sum + s[key], 0) / heard.length;
    for (const key of ["level", "bass", "mid"] as const) {
      expect(
        Math.abs(mean(lastSecond(quiet), key) - mean(lastSecond(loud), key)),
      ).toBeLessThan(0.02);
    }
    expect(mean(lastSecond(loud), "level")).toBeGreaterThan(0.2);
    expect(mean(lastSecond(loud), "level")).toBeLessThan(0.8);
    // and the loudness, before any gain, still tells them apart, by 30 dB
    const loudness = (heard: Signals[]) =>
      heard.reduce((sum, s) => sum + s.loudness, 0) / heard.length;
    expect(
      loudness(lastSecond(loud)) - loudness(lastSecond(quiet)),
    ).toBeCloseTo(30.5, 0);
  });

  it("takes music that begins quietly as its normal within two seconds", () => {
    // a song's first moments are often far quieter than the rest of it, and
    // they must not stand for how loud the music is: measured on music, the
    // first frame heard was 28 to 30 dB under the rest, which held the
    // levels at their top for the next 12 to 20 s
    const music = (t: number) =>
      (t < 0.1 ? 0.01 : 1) *
      (hits(0.5, 0, thump)(t) + 0.2 * Math.sin(2 * Math.PI * 440 * t));
    const lastHalfSecond = listen(music, 2).slice(-30);
    for (const key of ["level", "bass", "mid"] as const) {
      const mean =
        lastHalfSecond.reduce((sum, s) => sum + s[key], 0) /
        lastHalfSecond.length;
      expect(mean, key).toBeGreaterThan(0.2);
      expect(mean, key).toBeLessThan(0.8);
    }
  });

  it("hears a part 10 dB louder as louder at first, and as the music's normal a dozen seconds on", () => {
    const music = (t: number) =>
      (t < 8 ? 0.3 : 1) *
      (hits(0.5, 0, thump)(t) + 0.2 * Math.sin(2 * Math.PI * 440 * t));
    const heard = listen(music, 22);
    const level = (from: number, to: number) => {
      const part = heard.filter((s) => s.at > from && s.at <= to);
      return part.reduce((sum, s) => sum + s.level, 0) / part.length;
    };
    const before = level(6, 8);
    expect(level(8, 9) - before).toBeGreaterThan(0.15);
    expect(Math.abs(level(20, 22) - before)).toBeLessThan(0.1);
  });

  it("calls silence silent, with nothing moving, no attacks and no note", () => {
    for (const sound of [() => 0, (t: number) => 0.0001 * hiss(t * RATE)]) {
      const heard = listen(sound, 2);
      const last = heard.at(-1);
      expect(last?.silent).toBe(true);
      expect(last?.level).toBe(0);
      for (const s of heard) {
        expect(s.onset).toBe(0);
        expect(s.hit).toBe(0);
        expect(s.note).toBe(0);
        expect(s.bassNote).toBe(0);
        expect(s.bassChange).toBe(0);
      }
    }
  });

  // A hit is broad in frequency for a moment; a note lasts. Telling them
  // apart takes the frames on either side of one, so both are heard SPAN / 2
  // late, at 60 frames a second and at fewer and more.
  it("hears the drums' hits, and not the chords that change under them", () => {
    for (const fps of [30, 60, 144]) {
      const heard = listen((t) => chords(t) + drums(t) + room(t), 6, fps);
      const hits = attacks(heard, "hit");
      const late = SPAN / 2 + 2.5 / fps;
      for (let second = 1; second < 6; second++) {
        for (const struck of [0.25, 0.5, 0.75].map((q) => second + q)) {
          const near = hits.filter((at) => at >= struck && at <= struck + late);
          expect(
            near,
            `${String(fps)} fps, the hit at ${String(struck)} s`,
          ).toHaveLength(1);
        }
        // the chord changes on every whole second, where no drum strikes
        const change = hits.filter(
          (at) => at > second - 0.02 && at < second + 0.2,
        );
        expect(
          change,
          `${String(fps)} fps, the chord at ${String(second)} s`,
        ).toEqual([]);
      }
    }
  });

  it("hears a note begin where a chord changes, and not where a drum strikes", () => {
    for (const fps of [30, 60, 144]) {
      const heard = listen((t) => chords(t) + drums(t) + room(t), 6, fps);
      const notes = attacks(heard, "note");
      for (let second = 1; second < 6; second++) {
        const begun = notes.filter(
          (at) => at >= second && at <= second + SPAN / 2 + 0.1,
        );
        expect(
          begun,
          `${String(fps)} fps, the chord at ${String(second)} s`,
        ).toHaveLength(1);
        const drummed = notes.filter(
          (at) => at > second + 0.3 && at < second + 0.95,
        );
        expect(
          drummed,
          `${String(fps)} fps, the drums of ${String(second)} s`,
        ).toEqual([]);
      }
    }
  });

  it("follows a bass line note by note, and hears each change once", () => {
    // A1, C2, D2, E2, G1, A1: half a second each, a root and two overtones
    const line = [33, 36, 38, 40, 31, 33];
    const bass = (t: number): number => {
      const since = t % 0.5;
      const note = line[Math.floor(t / 0.5)] ?? 33;
      const edge = Math.min(1, since / 0.02, (0.5 - since) / 0.02);
      return 0.3 * edge * organ(hz(note), t) + room(t);
    };
    const heard = listen(bass, 3);
    line.forEach((note, k) => {
      const held = heard.filter(
        (s) => s.at >= 0.5 * k + 0.15 && s.at < 0.5 * k + 0.5,
      );
      for (const s of held)
        expect(Math.round(s.bassNote), `${String(s.at)} s`).toBe(note);
    });
    const changes = attacks(heard, "bassChange");
    expect(changes).toHaveLength(line.length);
    changes.forEach((at, k) => {
      expect(at - 0.5 * k).toBeGreaterThanOrEqual(0);
      expect(at - 0.5 * k).toBeLessThan(0.2);
    });
  });

  it("follows the demonstration beat's bass under its kicks, chord by chord", () => {
    // its roots are A, F, C and G, a bar each; from the snare's tail on
    // the bar's second beat to the next note, only the bass sounds
    const roots = [9, 5, 0, 7];
    const heard = listen(demoSample, 16);
    for (let bar = 0; bar < 8; bar++) {
      const middle = heard.filter(
        (s) => s.at >= 2 * bar + 0.62 && s.at < 2 * bar + 0.75,
      );
      const right = middle.filter(
        (s) => s.bassNote > 0 && Math.round(s.bassNote) % 12 === roots[bar % 4],
      );
      expect(
        right.length / middle.length,
        `bar ${String(bar + 1)}`,
      ).toBeGreaterThan(0.8);
    }
  });

  it("goes quiet when the music stops, and takes it up again where it was", () => {
    const music = (t: number) =>
      t > 4 && t < 6 ? 0 : hits(0.5, 0, thump)(t) + room(t);
    const heard = listen(music, 9);
    const at = (t: number) => heard[Math.round(t * 60) - 1];
    expect(at(3.9)?.silent).toBe(false);
    expect(at(5.9)?.silent).toBe(true);
    expect(at(5.9)?.level).toBeLessThan(0.01);
    // after the silence the first thump is heard as an attack
    expect(attacks(heard, "kick").filter((t) => t > 6 && t < 6.1)).toHaveLength(
      1,
    );
  });

  it("does not hear the same window twice: a frame with no new sound changes nothing", () => {
    const hearing = new Hearing(RATE);
    const window = Float32Array.from({ length: HEARD }, (_, i) =>
      Math.sin(i / 3),
    );
    const first = hearing.hear(window, 1);
    expect(hearing.hear(window, 1)).toBe(first);
    expect(hearing.hear(window, 0.5)).toBe(first);
  });
});
