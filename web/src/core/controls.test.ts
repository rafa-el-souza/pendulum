import { describe, expect, it } from "vitest";

import { centredOver, moreToScroll, onControls } from "./controls.ts";

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

// The value chosen opens right above its icon, centred on it, and stays on
// the screen (decision 32).
describe("where the value chosen opens", () => {
  it("is centred on its icon where there is room", () => {
    expect(centredOver(400, 180, 8, 1272)).toBe(310);
  });

  it("stays on the screen beside an icon near either edge", () => {
    expect(centredOver(30, 180, 8, 382)).toBe(8);
    expect(centredOver(370, 180, 8, 382)).toBe(202);
  });

  it("starts at the near edge when it is wider than the screen", () => {
    expect(centredOver(100, 500, 8, 382)).toBe(8);
  });
});

// A touch where the controls are, seen or not, is for them, and never grabs
// the chain (decision 32).
describe("where the controls are, for a touch", () => {
  const button = { left: 334, top: 788, right: 382, bottom: 836 };
  const value = { left: 150, top: 744, right: 330, bottom: 784 };

  it("is on any of their boxes", () => {
    expect(onControls([button, value], 12, 358, 812)).toBe(true);
    expect(onControls([button, value], 12, 240, 760)).toBe(true);
  });

  it("reaches a margin round them, where a finger's miss lands", () => {
    expect(onControls([button], 12, 325, 812)).toBe(true);
    expect(onControls([button], 12, 358, 778)).toBe(true);
  });

  it("is not the stage beyond that margin", () => {
    expect(onControls([button], 12, 320, 812)).toBe(false);
    expect(onControls([button, value], 12, 195, 420)).toBe(false);
    expect(onControls([], 12, 358, 812)).toBe(false);
  });
});
