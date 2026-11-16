import {
  readCode,
  writeCode,
  type CodeTable,
  type Screen,
} from "../core/code.ts";
import { momentInHash } from "../core/moment.ts";
import {
  initialValues,
  readAddress,
  readSwitches,
  writeAddress,
  writeSwitches,
  type Switch,
  type Values,
} from "../core/parameters.ts";
import { MASSES, PARAMETERS } from "./parameters.ts";

// What the first piece's address carries (docs/decisions.md, decision 38).
// Without a saved moment, the values of its controls and its switches that
// differ from how it opens, readable, as "?n=8&g=1.62&tension=1". With one,
// the whole screen in a code after the "#": every control, every switch,
// whether it was paused and which way time ran, where the shaken pivot was,
// the minute it was saved and the chain's moment. An address of decision 34,
// the values readable and "#moment=…", still opens where it was saved.

/**
 * The piece's switches, as it opens: the light of the twins and the trails
 * (decision 27), the tension's colours (decision 35) and the sketch's light
 * on the whole frame (decision 24).
 */
export const SWITCHES: readonly Switch[] = [
  { id: "light", initial: true },
  { id: "tension", initial: false },
  { id: "sketch", initial: false },
];

/** A moment saved: the chain's, and how the screen around it was. */
export type Saved = Pick<
  Screen,
  "state" | "paused" | "backwards" | "phase" | "savedAt"
>;

/**
 * The code's first version, frozen as published on 2026-11-16: the thirteen
 * controls with every value each had, and the three switches. A change to
 * the registry makes a version 2 beside it, and this one keeps reading the
 * addresses written with it.
 */
const VERSION_1: CodeTable = {
  version: 1,
  controls: [
    {
      id: "n",
      values: [
        1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512,
      ],
    },
    { id: "time", values: [0.1, 0.25, 0.5, 0.8, 0.9, 1, 1.5, 2, 3, 4] },
    { id: "hand", values: [4, 7, 12, 20, 40] },
    { id: "g", values: [0, 0.62, 1.62, 3.71, 9.81, 24.79] },
    {
      id: "tilt",
      values: [
        -165, -150, -135, -120, -105, -90, -75, -60, -45, -30, -15, 0, 15, 30,
        45, 60, 75, 90, 105, 120, 135, 150, 165, 180,
      ],
    },
    { id: "shake", values: [0, 800, 1200, 1600] },
    { id: "mode", values: [0, 1, 2, 3, 4] },
    { id: "amplitude", values: [2, 5, 10, 20, 30, 45, 60, 90, 120, 180] },
    { id: "twins", values: [0, 64, 512, 4096] },
    {
      id: "spread",
      values: [1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1],
    },
    { id: "trail", values: [0, 0.5, 1, 2.5, 10, 600] },
    { id: "ribbon", values: [0, 1] },
    { id: "palette", values: [0, 1, 2, 3, 4] },
  ],
  switches: ["light", "tension", "sketch"],
};

/**
 * The code's second version (decision 41), frozen once published: the
 * palettes added, and the tension's scale and the ground after the light's
 * controls.
 */
const VERSION_2: CodeTable = {
  version: 2,
  controls: [
    ...VERSION_1.controls.filter(({ id }) => id !== "palette"),
    { id: "palette", values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { id: "scale", values: [0, 1, 2, 3] },
    { id: "ground", values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  ],
  switches: ["light", "tension", "sketch"],
};

/** Every version of the code the piece reads, oldest first. */
export const CODES: readonly CodeTable[] = [VERSION_1, VERSION_2];

/** The version the piece writes: the newest. */
export const CODE: CodeTable = VERSION_2;

/** What an address opens: the controls, the switches, and the moment saved, if any. */
export interface Opening {
  readonly values: Map<string, number>;
  readonly switches: Map<string, boolean>;
  readonly saved: Saved | null;
}

/**
 * What the address with this search and this part after the "#" opens: the
 * screen of its code, if the "#" holds one whose moment is of the number of
 * masses it asks for, taking only the values the registry still has; or else
 * the readable values and switches, and a moment of decision 34 if it is of
 * the number of masses they ask for.
 */
export function openingOf(search: string, hash: string): Opening {
  const screen = readCode(CODES, hash.replace(/^#/, ""));
  if (screen !== null) {
    const values = initialValues(PARAMETERS);
    for (const p of PARAMETERS) {
      const value = screen.values.get(p.id);
      if (value !== undefined && p.values.includes(value)) {
        values.set(p.id, value);
      }
    }
    if (screen.state.theta.length === values.get(MASSES.id)) {
      const switches = new Map(
        SWITCHES.map(({ id, initial }) => [
          id,
          screen.switches.get(id) ?? initial,
        ]),
      );
      const { state, paused, backwards, phase, savedAt } = screen;
      return {
        values,
        switches,
        saved: { state, paused, backwards, phase, savedAt },
      };
    }
  }
  const values = readAddress(PARAMETERS, search);
  const switches = readSwitches(SWITCHES, search);
  const state = momentInHash(hash, values.get(MASSES.id) ?? MASSES.initial);
  const saved =
    state === null
      ? null
      : { state, paused: false, backwards: false, phase: 0, savedAt: 0 };
  return { values, switches, saved };
}

/**
 * The address's search or "#" part for this screen: with a moment saved, its
 * code after the "#"; without, the values and switches that differ from the
 * opening, after whatever else `search` carried.
 */
export function addressOf(
  values: Values,
  switches: ReadonlyMap<string, boolean>,
  saved: Saved | null,
  search: string,
): string {
  if (saved !== null) {
    return `#${writeCode(CODE, { values, switches, ...saved })}`;
  }
  return writeSwitches(
    SWITCHES,
    switches,
    writeAddress(PARAMETERS, values, search),
  );
}
