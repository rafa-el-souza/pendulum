// The README's pictures of the first piece: an animation, the chain let go from
// the piece's raised start in slow motion, then sped up smoothly to real time,
// with its speed written in a corner, and the fan of twins it leaves; and three
// stills, each the screen an address opens after so many seconds, which the
// README links to that address. They are taken from the published site in
// Chromium, a frame at a time on the page's own clock, so that a slow machine
// draws them as smoothly as a fast one, and written as WebP by the browser's
// own encoder. The page is told it has eight cores, so that its workers carry
// the twins a desktop's would. Writes the pictures to ../docs/media/.
// Run: npm run media [-- <site>] [-- <names>], as "npm run media -- swing fan".

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { chromium, type Browser, type Page } from "@playwright/test";

const ARGS = process.argv.slice(2);
const SITE =
  ARGS.find((arg) => arg.startsWith("http")) ??
  "https://pendulum.rafasouza.dev.br/";
/** The pictures asked for by name, or every one. */
const NAMES = ARGS.filter((arg) => !arg.startsWith("http"));
const OUT = new URL("../../docs/media/", import.meta.url);
/** A frame of the page's clock, in ms: a 60 Hz screen's, as the fake clock fires them. */
const FRAME_MS = 16;
/** An image of the animation lasts two of the page's frames, 32 ms. */
const KEEP_EVERY = 2;
/** WebP quality, from 0 to 1. */
const QUALITY = 0.75;
/** The animation's last frames fade to the ground, so that its loop starts again from the ground. */
const FADE_FRAMES = 10;
const CORES = 8;
/** Any fixed day: a saved moment carries its minute, and the pictures should not change with the day they are taken. */
const DAY = Date.UTC(2026, 0, 1);

interface Size {
  readonly width: number;
  readonly height: number;
}

/** A still: the screen an address opens, after so many seconds. */
interface Still {
  readonly name: string;
  readonly query: string;
  readonly seconds: number;
}

const HERO: Size = { width: 800, height: 450 };
const STILL: Size = { width: 600, height: 600 };

const STILLS: readonly Still[] = [
  // the fan of 4 096 twins, as its colours part
  { name: "fan", query: "?twins=4096", seconds: 6 },
  // the path of the chain's tip, kept 10 s
  { name: "trails", query: "?twins=0&trail=10", seconds: 14 },
  // three masses, each rod in the colour of its tension, and its trail too
  { name: "tension", query: "?twins=0&tension=1&n=3&trail=10", seconds: 6 },
];

/** The piece's ground, from the design tokens, as the pages have it. */
const GROUND = (() => {
  const css = readFileSync(
    new URL("../src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  const found = /--color-ground:\s*(#[0-9a-f]{6})/i.exec(css)?.[1];
  if (found === undefined) throw new Error("no --color-ground in tokens.css");
  return found;
})();

/** Errors any page threw, reported at the end. */
const errors: string[] = [];

/** A page of the site at `query`, on a clock that moves only when told. */
async function open(
  browser: Browser,
  query: string,
  size: Size,
): Promise<Page> {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => {
    errors.push(`${query}: ${error.message}`);
  });
  await page.addInitScript((cores) => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      get: () => cores,
    });
  }, CORES);
  // the clock stands still from before the page opens, so that every picture
  // starts from the piece's first frame
  await page.clock.install({ time: DAY });
  await page.clock.pauseAt(DAY + 1000);
  await page.goto(new URL(query, SITE).href);
  await page.waitForFunction(
    () => document.documentElement.dataset.webgl === "webgl2",
    undefined,
    { polling: 50 },
  );
  return page;
}

/** Runs the page `frames` frames, each followed by a moment of real time for its workers; `each` sees every frame after it is drawn. */
async function run(
  page: Page,
  frames: number,
  each?: (frame: number) => Promise<void>,
): Promise<void> {
  for (let frame = 0; frame < frames; frame++) {
    await page.clock.runFor(FRAME_MS);
    await page.waitForTimeout(12);
    await each?.(frame);
  }
}

/** A PNG as WebP, by the encoder of the browser that `encoder` belongs to, under a veil of the ground from 0, none, to 1, the ground alone. */
async function webp(encoder: Page, png: Buffer, veil = 0): Promise<Uint8Array> {
  const letters = await encoder.evaluate(
    async ([base64, quality, ground, veil]) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("no 2D context to encode with");
      context.drawImage(bitmap, 0, 0);
      context.globalAlpha = veil;
      context.fillStyle = ground;
      context.fillRect(0, 0, bitmap.width, bitmap.height);
      const blob = await canvas.convertToBlob({ type: "image/webp", quality });
      const out = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of out) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    [png.toString("base64"), QUALITY, GROUND, veil] as const,
  );
  return Uint8Array.from(Buffer.from(letters, "base64"));
}

/** A RIFF chunk: its four letters, its size, its data, and a byte of padding when the size is odd. */
function chunk(fourcc: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + (data.length % 2));
  out.set(new TextEncoder().encode(fourcc), 0);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function uint24(view: DataView, at: number, value: number): void {
  view.setUint8(at, value & 0xff);
  view.setUint8(at + 1, (value >> 8) & 0xff);
  view.setUint8(at + 2, (value >> 16) & 0xff);
}

/** The chunks of a still WebP, by their four letters, without its RIFF header. */
function chunks(file: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const found = new Map<string, Uint8Array>();
  for (let at = 12; at + 8 <= file.length;) {
    const fourcc = new TextDecoder().decode(file.subarray(at, at + 4));
    const size = view.getUint32(at + 4, true);
    found.set(fourcc, file.subarray(at, at + 8 + size + (size % 2)));
    at += 8 + size + (size % 2);
  }
  return found;
}

/**
 * Still WebPs of one size as one animated WebP that loops for ever, each
 * frame shown `duration` ms. A frame keeps its image (ALPH, VP8 or VP8L);
 * the colour profile the browser gives every frame is the same, and an
 * animation holds it once, before its frames.
 */
function animated(
  frames: readonly Uint8Array[],
  size: Size,
  duration: number,
): Uint8Array {
  const first = frames[0];
  if (first === undefined) throw new Error("an animation needs a frame");
  const profile = chunks(first).get("ICCP");
  const vp8x = new Uint8Array(10);
  const header = new DataView(vp8x.buffer);
  header.setUint8(0, 0x02 | (profile === undefined ? 0 : 0x20)); // animation, and a profile
  uint24(header, 4, size.width - 1);
  uint24(header, 7, size.height - 1);
  // a black background, and a loop count of 0, for ever
  const anim = new Uint8Array(6);
  const parts = [
    chunk("VP8X", vp8x),
    ...(profile === undefined ? [] : [profile]),
    chunk("ANIM", anim),
  ];
  for (const frame of frames) {
    const head = new Uint8Array(16);
    const view = new DataView(head.buffer);
    uint24(view, 6, size.width - 1);
    uint24(view, 9, size.height - 1);
    uint24(view, 12, duration);
    view.setUint8(15, 0x02); // drawn over nothing, not blended
    const image = chunks(frame);
    const kept = ["ALPH", "VP8 ", "VP8L"].flatMap(
      (fourcc) => image.get(fourcc) ?? [],
    );
    parts.push(chunk("ANMF", concat([head, ...kept])));
  }
  const body = concat(parts);
  const riff = new Uint8Array(12);
  riff.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(riff.buffer).setUint32(4, 4 + body.length, true);
  riff.set(new TextEncoder().encode("WEBP"), 8);
  return concat([riff, body]);
}

/** The piece's slowest time, a tenth of real time, which the animation's page keeps. */
const SLOWEST = 0.1;
/** In images of the animation: held at the slowest, speeding up, and at real time. */
const HOLD = 30;
const SPEED_UP = 250;
const REAL = 60;
/** The last images of the speeding up ease into real time. */
const EASE = 60;

/**
 * How fast the animation runs at its image `i`, as a share of real time:
 * the slowest, then up by the same ratio from each image to the next, so that
 * it looks as smooth at a tenth as near real time, easing into real time over
 * the last images, and then real time.
 */
function speedAt(i: number): number {
  const j = Math.min(Math.max(0, i - HOLD), SPEED_UP);
  // the logarithm of the speed climbs at a rate that is constant, then falls
  // to nothing over the ease, and adds up to a tenfold rise
  const rate = Math.log(1 / SLOWEST) / (SPEED_UP - EASE / 2);
  const steady = Math.min(j, SPEED_UP - EASE);
  const eased = Math.max(0, j - (SPEED_UP - EASE));
  const climbed = rate * (steady + eased - (eased * eased) / (2 * EASE));
  return Math.min(1, SLOWEST * Math.exp(climbed));
}

/** Writes in the page's top left corner how fast its time runs, in the page's own face and ink, or nothing. */
async function label(page: Page, text: string): Promise<void> {
  await page.evaluate((text) => {
    let corner = document.getElementById("readme-pace");
    if (corner === null) {
      corner = document.createElement("div");
      corner.id = "readme-pace";
      Object.assign(corner.style, {
        position: "fixed",
        top: "18px",
        left: "22px",
        font: "500 17px var(--font-text)",
        color: "var(--color-ink)",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "0.02em",
        pointerEvents: "none",
      });
      document.body.append(corner);
    }
    corner.textContent = text;
  }, text);
}

/**
 * The animation: the chain of four masses let go from the piece's raised
 * start, swinging out and back in slow motion, at first a tenth of real time,
 * then faster, smoothly, up to real time, while the twins born with it fan out
 * in colour and fade. The page's time stays at its slowest, and each image of
 * the animation runs it as many frames as its speed asks, so that the speed
 * changes by steps no larger than a twentieth of real time. The top left
 * corner says how fast the animation runs.
 */
async function hero(browser: Browser, encoder: Page): Promise<void> {
  const page = await open(browser, `?n=4&fade=1&time=${String(SLOWEST)}`, HERO);
  const images = HOLD + SPEED_UP + REAL;
  /** Frames of the page an image at real time takes: its 32 ms, at a tenth. */
  const perImage = KEEP_EVERY / SLOWEST;
  const frames: Uint8Array[] = [];
  let owed = 0;
  for (let i = 0; i < images; i++) {
    const speed = speedAt(i);
    owed += speed * perImage;
    const due = Math.floor(owed);
    owed -= due;
    await run(page, due);
    const words =
      i < HOLD
        ? "slow motion"
        : speed < 0.995
          ? "slow motion, speeding up"
          : "real time";
    await label(page, `×${speed < 0.995 ? speed.toFixed(2) : "1"}  ${words}`);
    const veil = Math.max(0, 1 - (images - i) / FADE_FRAMES);
    frames.push(await webp(encoder, await page.screenshot(), veil));
  }
  writeFileSync(
    new URL("swing.webp", OUT),
    animated(frames, HERO, KEEP_EVERY * FRAME_MS),
  );
  console.log(`swing.webp: ${String(frames.length)} frames`);
  await page.close();
}

async function still(
  browser: Browser,
  encoder: Page,
  { name, query, seconds }: Still,
): Promise<void> {
  const page = await open(browser, query, STILL);
  await run(page, Math.round((1000 * seconds) / FRAME_MS));
  writeFileSync(
    new URL(`${name}.webp`, OUT),
    await webp(encoder, await page.screenshot()),
  );
  console.log(`${name}.webp: ${new URL(query, SITE).href}`);
  await page.close();
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const encoder = await browser.newPage();
const asked = (name: string): boolean =>
  NAMES.length === 0 || NAMES.includes(name);
if (asked("swing")) await hero(browser, encoder);
for (const one of STILLS)
  if (asked(one.name)) await still(browser, encoder, one);
await browser.close();
if (errors.length > 0) throw new Error(errors.join("\n"));
