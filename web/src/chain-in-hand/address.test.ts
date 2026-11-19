import { describe, expect, it } from "vitest";

import { readCode, writeCode } from "../core/code.ts";
import { checkParameters, initialValues } from "../core/parameters.ts";
import { writeMoment } from "../core/moment.ts";
import {
  CODE,
  CODES,
  SWITCHES,
  addressOf,
  openingOf,
  type Saved,
} from "./address.ts";
import { PARAMETERS } from "./parameters.ts";

// What the first piece's address carries (docs/decisions.md, decision 38):
// without a saved moment, its values and switches, readable; with one, the
// whole screen in a code after the "#".

function moment(n: number, changes: Partial<Saved> = {}): Saved {
  return {
    state: {
      theta: Float64Array.from({ length: n }, (_, i) => 0.5 - i / n),
      omega: Float64Array.from({ length: n }, (_, i) => 1 - i / n),
    },
    paused: true,
    backwards: true,
    phase: Math.PI / 2,
    savedAt: Date.UTC(2026, 10, 16, 1, 42),
    ...changes,
  };
}

function opening() {
  return {
    values: initialValues(PARAMETERS),
    switches: new Map(SWITCHES.map(({ id, initial }) => [id, initial])),
  };
}

describe("the first piece's address (decision 38)", () => {
  it("has switches whose ids are no parameter's: the light, the tension's colours and the sketch's light", () => {
    expect(() => {
      checkParameters(PARAMETERS, SWITCHES);
    }).not.toThrow();
    expect(SWITCHES).toEqual([
      { id: "light", initial: true },
      { id: "tension", initial: false },
      { id: "sketch", initial: false },
    ]);
  });

  it("writes codes in the newest version, whose table is the registry as it is: a change to the controls asks for a new version", () => {
    expect(CODES.at(-1)).toBe(CODE);
    expect(CODE.controls).toEqual(
      PARAMETERS.map(({ id, values }) => ({ id, values })),
    );
    expect(CODE.switches).toEqual(SWITCHES.map(({ id }) => id));
    expect(new Set(CODES.map(({ version }) => version)).size).toBe(
      CODES.length,
    );
  });

  it("opens a code of version 1 as it was published", () => {
    // 8 masses on the Moon, the tension's colours on, paused, saved at 01:42
    // UTC on 16 November 2026, the chain at rest half a radian out
    const opened = openingOf("", `#${VERSION_1}`);
    expect(opened.values.get("n")).toBe(8);
    expect(opened.values.get("g")).toBe(1.62);
    expect(opened.values.get("time")).toBe(0.8);
    expect(opened.switches.get("tension")).toBe(true);
    expect(opened.switches.get("light")).toBe(true);
    expect(opened.saved?.paused).toBe(true);
    expect(opened.saved?.backwards).toBe(false);
    expect(opened.saved?.savedAt).toBe(Date.UTC(2026, 10, 16, 1, 42));
    expect(opened.saved?.state.theta).toEqual(new Float64Array(8).fill(0.5));
    expect(opened.saved?.state.omega).toEqual(new Float64Array(8));
  });

  it("opens a code of version 1 on the ground and the scale of the tension the piece opens with, and with its palette (decision 41)", () => {
    const opened = openingOf("", `#${VERSION_1}`);
    expect(opened.values.get("ground")).toBe(0);
    expect(opened.values.get("scale")).toBe(0);
    expect(opened.values.get("palette")).toBe(0);
  });

  it("opens a code of version 2 as the published page wrote it (decision 41)", () => {
    // two masses, the neon scale on the rust ground, the tension's colours
    // on, paused, saved at 04:25 UTC on 16 November 2026
    const opened = openingOf("", `#${VERSION_2}`);
    expect(opened.values.get("n")).toBe(2);
    expect(opened.values.get("scale")).toBe(2);
    expect(opened.values.get("ground")).toBe(6);
    expect(opened.values.get("trail")).toBe(2.5);
    expect(opened.switches.get("tension")).toBe(true);
    expect(opened.saved?.paused).toBe(true);
    expect(opened.saved?.savedAt).toBe(Date.UTC(2026, 10, 16, 4, 25));
  });

  it("writes codes that hold the trails' mark (decision 42)", () => {
    const { values, switches } = opening();
    values.set("n", 3);
    values.set("trail", 100);
    const opened = openingOf("", addressOf(values, switches, moment(3), ""));
    expect(opened.values).toEqual(values);
  });

  it("opens a code of version 3 as the published page wrote it, with the twins that stay (decision 43)", () => {
    // three masses, 64 twins born 10⁻⁵ apart, trails that leave a mark, the
    // gold palette on the plum ground, the tension's colours on, paused,
    // saved at 05:22 UTC on 16 November 2026
    const opened = openingOf("", `#${VERSION_3}`);
    expect(opened.values.get("n")).toBe(3);
    expect(opened.values.get("twins")).toBe(64);
    expect(opened.values.get("spread")).toBe(1e-5);
    expect(opened.values.get("trail")).toBe(100);
    expect(opened.values.get("palette")).toBe(6);
    expect(opened.values.get("ground")).toBe(4);
    expect(opened.values.get("fade")).toBe(0);
    expect(opened.switches.get("tension")).toBe(true);
    expect(opened.saved?.paused).toBe(true);
    expect(opened.saved?.savedAt).toBe(Date.UTC(2026, 10, 16, 5, 22));
    expect(opened.saved?.state.theta).toHaveLength(3);
  });

  it("writes codes of version 6, which hold the trails' style apart from how long they last, and the twins' look apart from whether they fade (decision 53)", () => {
    const { values, switches } = opening();
    values.set("n", 3);
    values.set("fade", 1);
    values.set("look", 1);
    values.set("trail", 100);
    values.set("style", 1);
    const opened = openingOf("", addressOf(values, switches, moment(3), ""));
    expect(opened.values).toEqual(values);
  });

  it("opens a code of version 5 as the published page wrote it, its strobe's trails and its dust as the same screen: a strobe's trails of a second, and twins that stay, as dust (decision 53)", () => {
    // 3 masses on the Moon, the twins as dust, the trails of a strobe, paused
    const opened = openingOf("", `#${VERSION_5}`);
    expect(opened.values.get("n")).toBe(3);
    expect(opened.values.get("g")).toBe(1.62);
    expect(opened.values.get("fade")).toBe(0);
    expect(opened.values.get("look")).toBe(1);
    expect(opened.values.get("trail")).toBe(1);
    expect(opened.values.get("style")).toBe(1);
    expect(opened.saved?.paused).toBe(true);
    expect(opened.saved?.savedAt).toBe(Date.UTC(2026, 10, 18, 13, 51));
    expect(opened.saved?.state.theta).toHaveLength(3);
  });

  it("opens a readable address of the published page with the strobe's trails or the twins as dust as the same screen (decision 53)", () => {
    const both = openingOf("?fade=2&trail=50", "").values;
    expect(both.get("fade")).toBe(0);
    expect(both.get("look")).toBe(1);
    expect(both.get("trail")).toBe(1);
    expect(both.get("style")).toBe(1);
    const strobe = openingOf("?trail=50&n=4", "").values;
    expect(strobe.get("trail")).toBe(1);
    expect(strobe.get("style")).toBe(1);
    expect(strobe.get("look")).toBe(0);
    expect(strobe.get("n")).toBe(4);
    const dust = openingOf("?fade=2", "").values;
    expect(dust.get("fade")).toBe(0);
    expect(dust.get("look")).toBe(1);
    expect(dust.get("trail")).toBe(2.5);
    expect(dust.get("style")).toBe(0);
  });

  it("opens a code of version 4 as it was published", () => {
    // 3 masses on the Moon, the twins that fade, the trails that leave a
    // mark, paused
    const opened = openingOf("", `#${VERSION_4}`);
    expect(opened.values.get("n")).toBe(3);
    expect(opened.values.get("g")).toBe(1.62);
    expect(opened.values.get("fade")).toBe(1);
    expect(opened.values.get("trail")).toBe(100);
    expect(opened.saved?.paused).toBe(true);
    expect(opened.saved?.state.theta).toHaveLength(3);
  });

  it("carries the trails' style and the twins' look readable, without a moment", () => {
    const { values, switches } = opening();
    values.set("fade", 0);
    values.set("look", 1);
    values.set("style", 1);
    const address = addressOf(values, switches, null, "");
    expect(address).toBe("?fade=0&look=1&style=1");
    const opened = openingOf(address, "");
    expect(opened.values.get("fade")).toBe(0);
    expect(opened.values.get("look")).toBe(1);
    expect(opened.values.get("style")).toBe(1);
  });

  it("opens with the twins that fade, and carries the twins that stay readable, without a moment (decision 58)", () => {
    const { values, switches } = opening();
    expect(openingOf("", "").values.get("fade")).toBe(1);
    expect(addressOf(values, switches, null, "")).toBe("");
    values.set("fade", 0);
    expect(addressOf(values, switches, null, "")).toBe("?fade=0");
    expect(openingOf("?fade=0", "").values.get("fade")).toBe(0);
    expect(openingOf("?fade=1", "").values.get("fade")).toBe(1);
  });

  it("opens the codes written before the twins could fade with the twins that stay, as they were published (decision 58)", () => {
    for (const table of CODES.filter(
      ({ controls }) => !controls.some(({ id }) => id === "fade"),
    )) {
      const { values, switches } = opening();
      values.set("n", 3);
      const code = writeCode(table, { values, switches, ...moment(3) });
      expect(openingOf("", `#${code}`).values.get("fade")).toBe(0);
    }
  });

  it("writes codes of version 7, which hold when dense light turns white, after the palette (decision 61)", () => {
    expect(CODE.version).toBe(7);
    const ids = CODE.controls.map(({ id }) => id);
    expect(ids.indexOf("white")).toBe(ids.indexOf("palette") + 1);
    for (const white of [0, 1, 2, 3]) {
      const { values, switches } = opening();
      values.set("n", 3);
      values.set("white", white);
      const opened = openingOf("", addressOf(values, switches, moment(3), ""));
      expect(opened.values).toEqual(values);
    }
  });

  it("opens the codes written before version 7 with white coming in at once, as they were published (decision 61)", () => {
    const before = CODES.filter(
      ({ controls }) => !controls.some(({ id }) => id === "white"),
    );
    expect(before.map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const table of before) {
      const { values, switches } = opening();
      values.set("n", 3);
      const code = writeCode(table, { values, switches, ...moment(3) });
      expect(openingOf("", `#${code}`).values.get("white")).toBe(0);
    }
    expect(openingOf("", `#${VERSION_5}`).values.get("white")).toBe(0);
  });

  it("opens keeping the colour later, readable addresses without white= too, and carries the other steps readable (decision 61)", () => {
    const { values, switches } = opening();
    expect(openingOf("", "").values.get("white")).toBe(2);
    expect(openingOf("?n=3&palette=5", "").values.get("white")).toBe(2);
    expect(addressOf(values, switches, null, "")).toBe("");
    values.set("palette", 5);
    values.set("white", 0);
    expect(addressOf(values, switches, null, "")).toBe("?palette=5&white=0");
    expect(openingOf("?palette=5&white=0", "").values.get("white")).toBe(0);
    expect(openingOf("?white=3", "").values.get("white")).toBe(3);
  });

  it("writes codes that hold the ground, the scale and the palettes added (decision 41)", () => {
    const { values, switches } = opening();
    values.set("n", 3);
    values.set("palette", 9);
    values.set("scale", 3);
    values.set("ground", 10);
    switches.set("tension", true);
    const opened = openingOf("", addressOf(values, switches, moment(3), ""));
    expect(opened.values).toEqual(values);
    expect(opened.switches).toEqual(switches);
  });

  it("without a moment, is readable: the values and the switches that differ from the opening, and nothing after the #", () => {
    const { values, switches } = opening();
    expect(addressOf(values, switches, null, "")).toBe("");
    values.set("n", 8);
    values.set("g", 1.62);
    switches.set("tension", true);
    switches.set("light", false);
    expect(addressOf(values, switches, null, "")).toBe(
      "?n=8&g=1.62&light=0&tension=1",
    );
    const opened = openingOf("?n=8&g=1.62&light=0&tension=1", "");
    expect(opened.values).toEqual(values);
    expect(opened.switches).toEqual(switches);
    expect(opened.saved).toBeNull();
    // the ground and the scale, after the light's controls (decision 41)
    values.set("palette", 7);
    values.set("scale", 1);
    values.set("ground", 3);
    expect(addressOf(values, switches, null, "")).toBe(
      "?n=8&g=1.62&palette=7&scale=1&ground=3&light=0&tension=1",
    );
    expect(
      openingOf("?n=8&g=1.62&palette=7&scale=1&ground=3&light=0&tension=1", "")
        .values,
    ).toEqual(values);
  });

  it("with a moment, is the whole screen in a code after the #, without the readable part", () => {
    const { values, switches } = opening();
    values.set("n", 3);
    values.set("shake", 800);
    switches.set("sketch", true);
    const saved = moment(3);
    const address = addressOf(values, switches, saved, "?n=3&shake=800");
    expect(address).toMatch(/^#[A-Za-z0-9_-]+$/);
    // fourteen bytes since the sixth version (decision 53), and eight to a mass
    expect(address).toHaveLength(1 + Math.ceil((4 * (14 + 8 * 3)) / 3));
    const opened = openingOf("", address);
    expect(opened.values).toEqual(values);
    expect(opened.switches).toEqual(switches);
    expect(opened.saved?.paused).toBe(true);
    expect(opened.saved?.backwards).toBe(true);
    expect(opened.saved?.phase).toBeCloseTo(Math.PI / 2, 12);
    expect(opened.saved?.savedAt).toBe(saved.savedAt);
    expect(opened.saved?.state.theta).toHaveLength(3);
  });

  it("still opens an address of decision 34, the values readable and the moment after the #, its time not known", () => {
    const text = writeMoment({
      theta: Float64Array.of(0.5),
      omega: Float64Array.of(0),
    });
    const opened = openingOf("?n=1&g=1.62", `#moment=${text}`);
    expect(opened.values.get("n")).toBe(1);
    expect(opened.values.get("g")).toBe(1.62);
    expect(opened.saved?.state.theta).toEqual(Float64Array.of(0.5));
    expect(opened.saved?.paused).toBe(false);
    expect(opened.saved?.backwards).toBe(false);
    expect(opened.saved?.savedAt).toBe(0);
    // a moment of another number of masses than the address asks for is not taken
    expect(openingOf("?n=2", `#moment=${text}`).saved).toBeNull();
  });

  it("takes from a code only what the registry still has, and refuses a code whose moment is not of its number of masses", () => {
    const { values, switches } = opening();
    values.set("n", 4);
    const four = writeCode(CODE, { values, switches, ...moment(4) });
    const three = writeCode(CODE, {
      values,
      switches,
      ...moment(3),
    });
    expect(openingOf("", `#${four}`).saved).not.toBeNull();
    // the masses' control says 4 and the moment has 3: nothing is taken
    const refused = openingOf("?g=1.62", `#${three}`);
    expect(refused.saved).toBeNull();
    expect(refused.values.get("n")).toBe(2);
    expect(refused.values.get("g")).toBe(1.62);
    // a code the reader does not know opens the readable part, if any
    expect(readCode(CODES, "AAAA")).toBeNull();
    expect(openingOf("?n=8", "#AAAA").values.get("n")).toBe(8);
  });
});

/**
 * A code of version 1 as it was written when published, for "opens a code of
 * version 1 as it was published": its first twelve bytes checked bit by bit
 * against the table by hand, then eight masses at rest.
 */
/** A code of version 2, as the published page wrote it on saving a moment. */
const VERSION_2 = "AgnIsCTME2gAByHEpEiOEsDCZw7AJPE3wBujYEA";

/** A code of version 3, as the published page wrote it on saving a moment. */
const VERSION_3 = "AxHIsCKUwmgAByHFiATCnz4oTQ6-UJerPiHLdMFrTWFBttOcQQ";

/** A code of version 4, as the published page wrote it on saving a moment. */
const VERSION_4 = "BBHEsCTaACQAA5D1rl85_T9vHydAXHM8QGwbu79PbKs-p5RlPg";

/** A code of version 5, as the published page wrote it on saving a moment. */
const VERSION_5 = "BRHEsCTVABIAAch-n9B-sj47Axi8BY8UPx-o-L5kaAdAL1QvwQ";

const VERSION_1 =
  "ASnEsCTMNAADkOEMAAAAPwAAAD8AAAA_AAAAPwAAAD8AAAA_AAAAPwAAAD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
