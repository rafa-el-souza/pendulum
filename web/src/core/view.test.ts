import { describe, expect, it } from "vitest";

import { fitScale, reachBox, toWorld } from "./view.ts";

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

  it("bounds the pixels within a reach of the pivot, as a box centred on the canvas and cut at its edges (decision 62)", () => {
    // a wide canvas: the box is cut by its height
    expect(reachBox(2560, 1440, 800)).toEqual([480, 0, 1600, 1440]);
    // a tall one: by its width
    expect(reachBox(1170, 2532, 700)).toEqual([0, 566, 1170, 1400]);
    // a reach that is not whole takes the pixels it touches
    expect(reachBox(1000, 800, 100.5)).toEqual([399, 299, 202, 202]);
    // larger than the canvas: the whole of it
    expect(reachBox(800, 600, 5000)).toEqual([0, 0, 800, 600]);
  });

  it("holds every point within the reach of the centre", () => {
    const [x, y, w, h] = reachBox(1280, 720, 333.3);
    for (let a = 0; a < 2 * Math.PI; a += 0.01) {
      const px = 640 + 333.3 * Math.cos(a);
      const py = 360 + 333.3 * Math.sin(a);
      if (py < 0 || py > 720) continue;
      expect(px).toBeGreaterThanOrEqual(x);
      expect(px).toBeLessThanOrEqual(x + w);
      expect(py).toBeGreaterThanOrEqual(y);
      expect(py).toBeLessThanOrEqual(y + h);
    }
  });
});
