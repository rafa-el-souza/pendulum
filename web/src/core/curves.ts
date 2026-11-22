// Trails kept as curves (docs/decisions.md, decision 68). Each span of a
// trail keeps its ends' positions and velocities, a cubic Hermite curve over
// the span, its colour, its light at both ends and the fade clock at both
// ends: how many half-lives the trails had faded when each end was drawn, so
// that a span finds its light now however the half-life changed since. Drawn
// as a band along the curve, cut into as many straight pieces as the view's
// scale asks for, a span is as smooth at 64 times nearer as in the whole
// view. A merger joins each trail's samples into longer spans while the curve
// passes within a tolerance of every sample it skips.

import type { Rgb } from "./color.ts";
import type { View } from "./view.ts";

/**
 * How far (dx, dy) reaches: the square root of the sum of their squares,
 * which `Math.hypot` takes longer to give, guarding against sums too large or
 * too small for a float, which a trail's distances never come near.
 */
export function lengthOf(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

/** Bytes a span takes: ends and tangents as eight floats, its colour as four bytes, its light and fade clock at both ends as four floats. */
export const SPAN_BYTES = 52;
const FLOATS = SPAN_BYTES / 4;

/** The most a span's curve strays from a sample it skips, in metres: a twentieth of a pixel at sixty-four times nearer on a phone. */
export const MERGE_TOLERANCE = 1.5e-6;

/** The longest chord a span spans, in metres, so that each falls within a square of the window (spans.ts). */
export const MERGE_REACH = 0.07;

/** The most intervals between samples a span joins. */
export const MERGE_MOST = 16;

/**
 * A tip that moves farther than this, in metres, in one piece has jumped
 * (raised again, or given other masses), and leaves no trail across the jump
 * (decision 21).
 */
export const TRAIL_JUMP = 0.5;

/** How far from straight a span's light may run, as a share of it. */
const LIGHT_TOLERANCE = 0.02;

/** How far from straight a span's fade clock may run, in half-lives: under 1% of its light. */
const FADE_TOLERANCE = 0.01;

/** A span, its fields by name: the ends, the tangents (each end's velocity times the span's time), the colour, the light and the fade clock at each end. */
export interface Span {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly mx0: number;
  readonly my0: number;
  readonly mx1: number;
  readonly my1: number;
  readonly rgb: Rgb;
  readonly l0: number;
  readonly l1: number;
  readonly f0: number;
  readonly f1: number;
}

/** Spans, laid out as the card reads them. */
export class SpanBatch {
  #bytes: ArrayBuffer;
  #f32: Float32Array;
  #u8: Uint8Array;
  count = 0;

  constructor(capacity = 64) {
    this.#bytes = new ArrayBuffer(Math.max(1, capacity) * SPAN_BYTES);
    this.#f32 = new Float32Array(this.#bytes);
    this.#u8 = new Uint8Array(this.#bytes);
  }

  /** The spans' bytes, the first `count` of them in use. */
  get u8(): Uint8Array {
    return this.#u8;
  }

  clear(): void {
    this.count = 0;
  }

  /** The spans in use, as bytes of their own, which can be handed to another thread. */
  bytes(): ArrayBuffer {
    return this.#bytes.slice(0, this.count * SPAN_BYTES);
  }

  /** The spans of `other`, after those here, as they are. */
  appendBatch(other: SpanBatch): void {
    this.append(other.#bytes, other.count);
  }

  /** The first `count` spans laid out in `bytes`, after those here, as they are. */
  append(bytes: ArrayBuffer, count: number): void {
    if (count <= 0) return;
    this.#fit(this.count + count);
    this.#u8.set(
      new Uint8Array(bytes, 0, count * SPAN_BYTES),
      this.count * SPAN_BYTES,
    );
    this.count += count;
  }

  /** Room for `spans` spans, the batch's bytes doubled as often as it takes. */
  #fit(spans: number): void {
    if (spans * SPAN_BYTES <= this.#bytes.byteLength) return;
    let length = this.#bytes.byteLength;
    while (spans * SPAN_BYTES > length) length *= 2;
    const grown = new ArrayBuffer(length);
    new Uint8Array(grown).set(this.#u8);
    this.#bytes = grown;
    this.#f32 = new Float32Array(grown);
    this.#u8 = new Uint8Array(grown);
  }

  push(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    mx0: number,
    my0: number,
    mx1: number,
    my1: number,
    rgb: Rgb,
    l0: number,
    l1: number,
    f0: number,
    f1: number,
  ): void {
    this.#fit(this.count + 1);
    const f = this.count * FLOATS;
    const f32 = this.#f32;
    f32[f] = x0;
    f32[f + 1] = y0;
    f32[f + 2] = x1;
    f32[f + 3] = y1;
    f32[f + 4] = mx0;
    f32[f + 5] = my0;
    f32[f + 6] = mx1;
    f32[f + 7] = my1;
    const o = this.count * SPAN_BYTES + 32;
    this.#u8[o] = Math.round(Math.min(1, Math.max(0, rgb[0])) * 255);
    this.#u8[o + 1] = Math.round(Math.min(1, Math.max(0, rgb[1])) * 255);
    this.#u8[o + 2] = Math.round(Math.min(1, Math.max(0, rgb[2])) * 255);
    this.#u8[o + 3] = 255;
    f32[f + 9] = l0;
    f32[f + 10] = l1;
    f32[f + 11] = f0;
    f32[f + 12] = f1;
    this.count++;
  }

  /** Span `index`, as it is kept; none past the count. */
  span(index: number): Span | null {
    if (index < 0 || index >= this.count) return null;
    return readSpan(this.#f32, this.#u8, index);
  }
}

/** Span `index` of a pool of spans, as it is kept. */
export function readSpan(
  f32: Float32Array,
  u8: Uint8Array,
  index: number,
): Span {
  const f = index * FLOATS;
  const o = index * SPAN_BYTES + 32;
  return {
    x0: f32[f] ?? 0,
    y0: f32[f + 1] ?? 0,
    x1: f32[f + 2] ?? 0,
    y1: f32[f + 3] ?? 0,
    mx0: f32[f + 4] ?? 0,
    my0: f32[f + 5] ?? 0,
    mx1: f32[f + 6] ?? 0,
    my1: f32[f + 7] ?? 0,
    rgb: [(u8[o] ?? 0) / 255, (u8[o + 1] ?? 0) / 255, (u8[o + 2] ?? 0) / 255],
    l0: f32[f + 9] ?? 0,
    l1: f32[f + 10] ?? 0,
    f0: f32[f + 11] ?? 0,
    f1: f32[f + 12] ?? 0,
  };
}

/** A span's curve, ends and tangents alone. */
type Curve = Pick<
  Span,
  "x0" | "y0" | "x1" | "y1" | "mx0" | "my0" | "mx1" | "my1"
>;

/** The point of a span's curve at `u`, from 0 at its first end to 1 at its last. */
export function hermiteAt(span: Curve, u: number): [number, number] {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return [
    h00 * span.x0 + h10 * span.mx0 + h01 * span.x1 + h11 * span.mx1,
    h00 * span.y0 + h10 * span.my0 + h01 * span.y1 + h11 * span.my1,
  ];
}

/** How far a span's curve at `u` is from the point (x, y), in metres. */
export function strays(span: Curve, u: number, x: number, y: number): number {
  const [hx, hy] = hermiteAt(span, u);
  return Math.hypot(hx - x, hy - y);
}

/**
 * The most a span's curve bends, in metres over the span squared: the length
 * of its second derivative, which for a cubic is greatest at an end. The
 * shader takes it the same way.
 */
export function bendOf(span: Curve): number {
  const ax = 6 * (span.x1 - span.x0) - 4 * span.mx0 - 2 * span.mx1;
  const ay = 6 * (span.y1 - span.y0) - 4 * span.my0 - 2 * span.my1;
  const bx = 6 * (span.x0 - span.x1) + 2 * span.mx0 + 4 * span.mx1;
  const by = 6 * (span.y0 - span.y1) + 2 * span.my0 + 4 * span.my1;
  return Math.max(Math.hypot(ax, ay), Math.hypot(bx, by));
}

/**
 * How many straight pieces a span bending `bend` pixels over its length is
 * cut into, as the shader cuts it: a chord over a share du of the span
 * strays from the curve at most bend du² / 8, so as few as keep that within
 * `tolerance` pixels, from one to `most`.
 */
export function piecesFor(
  bend: number,
  tolerance: number,
  most: number,
): number {
  const k = Math.ceil(Math.sqrt(bend / (8 * tolerance)));
  return Math.min(most, Math.max(1, Number.isFinite(k) ? k : most));
}

/**
 * A straight span into `batch`, as a strobe's flash stamps a rod (decision
 * 91): from (ax, ay) to (bx, by), each end's tangent the chord itself, so
 * that the curve runs along it evenly and bends nowhere, with `light` at both
 * ends and both at the fade clock `fade`, the instant of the flash.
 */
export function pushStraight(
  batch: SpanBatch,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rgb: Rgb,
  light: number,
  fade: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  batch.push(ax, ay, bx, by, dx, dy, dx, dy, rgb, light, light, fade, fade);
}

/** The most a straight piece of a band strays from its curve, in pixels. */
export const PIECE_TOLERANCE = 0.05;

/**
 * The most pieces a span is cut into at `zoom` times nearer than the whole
 * view: few in the whole view, where spans are a few pixels long, and up to
 * sixteen nearer.
 */
export function mostPieces(zoom: number): number {
  return Math.min(16, Math.max(2, Math.ceil(3 * Math.sqrt(zoom))));
}

const VERTEX = `#version 300 es
precision highp float;
layout(location = 1) in vec4 ends;
layout(location = 2) in vec4 tangents;
layout(location = 3) in vec4 tint;
layout(location = 4) in vec2 light;
layout(location = 5) in vec2 clock;
uniform vec2 uHalfView;
uniform vec2 uCenter;
uniform float uScale;
uniform float uRadius;
uniform float uNow;
uniform float uGain;
uniform float uTol;
uniform int uMost;
out float vAcross;
out vec4 vTint;
void main() {
  // the camera's point subtracted before the scale, as the lines do
  // (decision 67), so that a near view keeps the precision of metres
  vec2 p0 = (ends.xy - uCenter) * uScale;
  vec2 p1 = (ends.zw - uCenter) * uScale;
  vec2 m0 = tangents.xy * uScale;
  vec2 m1 = tangents.zw * uScale;
  // the most the curve bends, in pixels, and so how many pieces keep each
  // piece's chord within uTol of the curve (piecesFor)
  vec2 a0 = 6.0 * (p1 - p0) - 4.0 * m0 - 2.0 * m1;
  vec2 a1 = 6.0 * (p0 - p1) + 2.0 * m0 + 4.0 * m1;
  float bend = max(length(a0), length(a1));
  int k = clamp(int(ceil(sqrt(bend / (8.0 * uTol)))), 1, uMost);
  int i = min(gl_VertexID / 2, k);
  float u = float(i) / float(k);
  float u2 = u * u;
  float u3 = u2 * u;
  vec2 p = (2.0 * u3 - 3.0 * u2 + 1.0) * p0 + (u3 - 2.0 * u2 + u) * m0
    + (-2.0 * u3 + 3.0 * u2) * p1 + (u3 - u2) * m1;
  vec2 d = (6.0 * u2 - 6.0 * u) * p0 + (3.0 * u2 - 4.0 * u + 1.0) * m0
    + (-6.0 * u2 + 6.0 * u) * p1 + (3.0 * u2 - 2.0 * u) * m1;
  if (length(d) < 1e-6) d = p1 - p0;
  vec2 t = length(d) > 1e-9 ? normalize(d) : vec2(1.0, 0.0);
  float side = (gl_VertexID % 2 == 0) ? -1.0 : 1.0;
  float r = uRadius + 1.0;
  vAcross = side * r;
  // the light at birth, faded by the half-lives since, as the trails' fade
  // has taken the light drawn then (decision 21): drawn as they come, and
  // drawn again from the window, spans hold the same light
  float faded = exp2(-max(uNow - mix(clock.x, clock.y, u), 0.0));
  vTint = vec4(tint.rgb, mix(light.x, light.y, u) * faded * uGain);
  gl_Position = vec4((p + vec2(-t.y, t.x) * side * r) / uHalfView, 0.0, 1.0);
}`;

// The edge as the lines draw theirs (lines.ts): full within the radius,
// none past it, over a pixel and a fifth.
const FRAGMENT = `#version 300 es
precision highp float;
in float vAcross;
in vec4 vTint;
uniform float uRadius;
out vec4 color;
void main() {
  float cover = 1.0 - smoothstep(uRadius - 0.6, uRadius + 0.6, abs(vAcross));
  color = vec4(vTint.rgb * (vTint.a * cover), 0.0);
}`;

function compile(
  gl: WebGL2RenderingContext,
  type: GLenum,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error("WebGL2 could not create a shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    throw new Error(
      `a curve shader did not compile: ${String(gl.getShaderInfoLog(shader))}`,
    );
  }
  return shader;
}

/** How spans are drawn into a target that sees `view`. */
export interface SpanStyle {
  /** Half the width of the band, in the target's pixels. */
  readonly radius: number;
  /** The fade clock now, in half-lives, from which each span's light is faded by its age. */
  readonly now: number;
  /** What the light is multiplied by: one over the k the target's light is kept divided by. */
  readonly gain: number;
  /** The most pieces a span is cut into (mostPieces). */
  readonly most: number;
}

const UNIFORMS = [
  "uHalfView",
  "uCenter",
  "uScale",
  "uRadius",
  "uNow",
  "uGain",
  "uTol",
  "uMost",
];

/** Draws spans as bands, adding their light to the target bound. */
export class SpanLines {
  readonly #gl: WebGL2RenderingContext;
  readonly #program: WebGLProgram;
  readonly #at: Readonly<Record<string, WebGLUniformLocation | null>>;
  readonly #vao: WebGLVertexArrayObject;
  readonly #own: WebGLBuffer;
  #most = 1;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      throw new Error(
        `the curve program did not link: ${String(gl.getProgramInfoLog(program))}`,
      );
    }
    this.#program = program;
    this.#at = Object.fromEntries(
      UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
    );
    this.#own = gl.createBuffer();
    this.#vao = gl.createVertexArray();
    gl.bindVertexArray(this.#vao);
    for (const at of [1, 2, 3, 4, 5]) {
      gl.enableVertexAttribArray(at);
      gl.vertexAttribDivisor(at, 1);
    }
    gl.bindVertexArray(null);
  }

  /** Sets the program, the view and the style; then from() and batch() draw spans, and end() lets go. */
  begin(view: View, style: SpanStyle): void {
    const gl = this.#gl;
    const at = this.#at;
    gl.useProgram(this.#program);
    gl.uniform2f(at.uHalfView ?? null, view.width / 2, view.height / 2);
    gl.uniform2f(at.uCenter ?? null, view.cx, view.cy);
    gl.uniform1f(at.uScale ?? null, view.scale);
    gl.uniform1f(at.uRadius ?? null, style.radius);
    gl.uniform1f(at.uNow ?? null, style.now);
    gl.uniform1f(at.uGain ?? null, style.gain);
    gl.uniform1f(at.uTol ?? null, PIECE_TOLERANCE);
    gl.uniform1i(at.uMost ?? null, style.most);
    this.#most = style.most;
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.#vao);
  }

  /** Draws `count` spans of `buffer` from span `first`. */
  from(buffer: WebGLBuffer, first: number, count: number): void {
    if (count <= 0) return;
    const gl = this.#gl;
    const o = first * SPAN_BYTES;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, SPAN_BYTES, o);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, SPAN_BYTES, o + 16);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, SPAN_BYTES, o + 32);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, SPAN_BYTES, o + 36);
    gl.vertexAttribPointer(5, 2, gl.FLOAT, false, SPAN_BYTES, o + 44);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 2 * (this.#most + 1), count);
  }

  /** Draws a whole batch, sent to the card first. */
  batch(batch: SpanBatch): void {
    if (batch.count === 0) return;
    const gl = this.#gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#own);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      batch.u8.subarray(0, batch.count * SPAN_BYTES),
      gl.STREAM_DRAW,
    );
    this.from(this.#own, 0, batch.count);
  }

  end(): void {
    this.#gl.bindVertexArray(null);
  }
}

// a trail's sample, as the merger keeps it: x, y, vx, vy, t, f, light
const SAMPLE = 7;
// a sample a span skips: x, y, t, f, light
const SKIPPED = 5;

/**
 * Joins each trail's samples into spans (decision 68): a span grows while the
 * curve from its first sample to the newest passes within `tolerance` metres
 * of every sample between, its chord stays within `reach` metres, its colour
 * stays the same, and its light and its fade clock run straight between its
 * ends, up to `most` intervals. Every interval also goes out at once, as a
 * span of its own, to be drawn now. Trails are told apart by an id: a mass of
 * the chain, or a twin.
 */
export class Merger {
  readonly tolerance: number;
  readonly reach: number;
  readonly most: number;
  #cap = 0;
  // whether each trail has a span open, its first sample, its newest, its
  // colour, the samples between and how many intervals it spans
  #open = new Uint8Array(0);
  #a = new Float64Array(0);
  #z = new Float64Array(0);
  #rgb = new Float32Array(0);
  #mid = new Float64Array(0);
  #intervals = new Int32Array(0);

  constructor(
    tolerance = MERGE_TOLERANCE,
    reach = MERGE_REACH,
    most = MERGE_MOST,
  ) {
    this.tolerance = tolerance;
    this.reach = reach;
    this.most = most;
  }

  #grow(id: number): void {
    if (id < this.#cap) return;
    const cap = Math.max(64, 2 * (id + 1));
    const open = new Uint8Array(cap);
    open.set(this.#open);
    this.#open = open;
    const a = new Float64Array(SAMPLE * cap);
    a.set(this.#a);
    this.#a = a;
    const z = new Float64Array(SAMPLE * cap);
    z.set(this.#z);
    this.#z = z;
    const rgb = new Float32Array(3 * cap);
    rgb.set(this.#rgb);
    this.#rgb = rgb;
    const mid = new Float64Array(SKIPPED * this.most * cap);
    mid.set(this.#mid);
    this.#mid = mid;
    const intervals = new Int32Array(cap);
    intervals.set(this.#intervals);
    this.#intervals = intervals;
    this.#cap = cap;
  }

  /** Whether trail `id` has an open span whose newest sample is within `eps` metres of (x, y). */
  continues(id: number, x: number, y: number, eps: number): boolean {
    if (id >= this.#cap || this.#open[id] === 0) return false;
    const o = SAMPLE * id;
    return lengthOf((this.#z[o] ?? 0) - x, (this.#z[o + 1] ?? 0) - y) <= eps;
  }

  /** Ends trail `id`'s open span where it is, into `closed`, and forgets the trail. */
  cut(id: number, closed: SpanBatch): void {
    if (id >= this.#cap || this.#open[id] === 0) return;
    this.#close(id, closed);
    this.#open[id] = 0;
  }

  /**
   * Ends every open span at its newest sample, into `closed`, and opens the
   * next there, so that no span runs across this instant.
   */
  splitAll(closed: SpanBatch): void {
    for (let id = 0; id < this.#cap; id++) {
      if (this.#open[id] !== 1) continue;
      this.#close(id, closed);
      this.#restart(id);
    }
  }

  /** Forgets every open span, closing none. */
  forget(): void {
    this.#open.fill(0);
  }

  /** Each open span, as it is now, into `out`. */
  openSpans(out: SpanBatch): void {
    for (let id = 0; id < this.#cap; id++) {
      if (this.#open[id] === 1) this.#close(id, out);
    }
  }

  /** The span from trail `id`'s first sample to its newest, into `out`, unless it spans no time. */
  #close(id: number, out: SpanBatch): void {
    const a = this.#a;
    const z = this.#z;
    const o = SAMPLE * id;
    const T = (z[o + 4] ?? 0) - (a[o + 4] ?? 0);
    if (T <= 0) return;
    const c = 3 * id;
    out.push(
      a[o] ?? 0,
      a[o + 1] ?? 0,
      z[o] ?? 0,
      z[o + 1] ?? 0,
      (a[o + 2] ?? 0) * T,
      (a[o + 3] ?? 0) * T,
      (z[o + 2] ?? 0) * T,
      (z[o + 3] ?? 0) * T,
      [this.#rgb[c] ?? 0, this.#rgb[c + 1] ?? 0, this.#rgb[c + 2] ?? 0],
      a[o + 6] ?? 0,
      z[o + 6] ?? 0,
      a[o + 5] ?? 0,
      z[o + 5] ?? 0,
    );
  }

  // the curve being tried: its ends and tangents, as Curve lays them out
  readonly #ends = new Float64Array(8);

  /**
   * Whether a sample the span would skip, at (px, py) at time pt with the
   * clock pf and light pl, lies within the tolerance of the curve being
   * tried (#ends), from the span's first sample at `a[o]` over a time `T`
   * to a newest with the clock `f` and `light`, and its light and clock on
   * the straight lines between theirs at the ends.
   */
  #on(
    a: Float64Array,
    o: number,
    T: number,
    f: number,
    light: number,
    px: number,
    py: number,
    pt: number,
    pf: number,
    pl: number,
  ): boolean {
    const u = (pt - (a[o + 4] ?? 0)) / T;
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    const e = this.#ends;
    const hx =
      h00 * (e[0] ?? 0) +
      h10 * (e[4] ?? 0) +
      h01 * (e[2] ?? 0) +
      h11 * (e[6] ?? 0);
    const hy =
      h00 * (e[1] ?? 0) +
      h10 * (e[5] ?? 0) +
      h01 * (e[3] ?? 0) +
      h11 * (e[7] ?? 0);
    if (lengthOf(hx - px, hy - py) > this.tolerance) return false;
    const al = a[o + 6] ?? 0;
    const want = al + (light - al) * u;
    if (
      Math.abs(pl - want) >
      LIGHT_TOLERANCE * Math.max(Math.abs(want), 1e-6)
    ) {
      return false;
    }
    const af = a[o + 5] ?? 0;
    return Math.abs(pf - (af + (f - af) * u)) <= FADE_TOLERANCE;
  }

  /** Trail `id`'s next span begins at its newest sample. */
  #restart(id: number): void {
    const o = SAMPLE * id;
    for (let k = 0; k < SAMPLE; k++) this.#a[o + k] = this.#z[o + k] ?? 0;
    this.#intervals[id] = 0;
  }

  /**
   * Trail `id`'s next sample: at (x, y), moving at (vx, vy) metres a second,
   * at `t` seconds of the motion and `f` half-lives of the fade, with
   * `light`, in `color`. The interval since its last sample goes into
   * `fresh`, and a span it ends into `closed`.
   */
  sample(
    id: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    t: number,
    f: number,
    light: number,
    color: Rgb,
    fresh: SpanBatch,
    closed: SpanBatch,
  ): void {
    this.#grow(id);
    const a = this.#a;
    const z = this.#z;
    const o = SAMPLE * id;
    const c = 3 * id;
    if (this.#open[id] === 0) {
      setSample(a, o, x, y, vx, vy, t, f, light);
      setSample(z, o, x, y, vx, vy, t, f, light);
      this.#rgb[c] = color[0];
      this.#rgb[c + 1] = color[1];
      this.#rgb[c + 2] = color[2];
      this.#intervals[id] = 0;
      this.#open[id] = 1;
      return;
    }
    const zx = z[o] ?? 0;
    const zy = z[o + 1] ?? 0;
    const zt = z[o + 4] ?? 0;
    const dt = t - zt;
    if (dt <= 0) return;
    // the interval since the last sample, drawn now
    fresh.push(
      zx,
      zy,
      x,
      y,
      (z[o + 2] ?? 0) * dt,
      (z[o + 3] ?? 0) * dt,
      vx * dt,
      vy * dt,
      color,
      z[o + 6] ?? 0,
      light,
      z[o + 5] ?? 0,
      f,
    );
    const intervals = this.#intervals[id] ?? 0;
    const sameColour =
      this.#rgb[c] === Math.fround(color[0]) &&
      this.#rgb[c + 1] === Math.fround(color[1]) &&
      this.#rgb[c + 2] === Math.fround(color[2]);
    let fits =
      sameColour &&
      intervals < this.most &&
      lengthOf(x - (a[o] ?? 0), y - (a[o + 1] ?? 0)) <= this.reach;
    if (fits && intervals > 0) {
      // the curve from the span's first sample to this one, against the
      // samples between: the newest so far, and those it skipped already
      const T = t - (a[o + 4] ?? 0);
      this.#ends[0] = a[o] ?? 0;
      this.#ends[1] = a[o + 1] ?? 0;
      this.#ends[2] = x;
      this.#ends[3] = y;
      this.#ends[4] = (a[o + 2] ?? 0) * T;
      this.#ends[5] = (a[o + 3] ?? 0) * T;
      this.#ends[6] = vx * T;
      this.#ends[7] = vy * T;
      fits = this.#on(
        a,
        o,
        T,
        f,
        light,
        zx,
        zy,
        zt,
        z[o + 5] ?? 0,
        z[o + 6] ?? 0,
      );
      const m = this.#mid;
      const base = SKIPPED * this.most * id;
      for (let i = 0; fits && i < intervals - 1; i++) {
        const q = base + SKIPPED * i;
        fits = this.#on(
          a,
          o,
          T,
          f,
          light,
          m[q] ?? 0,
          m[q + 1] ?? 0,
          m[q + 2] ?? 0,
          m[q + 3] ?? 0,
          m[q + 4] ?? 0,
        );
      }
    }
    if (fits) {
      // the newest sample so far becomes one the span skips, unless it is
      // the span's first
      if (intervals > 0) {
        const q = SKIPPED * this.most * id + SKIPPED * (intervals - 1);
        const m = this.#mid;
        m[q] = zx;
        m[q + 1] = zy;
        m[q + 2] = zt;
        m[q + 3] = z[o + 5] ?? 0;
        m[q + 4] = z[o + 6] ?? 0;
      }
      this.#intervals[id] = intervals + 1;
      setSample(z, o, x, y, vx, vy, t, f, light);
      return;
    }
    // the span ends at the newest sample so far, and the next begins there
    this.#close(id, closed);
    this.#restart(id);
    this.#rgb[c] = color[0];
    this.#rgb[c + 1] = color[1];
    this.#rgb[c + 2] = color[2];
    this.#intervals[id] = 1;
    setSample(z, o, x, y, vx, vy, t, f, light);
  }
}

function setSample(
  to: Float64Array,
  o: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  t: number,
  f: number,
  light: number,
): void {
  to[o] = x;
  to[o + 1] = y;
  to[o + 2] = vx;
  to[o + 3] = vy;
  to[o + 4] = t;
  to[o + 5] = f;
  to[o + 6] = light;
}
