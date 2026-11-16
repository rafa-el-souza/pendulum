// The registry of a piece's parameters (docs/decisions.md, decision 10). Each
// parameter is declared once, and that declaration feeds the control on
// screen, its keys and the shareable address. A parameter steps through a
// list of values, so that every value a visitor can reach is one that was
// chosen and can be written in an address. A cyclic one, such as a direction,
// comes round from either end to the other.

import type { Rgb } from "./color.ts";
import type { Icon } from "./icons.ts";

export interface Parameter {
  /** Its key in the address: lowercase letters. */
  readonly id: string;
  /** What it is, for the control's accessible name and title. */
  readonly label: string;
  /** The values it steps through, in increasing order. */
  readonly values: readonly number[];
  /** The value a visit starts with, one of `values`. */
  readonly initial: number;
  /** The keys (KeyboardEvent.key) that step it down and up. */
  readonly keys: {
    readonly down: readonly string[];
    readonly up: readonly string[];
  };
  /** How the control shows a value. */
  readonly show: (value: number) => string;
  /** What a screen reader says for a value, when what is shown does not read aloud. */
  readonly speak?: (value: number) => string;
  /** An icon shown beside the value, so that the control reads without words. */
  readonly icon?: Icon;
  /**
   * For a parameter that is a direction: the degrees its icon is turned at a
   * value, clockwise on screen.
   */
  readonly iconTurn?: (value: number) => number;
  /** Whether stepping past either end comes round to the other, as a direction does. */
  readonly cyclic?: boolean;
  /**
   * Colours shown as dots in place of the text of `show`, for a parameter
   * whose values are colours; a screen reader still hears the text.
   */
  readonly swatches?: (value: number) => readonly Rgb[];
}

/** A value for every parameter, by id. */
export type Values = ReadonlyMap<string, number>;

/**
 * A switch of a piece, on or off, such as its light: the address carries it
 * when it differs from how the piece opens (decision 38).
 */
export interface Switch {
  /** Its key in the address: lowercase letters, none a parameter's. */
  readonly id: string;
  /** Whether it is on as a visit starts. */
  readonly initial: boolean;
}

const ID = /^[a-z]+$/;

/**
 * Throws unless the ids of the parameters and of the switches are lowercase
 * letters and distinct, the keys are distinct, the values increase, and each
 * initial value is one of them.
 */
export function checkParameters(
  parameters: readonly Parameter[],
  switches: readonly Switch[] = [],
): void {
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const { id } of switches) {
    if (!ID.test(id)) {
      throw new Error(
        `switch id ${JSON.stringify(id)} is not lowercase letters`,
      );
    }
    if (ids.has(id)) throw new Error(`two switches share the id ${id}`);
    ids.add(id);
  }
  for (const p of parameters) {
    if (!ID.test(p.id)) {
      throw new Error(
        `parameter id ${JSON.stringify(p.id)} is not lowercase letters`,
      );
    }
    if (ids.has(p.id)) {
      throw new Error(`two parameters or switches share the id ${p.id}`);
    }
    ids.add(p.id);
    if (p.values.length === 0) throw new Error(`${p.id} has no values`);
    p.values.forEach((v, i) => {
      if (!Number.isFinite(v) || (i > 0 && !(v > (p.values[i - 1] ?? v)))) {
        throw new Error(`the values of ${p.id} must be finite and increasing`);
      }
    });
    if (!p.values.includes(p.initial)) {
      throw new Error(`the initial value of ${p.id} is not one of its values`);
    }
    for (const key of [...p.keys.down, ...p.keys.up]) {
      if (keys.has(key))
        throw new Error(`the key ${JSON.stringify(key)} does two things`);
      keys.add(key);
    }
  }
}

export function initialValues(
  parameters: readonly Parameter[],
): Map<string, number> {
  return new Map(parameters.map((p) => [p.id, p.initial]));
}

/** The next value up (direction 1) or down (-1): at either end, it stays, or comes round if the parameter is cyclic. */
export function stepValue(
  parameter: Parameter,
  value: number,
  direction: 1 | -1,
): number {
  const { values } = parameter;
  const next =
    direction > 0
      ? values.find((v) => v > value)
      : values.findLast((v) => v < value);
  if (next !== undefined) return next;
  if (parameter.cyclic !== true) return value;
  return (direction > 0 ? values[0] : values.at(-1)) ?? value;
}

/** The parameter a key steps, and which way, or null. */
export function keyAction(
  parameters: readonly Parameter[],
  key: string,
): { parameter: Parameter; direction: 1 | -1 } | null {
  for (const parameter of parameters) {
    if (parameter.keys.up.includes(key)) return { parameter, direction: 1 };
    if (parameter.keys.down.includes(key)) return { parameter, direction: -1 };
  }
  return null;
}

/** The values an address carries (a location's search, "?n=8"); anything else takes its initial value. */
export function readAddress(
  parameters: readonly Parameter[],
  search: string,
): Map<string, number> {
  const query = new URLSearchParams(search);
  const values = initialValues(parameters);
  for (const p of parameters) {
    const text = query.get(p.id);
    if (text === null) continue;
    const value = Number(text);
    if (p.values.includes(value)) values.set(p.id, value);
  }
  return values;
}

/**
 * The search part of an address carrying `values`: only those that differ
 * from the initial ones, after whatever else `search` carried. Empty when
 * nothing is left.
 */
export function writeAddress(
  parameters: readonly Parameter[],
  values: Values,
  search: string,
): string {
  const query = new URLSearchParams(search);
  for (const p of parameters) {
    query.delete(p.id);
    const value = values.get(p.id);
    if (value !== undefined && value !== p.initial)
      query.set(p.id, String(value));
  }
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

/** The switches an address's search carries ("?tension=1"), 1 on and 0 off; any other as the piece opens. */
export function readSwitches(
  switches: readonly Switch[],
  search: string,
): Map<string, boolean> {
  const query = new URLSearchParams(search);
  return new Map(
    switches.map(({ id, initial }) => {
      const text = query.get(id);
      return [id, text === "1" ? true : text === "0" ? false : initial];
    }),
  );
}

/**
 * The search part of an address carrying the switches as `on` says: only
 * those that differ from how the piece opens, after whatever else `search`
 * carried. Empty when nothing is left.
 */
export function writeSwitches(
  switches: readonly Switch[],
  on: ReadonlyMap<string, boolean>,
  search: string,
): string {
  const query = new URLSearchParams(search);
  for (const { id, initial } of switches) {
    query.delete(id);
    const value = on.get(id) ?? initial;
    if (value !== initial) query.set(id, value ? "1" : "0");
  }
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}
