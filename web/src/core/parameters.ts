// The registry of a piece's parameters (docs/decisions.md, decision 10). Each
// parameter is declared once, and that declaration feeds the control on
// screen, its keys and the shareable address. A parameter steps through a
// list of values, so that every value a visitor can reach is one that was
// chosen and can be written in an address.

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
}

/** A value for every parameter, by id. */
export type Values = ReadonlyMap<string, number>;

const ID = /^[a-z]+$/;

/** Throws unless ids and keys are distinct, values increase, and each initial value is one of them. */
export function checkParameters(parameters: readonly Parameter[]): void {
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const p of parameters) {
    if (!ID.test(p.id)) {
      throw new Error(
        `parameter id ${JSON.stringify(p.id)} is not lowercase letters`,
      );
    }
    if (ids.has(p.id)) throw new Error(`two parameters share the id ${p.id}`);
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

/** The next value up (direction 1) or down (-1), staying at either end. */
export function stepValue(
  parameter: Parameter,
  value: number,
  direction: 1 | -1,
): number {
  const { values } = parameter;
  if (direction > 0) return values.find((v) => v > value) ?? value;
  return values.findLast((v) => v < value) ?? value;
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
