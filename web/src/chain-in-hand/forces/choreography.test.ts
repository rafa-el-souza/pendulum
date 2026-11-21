import { describe, expect, it } from "vitest";

import {
  DANCE_OPENS,
  FIGURES,
  alongFigure,
  pointsOf,
  readChoreography,
  writeChoreography,
  type Figure,
} from "./choreography.ts";

// The dancing hand's choreography (docs/decisions.md, decision 83): the
// layers the visitor composes the dance from, carried by the address, and
// the figures the hand traces.

describe("the dance's choreography in the address (decision 83)", () => {
  it("opens as the dance has: the swing below, led by the kicks, a point a kick, in a snap, the hand hidden", () => {
    expect(readChoreography("")).toEqual(DANCE_OPENS);
    expect(DANCE_OPENS).toEqual({
      figure: "swing",
      place: "below",
      lead: "kick",
      beats: 1,
      feel: "snap",
      shown: false,
    });
  });

  it("reads each layer from the address, and opens anything it does not know as the dance opens", () => {
    expect(
      readChoreography(
        "?music=dance&figure=eight&place=above&lead=clock&beats=0.5&feel=ictus&showhand=1",
      ),
    ).toEqual({
      figure: "eight",
      place: "above",
      lead: "clock",
      beats: 0.5,
      feel: "ictus",
      shown: true,
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
  });

  it("writes only the layers that differ from how the dance opens, after whatever else the address carried, and reads back what it wrote", () => {
    expect(writeChoreography("?music=dance", DANCE_OPENS)).toBe("?music=dance");
    expect(writeChoreography("", DANCE_OPENS)).toBe("");
    const composed = {
      figure: "turn",
      place: "side",
      lead: "snare",
      beats: 4,
      feel: "smooth",
      shown: true,
    } as const;
    const search = writeChoreography(
      "?music=dance&figure=eight&strength=4",
      composed,
    );
    expect(search).toBe(
      "?music=dance&strength=4&figure=turn&place=side&lead=snare&beats=4&feel=smooth&showhand=1",
    );
    expect(readChoreography(search)).toEqual(composed);
    // back to how it opens, the layers leave the address
    expect(writeChoreography(search, DANCE_OPENS)).toBe(
      "?music=dance&strength=4",
    );
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
