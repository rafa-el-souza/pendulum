import { describe, expect, it } from "vitest";

import { Touches, WAIT, readWait } from "./touches.ts";

// The fingers on the stage (decision 67): one finger waits a moment before it
// grabs, so that a second can come and pinch; two never grab.

const wait = { ms: 120, px: 10 };

describe("one finger on the stage", () => {
  it("grabs once it has waited, where it is then, and not before", () => {
    const touches = new Touches(wait);
    expect(touches.down(1, { x: 100, y: 200 }, 1000)).toBe("none");
    expect(touches.due(1100)).toBe("none");
    expect(touches.holder).toBeNull();
    expect(touches.move(1, { x: 104, y: 203 })).toBe("none");
    expect(touches.due(1120)).toBe("grab");
    expect(touches.holder).toEqual({ id: 1, spot: { x: 104, y: 203 } });
    // asked once
    expect(touches.due(1200)).toBe("none");
    expect(touches.up(1)).toBe("let go");
    expect(touches.holder).toBeNull();
  });

  it("grabs at once when it moves farther than the wait's distance", () => {
    const touches = new Touches(wait);
    touches.down(1, { x: 100, y: 200 }, 1000);
    expect(touches.move(1, { x: 109, y: 206 })).toBe("grab");
    expect(touches.holder).toEqual({ id: 1, spot: { x: 109, y: 206 } });
    expect(touches.move(1, { x: 150, y: 206 })).toBe("none");
    expect(touches.holder?.spot).toEqual({ x: 150, y: 206 });
  });

  it("grabs nothing when it lifts before the wait is over", () => {
    const touches = new Touches(wait);
    touches.down(1, { x: 100, y: 200 }, 1000);
    expect(touches.up(1)).toBe("none");
    expect(touches.due(2000)).toBe("none");
    expect(touches.holder).toBeNull();
  });
});

describe("two fingers on the stage", () => {
  it("pinch when the second lands while the first waits, and never grab", () => {
    const touches = new Touches(wait);
    touches.down(1, { x: 100, y: 200 }, 1000);
    expect(touches.down(2, { x: 300, y: 200 }, 1050)).toBe("pinch");
    expect(touches.pair).toEqual({ x: 200, y: 200, distance: 200 });
    expect(touches.due(5000)).toBe("none");
    expect(touches.move(2, { x: 400, y: 200 })).toBe("pinch");
    expect(touches.pair).toEqual({ x: 250, y: 200, distance: 300 });
    expect(touches.holder).toBeNull();
    expect(touches.up(2)).toBe("end");
    expect(touches.pair).toBeNull();
  });

  it("leave the finger that stays unable to grab until every finger has lifted, and pinch again if another lands", () => {
    const touches = new Touches(wait);
    touches.down(1, { x: 100, y: 200 }, 1000);
    touches.down(2, { x: 300, y: 200 }, 1050);
    touches.up(2);
    expect(touches.move(1, { x: 200, y: 300 })).toBe("none");
    expect(touches.due(9000)).toBe("none");
    expect(touches.down(3, { x: 200, y: 500 }, 9100)).toBe("pinch");
    expect(touches.pair).toEqual({ x: 200, y: 400, distance: 200 });
    touches.up(1);
    touches.up(3);
    // all lifted: one finger waits again
    touches.down(4, { x: 10, y: 10 }, 10000);
    expect(touches.due(10120)).toBe("grab");
  });

  it("leave a finger that holds the chain holding, and the second neither pinches nor grabs", () => {
    const touches = new Touches(wait);
    touches.down(1, { x: 100, y: 200 }, 1000);
    touches.due(1200);
    expect(touches.down(2, { x: 300, y: 200 }, 1300)).toBe("none");
    expect(touches.move(2, { x: 350, y: 200 })).toBe("none");
    expect(touches.pair).toBeNull();
    expect(touches.up(2)).toBe("none");
    expect(touches.holder?.id).toBe(1);
    expect(touches.up(1)).toBe("let go");
  });
});

describe("the wait in the address, to try it (decision 67)", () => {
  it("reads the milliseconds and the pixels, within bounds, and the piece's own otherwise", () => {
    expect(readWait("?wait=200")).toEqual({ ms: 200, px: WAIT.px });
    expect(readWait("?n=3&wait=80,16")).toEqual({ ms: 80, px: 16 });
    expect(readWait("?wait=80%2C16")).toEqual({ ms: 80, px: 16 });
    expect(readWait("?wait=5000,500")).toEqual({ ms: 1000, px: 100 });
    expect(readWait("?wait=abc")).toEqual(WAIT);
    expect(readWait("")).toEqual(WAIT);
  });
});
