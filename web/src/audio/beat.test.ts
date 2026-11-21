import { describe, expect, it } from "vitest";

import { BeatClock, beatAt, type BeatAt } from "./beat.ts";
import { DEMO_BPM, demoSample } from "./demo.ts";

// The beat clock (docs/decisions.md, decision 78): the tempo, where in the
// beat and in the bar of four the music is, and how sure the clock is of it,
// heard sample by sample as the browser's audio line hears them, 128 at a
// time. Checked on click trains whose tempo changes and on the demonstration
// beat, whose every beat and bar is known.

const RATE = 48_000;
/** A block of the browser's audio line, in samples. */
const BLOCK = 128;

/** The clock's records, a block at a time, over `seconds` of `sound` (a function of time in s), heard `block` samples at a time. */
function hear(
  sound: (t: number) => number,
  seconds: number,
  block = BLOCK,
  rate = RATE,
): BeatAt[] {
  const clock = new BeatClock(rate);
  const samples = new Float32Array(block);
  const records: BeatAt[] = [];
  const total = Math.round(seconds * rate);
  for (let start = 0; start < total; start += block) {
    for (let i = 0; i < block; i++) samples[i] = sound((start + i) / rate);
    clock.hear(samples, (start + block - 1) / rate);
    const now = clock.now;
    if (now !== null && now !== records.at(-1)) records.push(now);
  }
  return records;
}

/** A number in [−1, 1) for sample `i`, the same on every run. */
function hiss(i: number): number {
  let s = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35) >>> 0;
  return ((s ^ (s >>> 16)) >>> 0) / 2 ** 31 - 1;
}

/** The times of clicks from 0.25 s on, at each part's tempo from its start: [start in s, beats a minute]. */
function clickTimes(parts: [number, number][], seconds: number): number[] {
  const times: number[] = [];
  for (let t = 0.25; t < seconds;) {
    times.push(t);
    const [, bpm] = parts.findLast(([from]) => from <= t) ?? [0, 120];
    t += 60 / bpm;
  }
  return times;
}

/** Clicks at `times`: a burst of noise falling over 4 ms. */
function clicks(times: readonly number[]): (t: number) => number {
  return (t) => {
    let sum = 0;
    for (const at of times) {
      const since = t - at;
      if (since >= 0 && since < 0.03) {
        sum += 0.8 * hiss(Math.round(t * RATE)) * Math.exp(-since / 0.004);
      }
    }
    return sum;
  };
}

/** The record in force at time `t`: the last at or before it, moved on to `t`. */
function at(records: readonly BeatAt[], t: number) {
  const record = records.findLast((r) => r.at <= t);
  return record === undefined ? null : beatAt(record, t);
}

/** How far, in s, the clock's nearest beat is from `t`: negative where the clock's beat comes after. */
function offBeat(records: readonly BeatAt[], t: number): number {
  const beat = at(records, t);
  if (beat === null) return Number.POSITIVE_INFINITY;
  const turn = beat.phase - Math.round(beat.phase);
  return (turn * 60) / beat.bpm;
}

describe("BeatClock", { timeout: 30_000 }, () => {
  it("finds a click train's tempo within a percent in three seconds, and its beats within 25 ms", () => {
    const times = clickTimes([[0, 120]], 12);
    const records = hear(clicks(times), 12);
    for (const t of times.filter((t) => t >= 3 && t < 11.5)) {
      expect(Math.abs((at(records, t)?.bpm ?? 0) / 120 - 1)).toBeLessThan(0.01);
      expect(Math.abs(offBeat(records, t))).toBeLessThan(0.025);
    }
    expect(at(records, 8)?.confidence).toBeGreaterThan(0.8);
  });

  it("follows the tempo as it changes, within eight seconds of each change, slow and fast", () => {
    const parts: [number, number][] = [
      [0, 90],
      [20, 160],
      [40, 75],
    ];
    const times = clickTimes(parts, 60);
    const records = hear(clicks(times), 60);
    for (const [from, bpm] of parts) {
      for (let t = from + 8; t < from + 19.5; t += 0.5) {
        expect(Math.abs((at(records, t)?.bpm ?? 0) / bpm - 1)).toBeLessThan(
          0.02,
        );
      }
    }
  });

  it("keeps time with the demonstration beat: its tempo, its beats and the first beat of its bars", () => {
    const records = hear((t) => 0.5 * demoSample(t), 24);
    const beat = 60 / DEMO_BPM;
    for (let t = 4; t < 23.5; t += beat) {
      expect(Math.abs((at(records, t)?.bpm ?? 0) / DEMO_BPM - 1)).toBeLessThan(
        0.005,
      );
      expect(Math.abs(offBeat(records, t))).toBeLessThan(0.025);
    }
    // a bar of four beats begins every 2 s, on the bar's first kick
    for (let t = 10; t < 23.5; t += 4 * beat) {
      const bar = at(records, t)?.bar ?? 0.5;
      expect(Math.min(bar, 1 - bar)).toBeLessThan(0.03);
    }
    expect(at(records, 12)?.confidence).toBeGreaterThan(0.8);
  });

  it("hears the same whatever size the blocks come in, as on the audio line and on a page's frames", () => {
    const sound = clicks(clickTimes([[0, 110]], 8));
    /** The clock's record at every 3 200 samples, fed `block` samples at a time. */
    const fed = (block: number) => {
      const clock = new BeatClock(RATE);
      const samples = new Float32Array(block);
      const seen = new Map<number, BeatAt | null>();
      for (let start = 0; start < 8 * RATE; start += block) {
        for (let i = 0; i < block; i++) samples[i] = sound((start + i) / RATE);
        clock.hear(samples, (start + block - 1) / RATE);
        if ((start + block) % 3200 === 0) seen.set(start + block, clock.now);
      }
      return seen;
    };
    const small = fed(BLOCK);
    const large = fed(800);
    for (const end of [3200 * 40, 3200 * 80, 3200 * 119]) {
      const a = small.get(end);
      const b = large.get(end);
      expect(a).not.toBeNull();
      for (const key of ["at", "bpm", "phase", "bar", "confidence"] as const) {
        expect(b?.[key]).toBeCloseTo(a?.[key] ?? Number.NaN, 9);
      }
    }
  });

  it("is not sure of a room's hiss; and when the music stops, keeps time through the comb's six beats, then stops being sure", () => {
    const room = (t: number) => 0.0045 * hiss(Math.round(t * RATE));
    const hissing = hear(room, 10);
    expect(at(hissing, 9.9)?.confidence ?? 0).toBeLessThan(0.3);
    const times = clickTimes([[0, 120]], 10);
    const stopping = hear((t) => (t < 10 ? clicks(times)(t) : 0), 17);
    expect(at(stopping, 9.9)?.confidence).toBeGreaterThan(0.8);
    expect(at(stopping, 12.4)?.confidence).toBeGreaterThan(0.8);
    expect(at(stopping, 16.5)?.confidence).toBeLessThan(0.3);
  });

  it("moves a record on in time: the phase by the beat, the bar by four beats, each coming round", () => {
    const record: BeatAt = {
      at: 10,
      bpm: 120,
      phase: 0.25,
      bar: 0.75,
      confidence: 0.9,
    };
    const later = beatAt(record, 10.5);
    expect(later.phase).toBeCloseTo(0.25, 9);
    expect(later.bar).toBeCloseTo(0, 9);
    expect(later.confidence).toBe(0.9);
    const quarter = beatAt(record, 10.125);
    expect(quarter.phase).toBeCloseTo(0.5, 9);
    expect(quarter.bar).toBeCloseTo(0.8125, 9);
    // and back, where the time asked for is before the record
    expect(beatAt(record, 9.875).phase).toBeCloseTo(0, 9);
  });
});
