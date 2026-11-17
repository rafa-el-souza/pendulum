// The Fourier transform the piece hears music with (docs/decisions.md,
// decision 44): radix 2, in place, on a power-of-two number of samples. It is
// ours, not the browser's analyser, so that the same code runs in the page
// and in the tests, on sounds made up to check it.

/** A transform of one size, with its turns and its order worked out once. */
export class Fourier {
  readonly size: number;
  /** cos and sin of 2πk/size, for k below half the size. */
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  /** Where each index goes when its bits are reversed. */
  private readonly reversed: Uint32Array;

  constructor(size: number) {
    if (!Number.isInteger(size) || size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(
        `a transform's size must be a power of two, not ${String(size)}`,
      );
    }
    this.size = size;
    const half = size / 2;
    this.cos = Float64Array.from({ length: half }, (_, k) =>
      Math.cos((2 * Math.PI * k) / size),
    );
    this.sin = Float64Array.from({ length: half }, (_, k) =>
      Math.sin((2 * Math.PI * k) / size),
    );
    const bits = Math.log2(size);
    this.reversed = Uint32Array.from({ length: size }, (_, i) => {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      return r;
    });
  }

  /** X[k] = Σ x[j]·e^(−2πi·jk/size), in place on (re, im). */
  transform(re: Float64Array, im: Float64Array): void {
    const n = this.size;
    if (re.length !== n || im.length !== n) {
      throw new Error(`a transform of ${String(n)} takes ${String(n)} samples`);
    }
    for (let i = 0; i < n; i++) {
      const j = this.reversed[i] ?? i;
      if (j > i) {
        const r = re[i] ?? 0;
        re[i] = re[j] ?? 0;
        re[j] = r;
        const m = im[i] ?? 0;
        im[i] = im[j] ?? 0;
        im[j] = m;
      }
    }
    for (let span = 2; span <= n; span *= 2) {
      const half = span / 2;
      const stride = n / span;
      for (let start = 0; start < n; start += span) {
        for (let k = 0; k < half; k++) {
          const c = this.cos[k * stride] ?? 1;
          const s = this.sin[k * stride] ?? 0;
          const a = start + k;
          const b = a + half;
          const br = re[b] ?? 0;
          const bi = im[b] ?? 0;
          // the odd half turned by e^(−2πi·k/span)
          const tr = br * c + bi * s;
          const ti = bi * c - br * s;
          const ar = re[a] ?? 0;
          const ai = im[a] ?? 0;
          re[a] = ar + tr;
          im[a] = ai + ti;
          re[b] = ar - tr;
          im[b] = ai - ti;
        }
      }
    }
  }
}

/** The Hann window over `n` samples, one period of a raised cosine. */
export function hann(n: number): Float64Array {
  return Float64Array.from(
    { length: n },
    (_, j) => 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / n),
  );
}
