import { stepValue, type Parameter, type Values } from "../core/parameters.ts";
import { readMusic, writeMusic } from "../core/routes.ts";
import { keepMeasures } from "../core/sharp.ts";
import { withCommas, writeCamera, type Camera } from "../core/view.ts";
import {
  SWITCHES,
  addressOf,
  openingOf,
  type Opening,
  type Saved,
} from "./address.ts";
import { DANCE_PARAMETERS, layerValue, withLayer } from "./dance-row.ts";
import {
  readChoreography,
  writeChoreography,
  type Choreography,
} from "./forces/choreography.ts";
import {
  AMPLITUDE,
  LIGHT,
  MASSES,
  MODE,
  MUSIC_MODE,
  MUSIC_STRENGTH,
  SCALE,
  TENSION,
  ZOOM,
} from "./parameters.ts";
import { MODES } from "./music.ts";
import { titleOf } from "./title.ts";

// What the visitor asks of the first piece by its row of controls and by the
// keys, as the piece's events (docs/decisions.md, decision 88), each with
// the value it asks for: a control to a value, a switch on or off, the music
// to a mode and a strength, the dance to a choreography (decision 89), a
// source to listen to, or an action. The settings
// are what the address carries in its readable part (decisions 38, 46 and
// 83), and the moment saved in it (decision 34): the events change them, the
// address and the page's title are written from them, and the piece answers
// each event with what it does to the chain, its twins, its trails and its
// colours (main.ts).

/** A switch of the piece, by its id in the address (decision 38). */
export type SwitchId = "light" | "tension" | "sketch";

/** What an action does: pause or go on, run time the other way, start again, save the moment, share the address, show it as a QR code, come nearer or go farther about the middle (decision 73), or see the whole view. */
export type Act =
  | "pause"
  | "reverse"
  | "start"
  | "save"
  | "share"
  | "qr"
  | "nearer"
  | "farther"
  | "whole";

/** The actions, in no order. */
export const ACTS: readonly Act[] = [
  "pause",
  "reverse",
  "start",
  "save",
  "share",
  "qr",
  "nearer",
  "farther",
  "whole",
];

/** What the visitor asks of the piece, with the value asked for; a control's event says the value it had, which the piece may answer by. */
export type PieceEvent =
  | {
      readonly kind: "value";
      readonly parameter: Parameter;
      readonly value: number;
      readonly was: number;
    }
  | { readonly kind: "switch"; readonly id: SwitchId; readonly on: boolean }
  | { readonly kind: "music"; readonly mode: string; readonly strength: number }
  | { readonly kind: "dance"; readonly choreography: Choreography }
  | { readonly kind: "listen"; readonly source: string }
  | { readonly kind: "act"; readonly id: Act };

/** The ids of the music's modes, the one the piece opens in first. */
const MODE_IDS = MODES.map(({ id }) => id);
/** The music's mode in which the hand dances (decision 75). */
const DANCE_MODE = "dance";

/**
 * Whether a control's new value has the chain start where it says, forgetting
 * a moment saved (decision 33): the start, or the amplitude of a mode.
 */
export function choosesStart(parameter: Parameter, values: Values): boolean {
  return (
    parameter === MODE ||
    (parameter === AMPLITUDE && (values.get(MODE.id) ?? MODE.initial) > 0)
  );
}

/** The settings the address carries in its readable part, and the moment saved in it; the events change them. */
export class Settings {
  /** The value of each control of the registry, by its id. */
  readonly values: Map<string, number>;
  /** Each switch, on or off, by its id. */
  readonly switches: Map<string, boolean>;
  /** What the music does, and how strongly (decision 46). */
  readonly tune: { mode: string; strength: number };
  /** How the music's hand dances (decision 83). */
  choreography: Choreography;
  /** The moment saved in the address, where the chain starts while there is one (decision 34), with how the screen around it was (decision 38). */
  saved: Saved | null;

  /** The settings an address opens with: `opened`, and what its `search` carries besides. */
  constructor(opened: Opening, search: string) {
    this.values = opened.values;
    this.switches = opened.switches;
    this.saved = opened.saved;
    this.tune = readMusic(MODE_IDS, search);
    this.choreography = readChoreography(search);
  }

  /** A control's value. */
  value(parameter: Parameter): number {
    return this.values.get(parameter.id) ?? parameter.initial;
  }

  /** Whether a switch is on. */
  on(id: SwitchId): boolean {
    return (
      this.switches.get(id) ??
      SWITCHES.find((s) => s.id === id)?.initial ??
      false
    );
  }

  /** The tension's colours as the row shows them, one control (decision 53): off, or the scale. */
  tensionAt(): number {
    return this.on("tension") ? this.value(SCALE) : TENSION.initial;
  }

  /** Where the music's mode stands among the modes. */
  modeAt(): number {
    return Math.max(0, MODE_IDS.indexOf(this.tune.mode));
  }

  /**
   * The events a control stepped down (-1) or up (1) makes, in their order:
   * the music's mode or strength (decisions 46 and 76); the zoom's − and +,
   * nearer or farther about the middle (decision 73); or the control to its
   * next value, and the switches that a value turns on. The tension's
   * colours, one control in the row, step the switch and the scale the
   * address keeps apart: off, then each scale (decision 53).
   */
  step(parameter: Parameter, direction: 1 | -1): PieceEvent[] {
    const { mode, strength } = this.tune;
    if (parameter === MUSIC_MODE) {
      const at = stepValue(MUSIC_MODE, this.modeAt(), direction);
      return [{ kind: "music", mode: MODE_IDS[at] ?? mode, strength }];
    }
    if (parameter === MUSIC_STRENGTH) {
      const next = stepValue(MUSIC_STRENGTH, strength, direction);
      return [{ kind: "music", mode, strength: next }];
    }
    if (parameter === ZOOM) {
      return [{ kind: "act", id: direction > 0 ? "nearer" : "farther" }];
    }
    if (DANCE_PARAMETERS.includes(parameter)) {
      const was = layerValue(parameter, this.choreography);
      const value = stepValue(parameter, was, direction);
      return this.dance(withLayer(this.choreography, parameter, value));
    }
    if (parameter === TENSION) {
      const was = this.tensionAt();
      const value = stepValue(TENSION, was, direction);
      return [{ kind: "value", parameter, value, was }];
    }
    const was = this.value(parameter);
    // with a moment saved, the start's first step forgets it and goes back
    // to the start it had before, rather than to the next one
    const value =
      parameter === MODE && this.saved !== null
        ? was
        : stepValue(parameter, was, direction);
    const events: PieceEvent[] = [{ kind: "value", parameter, value, was }];
    // another scale paints the tension in it, and turns its colours on
    // (decision 41); a control of the light lights it again (decision 27)
    if (parameter === SCALE && !this.on("tension")) {
      events.push({ kind: "switch", id: "tension", on: true });
    }
    if (!this.on("light") && LIGHT.includes(parameter)) {
      events.push({ kind: "switch", id: "light", on: true });
    }
    return events;
  }

  /**
   * The events of the dance going to `choreography`, from its row (decision
   * 89): the choreography, and the music's mode put on the dance where it is
   * not, as a control of the light lights it (decision 27).
   */
  dance(choreography: Choreography): PieceEvent[] {
    const events: PieceEvent[] = [{ kind: "dance", choreography }];
    if (this.tune.mode !== DANCE_MODE) {
      events.push({
        kind: "music",
        mode: DANCE_MODE,
        strength: this.tune.strength,
      });
    }
    return events;
  }

  /** The settings as an event leaves them; a moment is saved apart, with `save`. */
  apply(event: PieceEvent): void {
    if (event.kind === "dance") {
      this.choreography = event.choreography;
    } else if (event.kind === "switch") {
      this.switches.set(event.id, event.on);
    } else if (event.kind === "music") {
      this.tune.mode = event.mode;
      this.tune.strength = event.strength;
    } else if (event.kind === "value") {
      const { parameter, value } = event;
      if (parameter === TENSION) {
        if (value !== TENSION.initial) this.values.set(SCALE.id, value);
        this.switches.set("tension", value !== TENSION.initial);
        return;
      }
      this.values.set(parameter.id, value);
      // a moment saved belongs to a chain of so many masses, and choosing a
      // start, a mode or the amplitude of one, starts there instead
      if (parameter === MASSES || choosesStart(parameter, this.values)) {
        this.saved = null;
      }
    }
  }

  /**
   * The moment as it is now goes into the address, with the screen around
   * it, and the chain starts there from now on (decisions 34 and 38): exactly
   * as the address holds it, seven digits to a number, so that the address
   * opened again starts the same.
   */
  save(moment: Saved): void {
    this.saved = openingOf(
      "",
      addressOf(this.values, this.switches, moment, ""),
    ).saved;
  }

  /**
   * The address's search and "#" parts for the settings, after whatever else
   * `search` carried, with the `camera` (decision 67): with a moment saved,
   * its code after the "#"; without, the values and the switches that differ
   * from the opening. The music's mode and strength (decision 46), the
   * dance's choreography (decision 83) and the camera stay in the readable
   * part either way, and with a moment saved so do the trails' mechanism and
   * the meter (decision 68).
   */
  address(search: string, camera: Camera): string {
    const { mode, strength } = this.tune;
    const readable = (from: string): string =>
      writeCamera(
        writeChoreography(
          writeMusic(MODE_IDS, from, mode, strength),
          this.choreography,
        ),
        camera,
      );
    const part = addressOf(
      this.values,
      this.switches,
      this.saved,
      readable(search),
    );
    const tuned = this.saved === null ? "" : readable(keepMeasures(search));
    return `${withCommas(tuned)}${withCommas(part)}`;
  }

  /** The page's title, which names the screen (decision 38), after the piece's `name`. */
  title(name: string): string {
    return titleOf(name, this.values, this.switches, this.saved);
  }
}
