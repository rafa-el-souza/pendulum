import { describe, expect, it } from "vitest";

import {
  DANCE_OPENS,
  FIGURES,
  GRIPS,
  SLACKS,
  alongFigure,
  heldMass,
  pointsOf,
  readChoreography,
  sequenceOf,
  writeChoreography,
  type Figure,
} from "./choreography.ts";

// The dancing hand's choreography (docs/decisions.md, decisions 83, 85 and
// 87): the layers the visitor composes the dance from, carried by the
// address, the figures the hand traces, and the mass it holds.

describe("the dance's choreography in the address (decision 83)", () => {
  it("opens as the dance has: the swing below, led by the kicks, a point a kick, in a snap, as wide as the music is loud, from the middle, gripped as firmly throughout, by the tip, with the hand's grip of 12, taut, never let go of, the figure kept, the hand hidden", () => {
    expect(readChoreography("")).toEqual(DANCE_OPENS);
    expect(DANCE_OPENS).toEqual({
      figure: "swing",
      then: [],
      place: "below",
      lead: "kick",
      beats: 1,
      feel: "snap",
      size: "level",
      center: "none",
      pulse: "none",
      grab: "tip",
      grip: 3,
      slack: 0,
      toss: 0,
      vary: 0,
      shown: false,
    });
    expect(GRIPS[DANCE_OPENS.grip - 1]).toBe(12);
    expect(SLACKS[DANCE_OPENS.slack]).toBe(0);
  });

  it("reads each layer from the address, and opens anything it does not know as the dance opens", () => {
    expect(
      readChoreography(
        "?music=dance&figure=eight&place=above&lead=clock&beats=0.5&feel=ictus&showhand=1",
      ),
    ).toEqual({
      ...DANCE_OPENS,
      figure: "eight",
      place: "above",
      lead: "clock",
      beats: 0.5,
      feel: "ictus",
      shown: true,
    });
    expect(
      readChoreography(
        "?size=kick&center=bass&pulse=beat&grab=middle&grip=5&slack=3",
      ),
    ).toEqual({
      ...DANCE_OPENS,
      size: "kick",
      center: "bass",
      pulse: "beat",
      grab: "middle",
      grip: 5,
      slack: 3,
    });
    expect(
      readChoreography("?size=fixed&center=level&grab=top&grip=1&slack=4"),
    ).toEqual({
      ...DANCE_OPENS,
      size: "fixed",
      center: "level",
      grab: "top",
      grip: 1,
      slack: 4,
    });
    expect(readChoreography("?beats=auto&lead=bass&figure=conduct")).toEqual({
      ...DANCE_OPENS,
      figure: "conduct",
      lead: "bass",
      beats: "auto",
    });
    expect(
      readChoreography(
        "?figure=zigzag&place=under&lead=drums&beats=3&feel=soft&showhand=yes",
      ),
    ).toEqual(DANCE_OPENS);
    expect(
      readChoreography("?size=huge&center=up&pulse=1&grab=foot&grip=6&slack=5"),
    ).toEqual(DANCE_OPENS);
    expect(readChoreography("?grip=0&slack=-1")).toEqual(DANCE_OPENS);
    expect(readChoreography("?grip=2.5&slack=1.5")).toEqual(DANCE_OPENS);
  });

  it("writes only the layers that differ from how the dance opens, after whatever else the address carried, and reads back what it wrote", () => {
    expect(writeChoreography("?music=dance", DANCE_OPENS)).toBe("?music=dance");
    expect(writeChoreography("", DANCE_OPENS)).toBe("");
    const composed = {
      figure: "turn",
      then: [],
      place: "side",
      lead: "snare",
      beats: 4,
      feel: "smooth",
      size: "treble",
      center: "level",
      pulse: "beat",
      grab: "top",
      grip: 4,
      slack: 2,
      toss: 0,
      vary: 0,
      shown: true,
    } as const;
    const search = writeChoreography(
      "?music=dance&figure=eight&strength=4",
      composed,
    );
    expect(search).toBe(
      "?music=dance&strength=4&figure=turn&place=side&lead=snare&beats=4&feel=smooth&size=treble&center=level&pulse=beat&grab=top&grip=4&slack=2&showhand=1",
    );
    expect(readChoreography(search)).toEqual(composed);
    // back to how it opens, the layers leave the address
    expect(writeChoreography(search, DANCE_OPENS)).toBe(
      "?music=dance&strength=4",
    );
  });
});

describe("the dance's long time in the address (decision 87)", () => {
  it("reads when the hand lets go, every 1, 2 or 4 bars; when the figure changes, every 1, 2, 4 or 8 bars or with the loudness; and the figures that follow the first", () => {
    expect(
      readChoreography("?music=dance&figure=swing-circle-eight&toss=2&vary=4"),
    ).toEqual({
      ...DANCE_OPENS,
      figure: "swing",
      then: ["circle", "eight"],
      toss: 2,
      vary: 4,
    });
    expect(readChoreography("?toss=1&vary=level")).toEqual({
      ...DANCE_OPENS,
      toss: 1,
      vary: "level",
    });
    expect(readChoreography("?toss=4&vary=8")).toEqual({
      ...DANCE_OPENS,
      toss: 4,
      vary: 8,
    });
    // a figure it does not know is left out of the list
    expect(readChoreography("?figure=zigzag-turn-bounce-x")).toEqual({
      ...DANCE_OPENS,
      figure: "turn",
      then: ["bounce"],
    });
    expect(readChoreography("?figure=circle-")).toEqual({
      ...DANCE_OPENS,
      figure: "circle",
    });
    expect(readChoreography("?toss=3&vary=5&figure=-")).toEqual(DANCE_OPENS);
    expect(readChoreography("?toss=0&vary=0&toss=fill")).toEqual(DANCE_OPENS);
  });

  it("writes the list of figures joined by hyphens, and the long time's layers before the hand, and reads back what it wrote", () => {
    const composed = {
      ...DANCE_OPENS,
      figure: "eight",
      then: ["swing", "eight"],
      toss: 4,
      vary: "level",
      shown: true,
    } as const;
    const search = writeChoreography("?music=dance", composed);
    expect(search).toBe(
      "?music=dance&figure=eight-swing-eight&toss=4&vary=level&showhand=1",
    );
    expect(readChoreography(search)).toEqual(composed);
    expect(
      writeChoreography("", { ...DANCE_OPENS, then: ["circle"], vary: 2 }),
    ).toBe("?figure=swing-circle&vary=2");
    expect(writeChoreography(search, DANCE_OPENS)).toBe("?music=dance");
  });

  it("varies through the figures listed, or, with one, through all eight in their order from it", () => {
    expect(
      sequenceOf({ ...DANCE_OPENS, figure: "eight", then: ["circle"] }),
    ).toEqual(["eight", "circle"]);
    expect(sequenceOf({ ...DANCE_OPENS, figure: "bounce" })).toEqual([
      "bounce",
      "poses",
      "swing",
      "circle",
      "turn",
      "eight",
      "upright",
      "conduct",
    ]);
  });
});

describe("the mass the hand holds (decision 85)", () => {
  it("holds the tip, the mass halfway down the chain, or the one a quarter of the way down, near the pivot", () => {
    expect(heldMass("tip", 8)).toBe(7);
    expect(heldMass("middle", 8)).toBe(3);
    expect(heldMass("top", 8)).toBe(1);
    expect(heldMass("middle", 32)).toBe(15);
    expect(heldMass("top", 32)).toBe(7);
    expect(heldMass("middle", 3)).toBe(1);
    expect(heldMass("top", 3)).toBe(0);
    // with two masses, the middle is the elbow, and so is the top
    expect(heldMass("tip", 2)).toBe(1);
    expect(heldMass("middle", 2)).toBe(0);
    expect(heldMass("top", 2)).toBe(0);
    // and a single mass is the tip
    for (const grab of ["tip", "middle", "top"] as const) {
      expect(heldMass(grab, 1)).toBe(0);
    }
  });

  it("grips from gentle to forced, the visitor's hand's first three steps and then firmer than its firmest, and leaves the target at most four tenths of the reach nearer the pivot", () => {
    expect(GRIPS).toEqual([4, 7, 12, 40, 120]);
    expect(SLACKS).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
  });
});

describe("the figures the hand traces (decision 83)", () => {
  it("each passes through its points in order, a share of a turn apart, the first as the turn begins", () => {
    for (const figure of FIGURES) {
      const points = pointsOf(figure);
      points.forEach((point, k) => {
        const at = alongFigure(figure, k / points.length);
        expect(at.x, `${figure} ${String(k)}`).toBeCloseTo(point.x, 12);
        expect(at.y, `${figure} ${String(k)}`).toBeCloseTo(point.y, 12);
      });
    }
  });

  it("each comes round to where it began after a turn, but the turn, which goes on round the pivot", () => {
    for (const figure of FIGURES.filter((f) => f !== "turn")) {
      for (const u of [0.1, 0.37, 0.8]) {
        const once = alongFigure(figure, u);
        const again = alongFigure(figure, u + 3);
        expect(again.x, figure).toBeCloseTo(once.x, 9);
        expect(again.y, figure).toBeCloseTo(once.y, 9);
      }
    }
    expect(alongFigure("turn", 1.25)).toEqual({ x: 1.25, y: 0 });
  });

  it("keeps within its plane: across from −1 to 1, and inward from the full reach, 0, to 1", () => {
    for (const figure of FIGURES.filter((f) => f !== "turn")) {
      for (let k = 0; k <= 200; k++) {
        const at = alongFigure(figure, k / 200);
        expect(Math.abs(at.x), figure).toBeLessThanOrEqual(1 + 1e-12);
        expect(at.y, figure).toBeGreaterThanOrEqual(-1e-12);
        expect(at.y, figure).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });

  it("has the points of its name", () => {
    const named: Record<Figure, readonly (readonly [number, number])[]> = {
      // the two sides
      swing: [
        [1, 0],
        [-1, 0],
      ],
      // the bottom, a side, the top and the other side
      circle: [
        [0, 0],
        [1, 0.5],
        [0, 1],
        [-1, 0.5],
      ],
      // a quarter of a turn round the pivot each
      turn: [
        [0, 0],
        [0.25, 0],
        [0.5, 0],
        [0.75, 0],
      ],
      // the middle, where it crosses, on the first and the third
      eight: [
        [0, 0.5],
        [1, 0.5],
        [0, 0.5],
        [-1, 0.5],
      ],
      // the bottom, the middle, the top, the middle
      upright: [
        [0, 0],
        [0, 0.5],
        [0, 1],
        [0, 0.5],
      ],
      // the conductor's four beats: down, in, out and up
      conduct: [
        [0, 0],
        [-0.7, 0.35],
        [1, 0.3],
        [0.1, 1],
      ],
      // the full reach and the fold
      bounce: [
        [0, 0],
        [0, 1],
      ],
      // below, high on either side, and up
      poses: [
        [0, 0],
        [-1, 0.6],
        [1, 0.6],
        [0, 1],
      ],
    };
    for (const figure of FIGURES) {
      expect(
        pointsOf(figure).map(({ x, y }) => [x, y]),
        figure,
      ).toEqual(named[figure]);
    }
  });
});
