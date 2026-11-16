// A screen of a piece in a few letters after the address's "#"
// (docs/decisions.md, decision 38): the value of every control, every
// switch, whether the piece was paused and which way its time ran, where the
// shaken pivot was in its cycle, the minute the moment was saved, and the
// moment of the chain, in base64url. A control is written as the place of its
// value among the values its table names, in as few bits as they need, so
// that the whole screen but the moment takes about a dozen bytes. The moment
// follows from the next whole byte, in the bytes of decision 34.
//
// The table of each version is frozen once published, so that a code keeps
// opening as the controls change: a control added, or a value, makes a new
// version, and the reader keeps the old tables.

import type { ChainState } from "../physics/step.ts";
import { fromLetters, momentBytes, momentOf, toLetters } from "./moment.ts";

/** What a version of the code holds, and in which order. */
export interface CodeTable {
  /** Written first, in a byte, and found again by it. */
  readonly version: number;
  /** The controls, in order, each with every value it can name, in order. */
  readonly controls: readonly {
    readonly id: string;
    readonly values: readonly number[];
  }[];
  /** The switches, in order. */
  readonly switches: readonly string[];
}

/** A screen of a piece, as a code holds it. */
export interface Screen {
  /** The value of every control of the table, by id. */
  readonly values: ReadonlyMap<string, number>;
  /** Whether every switch of the table is on, by id. */
  readonly switches: ReadonlyMap<string, boolean>;
  /** The chain's moment: every rod's angle and rate. */
  readonly state: ChainState;
  /** Whether the piece was paused. */
  readonly paused: boolean;
  /** Whether its time ran backwards (decision 28). */
  readonly backwards: boolean;
  /** Where the shaken pivot was in its cycle, in radians (decision 36). */
  readonly phase: number;
  /** When the moment was saved, in milliseconds since 1970, to the minute; 0 when that is not known. */
  readonly savedAt: number;
}

const TURN = 2 * Math.PI;
/** The shake's phase is kept to this share of a turn. */
const PHASE_STEPS = 256;
const MINUTE = 60_000;

/** The bits that the place of one of `count` values takes. */
function width(count: number): number {
  return Math.max(1, Math.ceil(Math.log2(count)));
}

/** Bits written from the high end of each byte. */
class BitWriter {
  readonly bytes: number[] = [];
  private used = 0;

  write(value: number, bits: number): void {
    for (let b = bits - 1; b >= 0; b--) {
      if (this.used % 8 === 0) this.bytes.push(0);
      if (Math.floor(value / 2 ** b) % 2 === 1) {
        const last = this.bytes.length - 1;
        this.bytes[last] = (this.bytes[last] ?? 0) | (0x80 >> (this.used % 8));
      }
      this.used++;
    }
  }
}

/** Bits read as BitWriter writes them. */
class BitReader {
  private readonly bytes: Uint8Array;
  private used = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  /** The next `bits` bits as a number, or null past the end. */
  read(bits: number): number | null {
    if (this.used + bits > 8 * this.bytes.length) return null;
    let value = 0;
    for (let b = 0; b < bits; b++) {
      const byte = this.bytes[Math.floor(this.used / 8)] ?? 0;
      value = 2 * value + ((byte >> (7 - (this.used % 8))) & 1);
      this.used++;
    }
    return value;
  }

  /** The bytes after the last one read from. */
  rest(): Uint8Array {
    return this.bytes.subarray(Math.ceil(this.used / 8));
  }
}

/** The minutes since 1970 that `savedAt` falls in, or 0 when it is not known. */
function minuteOf(savedAt: number): number {
  const minute = Math.floor(savedAt / MINUTE);
  return minute > 0 && minute < 2 ** 32 ? minute : 0;
}

/** A screen as a code of the table's version. Throws for a value the table does not name. */
export function writeCode(table: CodeTable, screen: Screen): string {
  const bits = new BitWriter();
  bits.write(table.version, 8);
  for (const { id, values } of table.controls) {
    const value = screen.values.get(id);
    const place = value === undefined ? -1 : values.indexOf(value);
    if (place < 0) {
      throw new Error(
        `the code's version ${String(table.version)} names no value ${String(value)} for ${id}`,
      );
    }
    bits.write(place, width(values.length));
  }
  for (const id of table.switches) {
    bits.write(screen.switches.get(id) === true ? 1 : 0, 1);
  }
  bits.write(screen.paused ? 1 : 0, 1);
  bits.write(screen.backwards ? 1 : 0, 1);
  const turns = (((screen.phase / TURN) % 1) + 1) % 1;
  bits.write(Math.round(turns * PHASE_STEPS) % PHASE_STEPS, 8);
  bits.write(minuteOf(screen.savedAt), 32);
  const moment = momentBytes(screen.state);
  const bytes = new Uint8Array(bits.bytes.length + moment.length);
  bytes.set(bits.bytes);
  bytes.set(moment, bits.bytes.length);
  return toLetters(bytes);
}

/**
 * The screen a code holds, read with the table of its version among
 * `tables`; null when it is no such code, or holds a value its table does
 * not name or a number that is not one.
 */
export function readCode(
  tables: readonly CodeTable[],
  text: string,
): Screen | null {
  const bytes = fromLetters(text);
  const table = tables.find(({ version }) => version === bytes?.[0]);
  if (bytes === null || table === undefined) return null;
  const bits = new BitReader(bytes);
  bits.read(8);
  const values = new Map<string, number>();
  for (const { id, values: named } of table.controls) {
    const place = bits.read(width(named.length));
    const value = place === null ? undefined : named[place];
    if (value === undefined) return null;
    values.set(id, value);
  }
  const switches = new Map<string, boolean>();
  for (const id of table.switches) {
    const on = bits.read(1);
    if (on === null) return null;
    switches.set(id, on === 1);
  }
  const paused = bits.read(1);
  const backwards = bits.read(1);
  const phase = bits.read(8);
  const minute = bits.read(32);
  if (
    paused === null ||
    backwards === null ||
    phase === null ||
    minute === null
  ) {
    return null;
  }
  const state = momentOf(bits.rest());
  if (state === null) return null;
  return {
    values,
    switches,
    state,
    paused: paused === 1,
    backwards: backwards === 1,
    phase: (phase / PHASE_STEPS) * TURN,
    savedAt: minute * MINUTE,
  };
}

/** Letters that read without doubt: no I, L, O or U (Crockford's base 32). */
const MARK_LETTERS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Four letters that tell one saved moment from another: drawn from the
 * moment and the minute it was saved, so that the controls and the switches
 * may change and the mark stays. Two moments share a mark about once in a
 * million.
 */
export function markOf(state: ChainState, savedAt: number): string {
  // FNV-1a over the moment's bytes and the minute's, then mixed as
  // MurmurHash3 finishes, so that every bit of the mark depends on them all
  let hash = 0x811c9dc5;
  const feed = (byte: number): void => {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  };
  momentBytes(state).forEach(feed);
  const minute = minuteOf(savedAt);
  for (let k = 0; k < 4; k++) feed(Math.floor(minute / 256 ** k) % 256);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  let mark = "";
  for (let k = 0; k < 4; k++)
    mark += MARK_LETTERS.charAt((hash >>> (5 * k)) & 31);
  return mark;
}
