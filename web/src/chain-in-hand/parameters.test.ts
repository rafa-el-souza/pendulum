import { describe, expect, it } from "vitest";

import { GROUNDS } from "../core/grounds.ts";
import { FAN_PALETTES } from "../core/palettes.ts";
import { checkParameters, stepValue } from "../core/parameters.ts";
import { TENSION_SCALES } from "../core/tension.ts";
import {
  AMPLITUDE,
  CHAIN,
  COLOURS,
  GRAVITY,
  GROUND,
  HAND,
  LIGHT,
  MASSES,
  MODE,
  PALETTE,
  PARAMETERS,
  RIBBON,
  SCALE,
  SHAKE,
  SHAKE_AMPLITUDE,
  SPREAD,
  TILT,
  TIME,
  TRAIL,
  TWIN_COUNT,
  gravityOf,
  handDamping,
  shakeOf,
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
    expect(CHAIN).toEqual([
      MASSES,
      TIME,
      HAND,
      GRAVITY,
      TILT,
      SHAKE,
      MODE,
      AMPLITUDE,
    ]);
    expect(LIGHT).toEqual([TWIN_COUNT, SPREAD, TRAIL, RIBBON, PALETTE]);
    expect(COLOURS).toEqual([SCALE, GROUND]);
    expect(PARAMETERS).toEqual([...CHAIN, ...LIGHT, ...COLOURS]);
  });

  it("step through the tension's scales on one key, beside the tension's T, coming round, opening with decision 35's (decision 41)", () => {
    expect(SCALE.values).toEqual(TENSION_SCALES.map((_, i) => i));
    expect(SCALE.initial).toBe(0);
    expect(SCALE.keys).toEqual({ down: [], up: ["y", "Y"] });
    expect(SCALE.cyclic).toBe(true);
    expect(stepValue(SCALE, TENSION_SCALES.length - 1, 1)).toBe(0);
  });

  it("paint a scale as five dots, from a push to sixteen weights, and name it for a screen reader", () => {
    TENSION_SCALES.forEach((scale, i) => {
      expect(SCALE.show(i)).toBe(scale.name);
      expect(SCALE.swatches?.(i)).toEqual(
        scale.stops.map(([, color]) => color),
      );
    });
  });

  it("step through the grounds on U and I, coming round, opening on the one the piece has had (decision 41)", () => {
    expect(GROUND.values).toEqual(GROUNDS.map((_, i) => i));
    expect(GROUND.initial).toBe(0);
    expect(GROUND.keys).toEqual({ down: ["u", "U"], up: ["i", "I"] });
    expect(GROUND.cyclic).toBe(true);
    expect(stepValue(GROUND, 0, -1)).toBe(GROUNDS.length - 1);
    GROUNDS.forEach((ground, i) => {
      expect(GROUND.show(i)).toBe(ground.name);
    });
  });

  it("start the chain raised to one side, as until now, or in one of the four lowest normal modes (decision 33)", () => {
    expect(MODE.values).toEqual([0, 1, 2, 3, 4]);
    expect(MODE.initial).toBe(0);
    expect(MODE.keys).toEqual({ down: ["n", "N"], up: ["m", "M"] });
    expect(MODE.icon).toBe("mode");
  });

  it("show the mode by its number, a dash for none, and say it in words", () => {
    expect(MODE.show(0)).toBe("—");
    expect(MODE.show(2)).toBe("2");
    expect(MODE.speak?.(0)).toBe("raised to one side");
    expect(MODE.speak?.(1)).toBe("normal mode 1");
  });

  it("swing a mode from 2° to 180° at its largest angle, opening at 30° (decision 33)", () => {
    expect(AMPLITUDE.values).toEqual([2, 5, 10, 20, 30, 45, 60, 90, 120, 180]);
    expect(AMPLITUDE.initial).toBe(30);
    expect(AMPLITUDE.keys).toEqual({ down: ["j", "J"], up: ["k", "K"] });
    expect(AMPLITUDE.icon).toBe("amplitude");
  });

  it("show the amplitude as an angle either way, and say it in words", () => {
    expect(AMPLITUDE.show(20)).toBe("±20°");
    expect(AMPLITUDE.speak?.(20)).toBe("20 degrees either way at most");
  });

  it("shake the pivot a millimetre either way at 800, 1 200 or 1 600 Hz, opening still (decision 36)", () => {
    expect(SHAKE.values).toEqual([0, 800, 1200, 1600]);
    expect(SHAKE.initial).toBe(0);
    expect(SHAKE.keys).toEqual({ down: ["c", "C"], up: ["v", "V"] });
    expect(SHAKE.icon).toBe("shake");
    expect(SHAKE_AMPLITUDE).toBe(0.001);
  });

  it("show the shake in hertz, a dash while still, and say it in words", () => {
    expect(SHAKE.show(0)).toBe("—");
    expect(SHAKE.show(1200)).toBe("1200 Hz");
    expect(SHAKE.speak?.(0)).toBe("still");
    expect(SHAKE.speak?.(800)).toBe(
      "800 times a second, a millimetre either way",
    );
  });

  it("make the shake the controls ask for, along gravity's line, or none while still", () => {
    expect(shakeOf(0, 0, 1)).toBeNull();
    const up = shakeOf(800, 0, 1);
    expect(up?.amplitude).toBe(0.001);
    expect(up?.rate).toBeCloseTo(2 * Math.PI * 800, 9);
    expect(up?.x).toBeCloseTo(0, 15);
    expect(up?.y).toBeCloseTo(1, 15);
    expect(up?.phase).toBe(1);
    // gravity turned a quarter to the right: the shake runs across the screen
    const across = shakeOf(1600, 90, 0);
    expect(Math.abs(across?.x ?? 0)).toBeCloseTo(1, 15);
    expect(across?.y).toBeCloseTo(0, 15);
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
