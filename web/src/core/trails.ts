// Trails of light, like a long exposure (docs/decisions.md, decision 21):
// lines drawn into a target of their own, which fades by a factor every frame
// and is added to the canvas through 1 - exp(-x), so that where many trails
// cross the light saturates softly instead of clipping. The target holds half
// floats where the browser can draw into them; elsewhere it holds eight bits,
// which cannot keep a slow fade, so one step is taken off every frame as well
// and the light is lifted when it is shown.

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
uniform float uGain;
in vec2 vUv;
out vec4 color;
void main() {
  vec3 light = 1.0 - exp(-texture(uTrails, vUv).rgb * uGain);
  // Light is added to the canvas, so the alpha written is zero.
  color = vec4(pow(light, vec3(1.0 / 2.2)), 0.0);
}`;

/** How much of a trail's light is left after `seconds` of simulated time, with a half-life of `halfLife` seconds. */
export function fadeAfter(seconds: number, halfLife: number): number {
  return 0.5 ** (seconds / halfLife);
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

/** The trails of a piece, the size of the canvas's drawing buffer. */
export class Trails {
  readonly #gl: WebGL2RenderingContext;
  readonly #fill: Linked;
  readonly #show: Linked;
  readonly #quad: WebGLVertexArrayObject;
  #texture: WebGLTexture | null = null;
  #framebuffer: WebGLFramebuffer | null = null;
  #width = 0;
  #height = 0;
  /** Whether the target holds half floats; otherwise eight bits. */
  floating: boolean;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#fill = link(gl, FILL, ["uColor"]);
    this.#show = link(gl, SHOW, ["uTrails", "uGain"]);
    this.floating = gl.getExtension("EXT_color_buffer_float") !== null;
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

  /** Makes the target the drawing buffer's size; a new target starts dark. */
  #fit(): void {
    const gl = this.#gl;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    if (
      this.#framebuffer !== null &&
      width === this.#width &&
      height === this.#height
    ) {
      return;
    }
    this.#width = width;
    this.#height = height;
    if (this.floating && !this.#make(gl.RGBA16F, gl.HALF_FLOAT)) {
      // the browser lets half floats be read but not drawn into
      this.floating = false;
    }
    if (!this.floating && !this.#make(gl.RGBA8, gl.UNSIGNED_BYTE)) {
      throw new Error("the trails' target could not be drawn into");
    }
    // which one this browser gave, for anyone looking at the page
    document.documentElement.dataset.trails = this.floating
      ? "half-float"
      : "8-bit";
    this.clear();
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

  #fullscreen(): void {
    const gl = this.#gl;
    gl.bindVertexArray(this.#quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /** Darkens every trail at once. */
  clear(): void {
    const gl = this.#gl;
    if (this.#framebuffer === null) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Fades the light the trails hold to `left` of itself, and leaves their
   * target bound, so that what is drawn next is added to them. end() goes
   * back to the canvas.
   */
  begin(left: number): void {
    const gl = this.#gl;
    this.#fit();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.viewport(0, 0, this.#width, this.#height);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ZERO, gl.CONSTANT_COLOR);
    gl.blendColor(left, left, left, left);
    gl.useProgram(this.#fill.program);
    gl.uniform4f(this.#fill.at.uColor ?? null, 0, 0, 0, 0);
    this.#fullscreen();
    if (!this.floating) {
      // Eight bits cannot hold a slow fade: a step off as well, so that old
      // light reaches black instead of staying as a grey film.
      gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform4f(this.#fill.at.uColor ?? null, 1 / 255, 1 / 255, 1 / 255, 0);
      this.#fullscreen();
      gl.blendEquation(gl.FUNC_ADD);
    }
  }

  /** Back to drawing on the canvas. */
  end(): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }

  /** Adds the trails' light to the canvas, lifted where the target holds eight bits. */
  show(): void {
    const gl = this.#gl;
    this.#fit();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.#show.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#texture);
    gl.uniform1i(this.#show.at.uTrails ?? null, 0);
    gl.uniform1f(this.#show.at.uGain ?? null, this.floating ? 1 : 3);
    this.#fullscreen();
  }
}
