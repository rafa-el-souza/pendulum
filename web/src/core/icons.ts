// Icons for the controls, drawn as SVG rather than typed as characters, so that
// every device has them: some engines lack a font with the symbols they would
// need.

/** The icons a control can show. */
export type Icon =
  | "pause"
  | "play"
  | "raise"
  | "fan"
  | "comet"
  | "spread"
  | "ribbon"
  | "light"
  | "dark"
  | "rewind"
  | "forward"
  | "arrow"
  | "controls"
  | "masses"
  | "time"
  | "hand"
  | "gravity"
  | "palette"
  | "mode"
  | "amplitude"
  | "save"
  | "saved"
  | "balance"
  | "weighing"
  | "shake"
  | "share"
  | "copied"
  | "qr"
  | "left"
  | "right";

const SVG = "http://www.w3.org/2000/svg";

/**
 * Each icon as SVG path data on a 24 by 24 grid: strokes drawn faint, behind
 * the rest, for a position the drawing only recalls; filled shapes; strokes.
 */
const ICONS: Record<Icon, { fill: string; stroke: string; faint?: string }> = {
  pause: { fill: "M6 5h4v14H6zM14 5h4v14h-4z", stroke: "" },
  play: { fill: "M8 5l11 7-11 7z", stroke: "" },
  // a circle turning back on itself, its arrowhead at the top pointing left
  raise: {
    fill: "",
    stroke: "M5.5 8.25A7.5 7.5 0 1 0 12 4.5M15 2l-3 2.5 3 2.5",
  },
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
  // a light, lit: a disc and its rays
  light: {
    fill: "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
    stroke:
      "M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8",
  },
  // the same light, out: its outline alone
  dark: {
    fill: "",
    stroke: "M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0",
  },
  // two arrowheads pointing back, as on a player that rewinds
  rewind: { fill: "M11.5 6v12L3 12zM20.5 6v12L12 12z", stroke: "" },
  // two arrowheads pointing on
  forward: { fill: "M3.5 6v12l8.5-6zM12 6v12l8.5-6z", stroke: "" },
  // an arrow pointing straight down, which a direction turns
  arrow: { fill: "", stroke: "M12 3.5v16M6 13.5l6 6 6-6" },
  // the button that opens the controls: a little chain of three masses
  // hanging, which reads as the three dots of "more" too
  controls: {
    fill: "M10 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M10 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M11.4 7h1.2v3h-1.2zM11.4 14h1.2v3h-1.2z",
    stroke: "",
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
  // a string held at both ends in its second mode, as a standing wave is
  // drawn: one end of its swing, the other faint, and its nodes
  mode: {
    fill: "M1.9 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0M10.4 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0M18.9 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0",
    stroke: "M3.5 12Q7.75 4 12 12T20.5 12",
    faint: "M3.5 12Q7.75 20 12 12T20.5 12",
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
  const { fill, stroke, faint } = ICONS[name];
  if (faint !== undefined) svg.append(strokes(faint, 0.4));
  if (fill !== "") {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", fill);
    path.setAttribute("fill", "currentColor");
    svg.append(path);
  }
  if (stroke !== "") svg.append(strokes(stroke, 1));
  return svg;
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
