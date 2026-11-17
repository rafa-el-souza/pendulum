// Palettes for a fan of twins (docs/decisions.md, decision 23): each gives a
// colour to every place across the fan, from 0 at one edge to 1 at the other
// (twins.ts, fanPlace). The first is the sketch's ramp, which the author
// keeps. The others are candidates for the author to try: which stay, and
// how they look, are decided by looking. A palette's place in the list is
// what an address names, so new ones go at the end (decision 41).

import { parseColor, type Rgb } from "./color.ts";

export interface Palette {
  /** What a screen reader says for it. */
  readonly name: string;
  /** The colour at a place across the fan, from 0 to 1. */
  readonly color: (place: number) => Rgb;
}

/**
 * A palette through colours written as #rrggbb, spaced evenly from 0 to 1 and
 * mixed in a straight line between neighbours. A place outside 0 to 1 takes
 * the colour at the nearer end.
 */
export function throughColors(...written: string[]): (place: number) => Rgb {
  const stops = written.map(parseColor);
  if (stops.length < 2) throw new Error("a palette needs two colours or more");
  const last = stops.length - 1;
  return (place) => {
    const at = Math.min(1, Math.max(0, place)) * last;
    const i = Math.min(last - 1, Math.floor(at));
    const share = at - i;
    const a = stops[i] ?? [0, 0, 0];
    const b = stops[i + 1] ?? a;
    return [
      a[0] + share * (b[0] - a[0]),
      a[1] + share * (b[1] - a[1]),
      a[2] + share * (b[2] - a[2]),
    ];
  };
}

/** The sketch's ramp: blue at 0, through violet, magenta and coral, to amber at 1. */
function dusk(place: number): Rgb {
  const t = 0.36 - 0.46 * place;
  return [
    0.5 + 0.5 * Math.cos(2 * Math.PI * t),
    0.5 + 0.5 * Math.cos(2 * Math.PI * (t + 0.33)),
    0.5 + 0.5 * Math.cos(2 * Math.PI * (t + 0.67)),
  ];
}

export const FAN_PALETTES: readonly Palette[] = [
  { name: "dusk", color: dusk },
  // deep red through orange to a golden yellow
  {
    name: "fire",
    color: throughColors("#a8100a", "#e8340c", "#ff7414", "#ffac1f", "#ffd84a"),
  },
  // aqua through sky blue to violet
  {
    name: "ice",
    color: throughColors("#3ff5c8", "#38d6f0", "#4a9cff", "#6d6bff", "#a65cff"),
  },
  // the rainbow, red to violet
  {
    name: "spectrum",
    color: throughColors(
      "#ff3030",
      "#ff9418",
      "#ffe92e",
      "#48e04a",
      "#2ad4e8",
      "#3a6cff",
      "#a447ff",
    ),
  },
  // no colour, only light: dim grey to white
  { name: "silver", color: throughColors("#4a4a4a", "#ffffff") },
  // decision 41: rose through pink and salmon to peach
  {
    name: "blossom",
    color: throughColors("#ff2d6f", "#ff4f8f", "#ff77a8", "#ff9aa0", "#ffb98f"),
  },
  // bronze through gold to a pale gold
  {
    name: "gold",
    color: throughColors("#b0662a", "#d9902f", "#f2b84a", "#ffd677", "#fff0b5"),
  },
  // deep green through lime to a yellow
  {
    name: "meadow",
    color: throughColors("#22a05c", "#45c56a", "#93dc4c", "#d9e64a", "#ffd24a"),
  },
  // magenta through violet and blue to cyan
  {
    name: "neon",
    color: throughColors("#ff2bd6", "#b04dff", "#5d6bff", "#2dc6ff", "#2bffe0"),
  },
  // two colours facing each other across the fan: teal, a pale middle, coral
  {
    name: "reef",
    color: throughColors("#19d3c5", "#86e3d8", "#f2ede4", "#ffb078", "#ff6a3d"),
  },
];

/**
 * The colour of a note, by its name from 0 for C to 11 for B (decision 49):
 * the notes go round the wheel of hues by fifths, C, G, D, A and on, so that
 * notes a fifth apart are neighbours and those of one key lie together. Each
 * is bright, at seven tenths of full saturation.
 */
export function noteColor(name: number): Rgb {
  const fifths = (((7 * Math.round(name)) % 12) + 12) % 12;
  const hue = (fifths / 12) * 6;
  const saturation = 0.7;
  const channel = (n: number): number => {
    const k = (n + hue) % 6;
    return 1 - saturation * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [channel(5), channel(3), channel(1)];
}

/** The palette at `index` in FAN_PALETTES; any other index throws. */
export function fanPalette(index: number): Palette {
  const palette = Number.isInteger(index) ? FAN_PALETTES[index] : undefined;
  if (palette === undefined) {
    throw new Error(`there is no palette ${String(index)}`);
  }
  return palette;
}
