// Icons for the controls, drawn as SVG rather than typed as characters, so that
// every device has them: some engines lack a font with the symbols they would
// need.

/** The icons a control can show. */
export type Icon =
  | "pause"
  | "play"
  | "restart"
  | "fan"
  | "comet"
  | "style"
  | "dust"
  | "spread"
  | "ribbon"
  | "light"
  | "dark"
  | "reverse"
  | "reversed"
  | "arrow"
  | "controls"
  | "masses"
  | "time"
  | "hand"
  | "gravity"
  | "palette"
  | "scale"
  | "ground"
  | "snuffed"
  | "start"
  | "amplitude"
  | "save"
  | "saved"
  | "balance"
  | "weighing"
  | "shake"
  | "share"
  | "copied"
  | "qr"
  | "music"
  | "left"
  | "right"
  | "clock"
  | "butterfly"
  | "monitor"
  | "sketch"
  | "sketched"
  | "whiten"
  | "near";

const SVG = "http://www.w3.org/2000/svg";

/** The part of an icon that swings about a pivot on the grid: filled shapes and strokes, drawn last, in a group of their own that turns there. */
interface Swinging {
  readonly fill: string;
  readonly stroke: string;
  readonly pivot: readonly [number, number];
}

/**
 * Each icon as SVG path data on a 24 by 24 grid: strokes drawn faint, behind
 * the rest, for a position the drawing only recalls; filled shapes; strokes;
 * and a part that swings, if any.
 */
const ICONS: Record<
  Icon,
  { fill: string; stroke: string; faint?: string; swings?: Swinging }
> = {
  pause: { fill: "M6 5h4v14H6zM14 5h4v14h-4z", stroke: "" },
  play: { fill: "M8 5l11 7-11 7z", stroke: "" },
  // a bar and a triangle pointing back to it, as on a player that goes back
  // to the start
  restart: { fill: "M19 6v12l-9.5-6z", stroke: "M6 5.5v13" },
  // three chains fanning out from one pivot
  fan: {
    fill: "M10.5 4a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0",
    stroke: "M12 4L5 20M12 4L12 21M12 4L19 20",
  },
  // a head of light and the trail behind it
  comet: {
    fill: "M14 8a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
    stroke: "M14.5 10.5L4 21M12.5 8.5L6 13.5M16.5 12L12 19",
  },
  // a line that goes on as dots: the trails' style, lines or a strobe's
  style: {
    fill: "M11.3 10.6a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0M14.7 8.9a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0M18.3 7.8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0",
    stroke: "M3.5 20.5C5.5 16.5 7 14 9.5 12.3",
  },
  // a cloud of points of light: the twins' look, chains or dust
  dust: {
    fill: "M10.5 4.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M5.7 8.5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0M15.1 8a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0M9 12.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M14.3 14a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M4.3 15a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0M18.2 15a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0M7.6 19a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0M12.4 19.5a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0M17 20a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M3.5 20.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    stroke: "",
  },
  // two chains from one pivot, a narrow angle apart, each with its mass
  spread: {
    fill: "M10.5 4a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M7.2 20a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0M13.2 20a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0",
    stroke: "M12 4L9 20M12 4L15 20",
  },
  // a ribbon, two waves side by side
  ribbon: {
    fill: "",
    stroke: "M3 9c3-4 6-4 9 0s6 4 9 0M3 15c3-4 6-4 9 0s6 4 9 0",
  },
  // a light bulb, lit: the twins' and the trails' light, filled while it is
  // on and outlined while it is out
  light: {
    fill: "M12 2.5a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.6c0-.8.4-1.5 1-2A6 6 0 0 0 12 2.5z",
    stroke: "M9.5 19h5M10.5 21.5h3",
  },
  dark: {
    fill: "",
    stroke:
      "M12 2.5a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.6c0-.8.4-1.5 1-2A6 6 0 0 0 12 2.5zM9.5 19h5M10.5 21.5h3",
  },
  // a triangle pointing back, as on a player that plays backwards: outlined
  // while time runs forwards, and filled while it runs backwards
  reverse: { fill: "", stroke: "M16 5.5L5.5 12l10.5 6.5z" },
  reversed: {
    fill: "M16 5.5L5.5 12l10.5 6.5z",
    stroke: "M16 5.5L5.5 12l10.5 6.5z",
  },
  // an arrow pointing straight down, which a direction turns
  arrow: { fill: "", stroke: "M12 3.5v16M6 13.5l6 6 6-6" },
  // the button that opens the controls: a pendulum, its bar, its string and
  // its heavy bob, swung to one side over the faint arc of its swing; the
  // string and the bob swing about the pivot (decision 59)
  controls: {
    fill: "",
    stroke: "M7.5 3.5h9",
    faint: "M4.5 16.49A15 15 0 0 0 16.13 17.92",
    swings: {
      fill: "M15.64 16.74a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0",
      stroke: "M12 3.5L19.04 16.74",
      pivot: [12, 3.5],
    },
  },
  // a chain of beads hanging in a curve, as it does on its way to a rope
  masses: {
    fill: "M5.05 8.67a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0M9.35 13.67a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0M17.2 18a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0",
    stroke: "M5 3c1 6 4 11 14 15",
  },
  // a stopwatch
  time: {
    fill: "",
    stroke:
      "M12 21a7.5 7.5 0 1 0 0-15a7.5 7.5 0 1 0 0 15M12 13.5l3-3M12 6V3.5M9.5 3h5",
  },
  // the hand's spring, and the mass it holds
  hand: {
    fill: "M18.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
    stroke: "M1.5 12h3l1.75-4 3 8 3-8 3 8 1.75-4",
  },
  // a weight, as gravity pulls it
  gravity: {
    fill: "M6.5 10h11l2.5 10.5h-16z",
    stroke: "M9 10a3 3 0 1 1 6 0",
  },
  // a painter's palette
  palette: {
    fill: "M6.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M9 7.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M13.5 7.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0",
    stroke:
      "M12 3a9 9 0 1 0 0 18c1.2 0 1.8-1 1.3-2-.6-1.1 0-2.5 1.3-2.5H17a4 4 0 0 0 4-4C21 7 17 3 12 3z",
  },
  // a thermometer, its column half up: the tension's scale of colours, from
  // cold to hot
  scale: {
    fill: "M11.25 8.5h1.5v8h-1.5zM10 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    stroke: "M10 14.6V5a2 2 0 0 1 4 0v9.6a4 4 0 1 1 -4 0z",
  },
  // a paint roller, as a wall is painted: the ground
  ground: {
    fill: "M9.75 15.5h2.5v6h-2.5z",
    stroke:
      "M4.5 3.5h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1zM17.5 6h2.5v5.5H11v4",
  },
  // a candle just put out, its smoke rising and coming apart: the twins that
  // go out as chaos carries them off
  snuffed: {
    fill: "M9.5 14h5v7.5h-5z",
    stroke: "M12 14v-1.5c0-1.4-2-1.8-2-3.3",
    faint: "M10 9.2c0-1.5 3-1.7 3-3.4s-2.5-1.6-2.5-3.3",
  },
  // a chain raised straight to one side from its pivot, where it hangs at
  // rest recalled faint: where the chain starts
  start: {
    fill: "M3.5 4a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M8.5 8a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0 -3.8 0M13.9 12a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0 -3.8 0M18.7 16a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0",
    stroke: "M5 4L10.4 8L15.8 12L21 16",
    faint: "M5 4V21",
  },
  // a pendulum, and the marks of its swing either side of the bob
  amplitude: {
    fill: "M10.5 3a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M9.4 15a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0",
    stroke: "M12 3V12.5M6.5 11.5Q4.5 15 6.5 18.5M17.5 11.5Q19.5 15 17.5 18.5",
  },
  // a bookmark, empty while no moment is kept, and full when one is
  save: { fill: "", stroke: "M7 3.5h10v17l-5-4.5-5 4.5z" },
  saved: {
    fill: "M7 3.5h10v17l-5-4.5-5 4.5z",
    stroke: "M7 3.5h10v17l-5-4.5-5 4.5z",
  },
  // a spring balance, its scale marked and its hook empty: the chain in its
  // own colour; filled, its marks cut out, the chain painted by its tension
  balance: {
    fill: "",
    stroke:
      "M12 2v2M8.5 4h7v10h-7zM10.5 7h3M10.5 10h3M12 14v4M12 18a2 2 0 1 1 -2 2",
  },
  weighing: {
    fill: "M7.5 3h9v12h-9zM10.5 6.25v1.5h3v-1.5zM10.5 9.75v1.5h3v-1.5z",
    stroke: "M12 2v1M12 15v3M12 18a2 2 0 1 1 -2 2",
  },
  // a pendulum standing on its head, on a pivot that buzzes
  shake: {
    fill: "M10.5 15a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M10 3.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    stroke: "M12 15V5.5M5 20.5l2.33-2 2.33 2 2.33-2 2.34 2 2.33-2 2.33 2",
  },
  // chevrons: there is more of the row this way
  // a box open at the top, an arrow rising out of it, as phones draw sharing
  share: {
    fill: "",
    stroke: "M8.5 9.5H6.5v11h11v-11h-2M12 15V3M8.5 6.5L12 3l3.5 3.5",
  },
  // a tick, a moment after the address was copied
  copied: { fill: "", stroke: "M5 12.5l4.5 4.5L19 7.5" },
  // a QR code: its three corner squares, hollow round a centre, and a few modules
  qr: {
    fill: "M6 6h2v2H6zM16 6h2v2h-2zM6 16h2v2H6zM14 14h2v2h-2zM18 14h2v2h-2zM16 16h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
    stroke: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z",
  },
  // two eighth notes joined by their beam, their heads slanted: music
  music: {
    fill: "M4.6 18.6c0-1.3 1.3-2.4 2.9-2.4c1.1 0 1.9.6 1.9 1.5c0 1.3-1.3 2.4-2.9 2.4c-1.1 0-1.9-.6-1.9-1.5zM14.6 16.6c0-1.3 1.3-2.4 2.9-2.4c1.1 0 1.9.6 1.9 1.5c0 1.3-1.3 2.4-2.9 2.4c-1.1 0-1.9-.6-1.9-1.5zM9.4 5l10-2v3l-10 2z",
    stroke: "M9.4 17.5V6M19.4 15.5V4",
  },
  // Three of the groups of the row (decision 54); the chain's and the
  // trails' take the icons of their first controls. A clock: time and the
  // start.
  clock: {
    fill: "",
    stroke: "M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0M12 7.5V12l3 2",
  },
  // a butterfly: the twins, which show the butterfly effect
  butterfly: {
    fill: "M11.2 11C9.5 6.5 6.5 3.5 4 4.2C2 4.8 2.3 8 4 9.8C5.6 11.4 8.3 12 11.2 12.3ZM12.8 11C14.5 6.5 17.5 3.5 20 4.2C22 4.8 21.7 8 20 9.8C18.4 11.4 15.7 12 12.8 12.3ZM11.2 13.3C8.5 13.6 5.8 14.6 5.4 16.9C5 19.3 7.6 20.6 9.4 18.9C10.5 17.8 11 15.6 11.2 13.3ZM12.8 13.3C15.5 13.6 18.2 14.6 18.6 16.9C19 19.3 16.4 20.6 14.6 18.9C13.5 17.8 13 15.6 12.8 13.3Z",
    stroke: "M12 9.5v8",
  },
  // a monitor on its stand: the screen
  monitor: {
    fill: "",
    stroke:
      "M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15V6A1.5 1.5 0 0 1 4 4.5zM8.5 20.5h7M12 16.5v4",
  },
  // a pencil, outlined while the sketch's light is off and filled while it is
  // on the whole frame (decision 24)
  sketch: { fill: "", stroke: "M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19z" },
  sketched: {
    fill: "M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19z",
    stroke: "M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19z",
  },
  // a drop of colour, half full: how much dense light keeps its colour
  // before it turns white (decision 61)
  whiten: {
    fill: "M12 20.5a6 6 0 0 1-6-6c0-3.5 3-7 6-11z",
    stroke: "M12 3.5c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z",
  },
  // a line and two brackets closing in on it from either side: how near
  // the chain the twins are held
  near: { fill: "", stroke: "M12 4v16M4.5 7l4 5-4 5M19.5 7l-4 5 4 5" },
  left: { fill: "", stroke: "M15 5l-7 7 7 7" },
  right: { fill: "", stroke: "M9 5l7 7-7 7" },
};

/** An icon, sized for a control, hidden from screen readers: the control names itself. */
export function drawIcon(name: Icon): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  const { fill, stroke, faint, swings } = ICONS[name];
  if (faint !== undefined) svg.append(strokes(faint, 0.4));
  if (fill !== "") {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", fill);
    path.setAttribute("fill", "currentColor");
    svg.append(path);
  }
  if (stroke !== "") svg.append(strokes(stroke, 1));
  if (swings !== undefined) {
    const group = document.createElementNS(SVG, "g");
    group.dataset.swings = "";
    const [x, y] = swings.pivot;
    // in the grid's units, as an SVG element's own lengths are
    group.style.transformOrigin = `${String(x)}px ${String(y)}px`;
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", swings.fill);
    path.setAttribute("fill", "currentColor");
    group.append(path, strokes(swings.stroke, 1));
    svg.append(group);
  }
  return svg;
}

/** The part of an icon drawn by `drawIcon` that swings about its pivot, if it has one. */
export function swingingPart(svg: SVGSVGElement): SVGGElement | null {
  return svg.querySelector<SVGGElement>("g[data-swings]");
}

/** Path data drawn as round-ended strokes, at the given opacity. */
function strokes(data: string, opacity: number): SVGPathElement {
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", data);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  if (opacity < 1) path.setAttribute("opacity", String(opacity));
  return path;
}
