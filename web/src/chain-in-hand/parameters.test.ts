import { describe, expect, it } from "vitest";

import { GROUNDS } from "../core/grounds.ts";
import { FAN_PALETTES } from "../core/palettes.ts";
import { checkParameters, stepValue } from "../core/parameters.ts";
import { TENSION_SCALES } from "../core/tension.ts";
import { MOST_ZOOM, writeCamera } from "../core/view.ts";
import {
  AMPLITUDE,
  CHAIN,
  doublingSaid,
  doublingShown,
  COLOURS,
  DRAWN,
  FADE,
  FADE_REACH,
  HELD_STEP,
  HOLD,
  LEASHED_STEP,
  LEASH_RATE,
  MEASURED_WIDEST,
  NEAR_SPREAD,
  GRAVITY,
  GROUND,
  HAND,
  LIGHT,
  LOOK,
  MASSES,
  MODE,
  PALETTE,
  LINES,
  PARAMETERS,
  SAVED_START,
  SCALE,
  SHAKE,
  SHAKE_AMPLITUDE,
  SPREAD,
  STROBE,
  TENSION,
  TILT,
  TIME,
  TRAIL,
  TWIN_COUNT,
  TWIN_LINES,
  TWIN_STROBE,
  WHITE,
  ZOOM,
  gravityOf,
  handDamping,
  massesDrawn,
  MARK_STEP,
  rodsDrawn,
  shakeOf,
  trailFade,
  whiteAfter,
  whiteSwatches,
  MUSIC_MODE,
  MUSIC_STRENGTH,
} from "./parameters.ts";
import { MODES } from "./music.ts";

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
    // the last, written 600, stays
    expect(TRAIL.values.at(-1)).toBe(600);
    expect(TRAIL.icon).toBe("comet");
  });

  it("have a step before the one that stays which fades as the first piece's trails do and leaves a mark (decision 42), and no strobe's among them, which is a style of its own (decision 53)", () => {
    expect(TRAIL.values).toEqual([0, 0.5, 1, 2.5, 10, MARK_STEP, 600]);
    expect(trailFade(MARK_STEP)).toEqual({ halfLife: 2.5, mark: true });
    expect(trailFade(600)).toEqual({
      halfLife: Number.POSITIVE_INFINITY,
      mark: false,
    });
    for (const value of [0.5, 1, 2.5, 10]) {
      expect(trailFade(value)).toEqual({ halfLife: value, mark: false });
    }
  });

  it("are how long the trails last, shown in seconds and words, not pips (decision 53)", () => {
    expect(TRAIL.label).toBe("How long the trails last");
    expect(TRAIL.keys).toEqual({ down: ["7"], up: ["8"] });
    expect(TRAIL.values.map((value) => TRAIL.show(value))).toEqual([
      "off",
      "0.5 s",
      "1 s",
      "2.5 s",
      "10 s",
      "mark",
      "stays",
    ]);
    expect(TRAIL.speak?.(0)).toBe("off");
    expect(TRAIL.speak?.(2.5)).toBe("2.5 s");
    expect(TRAIL.speak?.(MARK_STEP)).toBe("leaves a mark");
    expect(TRAIL.speak?.(600)).toBe("stays");
  });

  it("draw lines from the chain's tip as the piece opens, or from none of it, every mass, its rods or the whole chain, on the keys that chose the masses before (decision 96)", () => {
    expect(LINES.id).toBe("lines");
    expect(LINES.label).toBe("Lines from the chain");
    expect(LINES.values).toEqual([0, 1, 2, 3, 4]);
    expect(LINES.initial).toBe(1);
    expect(LINES.keys).toEqual({ down: ["1"], up: ["2"] });
    expect(LINES.values.map((value) => LINES.show(value))).toEqual([
      "off",
      "tip",
      "masses",
      "rods",
      "whole",
    ]);
    expect(LINES.icon).toBe("path");
  });

  it("stamp no part of the chain on a strobe's flashes as the piece opens, or its tip, every mass, its rods or the whole chain, on the keys that chose the strobe before (decision 96)", () => {
    expect(STROBE.id).toBe("strobe");
    expect(STROBE.label).toBe("Strobe on the chain");
    expect(STROBE.values).toEqual([0, 1, 2, 3, 4]);
    expect(STROBE.initial).toBe(0);
    expect(STROBE.keys).toEqual({
      down: ["Shift+Digit7"],
      up: ["Shift+Digit8"],
    });
    expect(STROBE.values.map((value) => STROBE.show(value))).toEqual([
      "off",
      "tip",
      "masses",
      "rods",
      "whole",
    ]);
    expect(STROBE.icon).toBe("flash");
  });

  it("draw lines from each twin's tip as the piece opens, or none, on Shift with the chain's lines' keys (decision 96)", () => {
    expect(TWIN_LINES.id).toBe("twinlines");
    expect(TWIN_LINES.label).toBe("Lines from the twins");
    expect(TWIN_LINES.values).toEqual([0, 1]);
    expect(TWIN_LINES.initial).toBe(1);
    expect(TWIN_LINES.keys).toEqual({
      down: ["Shift+Digit1"],
      up: ["Shift+Digit2"],
    });
    expect(TWIN_LINES.show(0)).toBe("off");
    expect(TWIN_LINES.show(1)).toBe("tips");
    expect(TWIN_LINES.icon).toBe("paths");
  });

  it("stamp no twin on a strobe's flashes as the piece opens, or each twin's tip, every mass, its rods or the whole of it, as the chain's do, on Shift with the twins' own keys (decisions 96 and 100)", () => {
    expect(TWIN_STROBE.id).toBe("twinstrobe");
    expect(TWIN_STROBE.label).toBe("Strobe on the twins");
    expect(TWIN_STROBE.values).toEqual([0, 1, 2, 3, 4]);
    expect(TWIN_STROBE.initial).toBe(0);
    expect(TWIN_STROBE.keys).toEqual({
      down: ["Shift+Digit9"],
      up: ["Shift+Digit0"],
    });
    expect(TWIN_STROBE.values.map((value) => TWIN_STROBE.show(value))).toEqual([
      "off",
      "tips",
      "masses",
      "rods",
      "whole",
    ]);
    expect(TWIN_STROBE.icon).toBe("flashes");
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

  it("let dense light turn white at once, as before, late, later, as the piece opens, or never, on Shift with the palette's keys (decision 61)", () => {
    expect(WHITE.id).toBe("white");
    expect(WHITE.label).toBe("When dense light turns white");
    expect(WHITE.values).toEqual([0, 1, 2, 3]);
    expect(WHITE.initial).toBe(2);
    expect(WHITE.keys).toEqual({
      down: ["Shift+Digit5"],
      up: ["Shift+Digit6"],
    });
    expect(WHITE.values.map((value) => WHITE.show(value))).toEqual([
      "at once",
      "late",
      "later",
      "never",
    ]);
    expect(WHITE.speak?.(0)).toBe("at once, each colour filling on its own");
    expect(WHITE.speak?.(3)).toBe("never: dense light keeps its colour");
    expect(WHITE.icon).toBe("whiten");
    expect(WHITE.values.map(whiteAfter)).toEqual([
      0,
      40,
      150,
      Number.POSITIVE_INFINITY,
    ]);
  });

  it("paint when white comes in as five dots of the palette's middle colour, from 4 twins in a pixel to 1 024, each as bright as one of the 512 the piece opens with (decision 61)", () => {
    const blossom = FAN_PALETTES.findIndex(({ name }) => name === "blossom");
    const middle = FAN_PALETTES[blossom]?.color(0.5) ?? [0, 0, 0];
    const brightest = Math.max(...middle);
    const four = (4 * 2.2) / Math.sqrt(512);
    for (const step of WHITE.values) {
      const dots = whiteSwatches(step, blossom);
      expect(dots).toHaveLength(5);
      // brighter the more twins share the pixel, until a channel is full
      for (let i = 1; i < dots.length; i++) {
        const before = Math.max(...(dots[i - 1] ?? []));
        const now = Math.max(...(dots[i] ?? []));
        if (before < 1) expect(now).toBeGreaterThan(before);
        else expect(now).toBe(1);
      }
    }
    // at once, the twins added on the canvas, each channel cut at full: the
    // densest dots white
    expect(whiteSwatches(0, blossom)[0]?.[2]).toBeCloseTo(four * middle[2], 12);
    expect(whiteSwatches(0, blossom)[4]).toEqual([1, 1, 1]);
    // never, the palette's colour at every density
    for (const dot of whiteSwatches(3, blossom)) {
      const top = Math.max(...dot);
      dot.forEach((channel, i) => {
        expect(channel / top).toBeCloseTo((middle[i] ?? 0) / brightest, 12);
      });
    }
    // late is whiter than later at the densest dot
    const whiteness = (dot: readonly number[]): number =>
      Math.min(...dot) / Math.max(...dot);
    expect(whiteness(whiteSwatches(1, blossom)[4] ?? [])).toBeGreaterThan(
      whiteness(whiteSwatches(2, blossom)[4] ?? []),
    );
  });

  it("let the twins be born from a billionth of a radian apart to a tenth, by powers of ten, opening at the thousandth they had (decision 25), and then wider, round the pivot to a whole turn, in short radians (decision 63)", () => {
    expect(SPREAD.values).toEqual([
      1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 0.26, 0.79, 1.57,
      3.14, 6.28,
    ]);
    expect(SPREAD.initial).toBe(1e-3);
    expect(SPREAD.keys).toEqual({ down: ["3"], up: ["4"] });
    expect(SPREAD.icon).toBe("spread");
  });

  it("show the spread as how far apart the twins are born: the fan's width at the tip of the chain, a metre long, in units a visitor reads, and past ten centimetres the fan's angle round the pivot, in degrees (decision 63)", () => {
    expect(SPREAD.label).toBe("How far apart the twins are born");
    expect(SPREAD.values.map((value) => SPREAD.show(value))).toEqual([
      "1 nm",
      "10 nm",
      "100 nm",
      "1 µm",
      "10 µm",
      "0.1 mm",
      "1 mm",
      "1 cm",
      "10 cm",
      "15°",
      "45°",
      "90°",
      "180°",
      "360°",
    ]);
    expect(SPREAD.speak?.(1e-9)).toBe("1 nanometre apart at the tip");
    expect(SPREAD.speak?.(1e-4)).toBe(
      "a tenth of a millimetre apart at the tip",
    );
    expect(SPREAD.speak?.(1e-3)).toBe("1 millimetre apart at the tip");
    expect(SPREAD.speak?.(1e-1)).toBe("10 centimetres apart at the tip");
    expect(SPREAD.speak?.(0.26)).toBe("15 degrees round the pivot");
    expect(SPREAD.speak?.(6.28)).toBe("360 degrees round the pivot");
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
    expect(LIGHT).toEqual([
      TWIN_COUNT,
      SPREAD,
      FADE,
      HOLD,
      LOOK,
      TRAIL,
      LINES,
      STROBE,
      TWIN_LINES,
      TWIN_STROBE,
      PALETTE,
      WHITE,
    ]);
    expect(COLOURS).toEqual([SCALE, GROUND]);
    expect(PARAMETERS).toEqual([...CHAIN, ...LIGHT, ...COLOURS, DRAWN]);
  });

  it("draw the whole chain, as the piece opens, its rods alone, its masses alone, or none of it, coming round on Shift with the masses' own keys (decision 65)", () => {
    expect(DRAWN.id).toBe("chain");
    expect(DRAWN.label).toBe("What of the chain is drawn");
    expect(DRAWN.values).toEqual([0, 1, 2, 3]);
    expect(DRAWN.initial).toBe(0);
    expect(DRAWN.keys).toEqual({
      down: ["Shift+ArrowDown"],
      up: ["Shift+ArrowUp"],
    });
    expect(DRAWN.values.map((value) => DRAWN.show(value))).toEqual([
      "whole",
      "rods",
      "masses",
      "none",
    ]);
    expect(DRAWN.values.map((value) => DRAWN.speak?.(value))).toEqual([
      "the whole chain",
      "its rods alone",
      "its masses alone",
      "none of it",
    ]);
    expect(DRAWN.icon).toBe("eye");
    expect(stepValue(DRAWN, 0, -1)).toBe(3);
    expect(stepValue(DRAWN, 3, 1)).toBe(0);
    expect(DRAWN.values.map(rodsDrawn)).toEqual([true, true, false, false]);
    expect(DRAWN.values.map(massesDrawn)).toEqual([true, false, true, false]);
  });

  it("let the twins fade as chaos carries them off, as the piece opens (decision 58), stay (decision 43), be held near the chain or leashed to it (decision 64), round one key (decision 53)", () => {
    expect(FADE.label).toBe("Life of the twins");
    // 2 is the dust of addresses written before decision 53 (address.ts)
    expect(FADE.values).toEqual([0, 1, 3, 4]);
    expect([HELD_STEP, LEASHED_STEP]).toEqual([3, 4]);
    expect(FADE.initial).toBe(1);
    expect(FADE.keys).toEqual({ down: [], up: ["p", "P"] });
    expect(FADE.cyclic).toBe(true);
    expect(stepValue(FADE, 1, 1)).toBe(3);
    expect(stepValue(FADE, 3, 1)).toBe(4);
    expect(stepValue(FADE, 4, 1)).toBe(0);
    expect(stepValue(FADE, 0, 1)).toBe(1);
    expect(FADE.show(0)).toBe("stay");
    expect(FADE.show(1)).toBe("fade");
    expect(FADE.show(3)).toBe("held");
    expect(FADE.show(4)).toBe("leashed");
    expect(FADE.values.map((value) => FADE.speak?.(value))).toEqual([
      "stay",
      "fade",
      "held",
      "leashed",
    ]);
  });

  it("hold the twins as near the chain as a control says, from 5 to 40 cm on a chain a metre long, opening at 20, on Shift with the spread's keys: the lens's width while they are held, and each one's slack while they are leashed (decision 64)", () => {
    expect(HOLD.id).toBe("hold");
    expect(HOLD.label).toBe("How near the twins are held");
    expect(HOLD.values).toEqual([0.05, 0.1, 0.2, 0.3, 0.4]);
    expect(HOLD.initial).toBe(0.2);
    expect(HOLD.keys).toEqual({
      down: ["Shift+Digit3"],
      up: ["Shift+Digit4"],
    });
    expect(HOLD.values.map((value) => HOLD.show(value))).toEqual([
      "5 cm",
      "10 cm",
      "20 cm",
      "30 cm",
      "40 cm",
    ]);
    expect(HOLD.speak?.(0.3)).toBe("within 30 centimetres");
    expect(HOLD.icon).toBe("near");
  });

  it("leash the twins at 8 a second past their slack, and show the lens's number up to 20 cm, for twins born up to 10 cm apart (decision 64)", () => {
    expect(LEASH_RATE).toBe(8);
    expect(MEASURED_WIDEST).toBe(0.2);
    expect(HOLD.values).toContain(MEASURED_WIDEST);
    expect(NEAR_SPREAD).toBe(0.1);
    expect(SPREAD.values).toContain(NEAR_SPREAD);
  });

  it("show the time differences take to double in two figures, and say it whole (decision 64)", () => {
    expect(doublingShown(0.1)).toBe("0.10 s");
    expect(doublingShown(0.273)).toBe("0.27 s");
    expect(doublingShown(1.53)).toBe("1.5 s");
    expect(doublingShown(9.94)).toBe("9.9 s");
    expect(doublingShown(35.2)).toBe("35 s");
    expect(doublingShown(1234.5)).toBe("1235 s");
    expect(doublingSaid(0.1)).toBe(
      "Twins held: differences double every 0.10 s",
    );
  });

  it("draw the twins as chains, as they have until now and as the piece opens, or as dust, their tips alone (decision 50), on Shift with the twins' P, whether they stay or fade (decision 53)", () => {
    expect(LOOK.id).toBe("look");
    expect(LOOK.label).toBe("Look of the twins");
    expect(LOOK.values).toEqual([0, 1]);
    expect(LOOK.initial).toBe(0);
    expect(LOOK.keys).toEqual({ down: [], up: ["Shift+KeyP"] });
    expect(LOOK.cyclic).toBe(true);
    expect(stepValue(LOOK, 1, 1)).toBe(0);
    expect(LOOK.show(0)).toBe("chains");
    expect(LOOK.show(1)).toBe("dust");
    expect(LOOK.icon).toBe("dust");
  });

  it("show the tension's colours in the row as one control, off and then each scale, on the T that turns them on and the Y that steps the scale; the address keeps the switch and the scale (decision 53)", () => {
    expect(TENSION.id).toBe("tension");
    expect(PARAMETERS).not.toContain(TENSION);
    expect(TENSION.values).toEqual([-1, ...SCALE.values]);
    expect(TENSION.initial).toBe(-1);
    expect(TENSION.keys).toEqual({ down: [], up: [] });
    expect(TENSION.keysShown).toBe("T Y");
    expect(TENSION.cyclic).toBe(true);
    expect(TENSION.show(-1)).toBe("off");
    expect(TENSION.swatches?.(-1)).toEqual([]);
    for (const value of SCALE.values) {
      expect(TENSION.show(value)).toBe(SCALE.show(value));
      expect(TENSION.swatches?.(value)).toEqual(SCALE.swatches?.(value));
    }
    expect(TENSION.icon).toBe("balance");
  });

  it("show the music's mode and its strength in the music's group: the mode by its name, round from either end, and the strength as five dots, said in words; the address keeps both apart from the registry (decisions 46 and 76)", () => {
    expect(PARAMETERS).not.toContain(MUSIC_MODE);
    expect(PARAMETERS).not.toContain(MUSIC_STRENGTH);
    // the address's own words for them, "?music=none&strength=4"
    expect(MUSIC_MODE.id).toBe("music");
    expect(MUSIC_STRENGTH.id).toBe("strength");
    expect(MUSIC_MODE.values).toEqual(MODES.map((_, i) => i));
    expect(MUSIC_MODE.initial).toBe(0);
    expect(MUSIC_MODE.cyclic).toBe(true);
    expect(MUSIC_MODE.show(0)).toBe(MODES[0]?.name);
    expect(MUSIC_MODE.show(0)).toBe("light");
    expect(MUSIC_MODE.show(MODES.length - 1)).toBe("none");
    expect(stepValue(MUSIC_MODE, 0, -1)).toBe(MODES.length - 1);
    expect(stepValue(MUSIC_MODE, MODES.length - 1, 1)).toBe(0);
    expect(MUSIC_STRENGTH.values).toEqual([1, 2, 3, 4, 5]);
    expect(MUSIC_STRENGTH.initial).toBe(3);
    expect(MUSIC_STRENGTH.cyclic).toBeUndefined();
    expect(MUSIC_STRENGTH.show(3)).toBe("●●●○○");
    expect(MUSIC_STRENGTH.show(5)).toBe("●●●●●");
    expect(MUSIC_STRENGTH.speak?.(1)).toBe("1 of 5");
    expect(stepValue(MUSIC_STRENGTH, 5, 1)).toBe(5);
    expect(stepValue(MUSIC_STRENGTH, 1, -1)).toBe(1);
    // no keys yet: they wait for the modes that stay
    expect(MUSIC_MODE.keys).toEqual({ down: [], up: [] });
    expect(MUSIC_STRENGTH.keys).toEqual({ down: [], up: [] });
  });

  it("show the zoom in the screen's group as the address writes it, from the whole view, ×1, to sixty-four times nearer, its − and + being X and Z; the address keeps the camera apart from the registry (decisions 67 and 73)", () => {
    expect(ZOOM.id).toBe("zoom");
    expect(PARAMETERS).not.toContain(ZOOM);
    expect(ZOOM.values).toEqual([1, MOST_ZOOM]);
    expect(ZOOM.initial).toBe(1);
    expect(ZOOM.keys).toEqual({ down: [], up: [] });
    expect(ZOOM.keysShown).toBe("X Z");
    expect(ZOOM.icon).toBe("zoom");
    expect(ZOOM.show(1)).toBe("×1");
    // a step of Z, two, three, the wheel's and a pinch's, and the nearest
    for (const zoom of [1.25, 1.5625, 1.953125, 1.27, 11.641532, MOST_ZOOM]) {
      const written = new URLSearchParams(
        writeCamera("", { zoom, cx: 0, cy: 0 }),
      ).get("zoom");
      expect(ZOOM.show(zoom)).toBe(`×${String(written)}`);
    }
    expect(ZOOM.show(1.953125)).toBe("×1.95");
    expect(ZOOM.show(11.641532)).toBe("×11.64");
    expect(ZOOM.show(MOST_ZOOM)).toBe("×64");
    // a hair past the whole view is the whole view, as in the address
    expect(ZOOM.show(1.001)).toBe("×1");
    expect(writeCamera("", { zoom: 1.001, cx: 0, cy: 0 })).toBe("");
  });

  it("fade a twin to a third of its light three tenths of the chain's length from it, the session's reach, which the author settles by looking (decision 43)", () => {
    expect(FADE_REACH).toBe(0.3);
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
    expect(MODE.icon).toBe("start");
  });

  it("name the start, and show it in words a visitor reads: side, or the mode by its number", () => {
    expect(MODE.label).toBe("Start");
    expect(MODE.show(0)).toBe("side");
    expect(MODE.show(2)).toBe("mode 2");
    expect(MODE.speak?.(0)).toBe("raised to one side");
    expect(MODE.speak?.(1)).toBe("normal mode 1");
  });

  it("show the start as saved while a moment is saved, where the chain starts then, outside its steps", () => {
    expect(MODE.values).not.toContain(SAVED_START);
    expect(MODE.show(SAVED_START)).toBe("saved");
    expect(MODE.speak?.(SAVED_START)).toBe("the moment saved");
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
