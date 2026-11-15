import { describe, expect, it } from "vitest";

import { backingSize } from "./stage.ts";

describe("backingSize", () => {
  it("is the size on screen times the device pixel ratio", () => {
    expect(backingSize(390, 844, 3)).toEqual({ width: 1170, height: 2532 });
  });

  it("rounds to whole pixels", () => {
    expect(backingSize(1280, 721, 1.25)).toEqual({ width: 1600, height: 901 });
  });

  it("keeps at least one pixel each way, for a canvas not laid out yet", () => {
    expect(backingSize(0, 0, 2)).toEqual({ width: 1, height: 1 });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "takes a pixel ratio of %s as 1",
    (ratio) => {
      expect(backingSize(800, 600, ratio)).toEqual({ width: 800, height: 600 });
    },
  );
});
