import { describe, expect, it } from "vitest";

import tokensCss from "../styles/tokens.css?raw";
import { parseColor, type Rgb } from "./color.ts";
import { GROUNDS, groundAt, mixColors } from "./grounds.ts";

// The grounds a piece is drawn on (docs/decisions.md, decision 41): dark, since
// the pieces add light to them, each with the colours that must stand out
// from it.

/** The page's design tokens, as the stylesheet holds them. */
function tokens(): Map<string, string> {
  return new Map(
    [...tokensCss.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map(
      ([, name, value]) => [name ?? "", (value ?? "").trim()],
    ),
  );
}

/** WCAG's relative luminance of a colour. */
function luminance([r, g, b]: Rgb): number {
  const linear = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG's contrast ratio between two colours, from 1 to 21. */
function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe("the grounds (decision 41)", () => {
  it("open with the ground the piece has had, as the page's tokens hold it", () => {
    const token = tokens();
    const [first] = GROUNDS;
    if (first === undefined) throw new Error("there are no grounds");
    expect(first.name).toBe("night");
    const named: [string, Rgb][] = [
      ["--color-ground", first.ground],
      ["--color-chain", first.chain],
      ["--color-hand", first.hand],
      ["--color-pivot", first.pivot],
      ["--color-ink", first.ink],
      ["--color-ink-muted", first.inkMuted],
    ];
    for (const [name, color] of named) {
      expect(parseColor(token.get(name) ?? "")).toEqual(color);
    }
  });

  it("are dark, since the pieces add their light to them", () => {
    for (const { name, ground } of GROUNDS) {
      expect(luminance(ground), name).toBeLessThan(0.025);
    }
  });

  it("keep the chain, the hand, the pivot and the row's words clear of every ground", () => {
    for (const g of GROUNDS) {
      expect(contrast(g.chain, g.ground), g.name).toBeGreaterThan(12);
      expect(contrast(g.ink, g.ground), g.name).toBeGreaterThan(7);
      expect(contrast(g.inkMuted, g.ground), g.name).toBeGreaterThan(4.5);
      expect(contrast(g.hand, g.ground), g.name).toBeGreaterThan(4.5);
      expect(contrast(g.pivot, g.ground), g.name).toBeGreaterThan(4.5);
    }
  });

  it("have names of their own, for a screen reader, the address's title and the row", () => {
    const names = GROUNDS.map(({ name }) => name);
    expect(new Set(names).size).toBe(GROUNDS.length);
    expect(GROUNDS.length).toBeGreaterThanOrEqual(8);
  });

  it("are found by their place in the list, and nowhere else", () => {
    expect(groundAt(0)).toBe(GROUNDS[0]);
    expect(groundAt(GROUNDS.length - 1)).toBe(GROUNDS.at(-1));
    for (const index of [-1, GROUNDS.length, 0.5, Number.NaN]) {
      expect(() => groundAt(index)).toThrow(/ground/);
    }
  });
});

describe("mixColors", () => {
  it("mixes two colours in a straight line, by the share of the second", () => {
    expect(mixColors([0, 0.5, 1], [1, 0.5, 0], 0)).toEqual([0, 0.5, 1]);
    expect(mixColors([0, 0.5, 1], [1, 0.5, 0], 1)).toEqual([1, 0.5, 0]);
    expect(mixColors([0, 0.5, 1], [1, 0.5, 0], 0.25)).toEqual([
      0.25, 0.5, 0.75,
    ]);
  });
});
