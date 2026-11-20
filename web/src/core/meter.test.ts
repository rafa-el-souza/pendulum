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
  it("says the frames a second, the last remake, the mechanism and its memory", () => {
    expect(
      meterText({
        perSecond: 58.4,
        remake: 12.6,
        mechanism: "sharp",
        megabytes: 41.2,
      }),
    ).toBe("58 fps · remake 13 ms · sharp · 41 MB");
    expect(
      meterText({
        perSecond: 7.25,
        remake: 912,
        mechanism: "sharp",
        megabytes: 9.6,
      }),
    ).toBe("7.3 fps · remake 912 ms · sharp · 10 MB");
  });

  it("says when there was no remake yet, and says only the frames a second for the image carried", () => {
    expect(
      meterText({
        perSecond: 60,
        remake: null,
        mechanism: "sharp",
        megabytes: 3,
      }),
    ).toBe("60 fps · remake – · sharp · 3 MB");
    expect(
      meterText({
        perSecond: 59.9,
        remake: null,
        mechanism: "B",
        megabytes: 0,
      }),
    ).toBe("60 fps · B");
  });
});
