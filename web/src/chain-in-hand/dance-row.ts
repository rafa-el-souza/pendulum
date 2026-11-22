import type { Action } from "../core/controls.ts";
import type { Icon } from "../core/icons.ts";
import type { Parameter } from "../core/parameters.ts";
import {
  BEATS,
  CENTERS,
  FEELS,
  FIGURES,
  GRABS,
  GRIPS,
  LEADS,
  PLACES,
  PULSES,
  SIZES,
  SLACKS,
  TOSSES,
  VARIES,
  type Beats,
  type Choreography,
  type Figure,
  type Vary,
} from "./forces/choreography.ts";

// The dance's own row (docs/decisions.md, decision 89), which the dance's
// button opens in the music's group, stacked above the music's row: each layer
// of the choreography (decisions 83, 85 and 87) as a control, in the order of
// the layers, the path, the time, the expression, the body and the long time;
// and the hand, shown or hidden, as a switch. A control steps through the
// values its layer takes in the address, each shown by its name; none has
// keys yet.

const NO_KEYS = { down: [], up: [] } as const;

/** The words a list of names shows for each of its values, in its order. */
function named<T extends string>(
  values: readonly T[],
  words: Record<T, string>,
): (step: number) => string {
  return (step) => {
    const value = values[step];
    return value === undefined ? "" : words[value];
  };
}

/** Five dots, as many lit as the step from `first`, as the music's strength shows its steps. */
function dots(count: number, first: number): (step: number) => string {
  return (step) => {
    const lit = step - first + 1;
    return "●".repeat(lit) + "○".repeat(count - lit);
  };
}

/** A control whose values are the steps of a list, from 0, coming round from either end where `cyclic`. */
function listed(
  id: string,
  label: string,
  icon: Icon,
  count: number,
  initial: number,
  show: (step: number) => string,
  cyclic = false,
): Parameter {
  return {
    id,
    label,
    values: Array.from({ length: count }, (_, k) => k),
    initial,
    keys: NO_KEYS,
    show,
    icon,
    cyclic,
  };
}

/** The beats from one point to the next, the clock's "auto" after the numbers. */
const BEAT_STEPS: readonly Beats[] = [...BEATS, "auto"];
/** When the figure changes, by its loudness after the numbers of bars. */
const VARY_STEPS: readonly Vary[] = [...VARIES, "level"];

/** Every few bars, in words. */
function everyBars(bars: number): string {
  if (bars === 0) return "never";
  return bars === 1 ? "every bar" : `every ${String(bars)} bars`;
}

export const FIGURE: Parameter = listed(
  "figure",
  "Figure of the dance",
  "figure",
  FIGURES.length,
  0,
  named(FIGURES, {
    swing: "swing",
    circle: "circle",
    turn: "turn round",
    eight: "eight",
    upright: "upright eight",
    conduct: "conductor's four",
    bounce: "bounce",
    poses: "poses",
  }),
  true,
);

export const PLACE: Parameter = listed(
  "place",
  "Where the figure is traced",
  "place",
  PLACES.length,
  0,
  named(PLACES, { below: "below", side: "to a side", above: "above" }),
);

export const LEAD: Parameter = listed(
  "lead",
  "What leads the dance",
  "baton",
  LEADS.length,
  LEADS.indexOf("kick"),
  named(LEADS, {
    clock: "beat clock",
    kick: "kick",
    snare: "snare",
    hat: "hi-hat",
    onset: "any attack",
    hit: "drum hits",
    note: "notes",
    bass: "bass",
  }),
  true,
);

export const BEATS_PER_POINT: Parameter = listed(
  "beats",
  "Beats from point to point",
  "beats",
  BEAT_STEPS.length,
  BEAT_STEPS.indexOf(1),
  (step) => {
    const beats = BEAT_STEPS[step];
    return beats === 0.5 ? "½" : String(beats ?? "");
  },
);

export const FEEL: Parameter = listed(
  "feel",
  "Feel of the moves",
  "ease",
  FEELS.length,
  0,
  named(FEELS, { snap: "snap", smooth: "smooth", ictus: "ictus" }),
);

export const SIZE: Parameter = listed(
  "size",
  "What the figure's size follows",
  "width",
  SIZES.length,
  0,
  named(SIZES, {
    level: "loudness",
    fixed: "fixed",
    bass: "bass",
    treble: "treble",
    kick: "kicks",
  }),
);

export const CENTER: Parameter = listed(
  "center",
  "What the figure's middle follows",
  "aim",
  CENTERS.length,
  0,
  named(CENTERS, { none: "still", bass: "bass's note", level: "loudness" }),
);

export const PULSE: Parameter = listed(
  "pulse",
  "Whether the grip pulses",
  "pulse",
  PULSES.length,
  0,
  named(PULSES, { none: "steady", beat: "on the beat" }),
);

export const GRAB: Parameter = listed(
  "grab",
  "Where the hand holds the chain",
  "tweezers",
  GRABS.length,
  0,
  named(GRABS, { tip: "tip", middle: "middle", top: "near the pivot" }),
);

export const GRIP: Parameter = {
  id: "grip",
  label: "Grip of the dancing hand",
  values: GRIPS.map((_, k) => k + 1),
  initial: 3,
  keys: NO_KEYS,
  show: dots(GRIPS.length, 1),
  speak: (step) => `${String(step)} of ${String(GRIPS.length)}`,
  icon: "magnet",
};

export const SLACK: Parameter = {
  id: "slack",
  label: "Slack of the chain",
  values: SLACKS.map((_, k) => k),
  initial: 0,
  keys: NO_KEYS,
  show: (step) => {
    const share = SLACKS[step] ?? 0;
    return share === 0 ? "taut" : `${String(Math.round(share * 100))}% slack`;
  },
  icon: "slack",
};

export const TOSS: Parameter = {
  id: "toss",
  label: "When the hand lets go and catches",
  values: [...TOSSES],
  initial: 0,
  keys: NO_KEYS,
  show: everyBars,
  icon: "juggle",
};

export const VARY: Parameter = listed(
  "vary",
  "When the figure changes",
  "next",
  VARY_STEPS.length,
  0,
  (step) => {
    const vary = VARY_STEPS[step];
    return vary === "level" ? "by loudness" : everyBars(vary ?? 0);
  },
);

/** The hand's switch: the dancing hand shown, or hidden, as the dance opens (decision 83). */
export function handSwitch(shown: boolean): Action {
  return {
    id: "showhand",
    label: handLabel(shown),
    icon: handIcon(shown),
    keys: [],
    keysShown: "",
    pressed: shown,
  };
}

/** What the hand's switch says, shown or hidden. */
export function handLabel(shown: boolean): string {
  return shown ? "Hide the dancing hand" : "Show the dancing hand";
}

/** The hand's switch's icon: filled while shown, outlined while hidden. */
export function handIcon(shown: boolean): Icon {
  return shown ? "palmed" : "palm";
}

/** The dance's controls, in the row's order, the hand's switch between the body's and the long time's. */
export const DANCE_PARAMETERS: readonly Parameter[] = [
  FIGURE,
  PLACE,
  LEAD,
  BEATS_PER_POINT,
  FEEL,
  SIZE,
  CENTER,
  PULSE,
  GRAB,
  GRIP,
  SLACK,
  TOSS,
  VARY,
];

/** Where `value` stands in `values`, or 0. */
function stepIn<T>(values: readonly T[], value: T): number {
  return Math.max(0, values.indexOf(value));
}

/** The value a dance's control shows for `choreography`. */
export function layerValue(
  parameter: Parameter,
  choreography: Choreography,
): number {
  const c = choreography;
  switch (parameter) {
    case FIGURE:
      return stepIn(FIGURES, c.figure);
    case PLACE:
      return stepIn(PLACES, c.place);
    case LEAD:
      return stepIn(LEADS, c.lead);
    case BEATS_PER_POINT:
      return stepIn(BEAT_STEPS, c.beats);
    case FEEL:
      return stepIn(FEELS, c.feel);
    case SIZE:
      return stepIn(SIZES, c.size);
    case CENTER:
      return stepIn(CENTERS, c.center);
    case PULSE:
      return stepIn(PULSES, c.pulse);
    case GRAB:
      return stepIn(GRABS, c.grab);
    case GRIP:
      return c.grip;
    case SLACK:
      return c.slack;
    case TOSS:
      return c.toss;
    case VARY:
      return stepIn(VARY_STEPS, c.vary);
    default:
      throw new Error(`${parameter.id} is not a control of the dance`);
  }
}

/** `choreography` with the layer of a dance's control at `value`; a figure stepped takes the first place of a list of figures, keeping the rest. */
export function withLayer(
  choreography: Choreography,
  parameter: Parameter,
  value: number,
): Choreography {
  const c = choreography;
  const at = <T>(values: readonly T[], fallback: T): T =>
    values[value] ?? fallback;
  switch (parameter) {
    case FIGURE:
      return { ...c, figure: at<Figure>(FIGURES, c.figure) };
    case PLACE:
      return { ...c, place: at(PLACES, c.place) };
    case LEAD:
      return { ...c, lead: at(LEADS, c.lead) };
    case BEATS_PER_POINT:
      return { ...c, beats: at(BEAT_STEPS, c.beats) };
    case FEEL:
      return { ...c, feel: at(FEELS, c.feel) };
    case SIZE:
      return { ...c, size: at(SIZES, c.size) };
    case CENTER:
      return { ...c, center: at(CENTERS, c.center) };
    case PULSE:
      return { ...c, pulse: at(PULSES, c.pulse) };
    case GRAB:
      return { ...c, grab: at(GRABS, c.grab) };
    case GRIP:
      return { ...c, grip: value };
    case SLACK:
      return { ...c, slack: value };
    case TOSS:
      return { ...c, toss: TOSSES.find((t) => t === value) ?? c.toss };
    case VARY:
      return { ...c, vary: at(VARY_STEPS, c.vary) };
    default:
      throw new Error(`${parameter.id} is not a control of the dance`);
  }
}
