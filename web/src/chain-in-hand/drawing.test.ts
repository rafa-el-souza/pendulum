import { describe, expect, it } from "vitest";

import { layerOf, trailLayers, type TrailLayer } from "./drawing.ts";
import { LOOK, RIBBON, STYLE } from "./parameters.ts";

// The first piece's drawing (docs/decisions.md, decision 90): the trails are
// drawn in layers, each saying what leaves it (the chain or its twins), how
// (lines, or a strobe's stamps) and which parts (the tip, every mass, the
// rods). The controls of the trails ask for the layers decisions 21, 26, 50
// and 53 drew before there were layers.

/** The layers as words: target, mark and parts. */
function words(layers: readonly TrailLayer[]): string[] {
  return layers.map(({ target, mark, parts }) => `${target} ${mark} ${parts}`);
}

describe("the trails' layers", () => {
  it("open as lines from the tips of the chain and of each twin (decision 21)", () => {
    expect(
      words(trailLayers(STYLE.initial, RIBBON.initial, LOOK.initial)),
    ).toEqual(["chain lines tip", "twins lines tip"]);
  });

  it("draw lines from every mass of the chain with the ribbon (decision 26)", () => {
    expect(words(trailLayers(0, 1, 0))).toEqual([
      "chain lines masses",
      "twins lines tip",
    ]);
  });

  it("leave no lines from twins drawn as dust, whatever the chain draws (decisions 50 and 53)", () => {
    expect(words(trailLayers(0, 0, 1))).toEqual(["chain lines tip"]);
    expect(words(trailLayers(0, 1, 1))).toEqual(["chain lines masses"]);
  });

  it("are a strobe's stamps of the chain's rods and of each twin's tip, with or without the ribbon or dust, and no lines (decisions 50 and 53)", () => {
    for (const ribbon of [0, 1]) {
      for (const look of [0, 1]) {
        expect(words(trailLayers(1, ribbon, look))).toEqual([
          "chain stamps rods",
          "twins stamps tip",
        ]);
      }
    }
  });

  it("find the layer a target leaves by a mark, or none", () => {
    const layers = trailLayers(0, 1, 0);
    expect(layerOf(layers, "chain", "lines")?.parts).toBe("masses");
    expect(layerOf(layers, "twins", "lines")?.parts).toBe("tip");
    expect(layerOf(layers, "chain", "stamps")).toBeUndefined();
    expect(layerOf(trailLayers(1, 0, 0), "twins", "lines")).toBeUndefined();
    expect(layerOf([], "chain", "lines")).toBeUndefined();
  });

  it("are the same layers each time the same controls ask for them, so that a frame makes none anew", () => {
    expect(trailLayers(0, 0, 0)).toBe(trailLayers(0, 0, 0));
    expect(trailLayers(1, 1, 1)).toBe(trailLayers(1, 0, 0));
  });
});
