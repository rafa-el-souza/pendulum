import { describe, expect, it } from "vitest";

import { checkParameters } from "../core/parameters.ts";
import { MASSES, PARAMETERS, TIME } from "./parameters.ts";

describe("the first piece's parameters", () => {
  it("are a valid registry: distinct ids and keys, increasing values", () => {
    expect(() => {
      checkParameters(PARAMETERS);
    }).not.toThrow();
  });

  it("run from one mass to 512, the sketch's range", () => {
    expect(MASSES.values[0]).toBe(1);
    expect(MASSES.values.at(-1)).toBe(512);
  });

  it("let time run from a tenth of real time to four times it, real time included", () => {
    expect(TIME.values[0]).toBe(0.1);
    expect(TIME.values.at(-1)).toBe(4);
    expect(TIME.values).toContain(1);
  });
});
