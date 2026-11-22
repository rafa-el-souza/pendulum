// The recorder an address can ask for ("?perf=1", docs/decisions.md, decision
// 94). After a warm-up it records, frame by frame, where the main line's time
// goes, stage by stage; what each of the twins' workers sent back (decision
// 51); the frames' rhythm (decision 52); and, where the browser can tell it,
// the time the graphics card took to draw the frame. Then it saves the record
// as a file on the device: nothing is sent anywhere. It is there to measure
// the piece on a device, before and after a change to how its frames are made.

import { cls } from "./css.ts";
import styles from "./perf.module.css";

/** The stages of a frame the recorder times, in the order they run. */
export const PERF_STAGES = [
  "music",
  "chain",
  "take",
  "draw",
  "draw.see",
  "draw.fan",
  "draw.trails",
  "draw.gl",
  "bear",
  "show",
  "send",
] as const;
export type PerfStage = (typeof PERF_STAGES)[number];

/** Times a frame's stages. */
export interface Stages {
  begin(stage: PerfStage): void;
  end(stage: PerfStage): void;
}

/** The seconds the recorder warms up for, and those it records, unless the address says otherwise. */
export const PERF_WARM = 20;
export const PERF_SPAN = 20;
/** The most seconds the address may ask for, for either. */
const PERF_MOST = 600;

/** The recorder's keys in the address: none of them is carried on. */
const PERF_KEYS = ["perf", "perfwarm", "perfspan", "perflabel"];

/** What the address asks of the recorder. */
export interface PerfAsk {
  /** The seconds before the record begins, and the seconds it lasts. */
  readonly warm: number;
  readonly span: number;
  /** A word for the file's name; none by default. */
  readonly label: string;
}

/**
 * The recorder the address `search` asks for with "perf=1", none otherwise:
 * "perfwarm=" and "perfspan=" set its seconds, "perflabel=" a word for its
 * file.
 */
export function readPerf(search: string): PerfAsk | null {
  const query = new URLSearchParams(search);
  if (query.get("perf") !== "1") return null;
  return {
    warm: secondsIn(query.get("perfwarm"), PERF_WARM, 0),
    span: secondsIn(query.get("perfspan"), PERF_SPAN, Number.MIN_VALUE),
    label: (query.get("perflabel") ?? "")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 40),
  };
}

/** A number of seconds from the address, from `least` to PERF_MOST, or `fallback`. */
function secondsIn(
  text: string | null,
  fallback: number,
  least: number,
): number {
  if (text === null || text.trim() === "") return fallback;
  const value = Number(text);
  return Number.isFinite(value) && value >= least && value <= PERF_MOST
    ? value
    : fallback;
}

/**
 * The address's search part `search` without the recorder's keys, the rest
 * as it was written, so that no link taken from the address carries them.
 */
export function withoutPerf(search: string): string {
  const kept = search
    .replace(/^\?/, "")
    .split("&")
    .filter(
      (part) => part !== "" && !PERF_KEYS.includes(part.split("=")[0] ?? ""),
    );
  return kept.length === 0 ? "" : `?${kept.join("&")}`;
}

/**
 * What the address asks of the recorder, taken out of the address as the
 * page opens, before the piece reads it, as the visits' switch is (decision
 * 84); and the search part as it was, for the record. None when it asks for
 * none.
 */
export function takePerf(): { ask: PerfAsk; search: string } | null {
  const search = location.search;
  const ask = readPerf(search);
  if (ask === null) return null;
  history.replaceState(
    history.state,
    "",
    `${location.pathname}${withoutPerf(search)}${location.hash}`,
  );
  return { ask, search };
}

/** A twins' worker's report as the recorder keeps it. */
export interface ReportSeen {
  readonly share: number;
  /** How long the command took, in ms. */
  readonly spent: number;
  readonly asked: number;
  readonly count: number;
  readonly pieces: number;
}

/** What the piece says of a frame as it ends. */
export interface FrameState {
  /** The seconds of motion the frame drew. */
  readonly simulated: number;
  /** The chain's masses. */
  readonly n: number;
  /** The twins alive, asked for, and that their budget carries. */
  readonly twinsAlive: number;
  readonly twinsAsked: number;
  readonly twinsAffordable: number;
  /** How many shares carry the twins, and whether on the main line (decision 51). */
  readonly shares: number;
  readonly local: boolean;
  /** The time each worker may take, in ms (decision 52). */
  readonly budget: number;
  /** The screen's period, the frames' eased period, in ms, and whether they come late (decision 52). */
  readonly screen: number;
  readonly period: number;
  readonly late: boolean;
  /** The share of the speed asked for that the motion keeps (decision 15). */
  readonly reached: number;
  /** How the trails meet a new view (decision 71). */
  readonly mechanism: string;
  /** The frames a snapshot due has waited for the twins' workers to be in step, since the trails began (decision 97). */
  readonly waited: number;
}

// a frame's numbers, in the order of the record's columns
const STATE_COLUMNS = [
  "simulated",
  "n",
  "alive",
  "asked",
  "affordable",
  "budget",
  "screen",
  "period",
  "late",
  "reached",
  "waited",
] as const;

/**
 * The record: a column per measure and a row per frame, and each frame's
 * reports from the twins' workers as five numbers each (the share, the ms it
 * spent, the twins asked for and those advanced, and the pieces).
 */
export class PerfRecord {
  readonly columns: Record<string, number[]> = {};
  readonly reports: number[][] = [];
  #frames = 0;

  /** The frames recorded. */
  get frames(): number {
    return this.#frames;
  }

  /**
   * A frame drawn at `now`, its callback `total` ms long, each stage's ms in
   * `stages`, what the piece said of it in `state`, and the reports taken in
   * it.
   */
  add(
    now: number,
    total: number,
    stages: Readonly<Record<PerfStage, number>>,
    state: FrameState,
    reports: readonly ReportSeen[],
  ): void {
    this.#push("t", now);
    this.#push("total", total);
    for (const stage of PERF_STAGES) this.#push(stage, stages[stage]);
    // the graphics card answers later, if at all (gpu)
    this.#push("gpu", Number.NaN);
    const numbers: Record<(typeof STATE_COLUMNS)[number], number> = {
      simulated: state.simulated,
      n: state.n,
      alive: state.twinsAlive,
      asked: state.twinsAsked,
      affordable: state.twinsAffordable,
      budget: state.budget,
      screen: state.screen,
      period: state.period,
      late: state.late ? 1 : 0,
      reached: state.reached,
      waited: state.waited,
    };
    for (const column of STATE_COLUMNS) this.#push(column, numbers[column]);
    this.reports.push(
      reports.flatMap((r) => [r.share, r.spent, r.asked, r.count, r.pieces]),
    );
    this.#frames++;
  }

  /** The graphics card's time for frame `frame` of the record, in ms; −1 where its timer was disturbed. */
  gpu(frame: number, ms: number): void {
    const column = this.columns["gpu"];
    if (column !== undefined && frame >= 0 && frame < column.length) {
      column[frame] = ms;
    }
  }

  /** The record as the file keeps it, after `header`. */
  json(header: Readonly<Record<string, unknown>>): string {
    return JSON.stringify({
      header: { ...header, frames: this.#frames },
      columns: this.columns,
      shares: this.reports,
    });
  }

  #push(column: string, value: number): void {
    (this.columns[column] ??= []).push(value);
  }
}

/** The file a record is saved as: its label, if any, and the instant it was saved. */
export function perfFileName(label: string, at: Date): string {
  const stamp = at.toISOString().replace(/[:.]/g, "-");
  return `pendulum-perf-${label === "" ? "" : `${label}-`}${stamp}.json`;
}

// the extension that times the graphics card's work, where there is one
interface GpuTimer {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/**
 * The recorder on the page: a line in a corner says how long it warms up and
 * records, and becomes a link to the file once it is saved. Once it is saved,
 * the window hears a "pendulum-perf" event with the file's name.
 */
export class PerfRecorder implements Stages {
  readonly #ask: PerfAsk;
  readonly #gl: WebGL2RenderingContext;
  readonly #canvas: HTMLCanvasElement;
  readonly #search: string;
  readonly #element: HTMLElement;
  readonly #timer: GpuTimer | null;
  readonly #record = new PerfRecord();
  #state: "warm" | "record" | "done" = "warm";
  #first = Number.NaN;
  #began = 0;
  #shown = Number.NEGATIVE_INFINITY;
  readonly #stages = Object.fromEntries(
    PERF_STAGES.map((stage) => [stage, 0]),
  ) as Record<PerfStage, number>;
  readonly #open = new Map<PerfStage, number>();
  #reports: ReportSeen[] = [];
  #query: WebGLQuery | null = null;
  #queries: { query: WebGLQuery; frame: number }[] = [];
  #last: FrameState | null = null;

  /**
   * A recorder as `ask` says, of the piece drawn by `gl` on `canvas`, its line
   * in `parent`; `search` is the address's search part as the page opened,
   * which the record keeps.
   */
  constructor(
    ask: PerfAsk,
    gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement,
    parent: HTMLElement,
    search: string,
  ) {
    this.#ask = ask;
    this.#gl = gl;
    this.#canvas = canvas;
    this.#search = search;
    this.#timer = gl.getExtension(
      "EXT_disjoint_timer_query_webgl2",
    ) as GpuTimer | null;
    const element = document.createElement("output");
    element.className = cls(styles, "recorder");
    element.setAttribute("aria-label", "Recorder");
    parent.append(element);
    this.#element = element;
  }

  /** A frame begins at `now`, in ms. */
  frameStart(now: number): void {
    if (Number.isNaN(this.#first)) this.#first = now;
    this.#began = performance.now();
    for (const stage of PERF_STAGES) this.#stages[stage] = 0;
    this.#open.clear();
    const seconds = (now - this.#first) / 1000;
    const { warm, span } = this.#ask;
    if (this.#state === "warm" && seconds >= warm) this.#state = "record";
    if (this.#state === "record" && seconds >= warm + span) {
      this.#state = "done";
      this.#finish();
      return;
    }
    if (this.#state !== "done" && now - this.#shown >= 250) {
      this.#shown = now;
      const left =
        this.#state === "warm" ? warm - seconds : warm + span - seconds;
      this.#element.textContent = `perf · ${this.#state === "warm" ? "warming" : "recording"} ${Math.max(0, left).toFixed(0)} s`;
    }
  }

  begin(stage: PerfStage): void {
    this.#open.set(stage, performance.now());
  }

  end(stage: PerfStage): void {
    const at = this.#open.get(stage);
    if (at === undefined) return;
    this.#stages[stage] += performance.now() - at;
    this.#open.delete(stage);
  }

  /** Around the frame's drawing: the graphics card's time for it, where the browser can tell it. */
  gpuBegin(): void {
    const timer = this.#timer;
    if (timer === null || this.#state !== "record") return;
    const query = this.#gl.createQuery();
    this.#gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    this.#query = query;
  }

  gpuEnd(): void {
    const timer = this.#timer;
    if (timer === null || this.#query === null) return;
    this.#gl.endQuery(timer.TIME_ELAPSED_EXT);
    this.#queries.push({ query: this.#query, frame: this.#record.frames });
    this.#query = null;
  }

  /** A report the twins' workers sent back, taken this frame. */
  seen(report: ReportSeen): void {
    if (this.#state === "record") this.#reports.push(report);
  }

  /** The frame drawn at `now` ends, as `state` says. */
  frameEnd(now: number, state: FrameState): void {
    this.#poll();
    this.#last = state;
    if (this.#state !== "record") {
      this.#reports = [];
      return;
    }
    const total = performance.now() - this.#began;
    this.#record.add(now, total, this.#stages, state, this.#reports);
    this.#reports = [];
  }

  /** The graphics card's answers that have come, into the record. */
  #poll(): void {
    const timer = this.#timer;
    if (timer === null || this.#queries.length === 0) return;
    const gl = this.#gl;
    const disturbed = gl.getParameter(timer.GPU_DISJOINT_EXT) === true;
    const waiting: { query: WebGLQuery; frame: number }[] = [];
    for (const asked of this.#queries) {
      const ready = gl.getQueryParameter(
        asked.query,
        gl.QUERY_RESULT_AVAILABLE,
      ) as boolean;
      if (!ready) {
        waiting.push(asked);
        continue;
      }
      const ns = gl.getQueryParameter(asked.query, gl.QUERY_RESULT) as number;
      this.#record.gpu(asked.frame, disturbed ? -1 : ns / 1e6);
      gl.deleteQuery(asked.query);
    }
    this.#queries = waiting;
  }

  /** What the record says of the device and the page it was made on. */
  #header(): Record<string, unknown> {
    const gl = this.#gl;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const last = this.#last;
    return {
      recorder: "pendulum perf recorder (decision 94)",
      search: this.#search,
      label: this.#ask.label,
      date: new Date().toISOString(),
      userAgent: navigator.userAgent,
      cores: navigator.hardwareConcurrency,
      devicePixelRatio,
      screen: [screen.width, screen.height],
      inner: [innerWidth, innerHeight],
      canvas: [this.#canvas.width, this.#canvas.height],
      renderer: gl.getParameter(
        info === null ? gl.RENDERER : info.UNMASKED_RENDERER_WEBGL,
      ) as unknown,
      vendor: gl.getParameter(
        info === null ? gl.VENDOR : info.UNMASKED_VENDOR_WEBGL,
      ) as unknown,
      gpuTimer: this.#timer !== null,
      floatTargets: gl.getExtension("EXT_color_buffer_float") !== null,
      shares: last?.shares ?? null,
      local: last?.local ?? null,
      mechanism: last?.mechanism ?? null,
      warm: this.#ask.warm,
      span: this.#ask.span,
    };
  }

  /** The record saved as a file: at once where the browser lets it, and by its link where it does not. */
  #finish(): void {
    // the graphics card answers a few frames late: a moment for it
    setTimeout(() => {
      this.#poll();
      const name = perfFileName(this.#ask.label, new Date());
      const url = URL.createObjectURL(
        new Blob([this.#record.json(this.#header())], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.title = name;
      link.textContent = `perf · ${String(this.#record.frames)} frames · save`;
      link.className = cls(styles, "saved");
      this.#element.replaceChildren(link);
      link.click();
      dispatchEvent(
        new CustomEvent("pendulum-perf", {
          detail: { name, frames: this.#record.frames },
        }),
      );
    }, 500);
  }
}
