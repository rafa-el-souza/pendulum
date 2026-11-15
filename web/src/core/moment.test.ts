import { describe, expect, it } from "vitest";

import { hashWith, momentInHash, readMoment, writeMoment } from "./moment.ts";

/** A small deterministic generator, so that every run draws the same states. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function state(theta: number[], omega: number[]) {
  return { theta: Float64Array.from(theta), omega: Float64Array.from(omega) };
}

/** Within the rounding of a 32-bit float: seven significant digits. */
function close(found: number, wanted: number): boolean {
  return Math.abs(found - wanted) <= 6e-8 * Math.max(Math.abs(wanted), 1e-30);
}

describe("a moment of the chain, kept in the address (decision 34)", () => {
  it("comes back from its text within seven significant digits, from one mass to 512", () => {
    const draw = random(34);
    for (const n of [1, 2, 3, 8, 64, 512]) {
      const theta = Array.from({ length: n }, () => 6 * (draw() - 0.5));
      const omega = Array.from({ length: n }, () => 40 * (draw() - 0.5));
      const back = readMoment(writeMoment(state(theta, omega)), n);
      expect(back).not.toBeNull();
      theta.forEach((angle, i) => {
        expect(
          close(back?.theta[i] ?? Number.NaN, angle),
          `n = ${String(n)}`,
        ).toBe(true);
      });
      omega.forEach((rate, i) => {
        expect(
          close(back?.omega[i] ?? Number.NaN, rate),
          `n = ${String(n)}`,
        ).toBe(true);
      });
    }
  });

  it("brings each angle within half a turn of zero, where the chain is the same and the digits go further", () => {
    const back = readMoment(writeMoment(state([7.5, -10, 1e6], [0, 0, 0])), 3);
    expect(close(back?.theta[0] ?? Number.NaN, 7.5 - 2 * Math.PI)).toBe(true);
    expect(close(back?.theta[1] ?? Number.NaN, -10 + 4 * Math.PI)).toBe(true);
    const wound = 1e6 - 2 * Math.PI * Math.round(1e6 / (2 * Math.PI));
    expect(Math.abs((back?.theta[2] ?? Number.NaN) - wound)).toBeLessThan(1e-6);
    for (const angle of back?.theta ?? []) {
      expect(Math.abs(angle)).toBeLessThanOrEqual(Math.PI);
    }
  });

  it("is written in the letters an address keeps as they are, about 25 of them with two masses and 5 500 with 512", () => {
    const two = writeMoment(state([0.1, 0.2], [0.3, 0.4]));
    expect(two).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(two).toHaveLength(22);
    const many = writeMoment(
      state(new Array<number>(512).fill(0.5), new Array<number>(512).fill(1)),
    );
    expect(many).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(many).toHaveLength(5462);
  });

  it("is refused for another number of masses, in other letters, or with a value that is not a number", () => {
    const text = writeMoment(state([0.1, 0.2], [0.3, 0.4]));
    expect(readMoment(text, 2)).not.toBeNull();
    expect(readMoment(text, 1)).toBeNull();
    expect(readMoment(text, 3)).toBeNull();
    expect(readMoment("", 2)).toBeNull();
    expect(readMoment(`${text.slice(0, -1)}*`, 2)).toBeNull();
    expect(readMoment(text.slice(0, -2), 2)).toBeNull();
    expect(
      readMoment(writeMoment(state([Number.NaN, 0.2], [0.3, 0.4])), 2),
    ).toBeNull();
    expect(
      readMoment(
        writeMoment(state([0.1, 0.2], [Number.POSITIVE_INFINITY, 0.4])),
        2,
      ),
    ).toBeNull();
  });

  it("is found after the # of an address, beside anything else kept there", () => {
    const text = writeMoment(state([0.1, 0.2], [0.3, 0.4]));
    expect(momentInHash(`#moment=${text}`, 2)?.theta).toHaveLength(2);
    expect(momentInHash(`#x=1&moment=${text}`, 2)?.theta).toHaveLength(2);
    expect(momentInHash(`#moment=${text}`, 3)).toBeNull();
    expect(momentInHash("", 2)).toBeNull();
    expect(momentInHash("#moment=", 2)).toBeNull();
    expect(momentInHash("#something-else", 2)).toBeNull();
  });

  it("goes into the # of an address, and out of it, leaving the rest as it was", () => {
    expect(hashWith("", "abc")).toBe("#moment=abc");
    expect(hashWith("#moment=old", "new")).toBe("#moment=new");
    expect(hashWith("#x=1", "abc")).toBe("#x=1&moment=abc");
    expect(hashWith("#x=1&moment=abc", null)).toBe("#x=1");
    expect(hashWith("#moment=abc", null)).toBe("");
    expect(hashWith("", null)).toBe("");
  });
});
