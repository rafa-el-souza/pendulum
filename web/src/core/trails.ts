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

const SHOW = `#version 300 es
precision highp float;
uniform sampler2D uTrails;
uniform sampler2D uMark;
uniform float uGain;
uniform float uMarkGain;
in vec2 vUv;
out vec4 color;
void main() {
  vec3 sum = texture(uTrails, vUv).rgb * uGain + texture(uMark, vUv).rgb * uMarkGain;
  vec3 light = 1.0 - exp(-sum);
  // Light is added to the canvas, so the alpha written is zero.
  color = vec4(pow(light, vec3(1.0 / 2.2)), 0.0);
}`;

// The trails and the frame's lines together, through the same curve.
const SHOW_WITH_SCENE = `#version 300 es
precision highp float;
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
  vec3 light = 1.0 - exp(-sum);
  color = vec4(pow(light, vec3(1.0 / 2.2)), 0.0);
}`;

/** How much of a trail's light is left after `seconds` of simulated time, with a half-life of `halfLife` seconds; none fades with a half-life without end. */
export function fadeAfter(seconds: number, halfLife: number): number {
  return 0.5 ** (seconds / halfLife);
}

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

  /** Draws into it from now on, over all of it; `fresh` darkens it first. */
  bind(fresh = false): void {
    const gl = this.#gl;
    this.fit();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.viewport(0, 0, this.#width, this.#height);
    if (fresh) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  /** Back to drawing on the canvas. */
  unbind(): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
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
  readonly #quad: WebGLVertexArrayObject;
  readonly #target: LightTarget;
  // the mark: the brightest piece of trail drawn at every point, kept while
  // the trails leave one
  readonly #mark: LightTarget;
  readonly #batch = new FadeBatch();

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#fill = link(gl, FILL, ["uColor"]);
    this.#show = link(gl, SHOW, ["uTrails", "uMark", "uGain", "uMarkGain"]);
    this.#showWithScene = link(gl, SHOW_WITH_SCENE, [
      "uTrails",
      "uScene",
      "uMark",
      "uGain",
      "uSceneGain",
      "uMarkGain",
    ]);
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
    this.#batch.reset();
  }

  /** Darkens the mark alone. */
  clearMark(): void {
    this.#mark.clear();
  }

  /**
   * Fades the light the trails hold to `left` of itself, once the fades
   * asked for take off enough together, and leaves their target bound, so
   * that what is drawn next is added to them. end() goes back to the canvas.
   */
  begin(left: number): void {
    const gl = this.#gl;
    this.#fit();
    this.#target.bind();
    gl.enable(gl.BLEND);
    gl.useProgram(this.#fill.program);
    gl.uniform4f(this.#fill.at.uColor ?? null, 0, 0, 0, 0);
    const now = this.#batch.take(left);
    if (now < 1) {
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ZERO, gl.CONSTANT_COLOR);
      gl.blendColor(now, now, now, now);
      this.#fullscreen();
    }
    if (!this.#target.floating) {
      // Eight bits cannot hold a slow fade: a step off as well, so that old
      // light reaches black instead of staying as a grey film.
      gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform4f(this.#fill.at.uColor ?? null, 1 / 255, 1 / 255, 1 / 255, 0);
      this.#fullscreen();
      gl.blendEquation(gl.FUNC_ADD);
    }
  }

  /**
   * Binds the mark, so that what is drawn next, drawn keeping the brightest
   * (LineStyle.keep), stays in it. end() goes back to the canvas.
   */
  beginMark(): void {
    this.#mark.bind();
  }

  /** Back to drawing on the canvas. */
  end(): void {
    this.#target.unbind();
  }

  /**
   * Adds the trails' light to the canvas, lifted where a target holds eight
   * bits, and with it the light of `scene`, when given, and of the mark,
   * when `marked`, through the same curve.
   */
  show(scene?: LightTarget, marked = false): void {
    const gl = this.#gl;
    this.#fit();
    this.#target.unbind();
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    const { program, at } =
      scene === undefined ? this.#show : this.#showWithScene;
    gl.useProgram(program);
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
    this.#fullscreen();
  }
}
