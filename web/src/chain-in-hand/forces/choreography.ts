import type { Point } from "../../physics/drive.ts";

// The dancing hand's choreography (docs/decisions.md, decisions 83 and 85):
// the layers the visitor composes the dance from, each a choice of its own.
// The figure the hand traces, and the place it traces it; what leads it on,
// the beat clock or a sound heard; how many beats, or sounds, it takes from
// one point of the figure to the next; the feel of its moves; what the
// figure's size and its middle follow in the music, and whether the grip
// pulses on the beat; the mass the hand holds, how firmly and how slack; and
// whether the hand is seen. The address carries it in its readable part, as
// it carries the music's mode.

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

/** What the figure's size follows: the loudness; nothing, the size of music as loud as it has been; the bass; the treble; or the kicks, swelling on each. */
export const SIZES = ["level", "fixed", "bass", "treble", "kick"] as const;
export type Size = (typeof SIZES)[number];

/** What the figure's middle follows: nothing; the bass's note, low to one side and high to the other; or the loudness, which lifts it. */
export const CENTERS = ["none", "bass", "level"] as const;
export type Center = (typeof CENTERS)[number];

/** What the grip follows: nothing, as firm throughout; or the beat, firm on each and loose between. */
export const PULSES = ["none", "beat"] as const;
export type Pulse = (typeof PULSES)[number];

/** The mass the hand holds: the tip; the one halfway down the chain; or the one a quarter of the way down, near the pivot. */
export const GRABS = ["tip", "middle", "top"] as const;
export type Grab = (typeof GRABS)[number];

/**
 * The grip's steps, from gentle to forced, in rad/s: the visitor's hand's
 * first three (decision 19), its firmest, and three times that. The
 * choreography carries the step, from 1.
 */
export const GRIPS = [4, 7, 12, 40, 120] as const;

/** The slack's steps: how much nearer the pivot than the held mass reaches the hand keeps its target, as a share of that reach. The choreography carries the step, from 0. */
export const SLACKS = [0, 0.1, 0.2, 0.3, 0.4] as const;

/** The dancing hand's choreography. */
export interface Choreography {
  readonly figure: Figure;
  readonly place: Place;
  readonly lead: Lead;
  readonly beats: Beats;
  readonly feel: Feel;
  readonly size: Size;
  readonly center: Center;
  readonly pulse: Pulse;
  readonly grab: Grab;
  /** The grip's step, from 1 to 5, and the slack's, from 0 to 4. */
  readonly grip: number;
  readonly slack: number;
  /** Whether the hand is drawn; hidden, the chain dances by itself. */
  readonly shown: boolean;
}

/**
 * The dance as it opens: decision 75's swing from side to side, a side on
 * each kick, crossing in a snap, as wide as the music is loud, held by the
 * tip with the visitor's hand's middle grip, taut; the hand hidden.
 */
export const DANCE_OPENS: Choreography = {
  figure: "swing",
  place: "below",
  lead: "kick",
  beats: 1,
  feel: "snap",
  size: "level",
  center: "none",
  pulse: "none",
  grab: "tip",
  grip: 3,
  slack: 0,
  shown: false,
};

/** The address's names for the layers, in the order it writes them. */
const KEYS = [
  "figure",
  "place",
  "lead",
  "beats",
  "feel",
  "size",
  "center",
  "pulse",
  "grab",
  "grip",
  "slack",
  "showhand",
] as const;

/** One of `values` that `text` names, or `fallback`. */
function oneOf<T extends string>(
  values: readonly T[],
  text: string | null,
  fallback: T,
): T {
  return values.find((value) => value === text) ?? fallback;
}

/** The step from `first` of `steps` that `text` names, or `fallback`. */
function stepOf(
  steps: readonly number[],
  first: number,
  text: string | null,
  fallback: number,
): number {
  const step = steps.findIndex((_, k) => String(k + first) === text);
  return step < 0 ? fallback : step + first;
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
    size: oneOf(SIZES, query.get("size"), DANCE_OPENS.size),
    center: oneOf(CENTERS, query.get("center"), DANCE_OPENS.center),
    pulse: oneOf(PULSES, query.get("pulse"), DANCE_OPENS.pulse),
    grab: oneOf(GRABS, query.get("grab"), DANCE_OPENS.grab),
    grip: stepOf(GRIPS, 1, query.get("grip"), DANCE_OPENS.grip),
    slack: stepOf(SLACKS, 0, query.get("slack"), DANCE_OPENS.slack),
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
  const { size, center, pulse, grab, grip, slack } = choreography;
  if (figure !== DANCE_OPENS.figure) query.set("figure", figure);
  if (place !== DANCE_OPENS.place) query.set("place", place);
  if (lead !== DANCE_OPENS.lead) query.set("lead", lead);
  if (beats !== DANCE_OPENS.beats) query.set("beats", String(beats));
  if (feel !== DANCE_OPENS.feel) query.set("feel", feel);
  if (size !== DANCE_OPENS.size) query.set("size", size);
  if (center !== DANCE_OPENS.center) query.set("center", center);
  if (pulse !== DANCE_OPENS.pulse) query.set("pulse", pulse);
  if (grab !== DANCE_OPENS.grab) query.set("grab", grab);
  if (grip !== DANCE_OPENS.grip) query.set("grip", String(grip));
  if (slack !== DANCE_OPENS.slack) query.set("slack", String(slack));
  if (shown !== DANCE_OPENS.shown) query.set("showhand", "1");
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

/** The mass the hand holds on a chain of `n`, counted from the top, from 0: the last, or the one at least halfway, or a quarter of the way, down. */
export function heldMass(grab: Grab, n: number): number {
  switch (grab) {
    case "tip":
      return n - 1;
    case "middle":
      return Math.ceil(n / 2) - 1;
    case "top":
      return Math.ceil(n / 4) - 1;
  }
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
