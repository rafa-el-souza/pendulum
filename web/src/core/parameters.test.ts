import { describe, expect, it } from "vitest";

import {
  checkParameters,
  initialValues,
  keyAction,
  readAddress,
  readSwitches,
  stepValue,
  writeAddress,
  writeSwitches,
  type Parameter,
  type Switch,
} from "./parameters.ts";

const count: Parameter = {
  id: "n",
  label: "Number of masses",
  values: [1, 2, 4, 8],
  initial: 2,
  keys: { down: ["ArrowDown"], up: ["ArrowUp"] },
  show: (v) => `n = ${String(v)}`,
};
const speed: Parameter = {
  id: "time",
  label: "Speed of time",
  values: [0.5, 1, 2],
  initial: 1,
  keys: { down: ["["], up: ["]"] },
  show: (v) => `×${String(v)}`,
};
const both = [count, speed];

describe("the registry of parameters (decision 10)", () => {
  it("starts every parameter at its initial value", () => {
    expect(initialValues(both)).toEqual(
      new Map([
        ["n", 2],
        ["time", 1],
      ]),
    );
  });

  it("steps along the values and stops at either end", () => {
    expect(stepValue(count, 2, 1)).toBe(4);
    expect(stepValue(count, 2, -1)).toBe(1);
    expect(stepValue(count, 8, 1)).toBe(8);
    expect(stepValue(count, 1, -1)).toBe(1);
  });

  it("steps from a value between two rungs to the next rung that way", () => {
    expect(stepValue(count, 3, 1)).toBe(4);
    expect(stepValue(count, 3, -1)).toBe(2);
  });

  it("comes round from either end to the other when the parameter is cyclic, as a direction is", () => {
    const direction: Parameter = {
      id: "tilt",
      label: "Direction",
      values: [-90, 0, 90, 180],
      initial: 0,
      keys: { down: ["a"], up: ["d"] },
      show: (v) => `${String(v)}°`,
      cyclic: true,
    };
    expect(stepValue(direction, 0, 1)).toBe(90);
    expect(stepValue(direction, 180, 1)).toBe(-90);
    expect(stepValue(direction, -90, -1)).toBe(180);
    expect(stepValue(direction, 0, -1)).toBe(-90);
  });

  it("finds what a key does, and nothing for other keys", () => {
    expect(keyAction(both, { key: "ArrowUp" })).toEqual({
      parameter: count,
      direction: 1,
    });
    expect(keyAction(both, { key: "[" })).toEqual({
      parameter: speed,
      direction: -1,
    });
    expect(keyAction(both, { key: "x" })).toBeNull();
  });

  it("finds what a key held with Shift does by where the key is, so that it is the same on any layout, and what the key does alone otherwise (decision 53)", () => {
    const life: Parameter = {
      id: "fade",
      label: "Life",
      values: [0, 1],
      initial: 0,
      keys: { down: [], up: ["p", "P"] },
      show: String,
      cyclic: true,
    };
    const look: Parameter = {
      id: "look",
      label: "Look",
      values: [0, 1],
      initial: 0,
      keys: { down: [], up: ["Shift+KeyP"] },
      show: String,
      cyclic: true,
    };
    const style: Parameter = {
      id: "style",
      label: "Style",
      values: [0, 1],
      initial: 0,
      keys: { down: ["Shift+Digit7"], up: ["Shift+Digit8"] },
      show: String,
    };
    const all = [life, look, style, count];
    // Shift and P steps the look; P alone, or with caps lock on, the life
    expect(keyAction(all, { key: "P", code: "KeyP", shiftKey: true })).toEqual({
      parameter: look,
      direction: 1,
    });
    expect(keyAction(all, { key: "p", code: "KeyP", shiftKey: false })).toEqual(
      { parameter: life, direction: 1 },
    );
    expect(keyAction(all, { key: "P", code: "KeyP", shiftKey: false })).toEqual(
      { parameter: life, direction: 1 },
    );
    // Shift and 7 or 8, whichever symbol the layout puts on them
    expect(
      keyAction(all, { key: "&", code: "Digit7", shiftKey: true }),
    ).toEqual({ parameter: style, direction: -1 });
    expect(
      keyAction(all, { key: "*", code: "Digit8", shiftKey: true }),
    ).toEqual({ parameter: style, direction: 1 });
    // a key held with Shift that has nothing of its own does what it types
    expect(
      keyAction(all, { key: "ArrowUp", code: "ArrowUp", shiftKey: true }),
    ).toEqual({ parameter: count, direction: 1 });
    expect(
      keyAction(all, { key: "*", code: "NumpadMultiply", shiftKey: false }),
    ).toBeNull();
  });

  it("accepts parameters with distinct ids and keys and an initial value among their values", () => {
    expect(() => {
      checkParameters(both);
    }).not.toThrow();
  });

  it.each<[string, Parameter[]]>([
    ["two parameters with one id", [count, { ...speed, id: "n" }]],
    ["an id that is not lowercase letters", [{ ...count, id: "N2" }]],
    ["values not in increasing order", [{ ...count, values: [1, 4, 2] }]],
    [
      "an initial value that is not one of the values",
      [{ ...count, initial: 3 }],
    ],
    [
      "one key for two things",
      [count, { ...speed, keys: { down: ["ArrowUp"], up: ["]"] } }],
    ],
    ["no values", [{ ...count, values: [] }]],
  ])("refuses %s", (_, parameters) => {
    expect(() => {
      checkParameters(parameters);
    }).toThrow();
  });

  it.each<[string, Switch[]]>([
    ["a switch with a parameter's id", [{ id: "n", initial: false }]],
    [
      "two switches with one id",
      [
        { id: "light", initial: true },
        { id: "light", initial: false },
      ],
    ],
    [
      "a switch whose id is not lowercase letters",
      [{ id: "Light", initial: true }],
    ],
  ])("refuses %s", (_, switches) => {
    expect(() => {
      checkParameters(both, switches);
    }).toThrow();
  });
});

describe("the shareable address", () => {
  it("reads the values it carries", () => {
    expect(readAddress(both, "?n=8&time=0.5")).toEqual(
      new Map([
        ["n", 8],
        ["time", 0.5],
      ]),
    );
  });

  it("keeps the initial value for what it does not carry, or carries wrong", () => {
    expect(readAddress(both, "?n=3&time=fast&other=1")).toEqual(
      new Map([
        ["n", 2],
        ["time", 1],
      ]),
    );
    expect(readAddress(both, "")).toEqual(initialValues(both));
  });

  it("writes only the values that differ from the initial ones, and keeps anything else it carried", () => {
    const values = new Map([
      ["n", 8],
      ["time", 1],
    ]);
    expect(writeAddress(both, values, "")).toBe("?n=8");
    expect(writeAddress(both, values, "?time=2&ref=x")).toBe("?ref=x&n=8");
    expect(writeAddress(both, initialValues(both), "?n=8")).toBe("");
  });

  it("reads back what it writes", () => {
    const values = new Map([
      ["n", 4],
      ["time", 0.5],
    ]);
    expect(readAddress(both, writeAddress(both, values, ""))).toEqual(values);
  });
});

describe("the switches in the shareable address (decision 38)", () => {
  const light: Switch = { id: "light", initial: true };
  const tension: Switch = { id: "tension", initial: false };
  const switches = [light, tension];

  it("reads those it carries, 1 on and 0 off, and keeps the rest as the piece opens", () => {
    expect(readSwitches(switches, "?n=8&light=0&tension=1")).toEqual(
      new Map([
        ["light", false],
        ["tension", true],
      ]),
    );
    expect(readSwitches(switches, "?light=off&tension=")).toEqual(
      new Map([
        ["light", true],
        ["tension", false],
      ]),
    );
  });

  it("writes only those that differ from how the piece opens, after the values, and keeps anything else", () => {
    const off = new Map([
      ["light", false],
      ["tension", false],
    ]);
    expect(writeSwitches(switches, off, "?n=8")).toBe("?n=8&light=0");
    expect(writeSwitches(switches, off, "?tension=1&ref=x")).toBe(
      "?ref=x&light=0",
    );
    const opening = new Map([
      ["light", true],
      ["tension", false],
    ]);
    expect(writeSwitches(switches, opening, "?light=0")).toBe("");
    const both = new Map([
      ["light", true],
      ["tension", true],
    ]);
    expect(readSwitches(switches, writeSwitches(switches, both, ""))).toEqual(
      both,
    );
  });
});
