import { FAN_PALETTES, fanPalette } from "../core/palettes.ts";
import type { Parameter } from "../core/parameters.ts";
import { gravity, type Gravity } from "../physics/chain.ts";

// The first piece's parameters (docs/decisions.md, decision 10). Each feeds
// its control on screen, its keys and the shareable address.

/** How many masses the chain has, from one to a rope, on the sketch's ladder. */
export const MASSES: Parameter = {
  id: "n",
  label: "Number of masses",
  values: [
    1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512,
  ],
  initial: 2,
  keys: { down: ["ArrowDown", "-"], up: ["ArrowUp", "+", "="] },
  show: (value) => `n = ${String(value)}`,
  icon: "masses",
};

/**
 * How fast time runs, as a multiple of real time for a chain 1 m long
 * (decision 15). It starts a little slower than real time, at 0.8, which the
 * author chose by trying, with 0.9 one step up (decisions 17 and 19).
 */
export const TIME: Parameter = {
  id: "time",
  label: "Speed of time",
  values: [0.1, 0.25, 0.5, 0.8, 0.9, 1, 1.5, 2, 3, 4],
  initial: 0.8,
  keys: { down: ["ArrowLeft", "["], up: ["ArrowRight", "]"] },
  show: (value) => `×${String(value)}`,
  icon: "time",
};

/**
 * How firmly the hand holds the chain, from elastic to firm (decision 18):
 * each step is a spring rate in rad/s for the whole chain's mass and a
 * damping ratio for the mass held (createHand). At the elastic end the chain
 * hangs below the finger and bounces as on a rubber band, and a pull let go
 * at the right moment flings it; at the firm end, the hand before this
 * control, the held mass stays on the finger and a throw leaves at the
 * gesture's speed. The author tried these steps and kept them (decision
 * 19).
 */
const GRIPS: ReadonlyMap<number, number> = new Map([
  [4, 0.3],
  [7, 0.45],
  [12, 0.6],
  [20, 0.8],
  [40, 1],
]);

/** The damping ratio of the hand's step at `rate` rad/s. */
export function handDamping(rate: number): number {
  const ratio = GRIPS.get(rate);
  if (ratio === undefined) {
    throw new Error(`the hand has no step at ${String(rate)} rad/s`);
  }
  return ratio;
}

const RATES = [...GRIPS.keys()];

export const HAND: Parameter = {
  id: "hand",
  label: "Firmness of the hand",
  values: RATES,
  initial: 40,
  keys: { down: [",", "<"], up: [".", ">"] },
  // one pip per step, filled up to this one
  show: (value) => {
    const filled = RATES.indexOf(value) + 1;
    return "●".repeat(filled) + "○".repeat(RATES.length - filled);
  },
  speak: (value) =>
    `${String(RATES.indexOf(value) + 1)} of ${String(RATES.length)}`,
  icon: "hand",
};

/**
 * How strong gravity is, in m/s² (decision 29): from none to Jupiter's,
 * through the surface gravity of Pluto, the Moon, Mars and the Earth, where
 * the piece opens. Each step is two to three times the one before. A chain
 * let go from rest goes through the same motion under any of them, slower
 * by the square root of the ratio; what changes beyond the pace is how far a
 * throw carries it, and with none it keeps whatever spin it is given.
 */
const BODIES: ReadonlyMap<number, string> = new Map([
  [0.62, "Pluto"],
  [1.62, "the Moon"],
  [3.71, "Mars"],
  [9.81, "Earth"],
  [24.79, "Jupiter"],
]);

export const GRAVITY: Parameter = {
  id: "g",
  label: "Strength of gravity",
  values: [0, ...BODIES.keys()],
  initial: 9.81,
  keys: { down: ["q", "Q"], up: ["e", "E"] },
  show: (value) => `g = ${String(value)}`,
  speak: (value) => {
    const body = BODIES.get(value);
    if (body === undefined) return "none";
    return `${String(value)} metres per second squared, as on ${body}`;
  },
  icon: "gravity",
};

/**
 * Which way gravity points, in degrees from straight down, to the right
 * positive, as a rod's angle turns (decision 29): all the way round in steps
 * of 15°, coming round past straight up. The chain hangs the way it points,
 * and raised again it is raised against it. The control shows the degrees
 * beside an arrow turned the way gravity points, and a screen reader hears
 * the direction in words.
 */
const TURNS = Array.from({ length: 24 }, (_, i) => 15 * (i - 11));

export const TILT: Parameter = {
  id: "tilt",
  label: "Direction of gravity",
  values: TURNS,
  initial: 0,
  keys: { down: ["a", "A"], up: ["d", "D"] },
  show: (value) => `${value < 0 ? "−" : ""}${String(Math.abs(value))}°`,
  speak: (value) => {
    if (value === 0) return "straight down";
    if (value === 180) return "straight up";
    const side = value > 0 ? "right" : "left";
    return `${String(Math.abs(value))} degrees ${side} of straight down`;
  },
  icon: "arrow",
  // drawn pointing down, the arrow turns anticlockwise on screen to point right
  iconTurn: (value) => -value,
  cyclic: true,
};

/** A direction of the control, in degrees, as an angle that turns the way a rod's does, in radians. */
export function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** The gravity that the strength and the direction of the controls ask for. */
export function gravityOf(strength: number, degrees: number): Gravity {
  return gravity(strength, radians(degrees));
}

/**
 * How many twins are born when the chain is let go (decisions 20 and 22): the
 * sketch's choices, from none to 4 096. Their budget may carry fewer, and the
 * control then shows how many it carries.
 */
export const TWIN_COUNT: Parameter = {
  id: "twins",
  label: "Number of twins",
  values: [0, 64, 512, 4096],
  initial: 512,
  keys: { down: ["9"], up: ["0"] },
  show: (value) => String(value),
  icon: "fan",
};

/**
 * How long the trails last, as the half-life of their light in seconds of
 * simulated time (decisions 21 and 22): from none to one that stays, whose
 * half-life of ten minutes a visit does not see fade.
 */
const HALF_LIVES = [0, 0.5, 1, 2.5, 10, 600];

export const TRAIL: Parameter = {
  id: "trail",
  label: "Length of the trails",
  values: HALF_LIVES,
  initial: 2.5,
  keys: { down: ["7"], up: ["8"] },
  // one pip per length, none when the trails are off
  show: (value) => {
    const filled = HALF_LIVES.indexOf(value);
    return "●".repeat(filled) + "○".repeat(HALF_LIVES.length - 1 - filled);
  },
  speak: (value) => {
    if (value === 0) return "off";
    if (value === HALF_LIVES.at(-1)) return "stays";
    return `${String(value)} s`;
  },
  icon: "comet",
};

/**
 * How far apart the twins are born, in radians across the fan (decision 25):
 * from a billionth of a radian to a tenth, by powers of ten, opening at the
 * thousandth they were born apart before this control. However close they
 * are born, the fan opens: each power of ten closer only delays it, by a
 * second or so with two masses and less with more (decision 25).
 */
const SUPERSCRIPT: Readonly<Record<string, string>> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** The power of ten a spread is. */
function powerOfTen(value: number): number {
  return Math.round(Math.log10(value));
}

export const SPREAD: Parameter = {
  id: "spread",
  label: "Spread of the twins at birth",
  values: [1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1],
  initial: 1e-3,
  keys: { down: ["3"], up: ["4"] },
  show: (value) =>
    `10${String(powerOfTen(value)).replace(/[-0-9]/g, (c) => SUPERSCRIPT[c] ?? c)}`,
  speak: (value) => `10 to the minus ${String(-powerOfTen(value))} radians`,
  icon: "spread",
};

/**
 * Which masses of the chain leave trails (decision 26): the tip alone, as
 * until now, or every mass, so that the chain draws a ribbon. The twins'
 * trails stay at their tips. The control shows the chain's masses, lit where
 * they draw.
 */
export const RIBBON: Parameter = {
  id: "ribbon",
  label: "Trails from every mass",
  values: [0, 1],
  initial: 0,
  keys: { down: ["1"], up: ["2"] },
  show: (value) => (value === 1 ? "●●●" : "○○●"),
  speak: (value) => (value === 1 ? "every mass" : "the tip"),
  icon: "ribbon",
};

/**
 * The twins' colours, and their trails' (decision 23): one palette per step,
 * opening with the sketch's, which the author keeps. The control paints five
 * dots from one edge of the fan to the other in the palette's colours, and a
 * screen reader hears its name.
 */
const SWATCH_PLACES = [0, 0.25, 0.5, 0.75, 1];

export const PALETTE: Parameter = {
  id: "palette",
  label: "Colours of the twins",
  values: FAN_PALETTES.map((_, i) => i),
  initial: 0,
  keys: { down: ["5"], up: ["6"] },
  show: (value) => fanPalette(value).name,
  swatches: (value) => {
    const palette = fanPalette(value);
    return SWATCH_PLACES.map((place) => palette.color(place));
  },
  icon: "palette",
};

/** What moves the chain: its masses, its time, the hand and gravity. */
export const CHAIN: readonly Parameter[] = [MASSES, TIME, HAND, GRAVITY, TILT];

/** The light: the twins, their trails and the chain's, and their colours. */
export const LIGHT: readonly Parameter[] = [
  TWIN_COUNT,
  SPREAD,
  TRAIL,
  RIBBON,
  PALETTE,
];

/**
 * Every parameter, the chain's first. The row of controls shows the two sets
 * apart (decision 31).
 */
export const PARAMETERS: readonly Parameter[] = [...CHAIN, ...LIGHT];
