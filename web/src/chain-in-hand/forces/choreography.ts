import type { Point } from "../../physics/drive.ts";

// The dancing hand's choreography (docs/decisions.md, decision 83): the
// layers the visitor composes the dance from, each a choice of its own. The
// figure the hand traces, and the place it traces it; what leads it on, the
// beat clock or a sound heard; how many beats, or sounds, it takes from one
// point of the figure to the next; the feel of its moves; and whether the
// hand is seen. The address carries it in its readable part, as it carries
// the music's mode.

/** The figures the hand can trace. */
export const FIGURES = [
  "swing",
  "circle",
  "turn",
  "eight",
  "upright",
  "conduct",
  "bounce",
  "poses",
] as const;
export type Figure = (typeof FIGURES)[number];

/** Where the figure is traced: the chain hanging, held level to a side, or standing. */
export const PLACES = ["below", "side", "above"] as const;
export type Place = (typeof PLACES)[number];

/** What leads the hand from one point to the next: the beat clock, or a sound heard. */
export const LEADS = [
  "clock",
  "kick",
  "snare",
  "hat",
  "onset",
  "hit",
  "note",
  "bass",
] as const;
export type Lead = (typeof LEADS)[number];

/**
 * How many beats, or sounds, the hand takes from one point of its figure to
 * the next; "auto", led by the clock, the number for which a turn of the
 * figure lasts about as long as the chain's own slowest swing.
 */
export const BEATS = [0.5, 1, 2, 4, 8] as const;
export type Beats = (typeof BEATS)[number] | "auto";

/** How the hand goes from one point to the next: in a snap, then still; smoothly; or as a conductor's beat, quick through each point and slow between. */
export const FEELS = ["snap", "smooth", "ictus"] as const;
export type Feel = (typeof FEELS)[number];

/** The dancing hand's choreography. */
export interface Choreography {
  readonly figure: Figure;
  readonly place: Place;
  readonly lead: Lead;
  readonly beats: Beats;
  readonly feel: Feel;
  /** Whether the hand is drawn; hidden, the chain dances by itself. */
  readonly shown: boolean;
}

/** The dance as it opens: decision 75's swing from side to side, a side on each kick, crossing in a snap; the hand hidden. */
export const DANCE_OPENS: Choreography = {
  figure: "swing",
  place: "below",
  lead: "kick",
  beats: 1,
  feel: "snap",
  shown: false,
};

/** The address's names for the layers, in the order it writes them. */
const KEYS = ["figure", "place", "lead", "beats", "feel", "showhand"] as const;

/** One of `values` that `text` names, or `fallback`. */
function oneOf<T extends string>(
  values: readonly T[],
  text: string | null,
  fallback: T,
): T {
  return values.find((value) => value === text) ?? fallback;
}

/** The choreography an address carries, each layer it does not carry, or does not know, as the dance opens. */
export function readChoreography(search: string): Choreography {
  const query = new URLSearchParams(search);
  const beats = query.get("beats");
  return {
    figure: oneOf(FIGURES, query.get("figure"), DANCE_OPENS.figure),
    place: oneOf(PLACES, query.get("place"), DANCE_OPENS.place),
    lead: oneOf(LEADS, query.get("lead"), DANCE_OPENS.lead),
    beats:
      beats === "auto"
        ? "auto"
        : (BEATS.find((value) => String(value) === beats) ?? DANCE_OPENS.beats),
    feel: oneOf(FEELS, query.get("feel"), DANCE_OPENS.feel),
    shown: query.get("showhand") === "1",
  };
}

/** The search part of an address carrying the layers that differ from how the dance opens, after whatever else `search` carried. */
export function writeChoreography(
  search: string,
  choreography: Choreography,
): string {
  const query = new URLSearchParams(search);
  for (const key of KEYS) query.delete(key);
  const { figure, place, lead, beats, feel, shown } = choreography;
  if (figure !== DANCE_OPENS.figure) query.set("figure", figure);
  if (place !== DANCE_OPENS.place) query.set("place", place);
  if (lead !== DANCE_OPENS.lead) query.set("lead", lead);
  if (beats !== DANCE_OPENS.beats) query.set("beats", String(beats));
  if (feel !== DANCE_OPENS.feel) query.set("feel", feel);
  if (shown !== DANCE_OPENS.shown) query.set("showhand", "1");
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

// Each figure is drawn in a plane of its own: x across, from −1 to 1, which
// the swing's angle scales, and y inward, from 0 at the full reach towards
// the pivot, 1 at the most. The turn alone goes round the pivot: its x is
// the share of a turn.

/** The conductor's beats in a bar of four: down, in, out and up. */
const CONDUCT: readonly Point[] = [
  { x: 0, y: 0 },
  { x: -0.7, y: 0.35 },
  { x: 1, y: 0.3 },
  { x: 0.1, y: 1 },
];
/** Below, high on either side, and up. */
const POSES: readonly Point[] = [
  { x: 0, y: 0 },
  { x: -1, y: 0.6 },
  { x: 1, y: 0.6 },
  { x: 0, y: 1 },
];

const POINTS: Record<Figure, readonly Point[]> = {
  swing: [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
  ],
  circle: [
    { x: 0, y: 0 },
    { x: 1, y: 0.5 },
    { x: 0, y: 1 },
    { x: -1, y: 0.5 },
  ],
  turn: [
    { x: 0, y: 0 },
    { x: 0.25, y: 0 },
    { x: 0.5, y: 0 },
    { x: 0.75, y: 0 },
  ],
  eight: [
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
    { x: 0, y: 0.5 },
    { x: -1, y: 0.5 },
  ],
  upright: [
    { x: 0, y: 0 },
    { x: 0, y: 0.5 },
    { x: 0, y: 1 },
    { x: 0, y: 0.5 },
  ],
  conduct: CONDUCT,
  bounce: [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
  ],
  poses: POSES,
};

/** A figure's points, in order, a share of a turn apart, the first as the turn begins. */
export function pointsOf(figure: Figure): readonly Point[] {
  return POINTS[figure];
}

/** The whole turns in `u`, taken away. */
function within(u: number): number {
  return u - Math.floor(u);
}

/**
 * Along a closed curve through `points`, a share `u` of the way round,
 * passing each at k / their number (Catmull-Rom), kept within the figure's
 * plane where it would swing out past a point at its edge.
 */
function curveThrough(points: readonly Point[], u: number): Point {
  const n = points.length;
  const at = within(u) * n;
  const k = Math.floor(at);
  const t = at - k;
  const p = (i: number) => points[(((k + i) % n) + n) % n] ?? { x: 0, y: 0 };
  const [a, b, c, d] = [p(-1), p(0), p(1), p(2)];
  const along = (p0: number, p1: number, p2: number, p3: number) =>
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  return {
    x: Math.min(1, Math.max(-1, along(a.x, b.x, c.x, d.x))),
    y: Math.min(1, Math.max(0, along(a.y, b.y, c.y, d.y))),
  };
}

/** Along the straight lines between `points`, closed, a share `u` of the way round. */
function linesThrough(points: readonly Point[], u: number): Point {
  const n = points.length;
  const at = within(u) * n;
  const k = Math.floor(at);
  const t = at - k;
  const a = points[k % n] ?? { x: 0, y: 0 };
  const b = points[(k + 1) % n] ?? { x: 0, y: 0 };
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Where on its figure the hand is a share `u` of a turn on, in the figure's plane. */
export function alongFigure(figure: Figure, u: number): Point {
  const turn = 2 * Math.PI * u;
  switch (figure) {
    case "swing":
      return { x: Math.cos(turn), y: 0 };
    case "circle":
      return { x: Math.sin(turn), y: (1 - Math.cos(turn)) / 2 };
    case "turn":
      return { x: u, y: 0 };
    case "eight":
      return { x: Math.sin(turn), y: 0.5 + 0.5 * Math.sin(2 * turn) };
    case "upright":
      return { x: 0.5 * Math.sin(2 * turn), y: (1 - Math.cos(turn)) / 2 };
    case "conduct":
      return curveThrough(CONDUCT, u);
    case "bounce":
      return { x: 0, y: (1 - Math.cos(turn)) / 2 };
    case "poses":
      return linesThrough(POSES, u);
  }
}
