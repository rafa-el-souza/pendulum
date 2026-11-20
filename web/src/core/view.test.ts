import { describe, expect, it } from "vitest";

import {
  ViewRuns,
  bufferView,
  carryMap,
  fitScale,
  reachBox,
  toWorld,
} from "./view.ts";

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

describe("the view a target of light sees (decision 66)", () => {
  it("takes its scale from the drawing buffer's own size: a phone's buffer, three device pixels to a CSS pixel, has three times the CSS scale", () => {
    const view = bufferView(1170, 2532, 1);
    expect(view).toEqual({
      width: 1170,
      height: 2532,
      scale: fitScale(1170, 2532, 1),
    });
    expect(view.scale).toBeCloseTo(3 * fitScale(390, 844, 1), 9);
  });

  it("carries each pixel to where the old view saw the same point of the world", () => {
    const from = bufferView(1280, 720, 1);
    const to = bufferView(900, 1200, 1);
    const [kx, ky, mx, my] = carryMap(from, to);
    for (const [x, y] of [
      [0, 0],
      [0.4, -0.7],
      [-0.95, 0.3],
    ] as const) {
      // the point's pixel in the new view, read in the old
      const px = to.width / 2 + x * to.scale;
      const py = to.height / 2 + y * to.scale;
      expect((px * kx + mx) * from.width).toBeCloseTo(
        from.width / 2 + x * from.scale,
        9,
      );
      expect((py * ky + my) * from.height).toBeCloseTo(
        from.height / 2 + y * from.scale,
        9,
      );
    }
  });

  it("reads each texel at its own centre within one view", () => {
    const view = bufferView(640, 400, 1);
    const [kx, ky, mx, my] = carryMap(view, view);
    for (const i of [0.5, 10.5, 639.5]) {
      expect((i * kx + mx) * 640).toBeCloseTo(i, 9);
    }
    expect((399.5 * ky + my) * 400).toBeCloseTo(399.5, 9);
  });

  it("moves a narrower canvas of the same height by half the width it lost, at the same scale", () => {
    // 1280 by 720 is fitted by its height, and so is 1000 by 720
    const from = bufferView(1280, 720, 1);
    const to = bufferView(1000, 720, 1);
    expect(to.scale).toBe(from.scale);
    const [kx, , mx] = carryMap(from, to);
    // the centre of the new view's first pixel, the old one's 141st
    expect((0.5 * kx + mx) * 1280).toBeCloseTo(140.5, 9);
  });
});

describe("changes of view, as runs (decision 66)", () => {
  const a = bufferView(1280, 720, 1);
  const b = bufferView(1270, 714, 1);
  const c = bufferView(1262, 709, 1);

  it("says nothing of the first view, nor of a view that stays", () => {
    const runs = new ViewRuns(3);
    expect(runs.see(a)).toBeNull();
    expect(runs.see(a)).toBeNull();
    expect(runs.see(bufferView(1280, 720, 1))).toBeNull();
  });

  it("holds the light as it was at a run's first change, and carries every change of the run from it, so that it is read once however many changes there are", () => {
    const runs = new ViewRuns(3);
    runs.see(a);
    expect(runs.see(b)).toEqual({ act: "hold", from: a });
    expect(runs.see(c)).toEqual({ act: "carry", from: a });
    expect(runs.see(b)).toEqual({ act: "carry", from: a });
    expect(runs.see(a)).toEqual({ act: "carry", from: a });
  });

  it("lets the held light go once the view has stayed as many frames as asked, and holds again at the next change", () => {
    const runs = new ViewRuns(3);
    runs.see(a);
    runs.see(b);
    expect(runs.see(b)).toBeNull();
    expect(runs.see(b)).toBeNull();
    expect(runs.see(b)).toEqual({ act: "let go" });
    expect(runs.see(b)).toBeNull();
    expect(runs.see(c)).toEqual({ act: "hold", from: b });
  });

  it("counts the frames that stay from the run's last change", () => {
    const runs = new ViewRuns(3);
    runs.see(a);
    runs.see(b);
    runs.see(b);
    runs.see(b);
    // a change before the third frame: the run goes on, from the same light
    expect(runs.see(c)).toEqual({ act: "carry", from: a });
    expect(runs.see(c)).toBeNull();
    expect(runs.see(c)).toBeNull();
    expect(runs.see(c)).toEqual({ act: "let go" });
  });
});
