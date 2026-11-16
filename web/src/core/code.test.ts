import { describe, expect, it } from "vitest";

import {
  markOf,
  readCode,
  writeCode,
  type CodeTable,
  type Screen,
} from "./code.ts";

// A screen of a piece in a few letters after the "#" (docs/decisions.md,
// decision 38): its controls, its switches and a moment of its chain.

const TABLE: CodeTable = {
  version: 1,
  controls: [
    { id: "n", values: [1, 2, 3, 4, 8, 16, 512] },
    { id: "g", values: [0, 1.62, 9.81] },
    { id: "ribbon", values: [0, 1] },
  ],
  switches: ["light", "tension"],
};

function screen(n: number, changes: Partial<Screen> = {}): Screen {
  return {
    values: new Map([
      ["n", n],
      ["g", 1.62],
      ["ribbon", 1],
    ]),
    switches: new Map([
      ["light", false],
      ["tension", true],
    ]),
    state: {
      theta: Float64Array.from({ length: n }, (_, i) => 0.5 - (2.5 * i) / n),
      omega: Float64Array.from({ length: n }, (_, i) => -3 + 1.5 * i),
    },
    paused: true,
    backwards: false,
    phase: 1,
    savedAt: Date.UTC(2026, 10, 16, 1, 42),
    ...changes,
  };
}

/** Within the rounding of a 32-bit float: seven significant digits. */
function close(found: number, wanted: number): boolean {
  return Math.abs(found - wanted) <= 6e-8 * Math.max(Math.abs(wanted), 1e-30);
}

describe("a screen in a code after the # (decision 38)", () => {
  it("comes back from its code: the controls, the switches, the pause, the way time runs, the shake's phase, when it was saved and the moment", () => {
    for (const n of [1, 2, 8, 512]) {
      const before = screen(n);
      const back = readCode([TABLE], writeCode(TABLE, before));
      expect(back, `n = ${String(n)}`).not.toBeNull();
      expect(back?.values).toEqual(before.values);
      expect(back?.switches).toEqual(before.switches);
      expect(back?.paused).toBe(true);
      expect(back?.backwards).toBe(false);
      expect(back?.savedAt).toBe(before.savedAt);
      expect(back?.state.theta).toHaveLength(n);
      before.state.theta.forEach((angle, i) => {
        expect(close(back?.state.theta[i] ?? Number.NaN, angle)).toBe(true);
      });
      before.state.omega.forEach((rate, i) => {
        expect(close(back?.state.omega[i] ?? Number.NaN, rate)).toBe(true);
      });
    }
    const other = screen(2, {
      paused: false,
      backwards: true,
      switches: new Map([
        ["light", true],
        ["tension", false],
      ]),
    });
    const back = readCode([TABLE], writeCode(TABLE, other));
    expect(back?.paused).toBe(false);
    expect(back?.backwards).toBe(true);
    expect(back?.switches).toEqual(other.switches);
  });

  it("keeps the shake's phase to a 256th of a turn, and the time it was saved to the minute", () => {
    for (const phase of [0, 1, 3, 6.2]) {
      const back = readCode([TABLE], writeCode(TABLE, screen(2, { phase })));
      const turn = 2 * Math.PI;
      const off = Math.abs((back?.phase ?? Number.NaN) - phase);
      expect(Math.min(off, turn - off)).toBeLessThanOrEqual(turn / 512);
    }
    const at = Date.UTC(2026, 10, 16, 1, 42, 37, 120);
    const back = readCode(
      [TABLE],
      writeCode(TABLE, screen(2, { savedAt: at })),
    );
    expect(back?.savedAt).toBe(Date.UTC(2026, 10, 16, 1, 42));
    // a moment whose time is not known, from an address of the old kind
    const unknown = readCode(
      [TABLE],
      writeCode(TABLE, screen(2, { savedAt: 0 })),
    );
    expect(unknown?.savedAt).toBe(0);
  });

  it("is written in the letters an address keeps as they are: a dozen bytes and eight to a mass", () => {
    // version 8 bits, controls 3 + 2 + 1, switches 2, pause and time 2, phase
    // 8, minute 32: 58 bits in 8 bytes, then 16 bytes for two masses
    const two = writeCode(TABLE, screen(2));
    expect(two).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(two).toHaveLength(Math.ceil((4 * (8 + 16)) / 3));
    const many = writeCode(TABLE, screen(512));
    expect(many).toHaveLength(Math.ceil((4 * (8 + 8 * 512)) / 3));
  });

  it("is read with the table of its own version, of those it knows", () => {
    const later: CodeTable = {
      version: 2,
      controls: [{ id: "n", values: [1, 2, 3, 4, 6, 8, 16, 512] }],
      switches: [],
    };
    const first = writeCode(TABLE, screen(3));
    const second = writeCode(later, {
      ...screen(6),
      values: new Map([["n", 6]]),
      switches: new Map(),
    });
    expect(readCode([TABLE, later], first)?.values.get("g")).toBe(1.62);
    expect(readCode([TABLE, later], second)?.values.get("n")).toBe(6);
    expect(readCode([TABLE, later], second)?.values.has("g")).toBe(false);
    expect(readCode([TABLE], second)).toBeNull();
  });

  it("is refused in other letters, cut short, with a value its table lacks, or with a number that is not one", () => {
    const text = writeCode(TABLE, screen(2));
    expect(readCode([TABLE], text)).not.toBeNull();
    expect(readCode([TABLE], "")).toBeNull();
    expect(readCode([TABLE], `${text.slice(0, -1)}*`)).toBeNull();
    expect(readCode([TABLE], "moment=AAAAPwAAAAA")).toBeNull();
    // a code cut in a moment's number, or before the moment
    expect(readCode([TABLE], text.slice(0, -2))).toBeNull();
    expect(readCode([TABLE], text.slice(0, 8))).toBeNull();
    const bytes = Uint8Array.from(
      atob(text.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    // the first control's 3 bits follow the version's 8: 001 (2) becomes 111 (index 7, past the table)
    const past = Uint8Array.from(bytes);
    past[1] = (past[1] ?? 0) | 0b1110_0000;
    const letters = btoa(String.fromCharCode(...past))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(readCode([TABLE], letters)).toBeNull();
    expect(
      readCode(
        [TABLE],
        writeCode(TABLE, {
          ...screen(2),
          state: {
            theta: Float64Array.of(0.1, Number.NaN),
            omega: Float64Array.of(0, 0),
          },
        }),
      ),
    ).toBeNull();
  });

  it("refuses to write a value its table lacks", () => {
    expect(() =>
      writeCode(TABLE, {
        ...screen(2),
        values: new Map([
          ["n", 5],
          ["g", 1.62],
          ["ribbon", 1],
        ]),
      }),
    ).toThrow(/n/);
  });
});

describe("the mark of a saved moment", () => {
  /** The mark of a screen's moment and the minute it was saved. */
  const mark = (of: Screen): string => markOf(of.state, of.savedAt);

  it("is four letters that read without doubt, the same for the same moment and minute, whatever the controls", () => {
    const one = mark(screen(2));
    expect(one).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(mark(screen(2))).toBe(one);
    expect(
      mark(screen(2, { savedAt: Date.UTC(2026, 10, 16, 1, 42, 59) })),
    ).toBe(one);
  });

  it("differs from moment to moment and from minute to minute, as four random letters would", () => {
    const marks = new Set<string>();
    for (let k = 0; k < 400; k++) {
      marks.add(
        mark(
          screen(2, {
            state: {
              theta: Float64Array.of(0.001 * k, 0.5),
              omega: Float64Array.of(0, 0),
            },
          }),
        ),
      );
    }
    // 400 draws from 2^20 marks repeat one with a chance of about 7%
    expect(marks.size).toBeGreaterThanOrEqual(399);
    const at = Date.UTC(2026, 10, 16, 1, 42);
    expect(mark(screen(2, { savedAt: at }))).not.toBe(
      mark(screen(2, { savedAt: at + 60_000 })),
    );
  });
});
