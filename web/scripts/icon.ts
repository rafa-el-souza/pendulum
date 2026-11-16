// The site's icon (docs/decisions.md, decision 39): a frame of the first
// piece, drawn by its own physics. Two masses let go from the piece's raised
// start, and 48 twins born a thousandth of a radian apart, as the piece bears
// them, 4.983 s later: the chain as light over the fan of its twins, in the
// first palette, on the piece's ground. Writes public/favicon.svg and, from it
// in Chromium, public/favicon-32.png, for browsers that take no SVG icon, and
// public/apple-touch-icon.png, for a phone's home screen. Run: npm run icon

import { readFileSync, writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

import type { Rgb } from "../src/core/color.ts";
import { fanPalette } from "../src/core/palettes.ts";
import { bornTwins, fanPlace } from "../src/core/twins.ts";
import { Chain, gravity } from "../src/physics/chain.ts";
import { Stepper, restingState, type ChainState } from "../src/physics/step.ts";

const MASSES = 2;
const TWINS = 48;
const SPREAD = 1e-3;
const FRAME = 1 / 60;
const FRAMES = 299;

/** A colour of the design tokens, as the pages have it. */
function token(name: string): string {
  const css = readFileSync(
    new URL("../src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  const found = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css)?.[1];
  if (found === undefined) throw new Error(`no ${name} in tokens.css`);
  return found;
}

function hex(color: Rgb): string {
  return `#${color
    .map((c) =>
      Math.round(255 * c)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

// The piece's raised start (main.ts, start()) and its twins (twins.ts), with
// the twins' coarser substep, under the Earth's gravity.
const chain = Chain.uniform(MASSES);
const state = restingState(MASSES);
for (let i = 0; i < MASSES; i++) {
  state.theta[i] = 2.2 + (0.7 * i) / Math.max(1, MASSES - 1);
}
const twins = bornTwins(state, TWINS, SPREAD);
const stepper = new Stepper(chain);
const twinStepper = new Stepper(chain, { maxStep: 1 / 240 });
const g = gravity(9.81);
for (let k = 0; k < FRAMES; k++) {
  stepper.advance(state, FRAME, g);
  for (const twin of twins) twinStepper.advance(twin, FRAME, g);
}

/** Where the pivot and each mass of a chain are, x to the right and y up. */
function places({ theta }: ChainState): [number, number][] {
  const x = new Float64Array(MASSES);
  const y = new Float64Array(MASSES);
  chain.positions(theta, x, y);
  return [
    [0, 0],
    ...Array.from(x, (px, i): [number, number] => [px, y[i] ?? 0]),
  ];
}

/** The icon as SVG, its tile rounded, or square for a phone, which rounds it itself, with room for that. */
function icon(square: boolean): string {
  const main = places(state);
  const fan = twins.map(places);
  const all = [...main, ...fan.flat()];
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const [left, right] = [Math.min(...xs), Math.max(...xs)];
  const [bottom, top] = [Math.min(...ys), Math.max(...ys)];
  const pad = square ? 9 : 6;
  const scale = (64 - 2 * pad) / Math.max(right - left, top - bottom);
  const at = ([x, y]: [number, number]): string =>
    `${(32 + scale * (x - (left + right) / 2)).toFixed(1)} ${(32 - scale * (y - (bottom + top) / 2)).toFixed(1)}`;
  const line = (points: [number, number][]): string =>
    `M${points.map(at).join("L")}`;
  const palette = fanPalette(0);
  const chainColor = token("--color-chain");
  const beads = main
    .slice(1)
    .map((p) => {
      const [cx, cy] = at(p).split(" ");
      return `<circle cx="${cx ?? ""}" cy="${cy ?? ""}" r="2.6"/>`;
    })
    .join("");
  const [px, py] = at([0, 0]).split(" ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>`,
    `<rect width="64" height="64"${square ? "" : ` rx="14"`} fill="${token("--color-ground")}"/>`,
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" stroke-opacity="0.55">`,
    ...fan.map(
      (points, j) =>
        `<path d="${line(points)}" stroke="${hex(palette.color(fanPlace(j)))}"/>`,
    ),
    `</g>`,
    `<g fill="none" stroke="${chainColor}" stroke-linecap="round" stroke-linejoin="round">`,
    `<path d="${line(main)}" stroke-opacity="0.8" stroke-width="5.4" filter="url(#glow)"/>`,
    `<path d="${line(main)}" stroke-width="3.4"/>`,
    `</g>`,
    `<g fill="${chainColor}">${beads}</g>`,
    `<circle cx="${px ?? ""}" cy="${py ?? ""}" r="1.8" fill="${token("--color-pivot")}"/>`,
    `</svg>`,
    ``,
  ].join("\n");
}

const out = (name: string): URL =>
  new URL(`../public/${name}`, import.meta.url);
const rounded = icon(false);
writeFileSync(out("favicon.svg"), rounded);

const browser = await chromium.launch();
for (const [name, svg, size] of [
  ["favicon-32.png", rounded, 32],
  ["apple-touch-icon.png", icon(true), 180],
] as const) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
  });
  await page.setContent(
    `<body style="margin:0"><img width="${String(size)}" height="${String(size)}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body>`,
  );
  await page
    .locator("img")
    .screenshot({ path: out(name).pathname, omitBackground: true });
  await page.close();
}
await browser.close();
