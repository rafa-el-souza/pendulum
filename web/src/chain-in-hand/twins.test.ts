import { describe, expect, it } from "vitest";

import { twinPieces, twinTrailLight } from "./twins.ts";

// The first piece's twins (docs/decisions.md, decision 92): the pieces they
// are sent in, and the light of their trails (decisions 21 and 51).

describe("the pieces the twins are sent in (decisions 21 and 51)", () => {
  it("are none for events alone, one with the trails off, and 240 to the second, from one to eight", () => {
    expect(twinPieces(0, 2.5)).toBe(0);
    expect(twinPieces(-1, 2.5)).toBe(0);
    expect(twinPieces(1 / 60, 0)).toBe(1);
    expect(twinPieces(1 / 240, 2.5)).toBe(1);
    expect(twinPieces(1e-4, 2.5)).toBe(1);
    expect(twinPieces(1 / 60, 2.5)).toBe(4);
    expect(twinPieces(1 / 30, 2.5)).toBe(8);
    expect(twinPieces(0.25, 2.5)).toBe(8);
  });
});

describe("the light of the twins' trails (decision 21)", () => {
  it("is fainter the more twins there are, from 0.35 down to 0.03", () => {
    expect(twinTrailLight(0)).toBe(0.35);
    expect(twinTrailLight(1)).toBe(0.35);
    expect(twinTrailLight(64)).toBeCloseTo(0.15, 15);
    expect(twinTrailLight(512)).toBeCloseTo(1.2 / Math.sqrt(512), 15);
    expect(twinTrailLight(4096)).toBe(0.03);
  });
});
