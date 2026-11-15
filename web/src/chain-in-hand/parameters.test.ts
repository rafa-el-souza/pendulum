import { describe, expect, it } from "vitest";

import { FAN_PALETTES } from "../core/palettes.ts";
import { checkParameters, stepValue } from "../core/parameters.ts";
import {
  CHAIN,
  GRAVITY,
  HAND,
  LIGHT,
  MASSES,
  PALETTE,
  PARAMETERS,
  RIBBON,
  SPREAD,
  TILT,
  TIME,
  TRAIL,
  TWIN_COUNT,
  gravityOf,
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
  it("run gravity from none to Jupiter's, through Pluto's, the Moon's, Mars's and Earth's, opening at Earth's (decision 29)", () => {
    expect(GRAVITY.values).toEqual([0, 0.62, 1.62, 3.71, 9.81, 24.79]);
    expect(GRAVITY.initial).toBe(9.81);
    expect(GRAVITY.keys).toEqual({ down: ["q", "Q"], up: ["e", "E"] });
  });

  it("show gravity's strength as g in m/s², and say where it is that strong", () => {
    expect(GRAVITY.show(9.81)).toBe("g = 9.81");
    expect(GRAVITY.show(0)).toBe("g = 0");
    expect(GRAVITY.speak?.(1.62)).toBe(
      "1.62 metres per second squared, as on the Moon",
    );
    expect(GRAVITY.speak?.(0)).toBe("none");
  });

  it("turn gravity all the way round in steps of 15°, from straight down and on past straight up (decision 29)", () => {
    expect(TILT.values).toHaveLength(24);
    expect(TILT.values[0]).toBe(-165);
    expect(TILT.values.at(-1)).toBe(180);
    expect(TILT.initial).toBe(0);
    expect(TILT.keys).toEqual({ down: ["a", "A"], up: ["d", "D"] });
    expect(stepValue(TILT, 0, 1)).toBe(15);
    expect(stepValue(TILT, 180, 1)).toBe(-165);
    expect(stepValue(TILT, -165, -1)).toBe(180);
  });

  it("show the direction in degrees from straight down, to the right positive, beside an arrow turned the way gravity points", () => {
    expect(TILT.show(0)).toBe("0°");
    expect(TILT.show(90)).toBe("90°");
    expect(TILT.show(-45)).toBe("−45°");
    expect(TILT.speak?.(0)).toBe("straight down");
    expect(TILT.speak?.(180)).toBe("straight up");
    expect(TILT.speak?.(-45)).toBe("45 degrees left of straight down");
    expect(TILT.speak?.(90)).toBe("90 degrees right of straight down");
    // the arrow is drawn pointing down, and turning it to the right on
    // screen is turning it anticlockwise
    expect(TILT.icon).toBe("arrow");
    expect(TILT.iconTurn?.(90)).toBe(-90);
  });

  it("give every parameter an icon of its own, since the row of controls names them without words (decision 31)", () => {
    const icons = PARAMETERS.map((p) => p.icon);
    expect(icons).not.toContain(undefined);
    expect(new Set(icons).size).toBe(PARAMETERS.length);
  });

  it("set what moves the chain apart from the light, each parameter in one of the two, in the registry's order (decision 31)", () => {
    expect(CHAIN).toEqual([MASSES, TIME, HAND, GRAVITY, TILT]);
    expect(LIGHT).toEqual([TWIN_COUNT, SPREAD, TRAIL, RIBBON, PALETTE]);
    expect(PARAMETERS).toEqual([...CHAIN, ...LIGHT]);
  });

  it("make the gravity the controls ask for: Earth's straight down at first, and a quarter turn points it to the right", () => {
    expect(gravityOf(9.81, 0)).toEqual({ x: 0, y: -9.81 });
    const right = gravityOf(1.62, 90);
    expect(right.x).toBeCloseTo(1.62, 15);
    expect(right.y).toBeCloseTo(0, 15);
    const up = gravityOf(24.79, 180);
    expect(up.x).toBeCloseTo(0, 14);
    expect(up.y).toBeCloseTo(24.79, 14);
  });
});
