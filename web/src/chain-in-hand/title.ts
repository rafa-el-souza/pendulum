import { markOf } from "../core/code.ts";
import { groundAt } from "../core/grounds.ts";
import { fanPalette } from "../core/palettes.ts";
import type { Parameter, Values } from "../core/parameters.ts";
import { tensionScaleAt } from "../core/tension.ts";
import { SWITCHES, type Saved } from "./address.ts";
import {
  AMPLITUDE,
  BODIES,
  HAND,
  HELD_STEP,
  LEASHED_STEP,
  MARK_STEP,
  MODE,
  PARAMETERS,
  SPREAD,
  TRAIL,
  WHITE,
} from "./parameters.ts";

// The page's title, which names a bookmark (docs/decisions.md, decision 38):
// the piece's name; what differs from how the piece opens, in a few words;
// and for a saved moment, the minute it was saved, where the visitor is, and
// a mark of four letters, so that two bookmarks of one piece read apart, as
// "Pendulum · 8 masses, the Moon · 16 Nov 01:42 · K7QF".

/** A parameter's value in a few words, for a title. */
function words(parameter: Parameter, value: number): string {
  switch (parameter.id) {
    case "n":
      return value === 1 ? "1 mass" : `${String(value)} masses`;
    case "time":
      return `time ×${String(value)}`;
    case "hand":
      return `hand ${String(HAND.values.indexOf(value) + 1)} of ${String(HAND.values.length)}`;
    case "g":
      return value === 0
        ? "no gravity"
        : (BODIES.get(value) ?? `g ${String(value)}`);
    case "tilt":
      if (value === 180) return "gravity up";
      return `gravity ${String(Math.abs(value))}° ${value < 0 ? "left" : "right"}`;
    case "shake":
      return `shaken at ${String(value)} Hz`;
    case "mode":
      return `mode ${String(value)}`;
    case "amplitude":
      return `±${String(value)}°`;
    case "twins":
      return value === 0 ? "no twins" : `${String(value)} twins`;
    case "spread": {
      // a width at the tip, or past it an angle round the pivot (decision 63)
      const shown = SPREAD.show(value);
      return shown.endsWith("°")
        ? `born across ${shown}`
        : `born ${shown} apart`;
    }
    case "fade":
      if (value === HELD_STEP) return "twins held";
      if (value === LEASHED_STEP) return "twins leashed";
      return value === 1 ? "twins that fade" : "twins that stay";
    case "look":
      return "twins as dust";
    case "trail":
      if (value === 0) return "no trails";
      if (value === TRAIL.values.at(-1)) return "trails that stay";
      if (value === MARK_STEP) return "trails that leave a mark";
      return `trails ${String(value)} s`;
    case "style":
      return "trails of a strobe";
    case "ribbon":
      return "trails from every mass";
    case "palette":
      return `${fanPalette(value).name} palette`;
    case "white":
      if (value === 3) return "colours that never whiten";
      return `colours that whiten ${WHITE.show(value)}`;
    case "scale":
      return `${tensionScaleAt(value).name} scale`;
    case "ground":
      return `${groundAt(value).name} ground`;
    default:
      return `${parameter.id} ${String(value)}`;
  }
}

/** A switch that differs from the opening, in a few words. */
const SWITCH_WORDS: Readonly<Record<string, string>> = {
  light: "light out",
  tension: "tension colours",
  sketch: "sketch light",
};

/**
 * What differs from how the piece opens, in a few words each: the controls,
 * in the registry's order, then the switches, then, for a saved moment,
 * whether it was paused and which way time ran. A mode's amplitude counts
 * only in a mode, and with a moment saved, where the chain starts, neither
 * the mode nor its amplitude does.
 */
export function summaryOf(
  values: Values,
  switches: ReadonlyMap<string, boolean>,
  saved: Saved | null,
): string[] {
  const said: string[] = [];
  const inMode = (values.get(MODE.id) ?? MODE.initial) > 0;
  for (const parameter of PARAMETERS) {
    const value = values.get(parameter.id) ?? parameter.initial;
    if (value === parameter.initial) continue;
    if (saved !== null && (parameter === MODE || parameter === AMPLITUDE)) {
      continue;
    }
    if (parameter === AMPLITUDE && !inMode) continue;
    said.push(words(parameter, value));
  }
  for (const { id, initial } of SWITCHES) {
    if ((switches.get(id) ?? initial) !== initial) {
      said.push(SWITCH_WORDS[id] ?? id);
    }
  }
  if (saved?.paused === true) said.push("paused");
  if (saved?.backwards === true) said.push("time backwards");
  return said;
}

/** The minute a moment was saved, as "16 Nov 01:42" where the visitor is, with the year when it is not this one. */
function minuteWords(at: number, now: Date, timeZone?: string): string {
  const parts = (date: Date): Map<string, string> =>
    new Map(
      new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        ...(timeZone === undefined ? {} : { timeZone }),
      })
        .formatToParts(date)
        .map(({ type, value }) => [type, value]),
    );
  const saved = parts(new Date(at));
  const year = saved.get("year") ?? "";
  const thisYear = parts(now).get("year") ?? "";
  const day = `${saved.get("day") ?? ""} ${saved.get("month") ?? ""}`;
  const time = `${saved.get("hour") ?? ""}:${saved.get("minute") ?? ""}`;
  return year === thisYear ? `${day} ${time}` : `${day} ${year} ${time}`;
}

/**
 * The page's title: the piece's name; what differs from the opening; and for
 * a saved moment, the minute it was saved, when it is known, and its mark.
 */
export function titleOf(
  name: string,
  values: Values,
  switches: ReadonlyMap<string, boolean>,
  saved: Saved | null,
  { now = new Date(), timeZone }: { now?: Date; timeZone?: string } = {},
): string {
  const parts = [name];
  const summary = summaryOf(values, switches, saved);
  if (summary.length > 0) parts.push(summary.join(", "));
  if (saved !== null) {
    if (saved.savedAt > 0)
      parts.push(minuteWords(saved.savedAt, now, timeZone));
    parts.push(markOf(saved.state, saved.savedAt));
  }
  return parts.join(" · ");
}
