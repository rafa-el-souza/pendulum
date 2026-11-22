import { describe, expect, it } from "vitest";

import { WHOLE_VIEW } from "../core/view.ts";
import { openingOf, type Saved } from "./address.ts";
import { FIGURE, LEAD } from "./dance-row.ts";
import { DANCE_OPENS } from "./forces/choreography.ts";
import {
  AMPLITUDE,
  GROUND,
  MASSES,
  MODE,
  MUSIC_MODE,
  MUSIC_STRENGTH,
  SCALE,
  TENSION,
  TRAIL,
  TWIN_COUNT,
  ZOOM,
} from "./parameters.ts";
import { MODES } from "./music.ts";
import { Settings, choosesStart } from "./settings.ts";

// What the visitor asks of the first piece by its row and its keys, as the
// piece's events, and the settings the address carries (docs/decisions.md,
// decision 88): each event says the value asked for, the settings take it,
// and the address and the title are written from them.

/** The settings an address opens with. */
function opened(search = "", hash = ""): Settings {
  return new Settings(openingOf(search, hash), search);
}

/** A moment of a chain of `n`, paused and running backwards. */
function moment(n: number): Saved {
  return {
    state: {
      theta: Float64Array.from({ length: n }, (_, i) => 0.5 - i / n),
      omega: Float64Array.from({ length: n }, (_, i) => 1 - i / n),
    },
    paused: true,
    backwards: true,
    phase: Math.PI / 2,
    savedAt: Date.UTC(2026, 10, 21, 23, 50),
  };
}

describe("the piece's events from a control stepped (decision 88)", () => {
  it("say the value asked for and the one the control had", () => {
    const settings = opened();
    expect(settings.step(MASSES, 1)).toEqual([
      { kind: "value", parameter: MASSES, value: 3, was: 2 },
    ]);
    expect(settings.step(MASSES, -1)).toEqual([
      { kind: "value", parameter: MASSES, value: 1, was: 2 },
    ]);
  });

  it("stay at an end, as the control does", () => {
    const settings = opened("?n=1");
    expect(settings.step(MASSES, -1)).toEqual([
      { kind: "value", parameter: MASSES, value: 1, was: 1 },
    ]);
  });

  it("light the twins and the trails again after a control of theirs, while they are out (decision 27), and only then", () => {
    expect(opened("?light=0").step(TWIN_COUNT, 1)).toEqual([
      { kind: "value", parameter: TWIN_COUNT, value: 4096, was: 512 },
      { kind: "switch", id: "light", on: true },
    ]);
    expect(opened().step(TWIN_COUNT, 1)).toHaveLength(1);
    expect(opened("?light=0").step(MASSES, 1)).toHaveLength(1);
  });

  it("turn the tension's colours on after another scale, while they are off (decision 41), and only then", () => {
    expect(opened().step(SCALE, 1)).toEqual([
      { kind: "value", parameter: SCALE, value: 1, was: 0 },
      { kind: "switch", id: "tension", on: true },
    ]);
    expect(opened("?tension=1").step(SCALE, 1)).toHaveLength(1);
  });

  it("step the tension's colours, one control, through off and each scale, which the settings keep apart (decision 53)", () => {
    const settings = opened();
    const [on] = settings.step(TENSION, 1);
    expect(on).toEqual({
      kind: "value",
      parameter: TENSION,
      value: 0,
      was: -1,
    });
    if (on !== undefined) settings.apply(on);
    expect(settings.on("tension")).toBe(true);
    expect(settings.value(SCALE)).toBe(0);
    for (const event of settings.step(TENSION, 1)) settings.apply(event);
    expect(settings.tensionAt()).toBe(1);
    // switched off by its key, the scale stays for when they come on again
    const back = opened("?tension=1&scale=2");
    back.apply({ kind: "switch", id: "tension", on: false });
    expect(back.value(SCALE)).toBe(2);
    expect(back.tensionAt()).toBe(TENSION.initial);
    // and stepped down from the first scale, they go off, keeping it
    const down = opened("?tension=1&scale=1");
    for (const event of down.step(TENSION, -1)) down.apply(event);
    for (const event of down.step(TENSION, -1)) down.apply(event);
    expect(down.on("tension")).toBe(false);
    expect(down.value(SCALE)).toBe(0);
  });

  it("step the music's mode round the modes, and its strength between its ends (decision 76)", () => {
    expect(opened().step(MUSIC_MODE, -1)).toEqual([
      { kind: "music", mode: MODES.at(-1)?.id, strength: 3 },
    ]);
    expect(opened("?music=dance").step(MUSIC_MODE, 1)).toEqual([
      { kind: "music", mode: "breath", strength: 3 },
    ]);
    expect(opened("?strength=5").step(MUSIC_STRENGTH, 1)).toEqual([
      { kind: "music", mode: "light", strength: 5 },
    ]);
  });

  it("come nearer and go farther about the middle for the zoom's − and + (decision 73)", () => {
    expect(opened().step(ZOOM, 1)).toEqual([{ kind: "act", id: "nearer" }]);
    expect(opened().step(ZOOM, -1)).toEqual([{ kind: "act", id: "farther" }]);
  });

  it("keep the start where it was on its first step with a moment saved, which the step forgets (decision 34)", () => {
    const settings = opened("?mode=2");
    settings.save(moment(2));
    expect(settings.step(MODE, 1)).toEqual([
      { kind: "value", parameter: MODE, value: 2, was: 2 },
    ]);
  });
});

describe("the dance's events, from its row (decision 89)", () => {
  it("take a layer to its next value, and put the music's mode on the dance where it is not, as a control of the light lights it", () => {
    expect(opened().step(LEAD, -1)).toEqual([
      { kind: "dance", choreography: { ...DANCE_OPENS, lead: "clock" } },
      { kind: "music", mode: "dance", strength: 3 },
    ]);
    expect(opened("?music=dance").step(FIGURE, 1)).toEqual([
      { kind: "dance", choreography: { ...DANCE_OPENS, figure: "circle" } },
    ]);
  });

  it("leave the dance in the settings and in the address, the mode with it", () => {
    const settings = opened("?n=3");
    for (const event of settings.step(FIGURE, 1)) settings.apply(event);
    for (const event of settings.dance({
      ...settings.choreography,
      shown: true,
    })) {
      settings.apply(event);
    }
    expect(settings.choreography).toEqual({
      ...DANCE_OPENS,
      figure: "circle",
      shown: true,
    });
    expect(settings.address("?n=3", WHOLE_VIEW)).toBe(
      "?music=dance&figure=circle&showhand=1&n=3",
    );
  });
});

describe("the settings, as the events leave them (decision 88)", () => {
  it("take a control's value, a switch and the music's mode and strength", () => {
    const settings = opened();
    settings.apply({ kind: "value", parameter: TRAIL, value: 10, was: 1 });
    settings.apply({ kind: "switch", id: "sketch", on: true });
    settings.apply({ kind: "music", mode: "glow", strength: 4 });
    expect(settings.value(TRAIL)).toBe(10);
    expect(settings.on("sketch")).toBe(true);
    expect(settings.tune).toEqual({ mode: "glow", strength: 4 });
    expect(settings.modeAt()).toBe(MODES.findIndex(({ id }) => id === "glow"));
  });

  it("forget a moment saved for another number of masses, another start or another amplitude of a mode, and keep it for anything else (decision 34)", () => {
    const forgets = [
      { kind: "value", parameter: MASSES, value: 3, was: 2 },
      { kind: "value", parameter: MODE, value: 1, was: 0 },
    ] as const;
    for (const event of forgets) {
      const settings = opened();
      settings.save(moment(2));
      settings.apply(event);
      expect(settings.saved).toBeNull();
    }
    const inMode = opened("?mode=1");
    inMode.save(moment(2));
    inMode.apply({ kind: "value", parameter: AMPLITUDE, value: 45, was: 30 });
    expect(inMode.saved).toBeNull();
    // raised to one side, the amplitude has nothing to do
    const raised = opened();
    raised.save(moment(2));
    raised.apply({ kind: "value", parameter: AMPLITUDE, value: 45, was: 30 });
    raised.apply({ kind: "value", parameter: GROUND, value: 3, was: 0 });
    raised.apply({ kind: "switch", id: "tension", on: true });
    expect(raised.saved).not.toBeNull();
    expect(choosesStart(AMPLITUDE, raised.values)).toBe(false);
    expect(choosesStart(AMPLITUDE, opened("?mode=1").values)).toBe(true);
  });
});

describe("the address and the title, from the settings (decisions 38 and 88)", () => {
  it("write the address the settings opened with, the music's, the dance's and the camera's parts kept readable", () => {
    const search =
      "?n=8&tension=1&music=dance&strength=4&figure=circle&zoom=2&at=0.1,-0.2";
    const settings = opened(search);
    expect(settings.address(search, { zoom: 2, cx: 0.1, cy: -0.2 })).toBe(
      "?music=dance&strength=4&figure=circle&zoom=2&at=0.1,-0.2&n=8&tension=1",
    );
    expect(opened().address("", WHOLE_VIEW)).toBe("");
  });

  it('write a moment saved as a code after the "#", exactly as it opens again, with the trails\' mechanism, the meter and the music before it (decisions 34, 46 and 68)', () => {
    const search = "?music=glow&trails=layers&fps=1&n=3";
    const settings = opened(search);
    settings.save(moment(3));
    const address = settings.address(search, WHOLE_VIEW);
    const [before = "", code = ""] = address.split("#");
    expect(before).toBe("?trails=layers&fps=1&music=glow");
    const again = openingOf(before, `#${code}`);
    expect(again.saved).toEqual(settings.saved);
    expect(again.values.get(MASSES.id)).toBe(3);
    // saved again from what it opens, the moment is the same
    const twice = opened(before, `#${code}`);
    if (twice.saved !== null) twice.save(twice.saved);
    expect(twice.address(search, WHOLE_VIEW)).toBe(address);
  });

  it("name the screen in the title, after the piece's name", () => {
    const settings = opened("?n=8");
    expect(settings.title("Pendulum")).toBe(opened("?n=8").title("Pendulum"));
    expect(settings.title("Pendulum")).not.toBe(opened().title("Pendulum"));
    expect(opened().title("Pendulum")).toBe("Pendulum");
  });
});
