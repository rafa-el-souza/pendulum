import { describe, expect, it } from "vitest";

import {
  MOST_ZOOM,
  ViewRuns,
  WHOLE_VIEW,
  bufferView,
  carryMap,
  clampCamera,
  fitScale,
  panBy,
  pinched,
  readCamera,
  reachBox,
  toPixel,
  toWorld,
  withCommas,
  writeCamera,
  zoomAbout,
  type Camera,
  type View,
} from "./view.ts";

/** A view of `width` by `height` pixels at `scale`, looking at `cx`, `cy`. */
function viewOf(
  width: number,
  height: number,
  scale = 1,
  cx = 0,
  cy = 0,
): View {
  return { width, height, scale, cx, cy };
}

/** What a camera sees on a canvas, its point exactly at the centre. */
function seenBy(
  camera: Camera,
  width: number,
  height: number,
  reach = 1,
): View {
  return viewOf(
    width,
    height,
    fitScale(width, height, reach) * camera.zoom,
    camera.cx,
    camera.cy,
  );
}

describe("the view of the world on a canvas", () => {
  it("fits a reach of one metre into 46% of the width or 42% of the height, whichever is smaller", () => {
    expect(fitScale(1000, 800, 1)).toBe(336);
    expect(fitScale(390, 844, 1)).toBeCloseTo(179.4, 12);
    expect(fitScale(1000, 800, 2)).toBe(168);
  });

  it("puts the pivot at the centre of the whole view, with y up, in metres", () => {
    const view = bufferView(1000, 800, 1);
    expect(toWorld(500, 400, view)).toEqual([0, 0]);
    expect(toWorld(500, 400 + 336, view)).toEqual([0, -1]);
    expect(toWorld(500 + 168, 400 - 336, view)).toEqual([0.5, 1]);
  });

  it("puts the camera's point at the centre of a nearer view, and finds every point where it is drawn (decision 67)", () => {
    const view = viewOf(1000, 800, 336 * 4, 0.25, -0.5);
    expect(toWorld(500, 400, view)).toEqual([0.25, -0.5]);
    expect(toPixel(0.25, -0.5, view)).toEqual([500, 400]);
    // a point a quarter of a metre up and to the right of the camera's
    expect(toPixel(0.5, -0.25, view)).toEqual([500 + 336, 400 - 336]);
    for (const [x, y] of [
      [0, 0],
      [0.3, -0.81],
      [-0.07, 0.6],
    ] as const) {
      const [px, py] = toPixel(x, y, view);
      const [wx, wy] = toWorld(px, py, view);
      expect(wx).toBeCloseTo(x, 12);
      expect(wy).toBeCloseTo(y, 12);
    }
  });

  it("bounds the pixels within a reach of the pivot, as a box centred on the canvas and cut at its edges (decision 62)", () => {
    // a wide canvas: the box is cut by its height
    expect(reachBox(viewOf(2560, 1440), 800)).toEqual([480, 0, 1600, 1440]);
    // a tall one: by its width
    expect(reachBox(viewOf(1170, 2532), 700)).toEqual([0, 566, 1170, 1400]);
    // a reach that is not whole takes the pixels it touches
    expect(reachBox(viewOf(1000, 800), 100.5)).toEqual([399, 299, 202, 202]);
    // larger than the canvas: the whole of it
    expect(reachBox(viewOf(800, 600), 5000)).toEqual([0, 0, 800, 600]);
  });

  it("holds every point within the reach of the centre", () => {
    const [x, y, w, h] = reachBox(viewOf(1280, 720), 333.3);
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

  it("puts the box about the pivot wherever the camera puts the pivot, counted from the bottom as WebGL cuts (decision 67)", () => {
    // the camera a tenth of a metre right of the pivot and a fifth below:
    // the pivot 134.4 pixels left of the centre and 268.8 above it
    const view = viewOf(1000, 800, 1344, 0.1, -0.2);
    expect(reachBox(view, 100)).toEqual([265, 568, 201, 201]);
  });
});

describe("the view a target of light sees (decision 66)", () => {
  it("takes its scale from the drawing buffer's own size: a phone's buffer, three device pixels to a CSS pixel, has three times the CSS scale", () => {
    const view = bufferView(1170, 2532, 1);
    expect(view).toEqual({
      width: 1170,
      height: 2532,
      scale: fitScale(1170, 2532, 1),
      cx: 0,
      cy: 0,
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

describe("the camera (decision 67)", () => {
  it("multiplies the whole view's scale by its zoom, and puts its point at the centre to a whole pixel", () => {
    const camera: Camera = { zoom: 8, cx: 0.123456, cy: -0.654321 };
    const view = bufferView(1280, 720, 1, camera);
    expect(view.scale).toBe(8 * fitScale(1280, 720, 1));
    // the pivot is a whole number of pixels from the centre, so that a view
    // moved at the same scale moves its light by whole pixels
    for (const at of [view.cx, view.cy]) {
      expect(at * view.scale).toBeCloseTo(Math.round(at * view.scale), 6);
    }
    expect(Math.abs(view.cx - camera.cx) * view.scale).toBeLessThanOrEqual(0.5);
    expect(Math.abs(view.cy - camera.cy) * view.scale).toBeLessThanOrEqual(0.5);
    expect(bufferView(1280, 720, 1, WHOLE_VIEW)).toEqual(
      bufferView(1280, 720, 1),
    );
  });

  it("carries each pixel to where the old view saw the same point, whatever both cameras look at", () => {
    const from = bufferView(1280, 720, 1, { zoom: 2, cx: 0.1, cy: -0.3 });
    const to = bufferView(1280, 720, 1, { zoom: 5, cx: 0.2, cy: -0.45 });
    const [kx, ky, mx, my] = carryMap(from, to);
    for (const [x, y] of [
      [0.2, -0.45],
      [0.25, -0.5],
      [0.12, -0.38],
    ] as const) {
      // the shader counts pixels from the bottom
      const [px, top] = toPixel(x, y, to);
      const [fx, fromTop] = toPixel(x, y, from);
      expect((px * kx + mx) * from.width).toBeCloseTo(fx, 6);
      expect(((to.height - top) * ky + my) * from.height).toBeCloseTo(
        from.height - fromTop,
        6,
      );
    }
  });

  it("goes no farther than the whole view, nor nearer than 64 times, and keeps its point within the disc as it can see it whole at that zoom", () => {
    expect(clampCamera({ zoom: 0.5, cx: 0.3, cy: 0 }, 1)).toEqual(WHOLE_VIEW);
    expect(clampCamera({ zoom: 100, cx: 0, cy: 0 }, 1).zoom).toBe(MOST_ZOOM);
    // at 4 times, the point stays within three quarters of the reach
    const far = clampCamera({ zoom: 4, cx: 3, cy: 4 }, 1);
    expect(far.cx).toBeCloseTo(0.45, 12);
    expect(far.cy).toBeCloseTo(0.6, 12);
    const near = { zoom: 4, cx: 0.3, cy: -0.4 };
    expect(clampCamera(near, 1)).toEqual(near);
    expect(clampCamera({ zoom: Number.NaN, cx: 0, cy: 0 }, 1)).toEqual(
      WHOLE_VIEW,
    );
    expect(clampCamera({ zoom: 2, cx: Number.NaN, cy: 0.1 }, 1)).toEqual({
      zoom: 2,
      cx: 0,
      cy: 0.1,
    });
  });

  it("zooms about a point, which stays where it was on the screen, and comes back to the whole view", () => {
    const before = { zoom: 2, cx: 0.1, cy: -0.2 };
    const point = [0.3, -0.35] as const;
    const after = zoomAbout(before, ...point, 1.5, 1);
    expect(after.zoom).toBe(3);
    const [bx, by] = toPixel(...point, seenBy(before, 1280, 720));
    const [ax, ay] = toPixel(...point, seenBy(after, 1280, 720));
    expect(ax).toBeCloseTo(bx, 9);
    expect(ay).toBeCloseTo(by, 9);
    // far enough out, the whole view, its point the pivot
    expect(zoomAbout(after, 0.9, 0.9, 1 / 4, 1)).toEqual(WHOLE_VIEW);
  });

  it("moves its point against a drag, so that the world follows the hand, at the scale it is seen", () => {
    const before = { zoom: 4, cx: 0, cy: 0 };
    // dragged 100 pixels right and 50 down, at 400 pixels a metre
    const after = panBy(before, 100, 50, 400, 1);
    expect(after.cx).toBeCloseTo(-0.25, 12);
    expect(after.cy).toBeCloseTo(0.125, 12);
    expect(after.zoom).toBe(4);
    // no farther than the disc
    expect(panBy(before, -1e6, 0, 400, 1).cx).toBeCloseTo(0.75, 12);
    // at the whole view, nowhere
    expect(panBy(WHOLE_VIEW, 100, 50, 400, 1)).toEqual(WHOLE_VIEW);
  });

  it("follows two fingers: the point under them at the start stays under them, nearer as far as they spread", () => {
    const width = 1170;
    const height = 2532;
    const camera = { zoom: 2, cx: 0.1, cy: -0.4 };
    const start = {
      camera,
      world: toWorld(500, 1500, seenBy(camera, width, height)),
      distance: 300,
    };
    // spread to twice as far apart, and moved
    const after = pinched(start, 620, 1380, 600, width, height, 1);
    expect(after.zoom).toBeCloseTo(4, 12);
    const [px, py] = toPixel(...start.world, seenBy(after, width, height));
    expect(px).toBeCloseTo(620, 9);
    expect(py).toBeCloseTo(1380, 9);
    // never past the bounds
    expect(pinched(start, 500, 1500, 1, width, height, 1)).toEqual(WHOLE_VIEW);
    expect(pinched(start, 500, 1500, 1e6, width, height, 1).zoom).toBe(
      MOST_ZOOM,
    );
  });
});

describe("the camera in the address (decision 67)", () => {
  it("reads the zoom and the point it looks at, within the bounds, and the whole view from anything else", () => {
    expect(readCamera("?n=3&zoom=8&at=0.12345,-0.85432", 1)).toEqual({
      zoom: 8,
      cx: 0.12345,
      cy: -0.85432,
    });
    expect(readCamera("?zoom=8&at=0.12345%2C-0.85432", 1)).toEqual({
      zoom: 8,
      cx: 0.12345,
      cy: -0.85432,
    });
    expect(readCamera("?zoom=8", 1)).toEqual({ zoom: 8, cx: 0, cy: 0 });
    expect(readCamera("", 1)).toEqual(WHOLE_VIEW);
    expect(readCamera("?zoom=abc&at=1,2", 1)).toEqual(WHOLE_VIEW);
    expect(readCamera("?zoom=500&at=0.1,0.1", 1)).toEqual({
      zoom: MOST_ZOOM,
      cx: 0.1,
      cy: 0.1,
    });
    expect(readCamera("?zoom=2&at=0.1", 1)).toEqual({ zoom: 2, cx: 0, cy: 0 });
  });

  it("writes them only away from the whole view, after whatever else the address carried, its comma a comma", () => {
    expect(writeCamera("?n=3", { zoom: 8, cx: 0.123456, cy: -0.854321 })).toBe(
      "?n=3&zoom=8&at=0.12346,-0.85432",
    );
    expect(writeCamera("?n=3&zoom=8&at=0.1,0.1", WHOLE_VIEW)).toBe("?n=3");
    expect(writeCamera("", { zoom: 2.3456, cx: 0, cy: 0 })).toBe("?zoom=2.35");
    expect(writeCamera("", WHOLE_VIEW)).toBe("");
    expect(withCommas("?wait=120%2C10&n=3")).toBe("?wait=120,10&n=3");
  });

  it("reads back what it writes, to a hundredth of the zoom and ten micrometres", () => {
    const camera = { zoom: 23.456, cx: 0.4321234, cy: -0.1234567 };
    const read = readCamera(writeCamera("", camera), 1);
    expect(read.zoom).toBeCloseTo(23.46, 12);
    expect(Math.abs(read.cx - camera.cx)).toBeLessThan(1e-5);
    expect(Math.abs(read.cy - camera.cy)).toBeLessThan(1e-5);
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

describe("a gesture's changes of view (decision 67)", () => {
  const at = (zoom: number, cx = 0, cy = 0): View =>
    bufferView(1280, 720, 1, { zoom, cx, cy });

  it("clears the light once the camera comes nearer than the limit from the least scale it was drawn at, and holds anew the light drawn after", () => {
    const runs = new ViewRuns(3, 1.25);
    runs.see(at(1));
    expect(runs.see(at(1.2))).toEqual({ act: "hold", from: at(1) });
    expect(runs.see(at(1.3))).toEqual({ act: "clear" });
    expect(runs.see(at(1.5))).toEqual({ act: "hold", from: at(1.3) });
    // a quarter nearer than the light drawn at 1.3 times
    expect(runs.see(at(1.7))).toEqual({ act: "clear" });
  });

  it("carries a camera that goes farther and comes back, and clears once it comes nearer than the light drawn farther", () => {
    const runs = new ViewRuns(2, 1.25);
    runs.see(at(8));
    expect(runs.see(at(4))).toEqual({ act: "hold", from: at(8) });
    // back within the run: the light read is the light held, drawn at eight times
    expect(runs.see(at(8))).toEqual({ act: "carry", from: at(8) });
    runs.see(at(4));
    runs.see(at(4));
    expect(runs.see(at(4))).toEqual({ act: "let go" });
    // settled at four times, the light drawn there would be stretched twice
    expect(runs.see(at(8))).toEqual({ act: "clear" });
  });

  it("holds the light anew at every change that sees past what is held, as it moves or goes farther", () => {
    const runs = new ViewRuns(3);
    runs.see(at(4, 0.3, 0));
    // moved: the view sees past the held one
    expect(runs.see(at(4, 0.31, 0))).toEqual({
      act: "hold",
      from: at(4, 0.3, 0),
    });
    expect(runs.see(at(4, 0.32, 0))).toEqual({
      act: "hold",
      from: at(4, 0.31, 0),
    });
    // farther: it sees more than the held one
    expect(runs.see(at(3.8, 0.32, 0))).toEqual({
      act: "hold",
      from: at(4, 0.32, 0),
    });
  });

  it("counts the canvas's size and the camera's zoom together: at eight times, a window a tenth wider is carried, and half as large again cleared", () => {
    const runs = new ViewRuns(3, 1.25);
    runs.see(at(8));
    // 1280 and 1408 by 720 are both fitted by their height: the same scale
    const wider = bufferView(1408, 720, 1, { zoom: 8, cx: 0, cy: 0 });
    expect(runs.see(wider)).toEqual({ act: "hold", from: at(8) });
    const larger = bufferView(1920, 1080, 1, { zoom: 8, cx: 0, cy: 0 });
    expect(runs.see(larger)).toEqual({ act: "clear" });
  });

  it("keeps a change of size on the rule of a run, reading what it held", () => {
    const runs = new ViewRuns(3);
    const small = bufferView(1000, 720, 1, { zoom: 4, cx: 0.3, cy: 0 });
    runs.see(at(4, 0.3, 0));
    expect(runs.see(small)).toEqual({ act: "hold", from: at(4, 0.3, 0) });
    expect(runs.see(at(4, 0.3, 0))).toEqual({
      act: "carry",
      from: at(4, 0.3, 0),
    });
  });
});

describe("a canvas that grows too much, as runs (decision 66)", () => {
  const a = bufferView(1280, 720, 1);
  // the same reach at 1.2, 1.3 and 0.5 times the scale of a
  const at = (k: number): View => ({
    width: 1280 * k,
    height: 720 * k,
    scale: a.scale * k,
    cx: 0,
    cy: 0,
  });

  it("asks for the light to be cleared, not held, when a change grows the view more than the limit", () => {
    const runs = new ViewRuns(3, 1.25);
    runs.see(a);
    expect(runs.see(at(1.3))).toEqual({ act: "clear" });
  });

  it("holds and carries a change that grows the view no more than the limit, and one that shrinks it however much", () => {
    const runs = new ViewRuns(3, 1.25);
    runs.see(a);
    expect(runs.see(at(1.2))).toEqual({ act: "hold", from: a });
    expect(runs.see(at(0.5))).toEqual({ act: "carry", from: a });
    expect(runs.see(at(1.25))).toEqual({ act: "carry", from: a });
  });

  it("measures the growth from the light held, so that steps each small add up over a run", () => {
    const runs = new ViewRuns(3, 1.25);
    runs.see(a);
    expect(runs.see(at(1.1))).toEqual({ act: "hold", from: a });
    expect(runs.see(at(1.2))).toEqual({ act: "carry", from: a });
    expect(runs.see(at(1.3))).toEqual({ act: "clear" });
  });

  it("after clearing, holds anew at the next change, from the view before it", () => {
    const runs = new ViewRuns(3, 1.25);
    runs.see(a);
    runs.see(at(1.3));
    expect(runs.see(at(1.4))).toEqual({ act: "hold", from: at(1.3) });
  });

  it("measures the growth from the least scale the light was drawn at, so that two runs each growing less than the limit clear when together they grow more", () => {
    const runs = new ViewRuns(2, 1.25);
    runs.see(a);
    expect(runs.see(at(1.2))).toEqual({ act: "hold", from: a });
    runs.see(at(1.2));
    expect(runs.see(at(1.2))).toEqual({ act: "let go" });
    // a second run, 1.2 times again: 1.44 times the light drawn in a
    expect(runs.see(at(1.44))).toEqual({ act: "clear" });
  });

  it("carries a run that shrinks and grows back, as the light it reads was held at the larger view", () => {
    const runs = new ViewRuns(2, 1.25);
    runs.see(a);
    expect(runs.see(at(0.5))).toEqual({ act: "hold", from: a });
    expect(runs.see(at(1.2))).toEqual({ act: "carry", from: a });
  });

  it("clears a canvas grown back past the limit once a run has settled smaller, as the light drawn there would be stretched", () => {
    const runs = new ViewRuns(2, 1.25);
    runs.see(a);
    runs.see(at(0.5));
    runs.see(at(0.5));
    expect(runs.see(at(0.5))).toEqual({ act: "let go" });
    expect(runs.see(a)).toEqual({ act: "clear" });
  });

  it("carries a phone turned and turned back, each way within the limit", () => {
    const portrait = bufferView(1170, 2532, 1);
    const landscape = bufferView(2532, 1170, 1);
    const runs = new ViewRuns(2, 1.25);
    runs.see(portrait);
    expect(runs.see(landscape)).toEqual({ act: "hold", from: portrait });
    runs.see(landscape);
    expect(runs.see(landscape)).toEqual({ act: "let go" });
    expect(runs.see(portrait)).toEqual({ act: "hold", from: landscape });
  });

  it("without a limit carries any growth, as before", () => {
    const runs = new ViewRuns(3);
    runs.see(a);
    expect(runs.see(at(2.7))).toEqual({ act: "hold", from: a });
  });
});
