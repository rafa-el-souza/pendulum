import { describe, expect, it } from "vitest";

import { checkParameters } from "../core/parameters.ts";
import { SWITCHES } from "./address.ts";
import {
  BEATS_PER_POINT,
  DANCE_PARAMETERS,
  FIGURE,
  GRIP,
  LEAD,
  SLACK,
  TOSS,
  VARY,
  handIcon,
  handLabel,
  handSwitch,
  layerValue,
  withLayer,
} from "./dance-row.ts";
import { DANCE_OPENS, readChoreography } from "./forces/choreography.ts";
import { MUSIC_MODE, MUSIC_STRENGTH, PARAMETERS } from "./parameters.ts";

// The dance's own row (docs/decisions.md, decision 89): each layer of the
// choreography as a control, which steps through the values its layer takes
// in the address.

describe("the dance's controls (decision 89)", () => {
  it("are thirteen controls whose ids are their layers' names in the address, apart from every other control's and switch's", () => {
    expect(DANCE_PARAMETERS.map(({ id }) => id)).toEqual([
      "figure",
      "place",
      "lead",
      "beats",
      "feel",
      "size",
      "center",
      "pulse",
      "grab",
      "grip",
      "slack",
      "toss",
      "vary",
    ]);
    expect(() => {
      checkParameters(
        [...PARAMETERS, MUSIC_MODE, MUSIC_STRENGTH, ...DANCE_PARAMETERS],
        SWITCHES,
      );
    }).not.toThrow();
  });

  it("open at the values of the dance as it opens", () => {
    for (const parameter of DANCE_PARAMETERS) {
      expect(layerValue(parameter, DANCE_OPENS)).toBe(parameter.initial);
    }
  });

  it("each take every value of their layer, and give it back as they show it", () => {
    for (const parameter of DANCE_PARAMETERS) {
      for (const value of parameter.values) {
        const changed = withLayer(DANCE_OPENS, parameter, value);
        expect(layerValue(parameter, changed)).toBe(value);
        expect(parameter.show(value)).not.toBe("");
      }
    }
  });

  it("change their own layer alone", () => {
    const changed = withLayer(DANCE_OPENS, LEAD, 0);
    expect(changed).toEqual({ ...DANCE_OPENS, lead: "clock" });
  });

  it("show the layers in words, the half beat and the clock's own count among the beats, and the grip in dots", () => {
    expect(FIGURE.show(5)).toBe("conductor's four");
    expect(LEAD.show(0)).toBe("beat clock");
    expect(BEATS_PER_POINT.values.map((v) => BEATS_PER_POINT.show(v))).toEqual([
      "½",
      "1",
      "2",
      "4",
      "8",
      "auto",
    ]);
    expect(GRIP.show(3)).toBe("●●●○○");
    expect(GRIP.speak?.(3)).toBe("3 of 5");
    expect(SLACK.values.map((v) => SLACK.show(v))).toEqual([
      "taut",
      "10% slack",
      "20% slack",
      "30% slack",
      "40% slack",
    ]);
    expect(TOSS.values.map((v) => TOSS.show(v))).toEqual([
      "never",
      "every bar",
      "every 2 bars",
      "every 4 bars",
    ]);
    expect(VARY.show(5)).toBe("by loudness");
  });

  it("step a figure into the first place of a list of figures, keeping the rest", () => {
    const listed = readChoreography("?figure=swing-circle-eight");
    const changed = withLayer(listed, FIGURE, 3);
    expect(changed.figure).toBe("eight");
    expect(changed.then).toEqual(["circle", "eight"]);
  });

  it("have the hand's switch say what a press does, and show it filled while shown", () => {
    expect(handSwitch(false)).toMatchObject({
      id: "showhand",
      icon: "palm",
      pressed: false,
      label: "Show the dancing hand",
    });
    expect(handIcon(true)).toBe("palmed");
    expect(handLabel(true)).toBe("Hide the dancing hand");
  });
});
