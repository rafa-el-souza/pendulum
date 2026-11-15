// Line segments on bare WebGL2 (docs/decisions.md, decision 6), drawn as light
// added to the canvas. Each segment is an instanced quad, anti-aliased by the
// distance of each pixel to the segment. Ends are round, or cut so that
// segments laid end to end add up to one even line however short they are,
// for chains whose rods are shorter than a pixel. A soft glow can surround
// the few lines that should stand out.

import type { Rgb } from "./color.ts";

const VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 seg;
layout(location = 2) in vec4 tint;
uniform vec2 uHalfView;
uniform float uScale;
uniform float uRadius;
uniform float uCaps;
uniform float uHalo;
out vec2 vP;
out vec2 vA;
out vec2 vB;
out vec4 vTint;
void main() {
  vec2 a = seg.xy * uScale;
  vec2 b = seg.zw * uScale;
  vec2 d = b - a;
  float len = length(d);
  vec2 t = len > 1e-5 ? d / len : vec2(1.0, 0.0);
  vec2 across = vec2(-t.y, t.x);
  float r = max(uRadius + 1.0, 3.0 * uHalo);
  // round ends reach a radius past the segment; cut ends, half a pixel
  float past = uCaps > 0.5 ? r : 0.5;
  vec2 p = mix(a, b, corner.x * 0.5 + 0.5) + t * (corner.x * past) + across * (corner.y * r);
  vP = p;
  vA = a;
  vB = b;
  vTint = tint;
  gl_Position = vec4(p / uHalfView, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vP;
in vec2 vA;
in vec2 vB;
in vec4 vTint;
uniform float uRadius;
uniform float uCaps;
uniform float uHalo;
uniform float uHaloGain;
out vec4 color;
void main() {
  vec2 pa = vP - vA;
  vec2 ba = vB - vA;
  float len = length(ba);
  float along = len > 1e-5 ? dot(pa, ba) / len : pa.x;
  float d;
  float share = 1.0;
  if (uCaps > 0.5) {
    d = length(pa - ba * clamp(along / max(len, 1e-5), 0.0, 1.0));
  } else {
    // Cut ends: the distance is to the line, and each pixel takes the share
    // of itself that lies along this segment. Segments end to end sum to one.
    d = len > 1e-5 ? abs(pa.x * ba.y - pa.y * ba.x) / len : abs(pa.y);
    share = clamp(along + 0.5, 0.0, 1.0) - clamp(along - len + 0.5, 0.0, 1.0);
  }
  float cover = 1.0 - smoothstep(uRadius - 0.6, uRadius + 0.6, d);
  // the glow reaches zero before the edge of the quad, at three spreads
  if (uHalo > 0.0) {
    cover += uHaloGain * exp(-0.5 * d * d / (uHalo * uHalo)) * (1.0 - smoothstep(2.0 * uHalo, 3.0 * uHalo, d));
  }
  // Light is added, so the alpha written is zero: the canvas stays opaque.
  color = vec4(vTint.rgb * (vTint.a * cover * share), 0.0);
}`;

/** How segments are drawn. Lengths are in device pixels. */
export interface LineStyle {
  /** Half the width of the line. */
  readonly radius: number;
  /** Round ends; otherwise ends cut flat, for segments laid end to end. */
  readonly roundEnds: boolean;
  /** The spread of a glow around the line, or 0 for none. */
  readonly halo?: number;
  /** How bright the glow is at the line, as a share of the line's own light. */
  readonly haloGain?: number;
}

/** Segments to draw, eight floats each: ax, ay, bx, by in metres, then red, green, blue and an intensity. */
export class SegmentBatch {
  #data: Float32Array;
  count = 0;

  constructor(capacity = 64) {
    this.#data = new Float32Array(Math.max(1, capacity) * 8);
  }

  get data(): Float32Array {
    return this.#data;
  }

  clear(): void {
    this.count = 0;
  }

  push(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    color: Rgb,
    intensity: number,
  ): void {
    if ((this.count + 1) * 8 > this.#data.length) {
      const grown = new Float32Array(this.#data.length * 2);
      grown.set(this.#data);
      this.#data = grown;
    }
    const d = this.#data;
    const o = this.count * 8;
    d[o] = ax;
    d[o + 1] = ay;
    d[o + 2] = bx;
    d[o + 3] = by;
    d[o + 4] = color[0];
    d[o + 5] = color[1];
    d[o + 6] = color[2];
    d[o + 7] = intensity;
    this.count++;
  }
}

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
      `a shader did not compile: ${String(gl.getShaderInfoLog(shader))}`,
    );
  }
  return shader;
}

/** Draws batches of segments, with the pivot at the centre of the canvas. */
export class Lines {
  readonly #gl: WebGL2RenderingContext;
  readonly #program: WebGLProgram;
  readonly #vao: WebGLVertexArrayObject;
  readonly #instances: WebGLBuffer;
  readonly #at: Record<string, WebGLUniformLocation | null>;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      throw new Error(
        `the line program did not link: ${String(gl.getProgramInfoLog(program))}`,
      );
    }
    this.#program = program;
    this.#at = Object.fromEntries(
      ["uHalfView", "uScale", "uRadius", "uCaps", "uHalo", "uHaloGain"].map(
        (name) => [name, gl.getUniformLocation(program, name)],
      ),
    );

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    this.#instances = gl.createBuffer();
    this.#vao = gl.createVertexArray();
    gl.bindVertexArray(this.#vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#instances);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
  }

  /** Clears the whole canvas to an opaque color, and sets the viewport to it. */
  clear(ground: Rgb): void {
    const gl = this.#gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(ground[0], ground[1], ground[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Adds the batch's light to the canvas; `scale` is device pixels per metre. */
  draw(batch: SegmentBatch, scale: number, style: LineStyle): void {
    if (batch.count === 0) return;
    const gl = this.#gl;
    const at = this.#at;
    gl.useProgram(this.#program);
    gl.uniform2f(
      at.uHalfView ?? null,
      gl.drawingBufferWidth / 2,
      gl.drawingBufferHeight / 2,
    );
    gl.uniform1f(at.uScale ?? null, scale);
    gl.uniform1f(at.uRadius ?? null, style.radius);
    gl.uniform1f(at.uCaps ?? null, style.roundEnds ? 1 : 0);
    gl.uniform1f(at.uHalo ?? null, style.halo ?? 0);
    gl.uniform1f(at.uHaloGain ?? null, style.haloGain ?? 0);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.#vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#instances);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      batch.data.subarray(0, batch.count * 8),
      gl.DYNAMIC_DRAW,
    );
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batch.count);
    gl.bindVertexArray(null);
  }
}
