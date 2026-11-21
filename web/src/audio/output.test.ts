import { describe, expect, it } from "vitest";

import { heardAt } from "./output.ts";

// When the sample heard now sounded, on the audio's own clock (decision 44):
// from the output's stamp where the browser gives one that holds, else the
// clock less the latencies the browser tells. The numbers are what Chromium
// and WebKit gave in the browsers' image the CI runs, a second and a half
// into a context's sound.

describe("the moment heard on the audio's clock", () => {
  it("takes the output's stamp, moved on to now, where it holds", () => {
    // Chromium: the stamp 8.7 ms old
    const at = heardAt({
      currentTime: 1.277,
      baseLatency: 0.011609977,
      outputLatency: 0.032,
      stamp: { contextTime: 1.2304615283, performanceTime: 2647.6 },
      now: 2656.3,
    });
    expect(at).toBeCloseTo(1.2304615283 + 0.0087, 9);
  });

  it("takes the clock less the latencies where the stamp comes from the future, as WebKit's, whose page time runs twice as fast", () => {
    const at = heardAt({
      currentTime: 1.553,
      baseLatency: 0.0029024943,
      outputLatency: 0,
      stamp: { contextTime: 1.549931972, performanceTime: 4363 },
      now: 2814,
    });
    expect(at).toBeCloseTo(1.553 - 0.0029024943, 9);
  });

  it("takes the clock less the latencies where there is no stamp, or one with no time yet, or a latency not told", () => {
    const clock = { currentTime: 3, baseLatency: 0.01, now: 5000 };
    expect(heardAt({ ...clock, outputLatency: 0.02, stamp: null })).toBe(2.97);
    expect(
      heardAt({
        ...clock,
        outputLatency: 0.02,
        stamp: { contextTime: 0, performanceTime: 0 },
      }),
    ).toBe(2.97);
    expect(heardAt({ ...clock, outputLatency: undefined, stamp: null })).toBe(
      2.99,
    );
  });

  it("takes the clock where the stamp puts the sample heard more than a second behind it", () => {
    const at = heardAt({
      currentTime: 10,
      baseLatency: 0,
      outputLatency: 0,
      stamp: { contextTime: 8, performanceTime: 4000 },
      now: 4100,
    });
    expect(at).toBe(10);
  });
});
