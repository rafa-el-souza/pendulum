// Palettes for a fan of twins (docs/decisions.md, decision 23): each gives a
// colour to every place across the fan, from 0 at one edge to 1 at the other
// (twins.ts, fanPlace). The first is the sketch's ramp, which the author
// keeps. The others are candidates for the author to try: which stay, and
// how they look, are decided by looking.

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
];

/** The palette at `index` in FAN_PALETTES; any other index throws. */
export function fanPalette(index: number): Palette {
  const palette = Number.isInteger(index) ? FAN_PALETTES[index] : undefined;
  if (palette === undefined) {
    throw new Error(`there is no palette ${String(index)}`);
  }
  return palette;
}
