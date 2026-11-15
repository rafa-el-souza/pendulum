import { describe, expect, it } from "vitest";

import { FAN_PALETTES } from "../core/palettes.ts";
import { checkParameters } from "../core/parameters.ts";
import {
  HAND,
  MASSES,
  PALETTE,
  PARAMETERS,
  RIBBON,
  SPREAD,
  TIME,
  TRAIL,
  TWIN_COUNT,
  handDamping,
} from "./parameters.ts";

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

  it("start time at 0.8 of real time, the author's choice, with 0.9 one step up (decision 17)", () => {
    expect(TIME.initial).toBe(0.8);
    const start = TIME.values.indexOf(TIME.initial);
    expect(TIME.values[start + 1]).toBe(0.9);
  });

  it("run the hand from elastic to firm, firm being the hand before it had a control: 40 rad/s, critically damped (decision 18)", () => {
    expect(HAND.values[0]).toBe(4);
    expect(HAND.values.at(-1)).toBe(40);
    expect(HAND.initial).toBe(40);
    expect(handDamping(40)).toBe(1);
  });

  it("make each step of the hand stiffer and more damped than the one before", () => {
    HAND.values.forEach((rate, i) => {
      const before = HAND.values[i - 1];
      if (before !== undefined) {
        expect(handDamping(rate)).toBeGreaterThan(handDamping(before));
      }
    });
  });

  it("know no grip off the hand's ladder", () => {
    expect(() => handDamping(5)).toThrow();
  });

  it("show the hand's step as filled pips, and say it as a count", () => {
    expect(HAND.show(4)).toBe("●○○○○");
    expect(HAND.show(12)).toBe("●●●○○");
    expect(HAND.show(40)).toBe("●●●●●");
    expect(HAND.speak?.(12)).toBe("3 of 5");
  });

  it("let the twins run from none to 4 096, the sketch's choices, opening at 512 (decision 22)", () => {
    expect(TWIN_COUNT.values).toEqual([0, 64, 512, 4096]);
    expect(TWIN_COUNT.initial).toBe(512);
    expect(TWIN_COUNT.show(64)).toBe("64");
    expect(TWIN_COUNT.icon).toBe("fan");
  });

  it("let the trails run from none to one that stays, opening at the half-life they had, 2.5 s", () => {
    expect(TRAIL.values[0]).toBe(0);
    expect(TRAIL.initial).toBe(2.5);
    // the last halves in ten minutes, which a visit does not see fade
    expect(TRAIL.values.at(-1)).toBe(600);
    expect(TRAIL.icon).toBe("comet");
  });

  it("show the trails' length as pips, none when off, and say it in seconds", () => {
    expect(TRAIL.show(0)).toBe("○○○○○");
    expect(TRAIL.show(2.5)).toBe("●●●○○");
    expect(TRAIL.show(600)).toBe("●●●●●");
    expect(TRAIL.speak?.(0)).toBe("off");
    expect(TRAIL.speak?.(2.5)).toBe("2.5 s");
    expect(TRAIL.speak?.(600)).toBe("stays");
  });

  it("step through the twins' palettes, opening with the sketch's, which the author keeps (decision 23)", () => {
    expect(PALETTE.values).toEqual(FAN_PALETTES.map((_, i) => i));
    expect(PALETTE.initial).toBe(0);
    expect(PALETTE.keys).toEqual({ down: ["5"], up: ["6"] });
  });

  it("paint the palette as five dots from one edge of the fan to the other, and name it for a screen reader", () => {
    FAN_PALETTES.forEach((palette, i) => {
      expect(PALETTE.show(i)).toBe(palette.name);
      expect(PALETTE.swatches?.(i)).toEqual(
        [0, 0.25, 0.5, 0.75, 1].map((place) => palette.color(place)),
      );
    });
  });

  it("let the twins be born from a billionth of a radian apart to a tenth, by powers of ten, opening at the thousandth they had (decision 25)", () => {
    expect(SPREAD.values).toEqual([
      1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1,
    ]);
    expect(SPREAD.initial).toBe(1e-3);
    expect(SPREAD.keys).toEqual({ down: ["3"], up: ["4"] });
    expect(SPREAD.icon).toBe("spread");
  });

  it("show the spread as a power of ten, and say it in words", () => {
    expect(SPREAD.show(1e-9)).toBe("10⁻⁹");
    expect(SPREAD.show(1e-3)).toBe("10⁻³");
    expect(SPREAD.show(1e-1)).toBe("10⁻¹");
    expect(SPREAD.speak?.(1e-3)).toBe("10 to the minus 3 radians");
  });

  it("let the trails come from the tip alone, as they have until now, or from every mass of the chain (decision 26)", () => {
    expect(RIBBON.values).toEqual([0, 1]);
    expect(RIBBON.initial).toBe(0);
    expect(RIBBON.keys).toEqual({ down: ["1"], up: ["2"] });
    expect(RIBBON.icon).toBe("ribbon");
  });

  it("show which masses draw as masses lit, and say it in words", () => {
    expect(RIBBON.show(0)).toBe("○○●");
    expect(RIBBON.show(1)).toBe("●●●");
    expect(RIBBON.speak?.(0)).toBe("the tip");
    expect(RIBBON.speak?.(1)).toBe("every mass");
  });
});
