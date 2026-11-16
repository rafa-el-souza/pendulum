// Colors for WebGL and for the page's stylesheet: a piece draws in the colours
// of its ground (src/core/grounds.ts), and sets the page's tokens to them
// (src/styles/tokens.css holds the first ground's, for the first paint).

/** Red, green and blue from 0 to 1. */
export type Rgb = readonly [number, number, number];

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/;

/** Reads "#rrggbb" or "rgb(r, g, b)"; anything else throws, so that a mistyped token fails loudly. */
export function parseColor(text: string): Rgb {
  const value = text.trim();
  const hex = HEX.exec(value);
  if (hex !== null) {
    const [, r = "", g = "", b = ""] = hex;
    return [
      Number.parseInt(r, 16) / 255,
      Number.parseInt(g, 16) / 255,
      Number.parseInt(b, 16) / 255,
    ];
  }
  const rgb = RGB.exec(value);
  if (rgb !== null) {
    const [, r = "", g = "", b = ""] = rgb;
    return [Number(r) / 255, Number(g) / 255, Number(b) / 255];
  }
  throw new Error(
    `${JSON.stringify(text)} is not a color written as #rrggbb or rgb(r, g, b)`,
  );
}

/** A color for the page's stylesheet, as rgb(r g b), each channel kept within 0 and 255. */
export function cssColor(color: Rgb): string {
  const channel = (value: number): string =>
    String(Math.round(255 * Math.min(1, Math.max(0, value))));
  return `rgb(${channel(color[0])} ${channel(color[1])} ${channel(color[2])})`;
}
