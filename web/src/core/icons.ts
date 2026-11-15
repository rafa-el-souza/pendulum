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
  | "forward";

const SVG = "http://www.w3.org/2000/svg";

/** Each icon as SVG path data on a 24 by 24 grid: filled shapes, then strokes. */
const ICONS: Record<Icon, { fill: string; stroke: string }> = {
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
};

/** An icon, sized for a control, hidden from screen readers: the control names itself. */
export function drawIcon(name: Icon): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  const { fill, stroke } = ICONS[name];
  if (fill !== "") {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", fill);
    path.setAttribute("fill", "currentColor");
    svg.append(path);
  }
  if (stroke !== "") {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", stroke);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  }
  return svg;
}
