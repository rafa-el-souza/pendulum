// The meter an address can ask for ("?fps=1", docs/decisions.md, decision
// 68): in a corner, the frames a second over the last half second, and, with
// trails kept as curves, what the last remake of the image cost, the
// mechanism the trails use, and the memory the curves take. It is there to
// measure the trails' mechanisms on a device.

import { cls } from "./css.ts";
import styles from "./meter.module.css";
import type { Mechanism } from "./sharp.ts";

/** The time the frames a second are counted over, in ms. */
const SPAN_MS = 500;

/** The frames a second over the last half second. */
export class FrameRate {
  readonly #times: number[] = [];

  /** A frame drawn at `now`, in ms. */
  frame(now: number): void {
    const times = this.#times;
    times.push(now);
    // the frames of the last half second, and the one before them, so that
    // a frame longer than the span still gives its rate
    while (times.length > 2 && (times[1] ?? now) <= now - SPAN_MS)
      times.shift();
  }

  /** Frames a second over the frames kept; none before two. */
  get perSecond(): number {
    const times = this.#times;
    const first = times[0];
    const last = times[times.length - 1];
    if (times.length < 2 || first === undefined || last === undefined) return 0;
    if (last <= first) return 0;
    return ((times.length - 1) * 1000) / (last - first);
  }
}

/** What the meter shows. */
export interface MeterReading {
  readonly perSecond: number;
  /** The last remake's cost, in ms, the card's work waited for; none yet. */
  readonly remake: number | null;
  readonly mechanism: Mechanism;
  /** The memory the curves take on the card, in MB. */
  readonly megabytes: number;
}

/** The meter's line: the frames a second, and, with curves, the last remake, the mechanism and its memory. */
export function meterText(reading: MeterReading): string {
  const fps = reading.perSecond;
  const frames = `${fps >= 9.95 ? fps.toFixed(0) : fps.toFixed(1)} fps`;
  if (reading.mechanism === "B") return `${frames} · B`;
  const remake =
    reading.remake === null ? "–" : `${reading.remake.toFixed(0)} ms`;
  return `${frames} · remake ${remake} · sharp · ${reading.megabytes.toFixed(0)} MB`;
}

/** The meter on the page, in the top left corner. */
export class Meter {
  readonly #element: HTMLElement;
  readonly rate = new FrameRate();
  #shown = 0;

  constructor(parent: HTMLElement) {
    const element = document.createElement("output");
    element.className = cls(styles, "meter");
    element.setAttribute("aria-label", "Frames a second");
    parent.append(element);
    this.#element = element;
  }

  /** A frame drawn at `now`; the line changes four times a second. */
  frame(now: number, reading: Omit<MeterReading, "perSecond">): void {
    this.rate.frame(now);
    if (now - this.#shown < 250) return;
    this.#shown = now;
    this.#element.textContent = meterText({
      ...reading,
      perSecond: this.rate.perSecond,
    });
  }
}
