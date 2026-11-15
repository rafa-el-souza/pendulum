import { cls } from "./css.ts";
import styles from "./stage.module.css";

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Stage {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
}

/**
 * The canvas's drawing buffer for its size on screen: CSS pixels times the
 * device pixel ratio, in whole pixels, at least one by one. A ratio that is not
 * a positive number counts as 1.
 */
export function backingSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): Size {
  const ratio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  return {
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
  };
}

/**
 * Makes the canvas fill the window and draw with WebGL2, keeping its drawing
 * buffer matched to its size on screen. The outcome is on `<html data-webgl>`:
 * "webgl2", or "unavailable" with a notice shown, in which case this returns
 * null and `<html data-webgl-error>` keeps the browser's own reason, when it
 * gave one.
 */
export function mountStage(
  canvas: HTMLCanvasElement,
  notice: HTMLElement,
): Stage | null {
  canvas.className = cls(styles, "stage");
  notice.className = cls(styles, "notice");

  // A browser that refuses the context says why in this event, fired during
  // getContext.
  let refusal = "";
  const onRefusal = (event: Event): void => {
    if (event instanceof WebGLContextEvent) refusal = event.statusMessage;
  };
  canvas.addEventListener("webglcontextcreationerror", onRefusal);
  const gl = canvas.getContext("webgl2", { antialias: true });
  canvas.removeEventListener("webglcontextcreationerror", onRefusal);

  if (gl === null) {
    notice.textContent =
      "This piece draws with WebGL2, which this browser did not provide.";
    notice.hidden = false;
    document.documentElement.dataset.webgl = "unavailable";
    if (refusal !== "") document.documentElement.dataset.webglError = refusal;
    return null;
  }

  const fit = (): void => {
    const { width, height } = backingSize(
      canvas.clientWidth,
      canvas.clientHeight,
      window.devicePixelRatio,
    );
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    // Transparent, so the page's ground color shows until a piece draws.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };
  new ResizeObserver(fit).observe(canvas);
  fit();

  document.documentElement.dataset.webgl = "webgl2";
  return { canvas, gl };
}
