import { describe, expect, it } from "vitest";

import { parseColor } from "./color.ts";

describe("a color from the tokens, for WebGL", () => {
  it("reads #rrggbb, as the tokens write it", () => {
    expect(parseColor(" #ff8000")).toEqual([1, 128 / 255, 0]);
  });

  it("reads rgb(r, g, b), as the browser computes it", () => {
    expect(parseColor("rgb(7, 8, 11)")).toEqual([7 / 255, 8 / 255, 11 / 255]);
  });

  it.each(["", "red", "#fff", "rgb(1, 2)", "rgba(1, 2, 3, 0.5)"])(
    "refuses %j, so that a mistyped token fails loudly",
    (text) => {
      expect(() => parseColor(text)).toThrow();
    },
  );
});
