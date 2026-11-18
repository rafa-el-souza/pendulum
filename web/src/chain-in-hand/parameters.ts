import { GROUNDS, groundAt } from "../core/grounds.ts";
import { FAN_PALETTES, fanPalette } from "../core/palettes.ts";
import type { Parameter } from "../core/parameters.ts";
import { TENSION_SCALES, tensionScaleAt } from "../core/tension.ts";
import { gravity, type Gravity } from "../physics/chain.ts";
import type { Shake } from "../physics/step.ts";

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
export const BODIES: ReadonlyMap<number, string> = new Map([
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

/**
 * What the start's control shows while a moment is saved, where the chain
 * starts again then: not one of its steps, which stay as they were for when
 * the moment is forgotten.
 */
export const SAVED_START = -1;

/**
 * Where the chain starts, and starts again (decision 33): raised to one side
 * and let go, as it has until now, or at rest in one of the lowest normal
 * modes of the paper's equal chain (PH-6, PH-7), the shapes in which the
 * chain swings without changing its form for as long as it swings small. A
 * chain with fewer masses than the mode asked for starts in its highest,
 * and the control shows that one, held back. While a moment is saved, the
 * chain starts there, and the control says so (`SAVED_START`).
 */
export const MODE: Parameter = {
  id: "mode",
  label: "Start",
  values: [0, 1, 2, 3, 4],
  initial: 0,
  keys: { down: ["n", "N"], up: ["m", "M"] },
  show: (value) =>
    value === SAVED_START
      ? "saved"
      : value === 0
        ? "side"
        : `mode ${String(value)}`,
  speak: (value) =>
    value === SAVED_START
      ? "the moment saved"
      : value === 0
        ? "raised to one side"
        : `normal mode ${String(value)}`,
  icon: "mode",
};

/**
 * How far a chain started in a mode swings (decision 33): the largest angle
 * of any rod from the way gravity points, in degrees. Small, the chain keeps
 * the mode's shape and its twins stay together; large, the shape breaks up
 * and the fan opens. With the chain raised to one side the amplitude has
 * nothing to do, and its control shows it held back.
 */
export const AMPLITUDE: Parameter = {
  id: "amplitude",
  label: "Amplitude of the mode",
  values: [2, 5, 10, 20, 30, 45, 60, 90, 120, 180],
  initial: 30,
  keys: { down: ["j", "J"], up: ["k", "K"] },
  show: (value) => `±${String(value)}°`,
  speak: (value) => `${String(value)} degrees either way at most`,
  icon: "amplitude",
};

/**
 * How far the shaken pivot goes either way of its place, in m (decision 36): a
 * millimetre. A chain stands on a shake only while the shake is small beside
 * each of its rods and fast, its speed a W above about 4.5 m/s: at a
 * millimetre, from one mass to twelve on the steps below, and from sixteen
 * the chain shakes itself apart, its fastest vibrations caught by the shake.
 */
export const SHAKE_AMPLITUDE = 0.001;

/**
 * The pivot shaken along gravity's line, in hertz, or still (decision 36): the
 * shake of Kapitza's pendulum, on which the chain stands on its head without
 * falling. Shaken, the chain starts again standing.
 */
export const SHAKE: Parameter = {
  id: "shake",
  label: "Shake of the pivot",
  values: [0, 800, 1200, 1600],
  initial: 0,
  keys: { down: ["c", "C"], up: ["v", "V"] },
  show: (value) => (value === 0 ? "—" : `${String(value)} Hz`),
  speak: (value) =>
    value === 0
      ? "still"
      : `${String(value)} times a second, a millimetre either way`,
  icon: "shake",
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
 * The shake the controls ask for, `hertz` times a second along the line of
 * gravity turned `degrees` from straight down, from `phase`; none while still.
 */
export function shakeOf(
  hertz: number,
  degrees: number,
  phase: number,
): Shake | null {
  if (hertz === 0) return null;
  const turn = radians(degrees);
  return {
    amplitude: SHAKE_AMPLITUDE,
    rate: 2 * Math.PI * hertz,
    x: -Math.sin(turn),
    y: Math.cos(turn),
    phase,
  };
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
 * How long the trails last (decisions 21, 22 and 53): the half-life of their
 * light in seconds of simulated time, from none to one that stays, written
 * 600. Before it, the step written 100 fades as the trails open, with a
 * half-life of 2.5 s, and leaves a mark: the brightest piece of trail drawn
 * at every point stays, under the trails that fade (decision 42). The
 * control shows the seconds, and the last two steps in words.
 */
export const MARK_STEP = 100;
const STAYS = 600;
const STEPS = [0, 0.5, 1, 2.5, 10, MARK_STEP, STAYS];

/** How a step of the trails fades: its half-life, without end for the one that stays, and whether it leaves a mark. */
export function trailFade(value: number): {
  halfLife: number;
  mark: boolean;
} {
  if (value === MARK_STEP) return { halfLife: 2.5, mark: true };
  if (value === STAYS) {
    return { halfLife: Number.POSITIVE_INFINITY, mark: false };
  }
  return { halfLife: value, mark: false };
}

export const TRAIL: Parameter = {
  id: "trail",
  label: "How long the trails last",
  values: STEPS,
  initial: 2.5,
  keys: { down: ["7"], up: ["8"] },
  show: (value) => {
    if (value === 0) return "off";
    if (value === MARK_STEP) return "mark";
    if (value === STAYS) return "stays";
    return `${String(value)} s`;
  },
  speak: (value) => {
    if (value === MARK_STEP) return "leaves a mark";
    return TRAIL.show(value);
  },
  icon: "comet",
};

/**
 * How the trails are drawn (decisions 50 and 53): as lines behind the
 * masses, as they have been and as the piece opens, or as a strobe's, the
 * whole chain stamped into the trails at even times, or on the kicks of the
 * music, and each twin's tip as a point on the same flash. The copies fade
 * as the trails' half-life says. The keys are the trails' own, with Shift.
 */
export const STYLE: Parameter = {
  id: "style",
  label: "Style of the trails",
  values: [0, 1],
  initial: 0,
  keys: { down: ["Shift+Digit7"], up: ["Shift+Digit8"] },
  show: (value) => (value === 1 ? "strobe" : "lines"),
  speak: (value) => (value === 1 ? "a strobe" : "lines"),
  icon: "strobe",
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
 * Whether the twins stay or fade (decisions 43 and 53). They stay, as they
 * have until now and as the piece opens: once the fan has opened they fill
 * the disc, a cloud that does not go. Or each fades as chaos carries it off
 * from the chain, its light falling with how far it looks from it and never
 * rising again, and once dark it is born again on the chain, at its place
 * in the fan, a few a frame, so that the twins come out of the chain as a
 * plume and come apart in the chaos. One key goes round the two.
 */
export const FADE: Parameter = {
  id: "fade",
  label: "Twins stay or fade",
  values: [0, 1],
  initial: 0,
  keys: { down: [], up: ["p", "P"] },
  cyclic: true,
  show: (value) => (value === 1 ? "fade" : "stay"),
  icon: "snuffed",
};

/**
 * How the twins are drawn (decisions 50 and 53): as chains, as they have been
 * and as the piece opens, or as dust, each twin its tip alone, a point of
 * light that leaves no trail, so that the fan is a cloud of sparks; twins
 * that fade fade as dust too, a plume of sparks. The key is the twins' P,
 * with Shift.
 */
export const LOOK: Parameter = {
  id: "look",
  label: "Look of the twins",
  values: [0, 1],
  initial: 0,
  keys: { down: [], up: ["Shift+KeyP"] },
  cyclic: true,
  show: (value) => (value === 1 ? "dust" : "chains"),
  icon: "dust",
};

/**
 * How far a twin that fades looks from its chain when its light is down to a
 * third, as a share of the chain's length (decision 43): three tenths. At
 * twice that it has all but gone, and is born again. The session's choice,
 * which the author settles by looking.
 */
export const FADE_REACH = 0.3;

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

/**
 * The scale of the tension's colours (decision 41): decision 35's first, then
 * the others, on one key beside the T that turns the colours on, coming round
 * from the last to the first. Stepping it turns the colours on. The control
 * paints five dots, from a push to sixteen weights, and a screen reader
 * hears the scale's name.
 */
export const SCALE: Parameter = {
  id: "scale",
  label: "Scale of the tension's colours",
  values: TENSION_SCALES.map((_, i) => i),
  initial: 0,
  keys: { down: [], up: ["y", "Y"] },
  cyclic: true,
  show: (value) => tensionScaleAt(value).name,
  swatches: (value) => tensionScaleAt(value).stops.map(([, color]) => color),
  icon: "scale",
};

/**
 * The tension's colours as the row shows them, one control (decision 53):
 * off, then each scale, coming round. It is not in the address, which keeps
 * the switch that turns them on (decision 35) and the scale apart: the T
 * turns them on and off and the Y steps the scale, as before, and the
 * control's − and + step through both.
 */
export const TENSION: Parameter = {
  id: "tension",
  label: "Colours of the tension",
  values: [-1, ...SCALE.values],
  initial: -1,
  keys: { down: [], up: [] },
  keysShown: "T Y",
  cyclic: true,
  show: (value) => (value < 0 ? "off" : SCALE.show(value)),
  swatches: (value) => (value < 0 ? [] : (SCALE.swatches?.(value) ?? [])),
  icon: "balance",
};

/**
 * The ground the piece is drawn on (decision 41), with the chain's colour,
 * the hand's and the row's that go with it: the ground the piece has had
 * first, then the others once round the colours, coming round from either
 * end. The control shows its name.
 */
export const GROUND: Parameter = {
  id: "ground",
  label: "Colour of the ground",
  values: GROUNDS.map((_, i) => i),
  initial: 0,
  keys: { down: ["u", "U"], up: ["i", "I"] },
  cyclic: true,
  show: (value) => groundAt(value).name,
  icon: "ground",
};

/** What moves the chain: its masses, its time, the hand, gravity, the shake, and where it starts. */
export const CHAIN: readonly Parameter[] = [
  MASSES,
  TIME,
  HAND,
  GRAVITY,
  TILT,
  SHAKE,
  MODE,
  AMPLITUDE,
];

/** The light: the twins, whether they fade and how they are drawn, their trails and the chain's, and their colours. */
export const LIGHT: readonly Parameter[] = [
  TWIN_COUNT,
  SPREAD,
  FADE,
  LOOK,
  TRAIL,
  STYLE,
  RIBBON,
  PALETTE,
];

/** The colours that are not the light's: the tension's scale and the ground (decision 41). */
export const COLOURS: readonly Parameter[] = [SCALE, GROUND];

/**
 * Every parameter, the chain's first. The row of controls shows the sets
 * apart (decision 31).
 */
export const PARAMETERS: readonly Parameter[] = [
  ...CHAIN,
  ...LIGHT,
  ...COLOURS,
];
