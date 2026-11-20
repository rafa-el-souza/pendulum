// Light kept off the canvas. Trails, like a long exposure (docs/decisions.md,
// decision 21): lines drawn into a target of their own, which fades by a
// factor every frame and is added to the canvas through 1 - exp(-x), so that
// where many trails cross the light saturates softly instead of clipping.
// With the sketch's light on the whole frame (decision 24), the frame's lines
// go to a second target and pass through the same curve with the trails.
// Targets hold half floats where the browser can draw into them; elsewhere
// they hold eight bits, which cannot keep a slow fade, so one step is taken
// off every frame as well and the light is lifted when it is shown. A fade
// smaller than half floats can take off waits until, with the next frames',
// it takes off a 256th, so that light never stops fading (decision 42).
// The trails can leave a mark (decision 42): a second target keeps, at every
// point, the brightest piece of trail drawn there, and shows under the
// fading trails after they are gone.
// Dense light can keep its colour (decision 61): the curve then takes the
// brightness from the brightest channel and keeps the colour, and white
// comes in only over more light, or never. The twins' light is then drawn
// into a target of its own and added to the canvas through the same curve.
// The passes over the whole of a target, the fade, the clear and the show,
// can be cut to a region the light is known to stay in (decision 62): what
// they would do outside it changes nothing that is shown.
// When the canvas changes size, the light the targets keep is carried to the
// new view instead of cleared (decision 66): each new pixel reads the old
// target where the old view saw the same point of the world, with the light
// a line drawn there anew would have. Over a run of changes, as a window's
// edge is dragged, the light is held as it was and read from there at every
// change, so that it is resampled once however long the run.

import type { Rgb } from "./color.ts";
import { ViewRuns, carryMap, type Box, type View } from "./view.ts";

const FULL_VERTEX = `#version 300 es
layout(location = 0) in vec2 corner;
out vec2 vUv;
void main() {
  vUv = corner * 0.5 + 0.5;
  gl_Position = vec4(corner, 0.0, 1.0);
}`;

const FILL = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 color;
void main() {
  color = uColor;
}`;

// A target's light read in another view (decision 66): each pixel reads the
// old target where the old view saw the same point of the world (uK and uM,
// as carryMap gives them), and nothing where it did not. The light is
// multiplied by the old scale over the new (uRatio, carriedGain). Where the
// view grows or only slides, the pixel reads the sixteen texels round the
// point, each weighed by catmullRom along each axis, which keeps lines
// sharper than the four of a linear read; where a pixel covers more than one
// of the old target's, it reads the mean over the area it covers, so that
// thin lines are not lost between samples.
const CARRY = `#version 300 es
precision highp float;
uniform sampler2D uFrom;
uniform vec2 uK;
uniform vec2 uM;
uniform float uRatio;
out vec4 color;
void main() {
  vec2 uv = gl_FragCoord.xy * uK + uM;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    color = vec4(0.0);
    return;
  }
  if (uRatio <= 1.0) {
    ivec2 size = textureSize(uFrom, 0);
    vec2 p = uv * vec2(size) - 0.5;
    vec2 base = floor(p);
    vec2 f = p - base;
    vec4 sum = vec4(0.0);
    for (int j = -1; j <= 2; j++) {
      float ty = abs(float(j) - f.y);
      float wy = ty < 1.0 ? (1.5 * ty - 2.5) * ty * ty + 1.0 : ((-0.5 * ty + 2.5) * ty - 4.0) * ty + 2.0;
      for (int i = -1; i <= 2; i++) {
        float tx = abs(float(i) - f.x);
        float wx = tx < 1.0 ? (1.5 * tx - 2.5) * tx * tx + 1.0 : ((-0.5 * tx + 2.5) * tx - 4.0) * tx + 2.0;
        ivec2 at = ivec2(base) + ivec2(i, j);
        if (any(lessThan(at, ivec2(0))) || any(greaterThanEqual(at, size))) continue;
        sum += texelFetch(uFrom, at, 0) * (wx * wy);
      }
    }
    // the curve dips a little below none beside a bright line: no light is less than none
    color = max(sum, vec4(0.0)) * uRatio;
    return;
  }
  int n = int(min(ceil(uRatio), 16.0));
  vec2 step = uK / float(n);
  vec2 start = uv - step * (float(n) - 1.0) * 0.5;
  vec4 sum = vec4(0.0);
  for (int j = 0; j < 16; j++) {
    if (j >= n) break;
    for (int i = 0; i < 16; i++) {
      if (i >= n) break;
      sum += texture(uFrom, start + step * vec2(float(i), float(j)));
    }
  }
  color = sum / float(n * n) * uRatio;
}`;

// The curve, as lightCurve below: with uKeep off, each channel on its own;
// on, the brightest channel's brightness, the colour kept, and white coming
// in at the rate uWhiten, none at 0.
const CURVE = `
uniform float uKeep;
uniform float uWhiten;
vec3 curve(vec3 sum) {
  if (uKeep < 0.5) return 1.0 - exp(-sum);
  float m = max(max(sum.r, sum.g), sum.b);
  if (m <= 0.0) return vec3(0.0);
  float white = 1.0 - exp(-m * uWhiten);
  return mix(sum / m, vec3(1.0), white) * (1.0 - exp(-m));
}`;

const SHOW = `#version 300 es
precision highp float;
${CURVE}
uniform sampler2D uTrails;
uniform sampler2D uMark;
uniform float uGain;
uniform float uMarkGain;
in vec2 vUv;
out vec4 color;
void main() {
  vec3 sum = texture(uTrails, vUv).rgb * uGain + texture(uMark, vUv).rgb * uMarkGain;
  vec3 light = curve(sum);
  // Light is added to the canvas, so the alpha written is zero.
  color = vec4(pow(light, vec3(1.0 / 2.2)), 0.0);
}`;

// The trails and the frame's lines together, through the same curve.
const SHOW_WITH_SCENE = `#version 300 es
precision highp float;
${CURVE}
uniform sampler2D uTrails;
uniform sampler2D uScene;
uniform sampler2D uMark;
uniform float uGain;
uniform float uSceneGain;
uniform float uMarkGain;
in vec2 vUv;
out vec4 color;
void main() {
  vec3 sum = texture(uTrails, vUv).rgb * uGain + texture(uScene, vUv).rgb * uSceneGain + texture(uMark, vUv).rgb * uMarkGain;
  vec3 light = curve(sum);
  color = vec4(pow(light, vec3(1.0 / 2.2)), 0.0);
}`;

// Light drawn off the canvas, as the twins' while their colour is kept, added
// to the canvas through the same curve but without the trails' lift towards
// the light (the power of 1 / 2.2), so that a faint twin looks as it did
// drawn straight on the canvas.
const SHOW_LIGHT = `#version 300 es
precision highp float;
${CURVE}
uniform sampler2D uLight;
in vec2 vUv;
out vec4 color;
void main() {
  color = vec4(curve(texture(uLight, vUv).rgb), 0.0);
}`;

// The trails, and the twins' light beside them, in one pass: the twins'
// without the lift, as SHOW_LIGHT shows it, so that a browser drawing without
// a graphics card takes one pass over the frame instead of two.
const SHOW_WITH_LIGHT = `#version 300 es
precision highp float;
${CURVE}
uniform sampler2D uTrails;
uniform sampler2D uMark;
uniform sampler2D uLight;
uniform float uGain;
uniform float uMarkGain;
in vec2 vUv;
out vec4 color;
void main() {
  vec3 sum = texture(uTrails, vUv).rgb * uGain + texture(uMark, vUv).rgb * uMarkGain;
  vec3 light = pow(curve(sum), vec3(1.0 / 2.2)) + curve(texture(uLight, vUv).rgb);
  color = vec4(light, 0.0);
}`;

/**
 * The curve light goes through to the canvas (decisions 21 and 61), as the
 * shaders' `curve`: with `white` 0, each channel on its own, 1 - e^(-x), so
 * that dense light turns white as each channel fills; otherwise the
 * brightness of the brightest channel, 1 - e^(-m), in the colour of the light
 * added, and white coming in as 1 - e^(-m / white), never with a `white`
 * without end. Faint, light comes out as it went in.
 */
export function lightCurve(sum: Rgb, white: number): Rgb {
  if (white === 0) {
    return [
      1 - Math.exp(-sum[0]),
      1 - Math.exp(-sum[1]),
      1 - Math.exp(-sum[2]),
    ];
  }
  const m = Math.max(sum[0], sum[1], sum[2]);
  if (m <= 0) return [0, 0, 0];
  const whiten = 1 - Math.exp(-m / white);
  const light = 1 - Math.exp(-m);
  const mix = (channel: number): number =>
    (channel / m + whiten * (1 - channel / m)) * light;
  return [mix(sum[0]), mix(sum[1]), mix(sum[2])];
}

/**
 * What the light of a target carried from the view `from` to the view `to`
 * is multiplied by (decision 66): the old scale over the new. A line is
 * drawn as many pixels wide in any view, so a line stretched twice as wide
 * would show twice its light; each pixel holds half of it, and the light
 * per length of line, or per area where it is dense, is what the same
 * trails drawn in the new view hold.
 */
export function carriedGain(from: View, to: View): number {
  return from.scale / to.scale;
}

/**
 * How much a texel weighs in a carried pixel, `t` texels from the point the
 * pixel reads, where the canvas grows or only slides (decision 66): the
 * Catmull-Rom curve, as the shader CARRY takes it for each axis over the
 * four texels round the point. Four weigh to one wherever the point falls;
 * a texel read at its own centre is read as it is; halfway between two, each
 * weighs nine sixteenths and the next ones a sixteenth off, which keeps
 * lines sharper than half of each.
 */
export function catmullRom(t: number): number {
  if (t < 1) return (1.5 * t - 2.5) * t * t + 1;
  if (t < 2) return ((-0.5 * t + 2.5) * t - 4) * t + 2;
  return 0;
}

/** How much of a trail's light is left after `seconds` of simulated time, with a half-life of `halfLife` seconds; none fades with a half-life without end. */
export function fadeAfter(seconds: number, halfLife: number): number {
  return 0.5 ** (seconds / halfLife);
}

/**
 * How many frames the canvas's size stays before a run of changes ends, and
 * the light held as it was before the run is let go (decision 66): half a
 * second at sixty frames a second.
 */
export const SETTLE_FRAMES = 30;

/**
 * How many times larger the canvas's view may grow, from the light held,
 * before the trails are cleared instead of carried (decision 66): carried
 * lines come out wider in proportion, and past a quarter more they read as
 * wide, soft bands beside the new ones.
 */
export const GROWTH_LIMIT = 1.25;

/**
 * The least a fade takes off at once: eight times half a step of a half
 * float's precision, so that rounding never undoes it.
 */
export const FADE_STEP = 1 / 256;

/**
 * Fades asked for frame by frame, passed on once together they take off at
 * least FADE_STEP of the light (decision 42). A half float rounds a fade
 * smaller than half a step of its precision back to the light it had, and
 * light that took off so little every frame stopped fading.
 */
export class FadeBatch {
  /** The fade kept, not yet passed on. */
  pending = 1;

  /** Takes a frame's fade; returns the fade to apply now, 1 for none. */
  take(left: number): number {
    this.pending *= left;
    if (this.pending > 1 - FADE_STEP) return 1;
    const now = this.pending;
    this.pending = 1;
    return now;
  }

  /** Forgets the fade kept, as the light is cleared. */
  reset(): void {
    this.pending = 1;
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

/** The uniforms of the curve, in every program that shows light. */
const CURVE_UNIFORMS = ["uKeep", "uWhiten"];

interface Linked {
  readonly program: WebGLProgram;
  readonly at: Readonly<Record<string, WebGLUniformLocation | null>>;
}

function link(
  gl: WebGL2RenderingContext,
  fragment: string,
  uniforms: readonly string[],
): Linked {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, FULL_VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    throw new Error(
      `a trail program did not link: ${String(gl.getProgramInfoLog(program))}`,
    );
  }
  return {
    program,
    at: Object.fromEntries(
      uniforms.map((name) => [name, gl.getUniformLocation(program, name)]),
    ),
  };
}

/** Cuts what is drawn next to `box`, or lets it reach every pixel when there is none. */
function cutTo(gl: WebGL2RenderingContext, box: Box | null): void {
  if (box === null) {
    gl.disable(gl.SCISSOR_TEST);
    return;
  }
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(box[0], box[1], box[2], box[3]);
}

/** Where light is drawn off the canvas: the size of the canvas's drawing buffer. */
export class LightTarget {
  readonly #gl: WebGL2RenderingContext;
  #texture: WebGLTexture | null = null;
  #framebuffer: WebGLFramebuffer | null = null;
  #width = 0;
  #height = 0;
  /** Whether it holds half floats; otherwise eight bits. */
  floating: boolean;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.floating = gl.getExtension("EXT_color_buffer_float") !== null;
  }

  get texture(): WebGLTexture | null {
    return this.#texture;
  }

  /** How much its light is lifted when shown: eight bits stop at one, which the curve would leave grey. */
  get gain(): number {
    return this.floating ? 1 : 3;
  }

  /** Whether it was ever made. */
  get made(): boolean {
    return this.#framebuffer !== null;
  }

  /** Makes it the drawing buffer's size, dark when new. True when it is new. */
  fit(): boolean {
    const gl = this.#gl;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    if (
      this.#framebuffer !== null &&
      width === this.#width &&
      height === this.#height
    ) {
      return false;
    }
    this.#width = width;
    this.#height = height;
    if (this.floating && !this.#make(gl.RGBA16F, gl.HALF_FLOAT)) {
      // the browser lets half floats be read but not drawn into
      this.floating = false;
    }
    if (!this.floating && !this.#make(gl.RGBA8, gl.UNSIGNED_BYTE)) {
      throw new Error("a target for light could not be drawn into");
    }
    this.clear();
    return true;
  }

  /** A target of this format, bound; false if it cannot be drawn into. */
  #make(format: GLenum, type: GLenum): boolean {
    const gl = this.#gl;
    gl.deleteFramebuffer(this.#framebuffer);
    gl.deleteTexture(this.#texture);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      format,
      this.#width,
      this.#height,
      0,
      gl.RGBA,
      type,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    this.#texture = texture;
    this.#framebuffer = framebuffer;
    return (
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    );
  }

  /**
   * Draws into it from now on, over all of it; `fresh` darkens it first,
   * within `region` when given, where whatever is drawn next stays.
   */
  bind(fresh = false, region: Box | null = null): void {
    const gl = this.#gl;
    // a target made anew is dark all over
    if (this.fit()) region = null;
    this.use();
    if (fresh) {
      cutTo(gl, region);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);
    }
  }

  /** Draws into it from now on, as it is, whatever the drawing buffer's size. */
  use(): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.viewport(0, 0, this.#width, this.#height);
  }

  /** Back to drawing on the canvas. */
  unbind(): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }

  /** Lets go of what it holds; it is made anew if drawn into again. */
  dispose(): void {
    const gl = this.#gl;
    gl.deleteFramebuffer(this.#framebuffer);
    gl.deleteTexture(this.#texture);
    this.#framebuffer = null;
    this.#texture = null;
    this.#width = 0;
    this.#height = 0;
  }

  /** Darkens all of it. */
  clear(): void {
    const gl = this.#gl;
    if (this.#framebuffer === null) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

/** The trails of a piece, the size of the canvas's drawing buffer. */
export class Trails {
  readonly #gl: WebGL2RenderingContext;
  readonly #fill: Linked;
  readonly #show: Linked;
  readonly #showWithScene: Linked;
  readonly #showLight: Linked;
  readonly #showWithLight: Linked;
  readonly #carryPass: Linked;
  readonly #quad: WebGLVertexArrayObject;
  #target: LightTarget;
  // the mark: the brightest piece of trail drawn at every point, kept while
  // the trails leave one
  #mark: LightTarget;
  readonly #batch = new FadeBatch();
  // the view the targets are in, and their light as it was when the view
  // began to change, in the view it was in, while the run lasts (decision 66)
  readonly #runs = new ViewRuns(SETTLE_FRAMES, GROWTH_LIMIT);
  #view: View | null = null;
  #held: LightTarget | null = null;
  #heldMark: LightTarget | null = null;
  #heldView: View | null = null;
  /**
   * Over how much light white comes in, as lightCurve takes it: 0, each
   * channel filling on its own, as the trails always had (decision 61).
   */
  white = 0;
  /**
   * The region every trail and twin stays in, where the fade and the shows
   * are cut (decision 62); none, the whole target.
   */
  region: Box | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#fill = link(gl, FILL, ["uColor"]);
    this.#show = link(gl, SHOW, [
      "uTrails",
      "uMark",
      "uGain",
      "uMarkGain",
      ...CURVE_UNIFORMS,
    ]);
    this.#showWithScene = link(gl, SHOW_WITH_SCENE, [
      "uTrails",
      "uScene",
      "uMark",
      "uGain",
      "uSceneGain",
      "uMarkGain",
      ...CURVE_UNIFORMS,
    ]);
    this.#showLight = link(gl, SHOW_LIGHT, ["uLight", ...CURVE_UNIFORMS]);
    this.#showWithLight = link(gl, SHOW_WITH_LIGHT, [
      "uTrails",
      "uMark",
      "uLight",
      "uGain",
      "uMarkGain",
      ...CURVE_UNIFORMS,
    ]);
    this.#carryPass = link(gl, CARRY, ["uFrom", "uK", "uM", "uRatio"]);
    this.#target = new LightTarget(gl);
    this.#mark = new LightTarget(gl);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    this.#quad = gl.createVertexArray();
    gl.bindVertexArray(this.#quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** Fits the target, saying on the page which kind this browser gave. */
  #fit(): void {
    if (this.#target.fit()) {
      document.documentElement.dataset.trails = this.#target.floating
        ? "half-float"
        : "8-bit";
    }
  }

  /** Sets the curve's uniforms of a program in use to `white`. */
  #curve(at: Linked["at"]): void {
    const gl = this.#gl;
    gl.uniform1f(at.uKeep ?? null, this.white > 0 ? 1 : 0);
    // a white without end comes in at the rate 0: never
    gl.uniform1f(at.uWhiten ?? null, this.white > 0 ? 1 / this.white : 0);
  }

  #fullscreen(): void {
    const gl = this.#gl;
    gl.bindVertexArray(this.#quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /** Darkens every trail at once, and the mark. */
  clear(): void {
    this.#target.clear();
    this.#mark.clear();
    this.#held?.clear();
    this.#heldMark?.clear();
    this.#batch.reset();
  }

  /** Darkens the mark alone. */
  clearMark(): void {
    this.#mark.clear();
    this.#heldMark?.clear();
  }

  /**
   * Takes the view of this frame, the drawing buffer's, before anything is
   * drawn into the trails or shown: when it has changed, the trails and the
   * mark are carried to it, or cleared, when it has grown past GROWTH_LIMIT
   * (decision 66).
   */
  see(view: View): void {
    const step = this.#runs.see(view);
    this.#view = view;
    if (step === null) return;
    if (step.act === "let go" || step.act === "clear") {
      this.#held?.dispose();
      this.#heldMark?.dispose();
      this.#held = null;
      this.#heldMark = null;
      this.#heldView = null;
      if (step.act === "clear") {
        // the targets made anew, dark, at the new size
        this.#fit();
        if (this.#mark.made) this.#mark.fit();
        this.clear();
      }
      return;
    }
    if (step.act === "hold") {
      // the targets as they are become what is held, and new ones take the
      // new view
      if (this.#target.made) {
        this.#held = this.#target;
        this.#target = this.#fresh(this.#held);
      }
      if (this.#mark.made) {
        this.#heldMark = this.#mark;
        this.#mark = this.#fresh(this.#heldMark);
      }
      this.#heldView = step.from;
    }
    if (this.#held !== null) {
      this.#carry(this.#held, step.from, this.#target, view);
    }
    if (this.#heldMark !== null) {
      this.#carry(this.#heldMark, step.from, this.#mark, view);
    }
  }

  /** A new target that holds what `like` holds, half floats or eight bits. */
  #fresh(like: LightTarget): LightTarget {
    const target = new LightTarget(this.#gl);
    target.floating = like.floating;
    return target;
  }

  /** Draws the light of `from`, seen as `fromView`, into `into`, made anew in the drawing buffer's view `to`. */
  #carry(from: LightTarget, fromView: View, into: LightTarget, to: View): void {
    const gl = this.#gl;
    into.bind(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    const { program, at } = this.#carryPass;
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, from.texture);
    // read between texels for the mean over an area, in the old target alone
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(at.uFrom ?? null, 0);
    const [kx, ky, mx, my] = carryMap(fromView, to);
    gl.uniform2f(at.uK ?? null, kx, ky);
    gl.uniform2f(at.uM ?? null, mx, my);
    gl.uniform1f(at.uRatio ?? null, carriedGain(fromView, to));
    this.#fullscreen();
    into.unbind();
  }

  /**
   * Fades `target` by `now` (1, none), within `region` when given; eight
   * bits take a step off as well. Leaves it bound.
   */
  #fade(target: LightTarget, now: number, region: Box | null): void {
    const gl = this.#gl;
    target.use();
    gl.enable(gl.BLEND);
    gl.useProgram(this.#fill.program);
    gl.uniform4f(this.#fill.at.uColor ?? null, 0, 0, 0, 0);
    cutTo(gl, region);
    if (now < 1) {
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ZERO, gl.CONSTANT_COLOR);
      gl.blendColor(now, now, now, now);
      this.#fullscreen();
    }
    if (!target.floating) {
      // Eight bits cannot hold a slow fade: a step off as well, so that old
      // light reaches black instead of staying as a grey film.
      gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform4f(this.#fill.at.uColor ?? null, 1 / 255, 1 / 255, 1 / 255, 0);
      this.#fullscreen();
      gl.blendEquation(gl.FUNC_ADD);
    }
    gl.disable(gl.SCISSOR_TEST);
  }

  /** The view see() took, which every frame takes before it draws. */
  #seen(): View {
    if (this.#view === null) {
      throw new Error("the trails are drawn into before they see a view");
    }
    return this.#view;
  }

  /**
   * Fades the light the trails hold to `left` of itself, once the fades
   * asked for take off enough together, and adds what `draw` draws in the
   * view it is given; while a run of changes of size lasts, into the light
   * held as well, in its own view (decision 66). Back to the canvas after.
   */
  add(left: number, draw: (view: View) => void): void {
    const view = this.#seen();
    this.#fit();
    const now = this.#batch.take(left);
    this.#fade(this.#target, now, this.region);
    draw(view);
    if (this.#held !== null && this.#heldView !== null) {
      // held in another view: all of it
      this.#fade(this.#held, now, null);
      draw(this.#heldView);
    }
    this.#target.unbind();
  }

  /**
   * Adds to the mark what `draw` draws, keeping the brightest
   * (LineStyle.keep), in the view it is given; into the mark held as well
   * while a run of changes of size lasts. Back to the canvas after.
   */
  addMark(draw: (view: View) => void): void {
    const view = this.#seen();
    this.#mark.bind();
    draw(view);
    if (this.#heldMark !== null && this.#heldView !== null) {
      this.#heldMark.use();
      draw(this.#heldView);
    }
    this.#mark.unbind();
  }

  /**
   * Adds the trails' light to the canvas, lifted where a target holds eight
   * bits, and with it the light of `scene`, when given, and of the mark,
   * when `marked`, through the same curve; and, when given, the light of
   * `light` through the curve without the lift, as showLight adds it, in the
   * same pass.
   */
  show(scene?: LightTarget, marked = false, light?: LightTarget): void {
    const gl = this.#gl;
    this.#fit();
    this.#target.unbind();
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    const { program, at } =
      scene !== undefined
        ? this.#showWithScene
        : light !== undefined
          ? this.#showWithLight
          : this.#show;
    gl.useProgram(program);
    if (scene === undefined && light !== undefined) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, light.texture);
      gl.uniform1i(at.uLight ?? null, 1);
    }
    if (scene !== undefined) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, scene.texture);
      gl.uniform1i(at.uScene ?? null, 1);
      gl.uniform1f(at.uSceneGain ?? null, scene.gain);
    }
    // without a mark, the trails stand in for it, at no light
    const mark = marked && this.#mark.texture !== null;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(
      gl.TEXTURE_2D,
      mark ? this.#mark.texture : this.#target.texture,
    );
    gl.uniform1i(at.uMark ?? null, 2);
    gl.uniform1f(at.uMarkGain ?? null, mark ? this.#mark.gain : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#target.texture);
    gl.uniform1i(at.uTrails ?? null, 0);
    gl.uniform1f(at.uGain ?? null, this.#target.gain);
    this.#curve(at);
    cutTo(gl, this.region);
    this.#fullscreen();
    gl.disable(gl.SCISSOR_TEST);
  }

  /**
   * Adds the light of `light`, a target of half floats, to the canvas through
   * the curve, without the trails' lift: the twins' light while dense light
   * keeps its colour (decision 61).
   */
  showLight(light: LightTarget): void {
    const gl = this.#gl;
    light.unbind();
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    const { program, at } = this.#showLight;
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, light.texture);
    gl.uniform1i(at.uLight ?? null, 0);
    this.#curve(at);
    cutTo(gl, this.region);
    this.#fullscreen();
    gl.disable(gl.SCISSOR_TEST);
  }
}
