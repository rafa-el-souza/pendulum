// The grounds a piece is drawn on (docs/decisions.md, decision 41). The pieces
// add light to the canvas, so every ground is dark. Each brings the colours
// that must stand out from it: the chain, the hand, the pivot, and the words
// and icons of the row. The first is the ground the piece has had, which the
// page's tokens (src/styles/tokens.css) hold for its first paint; the others
// are candidates, and which stay, and how they look, are decided by looking.

import { parseColor, type Rgb } from "./color.ts";

export interface Ground {
  /** What a screen reader, the title and the row call it. */
  readonly name: string;
  /** The ground itself, under the canvas and the page. */
  readonly ground: Rgb;
  /** The chain, its trail, and the light of a QR code. */
  readonly chain: Rgb;
  /** The hand's spring, and a value the budget holds back in the row. */
  readonly hand: Rgb;
  /** The pivot. */
  readonly pivot: Rgb;
  /** The row's words and icons. */
  readonly ink: Rgb;
  /** The row's quieter words. */
  readonly inkMuted: Rgb;
}

/** Two colours mixed in a straight line, `share` of the way from `a` to `b`. */
export function mixColors(a: Rgb, b: Rgb, share: number): Rgb {
  return [
    a[0] + share * (b[0] - a[0]),
    a[1] + share * (b[1] - a[1]),
    a[2] + share * (b[2] - a[2]),
  ];
}

const HAND = "#66bfff";
const PIVOT = "#999999";

/**
 * A ground and its chain, written as #rrggbb. The row's words are the chain's
 * colour a little sunk into the ground, and its quieter words more; the hand
 * and the pivot are the first ground's.
 */
function ground(name: string, groundColor: string, chain: string): Ground {
  const g = parseColor(groundColor);
  const c = parseColor(chain);
  return {
    name,
    ground: g,
    chain: c,
    hand: parseColor(HAND),
    pivot: parseColor(PIVOT),
    ink: mixColors(g, c, 0.9),
    inkMuted: mixColors(g, c, 0.62),
  };
}

export const GROUNDS: readonly Ground[] = [
  // the ground the piece has had, with the row's neutral words
  {
    ...ground("night", "#07080b", "#fff0d1"),
    ink: parseColor("#e9e7e3"),
    inkMuted: parseColor("#a3a09a"),
  },
  // the rest go once round the colours, from the coolest
  ground("slate", "#161a21", "#eef3ff"),
  ground("navy", "#0b1631", "#fff2d9"),
  ground("indigo", "#15113a", "#f4eeff"),
  ground("plum", "#220c28", "#ffe9f0"),
  ground("wine", "#2a0912", "#ffe5dc"),
  ground("rust", "#2b1109", "#ffefdf"),
  ground("espresso", "#1e140d", "#ffe8c8"),
  ground("olive", "#191b0b", "#fbf6d7"),
  ground("forest", "#0a2015", "#f3f8de"),
  ground("teal", "#05222a", "#e2fff6"),
];

/** The ground at `index` in GROUNDS; any other index throws. */
export function groundAt(index: number): Ground {
  const found = Number.isInteger(index) ? GROUNDS[index] : undefined;
  if (found === undefined) {
    throw new Error(`there is no ground ${String(index)}`);
  }
  return found;
}
