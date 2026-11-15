// Icons for the controls, drawn as SVG rather than typed as characters, so that
// every device has them: some engines lack a font with the symbols they would
// need.

/** The icons a control can show. */
export type Icon =
  "pause" | "play" | "raise" | "fan" | "comet" | "spread" | "ribbon";

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
