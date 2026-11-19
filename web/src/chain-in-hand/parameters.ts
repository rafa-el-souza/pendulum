import { GROUNDS, groundAt } from "../core/grounds.ts";
import type { Rgb } from "../core/color.ts";
import { FAN_PALETTES, fanPalette } from "../core/palettes.ts";
import type { Parameter } from "../core/parameters.ts";
import { TENSION_SCALES, tensionScaleAt } from "../core/tension.ts";
import { lightCurve } from "../core/trails.ts";
import { twinShine } from "../core/twins.ts";
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
  icon: "start",
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
  icon: "style",
};

/**
 * How far apart the twins are born, in radians across the fan (decision 25):
 * from a billionth of a radian to a tenth, by powers of ten, opening at the
 * thousandth they were born apart before this control. However close they
 * are born, the fan opens: each power of ten closer only delays it, by a
 * second or so with two masses and less with more (decision 25). The control
 * shows how close that is: the fan's width at the tip of the chain, a metre
 * long, held straight, as the twins are born, from a nanometre to ten
 * centimetres. Past that the fan opens round the pivot (decision 63), to 15°,
 * 45°, 90°, 180° and a whole turn, where the twins are no longer twins of one
 * motion; these steps are written in short radians, 0.26 to 6.28, so that an
 * address carries them as they are, and shown in degrees.
 */
export const SPREAD: Parameter = {
  id: "spread",
  label: "How far apart the twins are born",
  values: [
    1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 0.26, 0.79, 1.57,
    3.14, 6.28,
  ],
  initial: 1e-3,
  keys: { down: ["3"], up: ["4"] },
  show: (value) =>
    value < WIDEST_AT_TIP ? widthAtTip(value)[0] : `${degrees(value)}°`,
  speak: (value) =>
    value < WIDEST_AT_TIP
      ? `${widthAtTip(value)[1]} apart at the tip`
      : `${degrees(value)} degrees round the pivot`,
  icon: "spread",
};

/** The widest spread shown as a width at the tip; wider ones are shown in degrees. */
const WIDEST_AT_TIP = 0.2;

/** A spread in whole degrees. */
function degrees(spread: number): string {
  return String(Math.round((spread * 180) / Math.PI));
}

/** The fan's width at the tip of the chain, a metre long, for each power of ten of the spread from 10⁻⁹: as shown, and in words. */
const WIDTHS: readonly (readonly [string, string])[] = [
  ["1 nm", "1 nanometre"],
  ["10 nm", "10 nanometres"],
  ["100 nm", "100 nanometres"],
  ["1 µm", "1 micrometre"],
  ["10 µm", "10 micrometres"],
  ["0.1 mm", "a tenth of a millimetre"],
  ["1 mm", "1 millimetre"],
  ["1 cm", "1 centimetre"],
  ["10 cm", "10 centimetres"],
];

/** A spread's width at the tip, shown and in words. */
function widthAtTip(spread: number): readonly [string, string] {
  const width = WIDTHS[Math.round(Math.log10(spread)) + 9];
  if (width === undefined) {
    throw new Error(`no width for a spread of ${String(spread)}`);
  }
  return width;
}

/**
 * How the twins live (decisions 43, 53 and 64). They stay: once the fan has
 * opened they fill the disc, a cloud that does not go. Or, as the piece
 * opens (decision 58), each fades as chaos carries it off from the chain,
 * its light falling with how far it looks from it and never rising again,
 * and once dark it is born again on the chain, at its place in the fan, a
 * few a frame, so that the twins come out of the chain as a plume and come
 * apart in the chaos. Or they are held near the chain, all drawn in together
 * by one factor whenever the fan grows wider than the lens, so that they
 * stay a blade along the direction chaos stretches them in, and the control
 * shows how often differences double. Or each is leashed to the chain with
 * slack, a cloud that swells where the motion is most chaotic. One key goes
 * round the four. The step 2 is not one of them: addresses written before
 * decision 53 meant the twins as dust by it (address.ts).
 */
export const HELD_STEP = 3;
export const LEASHED_STEP = 4;

export const FADE: Parameter = {
  id: "fade",
  label: "Life of the twins",
  values: [0, 1, HELD_STEP, LEASHED_STEP],
  initial: 1,
  keys: { down: [], up: ["p", "P"] },
  cyclic: true,
  show: (value) =>
    value === LEASHED_STEP
      ? "leashed"
      : value === HELD_STEP
        ? "held"
        : value === 1
          ? "fade"
          : "stay",
  // said as shown, so that the lens's number can be said whole in its place
  speak: (value) => FADE.show(value),
  icon: "snuffed",
};

/**
 * How near the chain the twins are held (decision 64), in centimetres on a
 * chain a metre long, as the spread's width at the tip (decision 57): while
 * they are held, how wide the lens lets the fan grow, as the root mean
 * square of the twins' distances from the chain, or as wide as they were
 * born, if wider; while they are leashed, the slack each has before the
 * leash pulls. Shown faint while the twins stay or fade, where it has
 * nothing to do. On Shift with the spread's keys, another distance from the
 * chain.
 */
export const HOLD: Parameter = {
  id: "hold",
  label: "How near the twins are held",
  values: [0.05, 0.1, 0.2, 0.3, 0.4],
  initial: 0.2,
  keys: { down: ["Shift+Digit3"], up: ["Shift+Digit4"] },
  show: (value) => `${String(Math.round(value * 100))} cm`,
  speak: (value) => `within ${String(Math.round(value * 100))} centimetres`,
  icon: "near",
};

/**
 * The rate per second at which a leashed twin's distance past its slack
 * falls (decision 64): near the rate chaos parts the twins at, so that the
 * cloud swells and shrinks. Fixed, a placeholder set by the author's eye on
 * the prototype.
 */
export const LEASH_RATE = 8;

/**
 * The widest lens whose number is shown (decision 64): wider, the fan's
 * differences are no longer small, they stretch more slowly than small ones
 * do, and the number would read the time to double too long.
 */
export const MEASURED_WIDEST = 0.2;

/**
 * The widest spread the lens shows its number for, 10 cm at the tip
 * (decision 64): twins born farther apart are not differences of one motion,
 * and how they stretch says nothing of its chaos.
 */
export const NEAR_SPREAD = 0.1;

/** The seconds a difference takes to double, in two figures (decision 64). */
export function doublingShown(seconds: number): string {
  const figures = seconds < 10 ? seconds.toPrecision(2) : seconds.toFixed(0);
  return `${figures} s`;
}

/** The lens's number in words, for a screen reader and the control's title (decision 64). */
export function doublingSaid(seconds: number): string {
  return `Twins held: differences double every ${doublingShown(seconds)}`;
}

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
 * When dense light turns white (decision 61): where many twins, or many
 * trails, add their light in one place. At once, as the piece had until
 * now: each channel fills on its own and the densest light is white in any
 * palette. Or the light keeps its colour, at full where it is densest, and
 * white comes in late, later, as the piece opens, or never. The keys are the
 * palette's, with Shift. The control paints five dots of the palette's
 * middle colour, from 4 twins in a pixel to 1 024 (`whiteSwatches`), so that
 * it shows in the colours of the palette chosen; a screen reader hears the
 * words.
 */
const WHITE_WORDS = ["at once", "late", "later", "never"];

export const WHITE: Parameter = {
  id: "white",
  label: "When dense light turns white",
  values: [0, 1, 2, 3],
  initial: 2,
  keys: { down: ["Shift+Digit5"], up: ["Shift+Digit6"] },
  show: (value) => WHITE_WORDS[value] ?? "",
  speak: (value) =>
    value === 0
      ? "at once, each colour filling on its own"
      : value === 3
        ? "never: dense light keeps its colour"
        : (WHITE_WORDS[value] ?? ""),
  icon: "whiten",
};

/**
 * Over how much light white comes in at each step of `WHITE`, as the curve
 * takes it (lightCurve): none at once, where each channel fills on its own;
 * then 40 and 150, which are the session's placeholders for the author's
 * eye; and never.
 */
const WHITENS = [0, 40, 150, Number.POSITIVE_INFINITY];

export function whiteAfter(step: number): number {
  const white = WHITENS[step];
  if (white === undefined) throw new Error(`no step ${String(step)} of white`);
  return white;
}

/** How many twins share a pixel at each of the white's five dots. */
const SHARED = [4, 16, 64, 256, 1024];

/**
 * The white's five dots in the palette `palette`: its middle colour as 4, 16,
 * 64, 256 and 1 024 twins add it in one pixel, each as bright as one of the
 * 512 the piece opens with, shown at `step`. At once they are added as on the
 * canvas, each channel cut at full; otherwise through the curve.
 */
export function whiteSwatches(step: number, palette: number): Rgb[] {
  const middle = fanPalette(palette).color(0.5);
  const one = twinShine(TWIN_COUNT.initial);
  const white = whiteAfter(step);
  return SHARED.map((count) => {
    const sum: Rgb = [
      middle[0] * one * count,
      middle[1] * one * count,
      middle[2] * one * count,
    ];
    if (white === 0) {
      return [Math.min(1, sum[0]), Math.min(1, sum[1]), Math.min(1, sum[2])];
    }
    return lightCurve(sum, white);
  });
}

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

/**
 * What of the chain is drawn (decision 65): the whole of it, as the piece
 * opens, its rods alone, its masses alone, or none of it, while the twins,
 * the trails and the rest are drawn as before, from where the chain is. The
 * hand's spring and the pivot stay. Rods hidden are lit by the music: as
 * bright as its light on the kicks makes them, up to how bright they are
 * drawn, and gone in silence. The keys are the masses' own, with Shift, and
 * come round.
 */
export const DRAWN: Parameter = {
  id: "chain",
  label: "What of the chain is drawn",
  values: [0, 1, 2, 3],
  initial: 0,
  keys: { down: ["Shift+ArrowDown"], up: ["Shift+ArrowUp"] },
  cyclic: true,
  show: (value) => ["whole", "rods", "masses", "none"][value] ?? "whole",
  speak: (value) =>
    ["the whole chain", "its rods alone", "its masses alone", "none of it"][
      value
    ] ?? "the whole chain",
  icon: "eye",
};

/** Whether the chain's rods are drawn, for a value of what of it is drawn; hidden, the music still lights them (decision 65). */
export function rodsDrawn(value: number): boolean {
  return value === 0 || value === 1;
}

/** Whether the chain's masses are drawn, for a value of what of it is drawn (decision 65). */
export function massesDrawn(value: number): boolean {
  return value === 0 || value === 2;
}

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

/** The light: the twins, whether they fade and how they are drawn, their trails and the chain's, their colours, and when dense light turns white. */
export const LIGHT: readonly Parameter[] = [
  TWIN_COUNT,
  SPREAD,
  FADE,
  HOLD,
  LOOK,
  TRAIL,
  STYLE,
  RIBBON,
  PALETTE,
  WHITE,
];

/** The colours that are not the light's: the tension's scale and the ground (decision 41). */
export const COLOURS: readonly Parameter[] = [SCALE, GROUND];

/**
 * Every parameter, the chain's first, and what of the chain is drawn last.
 * The row of controls shows the sets apart (decision 31).
 */
export const PARAMETERS: readonly Parameter[] = [
  ...CHAIN,
  ...LIGHT,
  ...COLOURS,
  DRAWN,
];
