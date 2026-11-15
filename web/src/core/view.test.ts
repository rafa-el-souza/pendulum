import { describe, expect, it } from "vitest";

import { fitScale, toWorld } from "./view.ts";

describe("the view of the world on a canvas", () => {
  it("fits a reach of one metre into 46% of the width or 42% of the height, whichever is smaller", () => {
    expect(fitScale(1000, 800, 1)).toBe(336);
    expect(fitScale(390, 844, 1)).toBeCloseTo(179.4, 12);
    expect(fitScale(1000, 800, 2)).toBe(168);
  });

  it("puts the pivot at the centre, with y up, in metres", () => {
    const scale = fitScale(1000, 800, 1);
    expect(toWorld(500, 400, 1000, 800, scale)).toEqual([0, 0]);
    expect(toWorld(500, 400 + 336, 1000, 800, scale)).toEqual([0, -1]);
    expect(toWorld(500 + 168, 400 - 336, 1000, 800, scale)).toEqual([0.5, 1]);
  });
});
