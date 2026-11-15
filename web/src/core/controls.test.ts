import { describe, expect, it } from "vitest";

import { moreToScroll } from "./controls.ts";

// The row of controls scrolls sideways where it does not fit, and fades at
// the side where there is more of it to see (decision 31).
describe("the row of controls", () => {
  it("has nothing more to show when it fits", () => {
    expect(moreToScroll(0, 300, 300)).toBe("");
  });

  it("has more to the right at its start, on both sides in its middle, and to the left at its end", () => {
    expect(moreToScroll(0, 600, 300)).toBe("right");
    expect(moreToScroll(150, 600, 300)).toBe("both");
    expect(moreToScroll(300, 600, 300)).toBe("left");
  });

  it("counts a scroll within a pixel of either end as at that end, since browsers stop at fractions of one", () => {
    expect(moreToScroll(0.5, 600, 300)).toBe("right");
    expect(moreToScroll(299.4, 600, 300)).toBe("left");
    expect(moreToScroll(0, 300.6, 300)).toBe("");
  });
});
