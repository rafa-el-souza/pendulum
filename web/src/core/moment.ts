// A moment of a chain, kept in the page's address (docs/decisions.md,
// decision 34): every rod's angle and rate, as 32-bit floats, seven
// significant digits each, written in base64url after the "#" as
// "moment=…". Copying the address keeps the moment and shares it, and the
// part after the "#" never reaches a server, so a long chain's moment, about
// 5 500 letters with 512 masses, is as safe as a short one's. Since decision
// 38 a saved moment goes into the address inside the code of its whole
// screen (code.ts), in the same bytes; an address of this older kind still
// opens where it was saved.
//
// Each angle is brought within half a turn of zero first: the chain is the
// same, since the rods enter its equations only through the sines and
// cosines of their angles and of their differences, and the seven digits go
// further.

import type { ChainState } from "../physics/step.ts";

/** The key of the moment after the address's "#". */
const KEY = "moment";
const TURN = 2 * Math.PI;

/** Bytes as base64url letters, without padding: the letters an address keeps as they are. */
export function toLetters(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** The bytes that base64url letters hold, or null when they are other letters. */
export function fromLetters(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  let binary: string;
  try {
    binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** A chain's moment as bytes: its angles, each within half a turn of zero, then its rates, as little-endian 32-bit floats. */
export function momentBytes(state: ChainState): Uint8Array {
  const n = state.theta.length;
  const view = new DataView(new ArrayBuffer(8 * n));
  for (let i = 0; i < n; i++) {
    const angle = state.theta[i] ?? Number.NaN;
    view.setFloat32(4 * i, angle - TURN * Math.round(angle / TURN), true);
    view.setFloat32(4 * (n + i), state.omega[i] ?? Number.NaN, true);
  }
  return new Uint8Array(view.buffer);
}

/** The moment that bytes hold, eight to a mass, or null when they hold none or a number is not finite. */
export function momentOf(bytes: Uint8Array): ChainState | null {
  if (bytes.length === 0 || bytes.length % 8 !== 0) return null;
  const n = bytes.length / 8;
  const view = new DataView(Uint8Array.from(bytes).buffer);
  const theta = new Float64Array(n);
  const omega = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    theta[i] = view.getFloat32(4 * i, true);
    omega[i] = view.getFloat32(4 * (n + i), true);
  }
  const finite = theta.every(Number.isFinite) && omega.every(Number.isFinite);
  return finite ? { theta, omega } : null;
}

/** A chain's moment as text: its bytes in base64url. */
export function writeMoment(state: ChainState): string {
  return toLetters(momentBytes(state));
}

/** The moment `text` holds for a chain of n masses, or null when it holds none. */
export function readMoment(text: string, n: number): ChainState | null {
  const bytes = fromLetters(text);
  if (bytes?.length !== 8 * n) return null;
  return momentOf(bytes);
}

/** The moment an address's part after the "#" holds for a chain of n masses, or null. */
export function momentInHash(hash: string, n: number): ChainState | null {
  const text = new URLSearchParams(hash.replace(/^#/, "")).get(KEY);
  return text === null ? null : readMoment(text, n);
}

/**
 * An address's part after the "#" holding the moment `text`, or none when
 * it is null, with whatever else was there; empty when nothing is left.
 */
export function hashWith(hash: string, text: string | null): string {
  const kept = new URLSearchParams(hash.replace(/^#/, ""));
  if (text === null) kept.delete(KEY);
  else kept.set(KEY, text);
  const joined = kept.toString();
  return joined === "" ? "" : `#${joined}`;
}
