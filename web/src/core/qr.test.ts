import { decodeQR } from "qr/decode.js";
import { describe, expect, it } from "vitest";

import { QUIET, qrModules, qrPath } from "./qr.ts";

// The QR code of a page's address (docs/decisions.md, decision 40): drawn as
// the card draws it, it reads back as the address.

const SITE = "https://rafa-el-souza.github.io/pendulum/#";

/** An address whose code holds a chain of n masses: a dozen bytes and eight to a mass, in base64url. */
function address(n: number): string {
  return (
    SITE +
    "Ab-_9"
      .repeat(Math.ceil((4 * (12 + 8 * n)) / 15))
      .slice(0, Math.ceil((4 * (12 + 8 * n)) / 3))
  );
}

/** The picture the card's path draws: its runs of dark modules on light, `scale` pixels to a module, as RGBA. */
function raster(path: string, size: number, scale: number) {
  const width = size * scale;
  const data = new Uint8Array(width * width * 4).fill(255);
  for (const [, x, y, run] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < Number(run) * scale; dx++) {
        const at =
          ((Number(y) * scale + dy) * width + Number(x) * scale + dx) * 4;
        data[at] = data[at + 1] = data[at + 2] = 0;
      }
    }
  }
  return { width, height: width, data };
}

describe("the QR code of the page's address (decision 40)", () => {
  it.each([1, 8, 64, 256])(
    "reads back as the address of a moment of %i masses, drawn as the card draws it",
    (n) => {
      const text = address(n);
      const modules = qrModules(text);
      expect(modules).not.toBeNull();
      const size = modules?.length ?? 0;
      expect(decodeQR(raster(qrPath(modules ?? []), size, 3))).toBe(text);
    },
  );

  it("keeps four light modules all round, as the standard asks", () => {
    const modules = qrModules(address(2)) ?? [];
    const size = modules.length;
    for (let i = 0; i < size; i++) {
      for (let q = 0; q < QUIET; q++) {
        expect(modules[q]?.[i]).toBe(false);
        expect(modules[size - 1 - q]?.[i]).toBe(false);
        expect(modules[i]?.[q]).toBe(false);
        expect(modules[i]?.[size - 1 - q]).toBe(false);
      }
    }
  });

  it("is none for an address longer than a QR code holds, about 270 masses and more", () => {
    expect(qrModules(address(270))).not.toBeNull();
    expect(qrModules(address(384))).toBeNull();
    expect(qrModules(address(512))).toBeNull();
  });
});
