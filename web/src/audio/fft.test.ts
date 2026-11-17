import { describe, expect, it } from "vitest";

import { Fourier, hann } from "./fft.ts";

// The Fourier transform the piece hears music with (docs/decisions.md,
// decision 44), checked against what a transform must do.

/** A sequence of `n` numbers in [−1, 1), the same on every run. */
function noise(n: number, seed: number): Float64Array {
  let s = seed >>> 0;
  return Float64Array.from({ length: n }, () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 31 - 1;
  });
}

describe("Fourier", () => {
  it("refuses a size that is not a power of two", () => {
    expect(() => new Fourier(48)).toThrow(/power of two/);
    expect(() => new Fourier(1)).toThrow(/power of two/);
  });

  it("puts a sine of whole cycles in its bin and its mirror, at half the size, and nothing elsewhere", () => {
    const n = 256;
    const fourier = new Fourier(n);
    for (const k of [1, 5, 37, 127]) {
      const re = Float64Array.from({ length: n }, (_, j) =>
        Math.sin((2 * Math.PI * k * j) / n),
      );
      const im = new Float64Array(n);
      fourier.transform(re, im);
      for (let bin = 0; bin < n; bin++) {
        const magnitude = Math.hypot(re[bin] ?? 0, im[bin] ?? 0);
        const expected = bin === k || bin === n - k ? n / 2 : 0;
        expect(magnitude).toBeCloseTo(expected, 9);
      }
    }
  });

  it("keeps the energy: the sum of squares is the spectrum's over the size (Parseval)", () => {
    const n = 2048;
    const x = noise(n, 7);
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    new Fourier(n).transform(re, im);
    const time = x.reduce((sum, v) => sum + v * v, 0);
    let spectrum = 0;
    for (let k = 0; k < n; k++) {
      spectrum += (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2;
    }
    expect(spectrum / n / time).toBeCloseTo(1, 12);
  });

  it("agrees with the transform summed term by term", () => {
    const n = 64;
    const xr = noise(n, 3);
    const xi = noise(n, 11);
    const re = Float64Array.from(xr);
    const im = Float64Array.from(xi);
    new Fourier(n).transform(re, im);
    for (let k = 0; k < n; k++) {
      let sr = 0;
      let si = 0;
      for (let j = 0; j < n; j++) {
        const a = (-2 * Math.PI * j * k) / n;
        const vr = xr[j] ?? 0;
        const vi = xi[j] ?? 0;
        sr += vr * Math.cos(a) - vi * Math.sin(a);
        si += vr * Math.sin(a) + vi * Math.cos(a);
      }
      expect(re[k]).toBeCloseTo(sr, 10);
      expect(im[k]).toBeCloseTo(si, 10);
    }
  });
});

describe("hann", () => {
  it("rises from zero to one at the middle and back, as a period of a cosine", () => {
    const w = hann(8);
    expect(Array.from(w)).toEqual(
      [0, 0.5 - Math.SQRT1_2 / 2, 0.5, 0.5 + Math.SQRT1_2 / 2, 1]
        .concat([0.5 + Math.SQRT1_2 / 2, 0.5, 0.5 - Math.SQRT1_2 / 2])
        .map((v) => expect.closeTo(v, 12) as number),
    );
  });
});
