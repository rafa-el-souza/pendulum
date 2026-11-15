import { describe, expect, it } from "vitest";

import {
  checkParameters,
  initialValues,
  keyAction,
  readAddress,
  stepValue,
  writeAddress,
  type Parameter,
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
    expect(keyAction(both, "ArrowUp")).toEqual({
      parameter: count,
      direction: 1,
    });
    expect(keyAction(both, "[")).toEqual({ parameter: speed, direction: -1 });
    expect(keyAction(both, "x")).toBeNull();
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
