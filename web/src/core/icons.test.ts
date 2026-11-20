import { describe, expect, it } from "vitest";

import { barHeights } from "./icons.ts";

// While the piece listens, the music's icon in the row becomes three bars
// that rise with the sound's three bands (decision 76).
describe("the music's live icon", () => {
  it("rises with each band, from a short bar in silence, which three stubs would read as an ellipsis, to the grid's full height", () => {
    expect(barHeights([0, 0.5, 1])).toEqual([5, 11, 17]);
  });

  it("keeps a level out of range, or none, on the grid", () => {
    expect(barHeights([-1, 2, Number.NaN])).toEqual([5, 17, 5]);
  });
});
