// Colors for WebGL come from the same design tokens as the pages
// (src/styles/tokens.css), read when a piece starts.

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

/**
 * A color token of the page, such as "--color-chain". The build may rewrite
 * a token in a shorter form ("#999999" as "#999", or a name), so the browser
 * normalizes it first: as the computed color of a probe, which is always
 * rgb(r, g, b) for an opaque color. A token that is missing, or is not an
 * opaque color, throws.
 */
export function tokenColor(name: string): Rgb {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (value === "" || !CSS.supports("color", value)) {
    throw new Error(
      `the token ${name} is not a color: ${JSON.stringify(value)}`,
    );
  }
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.append(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  return parseColor(computed);
}

/**
 * A colour across a fan of twins, from blue at 0 through magenta to amber at
 * 1: the sketch's ramp, a placeholder until the visual identity is designed
 * with the author.
 */
export function fanColor(place: number): Rgb {
  const t = 0.36 - 0.46 * place;
  return [
    0.5 + 0.5 * Math.cos(2 * Math.PI * t),
    0.5 + 0.5 * Math.cos(2 * Math.PI * (t + 0.33)),
    0.5 + 0.5 * Math.cos(2 * Math.PI * (t + 0.67)),
  ];
}
