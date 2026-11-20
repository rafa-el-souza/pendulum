import { describe, expect, it } from "vitest";

import { FrameRate, meterText } from "./meter.ts";

// The meter an address can ask for (docs/decisions.md, decision 68), to
// measure the trails' mechanisms on a device.

describe("the frames a second", () => {
  it("count the frames of the last half second", () => {
    const rate = new FrameRate();
    expect(rate.perSecond).toBe(0);
    for (let frame = 0; frame <= 60; frame++)
      rate.frame(1000 + (frame * 1000) / 60);
    expect(rate.perSecond).toBeCloseTo(60, 0);
    // then a frame a fifth of a second
    for (let frame = 1; frame <= 5; frame++) rate.frame(2000 + frame * 200);
    expect(rate.perSecond).toBeCloseTo(5, 0);
  });
});

describe("the meter's line", () => {
  it("says the frames a second, the last remake, the mechanism, its memory and the seconds of motion the curves keep (decision 70)", () => {
    expect(
      meterText({
        perSecond: 58.4,
        remake: 12.6,
        mechanism: "sharp",
        megabytes: 41.2,
        kept: 1.43,
      }),
    ).toBe("58 fps · remake 13 ms · sharp · 41 MB · kept 1.4 s");
    expect(
      meterText({
        perSecond: 7.25,
        remake: 912,
        mechanism: "sharp",
        megabytes: 9.6,
        kept: 37.4,
      }),
    ).toBe("7.3 fps · remake 912 ms · sharp · 10 MB · kept 37 s");
  });

  it("says when there was no remake yet, and says only the frames a second and layers for the image carried (decision 71)", () => {
    expect(
      meterText({
        perSecond: 60,
        remake: null,
        mechanism: "sharp",
        megabytes: 3,
        kept: 0,
      }),
    ).toBe("60 fps · remake – · sharp · 3 MB · kept 0.0 s");
    expect(
      meterText({
        perSecond: 59.9,
        remake: null,
        mechanism: "layers",
        megabytes: 0,
        kept: null,
      }),
    ).toBe("60 fps · layers");
  });
});
