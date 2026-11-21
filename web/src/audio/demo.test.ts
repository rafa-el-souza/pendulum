import { describe, expect, it } from "vitest";

import {
  DEMO_SECONDS,
  demoHits,
  demoSample,
  DemoTap,
  demoWindow,
  renderDemo,
} from "./demo.ts";
import {
  HEARD,
  Hearing,
  KICK_WAIT,
  SPAN,
  WINDOW,
  type Signals,
} from "./signals.ts";

// The demonstration beat (docs/decisions.md, decision 44): a kick drum, a
// snare and a bass the page makes itself, the same every time, which plays
// aloud and, muted, serves the tests and the captures.

describe("the demonstration beat", () => {
  it("is the same every time, and comes round after its last bar", () => {
    for (const t of [0, 0.123, 1.5, 7.77, 15.9]) {
      expect(demoSample(t)).toBe(demoSample(t));
      expect(demoSample(t + DEMO_SECONDS)).toBeCloseTo(demoSample(t), 9);
    }
  });

  it("stays within full scale, and is loud enough to hear", () => {
    let peak = 0;
    for (let i = 0; i < DEMO_SECONDS * 8000; i++) {
      peak = Math.max(peak, Math.abs(demoSample(i / 8000)));
    }
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.5);
  });

  it("renders to a buffer as it sounds, and a window ends at its time", () => {
    const rate = 8000;
    const buffer = renderDemo(rate);
    expect(buffer).toHaveLength(DEMO_SECONDS * rate);
    for (const i of [0, 1, 4321, 99_999, buffer.length - 1]) {
      expect(buffer[i]).toBeCloseTo(demoSample(i / rate), 6);
    }
    const window = new Float32Array(WINDOW);
    demoWindow(3.2, rate, window);
    expect(window[WINDOW - 1]).toBeCloseTo(demoSample(3.2), 6);
    expect(window[0]).toBeCloseTo(demoSample(3.2 - (WINDOW - 1) / rate), 6);
  });

  it("is tapped a window at a time as it is worked out whole, however far the next window is", () => {
    const rate = 48_000;
    const tap = new DemoTap(rate);
    const tapped = new Float32Array(HEARD);
    const whole = new Float32Array(HEARD);
    // on by a frame, by none, back, and on by more than a window
    for (const t of [1, 1 + 1 / 60, 1 + 1 / 60, 0.5, 2, 2 + 1 / 144, 9]) {
      tap.fill(t, tapped);
      // a tap's window ends at the sample nearest its time
      demoWindow(Math.round(t * rate) / rate, rate, whole);
      for (let i = 0; i < HEARD; i += 97) {
        expect(tapped[i], `${String(t)} s, sample ${String(i)}`).toBeCloseTo(
          whole[i] ?? 0,
          5,
        );
      }
      expect(tapped[HEARD - 1]).toBeCloseTo(whole[HEARD - 1] ?? 0, 5);
    }
  });

  it("has its kicks, its snares and a quieter part in the middle", () => {
    const { kicks, snares } = demoHits();
    expect(kicks.length).toBeGreaterThan(16);
    expect(snares.length).toBeGreaterThan(8);
    // two bars in the middle with fewer hits
    const inMiddle = kicks.filter((t) => t >= 8 && t < 12).length;
    const atStart = kicks.filter((t) => t < 4).length;
    expect(inMiddle).toBeLessThan(atStart);
  });

  it("is heard as it is made: the hearing finds its kicks and snares, as the page will", () => {
    const rate = 48_000;
    const hearing = new Hearing(rate);
    const window = new Float32Array(HEARD);
    const tap = new DemoTap(rate);
    const heard: Signals[] = [];
    // twice round, at sixty frames a second
    for (let frame = 1; frame <= 2 * DEMO_SECONDS * 60; frame++) {
      tap.fill(frame / 60, window);
      heard.push(hearing.hear(window, frame / 60));
    }
    // after the hearing's first half second, twice round
    const twice = (times: readonly number[]) =>
      [...times, ...times.map((t) => t + DEMO_SECONDS)].filter((t) => t >= 0.5);
    const { kicks, snares, notes } = demoHits();
    const attacks = (key: "kick" | "snare") =>
      heard.filter((s) => s[key] > 0 && s.at >= 0.5).map((s) => s.at);
    /** Whether an attack heard at `at` follows one of `times` within `by` s. */
    const follows = (times: readonly number[], at: number, by = 0.06) =>
      times.some((t) => at >= t && at - t < by);
    /** A kick is heard KICK_WAIT after the frame that heard its attack (decision 86). */
    const within = { kick: KICK_WAIT + 0.06, snare: 0.06 };
    const share = (times: readonly number[], key: "kick" | "snare") =>
      times.filter((t) =>
        attacks(key).some((at) => follows([t], at, within[key])),
      ).length / times.length;
    // every kick is a kick, though a note of the bass begins with each, and
    // every snare an attack in the middle
    expect(share(twice(kicks), "kick")).toBeGreaterThan(0.9);
    expect(share(twice(snares), "snare")).toBeGreaterThan(0.9);
    // and nothing strikes where nothing starts: the kick's click is an attack
    // in the middle too; but a kick comes only after a kick, never where the
    // bass alone begins a note, which holds its pitch
    const starts = twice([...kicks, ...snares, ...notes]);
    expect(
      attacks("snare").filter((at) => !follows(starts, at)),
    ).toEqual([]);
    expect(
      attacks("kick").filter((at) => !follows(twice(kicks), at, within.kick)),
    ).toEqual([]);
    expect(heard.some((s) => s.silent && s.at > 0.5)).toBe(false);
    // every snare is a hit too, heard SPAN / 2 late, and no hit comes where
    // only the bass begins a note (decision 48)
    const hits = heard.filter((s) => s.hit > 0 && s.at >= 0.5).map((s) => s.at);
    const late = (times: readonly number[], at: number) =>
      times.some((t) => at >= t && at - t < SPAN / 2 + 0.04);
    expect(
      twice(snares).filter((t) => hits.some((at) => late([t], at))).length /
        twice(snares).length,
    ).toBeGreaterThan(0.9);
    expect(
      hits.filter((at) => !late(twice([...kicks, ...snares]), at)),
    ).toEqual([]);
  });
});
