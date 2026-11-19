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
import { FADE, MASSES, PARAMETERS, WHITE } from "./parameters.ts";

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

/**
 * The code's third version (decision 42), frozen once published: the
 * trails' step that leaves a mark, written 100, before the one that stays.
 */
const VERSION_3: CodeTable = {
  version: 3,
  controls: VERSION_2.controls.map((control) =>
    control.id === "trail"
      ? { id: "trail", values: [0, 0.5, 1, 2.5, 10, 100, 600] }
      : control,
  ),
  switches: ["light", "tension", "sketch"],
};

/**
 * The code's fourth version (decision 43), frozen once published: whether the
 * twins fade, after the spread of their birth.
 */
const VERSION_4: CodeTable = {
  version: 4,
  controls: VERSION_3.controls.flatMap((control) =>
    control.id === "spread"
      ? [control, { id: "fade", values: [0, 1] }]
      : [control],
  ),
  switches: ["light", "tension", "sketch"],
};

/**
 * The code's fifth version (decision 50), frozen once published: the trails'
 * step of a strobe, written 50, before the one that leaves a mark; and the
 * twins as dust, after the ones that fade.
 */
const VERSION_5: CodeTable = {
  version: 5,
  controls: VERSION_4.controls.map((control) => {
    if (control.id === "trail") {
      return { id: "trail", values: [0, 0.5, 1, 2.5, 10, 50, 100, 600] };
    }
    if (control.id === "fade") return { id: "fade", values: [0, 1, 2] };
    return control;
  }),
  switches: ["light", "tension", "sketch"],
};

/**
 * The code's sixth version (decision 53), frozen once published: the
 * trails' style apart from how long they last, and the twins' look apart
 * from whether they fade, each after the other.
 */
const VERSION_6: CodeTable = {
  version: 6,
  controls: VERSION_5.controls.flatMap((control) => {
    if (control.id === "trail") {
      return [
        { id: "trail", values: [0, 0.5, 1, 2.5, 10, 100, 600] },
        { id: "style", values: [0, 1] },
      ];
    }
    if (control.id === "fade") {
      return [
        { id: "fade", values: [0, 1] },
        { id: "look", values: [0, 1] },
      ];
    }
    return [control];
  }),
  switches: ["light", "tension", "sketch"],
};

/**
 * The code's seventh version (decision 61), frozen once published: when dense
 * light turns white, after the palette.
 */
const VERSION_7: CodeTable = {
  version: 7,
  controls: VERSION_6.controls.flatMap((control) =>
    control.id === "palette"
      ? [control, { id: "white", values: [0, 1, 2, 3] }]
      : [control],
  ),
  switches: ["light", "tension", "sketch"],
};

/**
 * The code's eighth version (decision 63), frozen once published: the twins
 * born wider apart, round the pivot, after the spreads up to a tenth.
 */
const VERSION_8: CodeTable = {
  version: 8,
  controls: VERSION_7.controls.map((control) =>
    control.id === "spread"
      ? {
          id: "spread",
          values: [...control.values, 0.26, 0.79, 1.57, 3.14, 6.28],
        }
      : control,
  ),
  switches: ["light", "tension", "sketch"],
};

/**
 * The code's ninth version (decision 64), frozen once published: the twins
 * held near the chain and leashed to it, after those that stay and fade.
 */
const VERSION_9: CodeTable = {
  version: 9,
  controls: VERSION_8.controls.map((control) =>
    control.id === "fade" ? { id: "fade", values: [0, 1, 3, 4] } : control,
  ),
  switches: ["light", "tension", "sketch"],
};

/** Every version of the code the piece reads, oldest first. */
export const CODES: readonly CodeTable[] = [
  VERSION_1,
  VERSION_2,
  VERSION_3,
  VERSION_4,
  VERSION_5,
  VERSION_6,
  VERSION_7,
  VERSION_8,
  VERSION_9,
];

/** The version the piece writes: the newest. */
export const CODE: CodeTable = VERSION_9;

/**
 * The trails' step of a strobe and the twins as dust, as the fifth code and
 * the readable addresses before decision 53 wrote them: a strobe's trails
 * then faded over a second.
 */
const STROBE_STEP = "50";
const STROBE_HALF_LIFE = "1";
const DUST_STEP = "2";

/**
 * Values written before decision 53, as the controls are now: the strobe's
 * step of the trails becomes trails of a second drawn by a strobe, and the
 * twins as dust become twins that stay, drawn as dust.
 */
function asNow(written: ReadonlyMap<string, string>): Map<string, string> {
  const now = new Map(written);
  if (now.get("trail") === STROBE_STEP) {
    now.set("trail", STROBE_HALF_LIFE);
    if (!now.has("style")) now.set("style", "1");
  }
  if (now.get("fade") === DUST_STEP) {
    now.set("fade", "0");
    if (!now.has("look")) now.set("look", "1");
  }
  return now;
}

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
    const written = asNow(
      new Map(
        [...screen.values].map(([id, value]) => [id, String(value)] as const),
      ),
    );
    // codes written before the twins could fade (versions 1 to 3) open with
    // the twins that stay, as they were published, though the piece now opens
    // with the twins that fade (decision 58)
    if (!written.has(FADE.id)) written.set(FADE.id, "0");
    // and codes written before the light could keep its colour (versions 1
    // to 6) open with white coming in at once, as they were published, though
    // the piece now opens keeping it (decision 61)
    if (!written.has(WHITE.id)) written.set(WHITE.id, "0");
    const values = initialValues(PARAMETERS);
    for (const p of PARAMETERS) {
      const text = written.get(p.id);
      const value = text === undefined ? undefined : Number(text);
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
  // the first of a name written twice counts, as the readable address reads it
  const query = new Map([...new URLSearchParams(search)].reverse());
  const values = readAddress(
    PARAMETERS,
    `?${new URLSearchParams([...asNow(query)]).toString()}`,
  );
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
