import { describe, expect, it } from "vitest";

import {
  TRAIL_JUMP,
  layerOf,
  trailLayers,
  veilShine,
  type TrailLayer,
} from "./drawing.ts";
import { LINES, STROBE, TWIN_LINES, TWIN_STROBE } from "./parameters.ts";

// The first piece's drawing (docs/decisions.md, decisions 90 and 96): the
// trails are drawn in layers, each saying what leaves it (the chain or its
// twins), how (lines, or a strobe's stamps) and which parts (the tip, every
// mass, the rods, or the whole of it). The four controls of the trails' layers
// ask for them, each layer apart.

/** The layers as words: target, mark and parts. */
function words(layers: readonly TrailLayer[]): string[] {
  return layers.map(({ target, mark, parts }) => `${target} ${mark} ${parts}`);
}

const PARTS = ["tip", "masses", "rods", "whole"];

describe("the trails' layers", () => {
  it("open as lines from the tips of the chain and of each twin (decision 21)", () => {
    expect(
      words(
        trailLayers(
          LINES.initial,
          STROBE.initial,
          TWIN_LINES.initial,
          TWIN_STROBE.initial,
        ),
      ),
    ).toEqual(["chain lines tip", "twins lines tip"]);
  });

  it("draw lines from each part of the chain the control steps to: its tip, every mass, its rods, the whole chain (decision 96)", () => {
    for (const [i, parts] of PARTS.entries()) {
      expect(words(trailLayers(i + 1, 0, 0, 0))).toEqual([
        `chain lines ${parts}`,
      ]);
    }
  });

  it("stamp each part of the chain the strobe's control steps to on its flashes (decision 96)", () => {
    for (const [i, parts] of PARTS.entries()) {
      expect(words(trailLayers(0, i + 1, 0, 0))).toEqual([
        `chain stamps ${parts}`,
      ]);
    }
  });

  it("are none when every control is off", () => {
    expect(trailLayers(0, 0, 0, 0)).toEqual([]);
  });

  it("draw lines and stamps of one target together, the chain's first, in the row's order (decision 96)", () => {
    expect(words(trailLayers(2, 3, 1, 1))).toEqual([
      "chain lines masses",
      "chain stamps rods",
      "twins lines tip",
      "twins stamps tip",
    ]);
    expect(words(trailLayers(0, 0, 0, 1))).toEqual(["twins stamps tip"]);
  });

  it("find the layer a target leaves by a mark, or none", () => {
    const layers = trailLayers(2, 0, 1, 0);
    expect(layerOf(layers, "chain", "lines")?.parts).toBe("masses");
    expect(layerOf(layers, "twins", "lines")?.parts).toBe("tip");
    expect(layerOf(layers, "chain", "stamps")).toBeUndefined();
    expect(layerOf(trailLayers(0, 3, 0, 1), "twins", "lines")).toBeUndefined();
    expect(layerOf([], "chain", "lines")).toBeUndefined();
  });

  it("are the same layers each time the same controls ask for them, so that a frame makes none anew", () => {
    expect(trailLayers(1, 0, 1, 0)).toBe(trailLayers(1, 0, 1, 0));
    expect(trailLayers(4, 4, 1, 1)).toBe(trailLayers(4, 4, 1, 1));
    expect(trailLayers(4, 4, 1, 1)[0]).toBe(trailLayers(4, 0, 0, 0)[0]);
  });
});

describe("the veil of the rods (decision 96)", () => {
  it("lights each end of a rod as far as it moved over the piece, up to a light it keeps for five millimetres or more", () => {
    expect(veilShine(0, 0)).toBe(0);
    const most = veilShine(0.005, 0);
    expect(most).toBeGreaterThan(0);
    expect(veilShine(0.003, 0.004)).toBeCloseTo(most, 12);
    expect(veilShine(0.0025, 0)).toBeCloseTo(most / 2, 12);
    expect(veilShine(0, -0.1)).toBe(most);
  });

  it("lights no end that jumped, as no trail goes across a jump (decision 21)", () => {
    expect(veilShine(TRAIL_JUMP, 0)).toBe(0);
    expect(veilShine(0, 2 * TRAIL_JUMP)).toBe(0);
  });
});
