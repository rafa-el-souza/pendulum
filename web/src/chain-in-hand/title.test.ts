import { describe, expect, it } from "vitest";

import { markOf } from "../core/code.ts";
import { initialValues } from "../core/parameters.ts";
import { SWITCHES, type Saved } from "./address.ts";
import { PARAMETERS } from "./parameters.ts";
import { summaryOf, titleOf } from "./title.ts";

// The page's title, which names a bookmark (docs/decisions.md, decision 38):
// the piece's name, what differs from how it opens, and for a saved moment
// the minute it was saved and a mark of four letters.

function opening() {
  return {
    values: initialValues(PARAMETERS),
    switches: new Map(SWITCHES.map(({ id, initial }) => [id, initial])),
  };
}

const AT = Date.UTC(2026, 10, 16, 1, 42);
const NOW = new Date(Date.UTC(2026, 10, 16, 9, 0));

function moment(changes: Partial<Saved> = {}): Saved {
  return {
    state: { theta: new Float64Array(8).fill(0.5), omega: new Float64Array(8) },
    paused: false,
    backwards: false,
    phase: 0,
    savedAt: AT,
    ...changes,
  };
}

describe("the title of the first piece's page (decision 38)", () => {
  it("is the piece's name alone as the piece opens", () => {
    const { values, switches } = opening();
    expect(titleOf("Pendulum", values, switches, null)).toBe("Pendulum");
  });

  it("names what differs from the opening, in the order of the controls, then the switches", () => {
    const { values, switches } = opening();
    values.set("g", 1.62);
    values.set("n", 8);
    switches.set("tension", true);
    expect(titleOf("Pendulum", values, switches, null)).toBe(
      "Pendulum · 8 masses, the Moon, tension colours",
    );
  });

  it.each<[string, number, string]>([
    ["n", 1, "1 mass"],
    ["n", 512, "512 masses"],
    ["time", 0.25, "time ×0.25"],
    ["hand", 4, "hand 1 of 5"],
    ["g", 0, "no gravity"],
    ["g", 0.62, "Pluto"],
    ["g", 3.71, "Mars"],
    ["g", 24.79, "Jupiter"],
    ["tilt", -30, "gravity 30° left"],
    ["tilt", 90, "gravity 90° right"],
    ["tilt", 180, "gravity up"],
    ["shake", 800, "shaken at 800 Hz"],
    ["mode", 2, "mode 2"],
    ["twins", 0, "no twins"],
    ["twins", 4096, "4096 twins"],
    ["spread", 1e-6, "born 1 µm apart"],
    ["spread", 1.57, "born across 90°"],
    ["spread", 6.28, "born across 360°"],
    ["fade", 0, "twins that stay"],
    ["fade", 3, "twins held"],
    ["fade", 4, "twins leashed"],
    ["look", 1, "twins as dust"],
    ["trail", 0, "no trails"],
    ["trail", 10, "trails 10 s"],
    ["trail", 600, "trails that stay"],
    ["trail", 100, "trails that leave a mark"],
    ["style", 1, "trails of a strobe"],
    ["ribbon", 1, "trails from every mass"],
    ["palette", 1, "fire palette"],
    ["palette", 9, "reef palette"],
    ["white", 0, "colours that whiten at once"],
    ["white", 1, "colours that whiten late"],
    ["white", 3, "colours that never whiten"],
    ["scale", 1, "incandescent scale"],
    ["ground", 2, "navy ground"],
  ])('says %s = %s as "%s"', (id, value, words) => {
    const { values, switches } = opening();
    values.set(id, value);
    expect(summaryOf(values, switches, null)).toEqual([words]);
  });

  it("names how near the twins are held only while they are held or leashed (decision 64)", () => {
    const { values, switches } = opening();
    values.set("hold", 0.3);
    expect(summaryOf(values, switches, null)).toEqual([]);
    values.set("fade", 3);
    expect(summaryOf(values, switches, null)).toEqual([
      "twins held",
      "within 30 cm",
    ]);
    values.set("fade", 4);
    expect(summaryOf(values, switches, null)).toEqual([
      "twins leashed",
      "within 30 cm",
    ]);
  });

  it("names the amplitude only for a mode, and neither the mode nor its amplitude for a moment, where the chain starts instead", () => {
    const { values, switches } = opening();
    values.set("amplitude", 60);
    expect(summaryOf(values, switches, null)).toEqual([]);
    values.set("mode", 1);
    expect(summaryOf(values, switches, null)).toEqual(["mode 1", "±60°"]);
    values.set("n", 8);
    expect(summaryOf(values, switches, moment())).toEqual(["8 masses"]);
  });

  it("names the switches that differ, and for a moment whether it was paused and which way time ran", () => {
    const { values, switches } = opening();
    switches.set("light", false);
    switches.set("sketch", true);
    expect(summaryOf(values, switches, null)).toEqual([
      "light out",
      "sketch light",
    ]);
    values.set("n", 8);
    expect(
      summaryOf(values, switches, moment({ paused: true, backwards: true })),
    ).toEqual([
      "8 masses",
      "light out",
      "sketch light",
      "paused",
      "time backwards",
    ]);
  });

  it("for a saved moment, adds the minute it was saved where the visitor is, and its mark", () => {
    const { values, switches } = opening();
    values.set("n", 8);
    values.set("g", 1.62);
    const saved = moment();
    const mark = markOf(saved.state, saved.savedAt);
    expect(
      titleOf("Pendulum", values, switches, saved, {
        now: NOW,
        timeZone: "UTC",
      }),
    ).toBe(`Pendulum · 8 masses, the Moon · 16 Nov 01:42 · ${mark}`);
    expect(
      titleOf("Pendulum", values, switches, saved, {
        now: NOW,
        timeZone: "America/Sao_Paulo",
      }),
    ).toBe(`Pendulum · 8 masses, the Moon · 15 Nov 22:42 · ${mark}`);
    // in another year, the year too
    expect(
      titleOf("Pendulum", values, switches, saved, {
        now: new Date(Date.UTC(2027, 0, 2)),
        timeZone: "UTC",
      }),
    ).toBe(`Pendulum · 8 masses, the Moon · 16 Nov 2026 01:42 · ${mark}`);
  });

  it("for a moment whose minute is not known, from an address of decision 34, gives the mark alone; for one with nothing else to name, the minute and the mark", () => {
    const { values, switches } = opening();
    values.set("n", 8);
    const old = moment({ savedAt: 0 });
    expect(titleOf("Pendulum", values, switches, old)).toBe(
      `Pendulum · 8 masses · ${markOf(old.state, 0)}`,
    );
    const two = {
      ...moment(),
      state: { theta: Float64Array.of(1, 2), omega: Float64Array.of(0, 0) },
    };
    expect(
      titleOf("Pendulum", opening().values, switches, two, {
        now: NOW,
        timeZone: "UTC",
      }),
    ).toBe(`Pendulum · 16 Nov 01:42 · ${markOf(two.state, AT)}`);
  });
});
