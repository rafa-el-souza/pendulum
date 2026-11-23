import { cssColor } from "../core/color.ts";
import { mountControls, type Controls } from "../core/controls.ts";
import { groundAt } from "../core/grounds.ts";
import { mountLinkCard, shareLink } from "../core/link.ts";
import { mountMusic, type Music } from "../core/music.ts";
import { keyAction, type Parameter } from "../core/parameters.ts";
import type { Camera } from "../core/view.ts";
import { PIECES } from "../pieces.ts";
import type { Saved } from "./address.ts";
import {
  BEATS_PER_POINT,
  CENTER,
  DANCE_PARAMETERS,
  FEEL,
  FIGURE,
  GRAB,
  GRIP,
  LEAD,
  PLACE,
  PULSE,
  SIZE,
  SLACK,
  TOSS,
  VARY,
  handIcon,
  handLabel,
  handSwitch,
  layerValue,
} from "./dance-row.ts";
import {
  AMPLITUDE,
  DRAWN,
  FADE,
  GRAVITY,
  GROUND,
  HAND,
  HELD_STEP,
  HOLD,
  LEASHED_STEP,
  LINES,
  LINES_LIGHT,
  LOOK,
  MASSES,
  MODE,
  MUSIC_MODE,
  MUSIC_STRENGTH,
  PALETTE,
  PARAMETERS,
  SAVED_START,
  SCALE,
  SHAKE,
  SPREAD,
  STROBE,
  STROBE_LIGHT,
  TENSION,
  TILT,
  TIME,
  TRAIL,
  TWIN_COUNT,
  TWIN_LINES,
  TWIN_LINES_LIGHT,
  TWIN_STROBE,
  TWIN_STROBE_LIGHT,
  WHITE,
  ZOOM,
  whiteSwatches,
} from "./parameters.ts";
import { ACTS, type PieceEvent, type Settings } from "./settings.ts";

// The first piece's row of controls (docs/decisions.md, decisions 31 and 54)
// and its keys, with the address and the page's title (decision 38), the
// address shared or shown as a QR code (decision 40), and the music's card
// (decisions 44 and 76), with the dance's row stacked above the music's
// (decision 89), and each of the trails' layers' rows above the trails'
// (decision 102). A control stepped, a button pressed or a key makes
// the piece's events (settings.ts, decision 88); each is taken by the
// settings, answered by the piece, and shown in the row, and the address and
// the title follow.

// How long the share button shows that the address was copied, in ms.
const COPIED_MS = 2000;
// The light switch's name: the twins' and the trails' light, which it puts
// out and lights again (decision 27), apart from the sketch's light.
const LIGHT_LABEL = "Light of the twins and trails";
const SKETCH_LABEL = "The sketch's light";
// The dance's button in the music's group, lit while the music dances
// (decision 89).
const DANCE_LABEL = "The dance";
const DANCING_LABEL = "The dance, which the music dances now";
// The trails' layers (decision 102), each a button in the trails' group that
// opens the layer's row stacked above: the parts the layer comes from and its
// light. A layer's button is lit while the layer is drawn.
const LAYERS = [
  {
    id: "layerlines",
    label: "The chain's lines",
    icon: "path",
    parts: LINES,
    light: LINES_LIGHT,
  },
  {
    id: "layerstrobe",
    label: "The chain's strobe",
    icon: "flash",
    parts: STROBE,
    light: STROBE_LIGHT,
  },
  {
    id: "layertwinlines",
    label: "The twins' lines",
    icon: "paths",
    parts: TWIN_LINES,
    light: TWIN_LINES_LIGHT,
  },
  {
    id: "layertwinstrobe",
    label: "The twins' strobe",
    icon: "flashes",
    parts: TWIN_STROBE,
    light: TWIN_STROBE_LIGHT,
  },
] as const;
// The piece's name, which begins the page's title (decision 37).
const NAME =
  PIECES.find(({ id }) => id === "chain-in-hand")?.title ?? document.title;

/** What the row needs of the piece. */
export interface RowHooks {
  /** What an event does to the chain, its twins, its trails and its colours, once the settings have taken it. */
  answer(event: PieceEvent): void;
  /** How many masses the chain has. */
  readonly masses: number;
  /** Whether the browser can draw light into half floats, where dense light keeps its colour (decision 61). */
  readonly floating: boolean;
  /** How the piece is looked at, which the address carries (decision 67). */
  readonly camera: Camera;
  /** The moment as the screen shows it, to be saved. */
  moment(): Omit<Saved, "savedAt">;
}

export interface Row {
  readonly controls: Controls;
  /** What the piece listens to (decision 44), in the music's group. */
  readonly music: Music;
  /** Takes an event as a button or a key does: the settings take it, the piece answers it, the row shows it, and the address and the title follow. */
  take(event: PieceEvent): void;
  /** Takes a key pressed if it is one of the row's, a control's or an action's; whether it took it. */
  key(event: KeyboardEvent): boolean;
  /** The address says what the screen is now, the title follows, the button says whether a moment is kept, and an open QR code shows the new address (decisions 38 and 40). */
  keepAddress(): void;
  /** Shows the start's controls as the settings and the chain have them. */
  showStart(): void;
}

/** Whether an event changes what the address carries. */
function changesAddress(event: PieceEvent): boolean {
  return (
    event.kind === "value" ||
    event.kind === "switch" ||
    event.kind === "music" ||
    event.kind === "dance" ||
    (event.kind === "act" && event.id === "save")
  );
}

export function mountRow(settings: Settings, hooks: RowHooks): Row {
  // The address shared, or shown as a QR code (decision 40), in the ground's
  // colours.
  const cardColors = { dark: "", light: "" };
  function colorCard(): void {
    const ground = groundAt(settings.value(GROUND));
    cardColors.dark = cssColor(ground.ground);
    cardColors.light = cssColor(ground.chain);
  }
  colorCard();
  const card = mountLinkCard(cardColors);
  // What the piece listens to (decision 44), in the music's group of the
  // row, which shows it hearing (decision 76).
  const music = mountMusic();

  /** The page's title names the screen (decision 38). */
  function showTitle(): void {
    document.title = settings.title(NAME);
  }

  function showSave(): void {
    controls.showAction(
      "save",
      settings.saved === null ? "save" : "saved",
      settings.saved === null
        ? "Save this moment"
        : "Save this moment over the one saved",
    );
  }

  function keepAddress(): void {
    history.replaceState(
      null,
      "",
      `${location.pathname}${settings.address(location.search, hooks.camera)}`,
    );
    showTitle();
    showSave();
    card.update(location.href, document.title);
  }

  let copiedTimer = 0;
  /** Shares the address as it is, with the title; where it was copied, the button and a word say so a moment. */
  async function share(): Promise<void> {
    const done = await shareLink(location.href, document.title);
    if (done === "copied") {
      card.say("Link copied");
      controls.showAction("share", "copied", "Link copied");
      clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => {
        controls.showAction("share", "share", "Share this page's address");
      }, COPIED_MS);
    } else if (done === "failed") {
      card.say("The link could not be copied");
    }
  }

  /**
   * The start's controls: with a moment saved, the start says the chain
   * starts there; without, a mode the chain lacks shows the highest it has,
   * held back. The amplitude, which only a mode has, shows faint while the
   * chain starts raised or from the moment saved, where it has nothing to do.
   */
  function showStart(): void {
    const mode = settings.value(MODE);
    if (settings.saved !== null) controls.showValue(MODE.id, SAVED_START);
    else if (mode > hooks.masses) {
      controls.showValue(MODE.id, mode, { reached: hooks.masses });
    } else controls.showValue(MODE.id, mode);
    controls.showValue(AMPLITUDE.id, settings.value(AMPLITUDE), {
      idle: settings.saved !== null || mode === 0,
    });
  }

  /** When dense light turns white, in five dots of the palette chosen; faint where the browser cannot keep the colour (decision 61). */
  function showWhite(): void {
    controls.showValue(WHITE.id, settings.value(WHITE), {
      swatches: whiteSwatches(settings.value(WHITE), settings.value(PALETTE)),
      idle: !hooks.floating,
    });
  }

  /** How near the twins are held, faint while they stay or fade, where it has nothing to do (decision 64). */
  function showHold(): void {
    const life = settings.value(FADE);
    controls.showValue(HOLD.id, settings.value(HOLD), {
      idle: life !== HELD_STEP && life !== LEASHED_STEP,
    });
  }

  /** The music's mode and strength, as values of its group, and the dance's button lit while the music dances (decision 89). */
  function showMusic(): void {
    controls.showValue(MUSIC_MODE.id, settings.modeAt());
    controls.showValue(MUSIC_STRENGTH.id, settings.tune.strength);
    const dancing = settings.tune.mode === "dance";
    controls.lightGroup(
      "dance",
      dancing,
      dancing ? DANCING_LABEL : DANCE_LABEL,
    );
  }

  /** The dance's controls as its choreography has them, and the hand's switch (decision 89). */
  function showDance(): void {
    const { choreography } = settings;
    for (const parameter of DANCE_PARAMETERS) {
      controls.showValue(parameter.id, layerValue(parameter, choreography));
    }
    const { shown } = choreography;
    controls.showAction("showhand", handIcon(shown), handLabel(shown), shown);
  }

  /** Each of the trails' layers' buttons lit while the layer is drawn, and its light faint while it is not, where it has nothing to do (decision 102). */
  function showLayers(): void {
    for (const { id, label, parts, light } of LAYERS) {
      const drawn = settings.value(parts) > 0;
      controls.lightGroup(id, drawn, label);
      controls.showValue(light.id, settings.value(light), { idle: !drawn });
    }
  }

  /** The light switch's button, lit while the light is on. */
  function showLight(): void {
    const on = settings.on("light");
    controls.showAction("light", on ? "light" : "dark", LIGHT_LABEL, on);
  }

  /** What an event changes in the row. */
  function show(event: PieceEvent): void {
    if (event.kind === "value") {
      const { parameter, value } = event;
      // the palette shows in the tension's colours, one control with the
      // switch (decisions 53 and 105), and the white in the twins' palette's
      // (decision 61)
      if (parameter === TENSION || parameter === SCALE) {
        showTension();
      } else if (parameter !== WHITE) {
        controls.showValue(parameter.id, value);
      }
      showStart();
      if (parameter !== TENSION) {
        showWhite();
        showHold();
        showLayers();
      }
    } else if (event.kind === "switch") {
      if (event.id === "light") showLight();
      else if (event.id === "tension") {
        showTension();
      } else {
        // its button in the screen's group says whether it is on (decision 54)
        controls.showAction(
          "sketch",
          event.on ? "sketched" : "sketch",
          SKETCH_LABEL,
          event.on,
        );
      }
    } else if (event.kind === "music") {
      showMusic();
    } else if (event.kind === "dance") {
      showDance();
    } else if (event.kind === "act" && event.id === "save") {
      showStart();
    }
  }

  /** An event taken, without the address. */
  function taken(event: PieceEvent): void {
    settings.apply(event);
    if (event.kind === "value" && event.parameter === GROUND) colorCard();
    if (event.kind === "listen") music.press(event.source);
    else if (event.kind === "act") {
      if (event.id === "save") {
        settings.save({ ...hooks.moment(), savedAt: Date.now() });
      } else if (event.id === "share") void share();
      else if (event.id === "qr") card.toggle(location.href, document.title);
    }
    hooks.answer(event);
    show(event);
  }

  function take(event: PieceEvent): void {
    taken(event);
    if (changesAddress(event)) keepAddress();
  }

  /** Events taken in their order, then the address once. */
  function takeAll(events: readonly PieceEvent[]): void {
    for (const event of events) taken(event);
    if (events.some(changesAddress)) keepAddress();
  }

  /** The tension's colours, on or off, and their palette, in their one sheet (decision 105). */
  function showTension(): void {
    controls.showValue(TENSION.id, settings.tensionAt(), {
      cell: settings.value(SCALE),
    });
  }

  /** A control stepped down (-1) or up (1), by its − and + or its keys: its events, then the address. */
  function step(parameter: Parameter, direction: 1 | -1): void {
    takeAll(settings.step(parameter, direction));
  }

  // The row of controls (decisions 31 and 54): the pause and the light,
  // which act on the whole piece, then the groups, each opening its own row:
  // time and where the chain starts, the chain, the twins, the trails, the
  // music, and the screen.
  const lit = settings.on("light");
  const sketched = settings.on("sketch");
  const controls = mountControls(
    [
      [
        {
          id: "pause",
          label: "Pause",
          icon: "pause",
          keys: [" "],
          keysShown: "␣",
        },
        {
          id: "light",
          label: LIGHT_LABEL,
          icon: "light",
          keys: ["l", "L"],
          keysShown: "L",
          pressed: lit,
        },
      ],
      [
        {
          id: "time",
          label: "Time and the start",
          icon: "clock",
          controls: [
            {
              id: "start",
              label: "Start again",
              icon: "restart",
              keys: ["r", "R"],
              keysShown: "R",
            },
            {
              id: "save",
              label: "Save this moment",
              icon: "save",
              keys: ["s", "S"],
              keysShown: "S",
            },
            MODE,
            AMPLITUDE,
            {
              id: "reverse",
              label: "Run time backwards",
              icon: "reverse",
              keys: ["b", "B"],
              keysShown: "B",
            },
            TIME,
          ],
        },
        {
          id: "chain",
          label: "The chain",
          icon: "masses",
          // the tension's colours, one control in place of the switch and
          // the scale (decision 53), and what of the chain is drawn last
          // (decision 65)
          controls: [MASSES, HAND, GRAVITY, TILT, SHAKE, TENSION, DRAWN],
        },
        {
          id: "twins",
          label: "The twins",
          icon: "butterfly",
          controls: [TWIN_COUNT, SPREAD, FADE, HOLD, LOOK, PALETTE, WHITE],
        },
        {
          id: "trails",
          label: "The trails",
          icon: "comet",
          // how long they last, then their layers (decision 96): the
          // chain's lines and strobe, and the twins', each opening its row
          // of the parts it comes from and its light (decision 102)
          controls: [
            TRAIL,
            ...LAYERS.map(({ id, label, icon, parts, light }) => ({
              id,
              label,
              icon,
              controls: [parts, light],
            })),
          ],
        },
        {
          // where the sound comes from, what the music does and how
          // strongly, and above them, while no value is chosen, what the
          // piece hears (decision 76)
          id: "music",
          label: "Music",
          icon: "music",
          keys: ["w", "W"],
          keysShown: "W",
          panel: music.panel,
          // and the dance's button, whose row opens stacked above, in the
          // order of the layers: the path, the time, the expression, the
          // body and the long time (decision 89)
          controls: [
            ...music.sources,
            MUSIC_MODE,
            MUSIC_STRENGTH,
            {
              id: "dance",
              label: DANCE_LABEL,
              icon: "dance",
              breaks: [LEAD.id, SIZE.id, GRAB.id, TOSS.id],
              controls: [
                FIGURE,
                PLACE,
                LEAD,
                BEATS_PER_POINT,
                FEEL,
                SIZE,
                CENTER,
                PULSE,
                GRAB,
                GRIP,
                SLACK,
                handSwitch(settings.choreography.shown),
                TOSS,
                VARY,
              ],
            },
          ],
        },
        {
          id: "screen",
          label: "The screen",
          icon: "monitor",
          // the zoom and the whole view first (decision 73)
          controls: [
            ZOOM,
            {
              id: "whole",
              label: "The whole view",
              icon: "whole",
              keys: ["Shift+KeyX"],
              keysShown: "Shift X",
            },
            GROUND,
            {
              id: "sketch",
              label: SKETCH_LABEL,
              icon: sketched ? "sketched" : "sketch",
              keys: ["g", "G"],
              keysShown: "G",
              pressed: sketched,
            },
            {
              id: "share",
              label: "Share this page's address",
              icon: "share",
              keys: ["h", "H"],
              keysShown: "H",
            },
            {
              id: "qr",
              label: "QR code of this page's address",
              icon: "qr",
              keys: ["o", "O"],
              keysShown: "O",
            },
          ],
        },
      ],
    ],
    {
      step,
      // a value chosen in one touch, in a sheet (decision 105)
      set(parameter, value) {
        takeAll(settings.set(parameter, value));
      },
      act(id) {
        if (id === "light" || id === "sketch") {
          take({ kind: "switch", id, on: !settings.on(id) });
        } else if (id === "showhand") {
          // the hand shown or hidden, a value of the dance (decision 89)
          const { choreography } = settings;
          takeAll(
            settings.dance({ ...choreography, shown: !choreography.shown }),
          );
        } else if (music.sources.some((source) => source.id === id)) {
          take({ kind: "listen", source: id });
        } else {
          take({ kind: "act", id: ACTS.find((act) => act === id) ?? "start" });
        }
      },
    },
  );
  for (const parameter of PARAMETERS) {
    // the scale shows in the tension's colours, which the switch's turn shows,
    // and the white in the palette's
    if (parameter !== SCALE && parameter !== WHITE) {
      controls.showValue(parameter.id, settings.value(parameter));
    }
  }
  showWhite();
  showHold();
  showLayers();
  showMusic();
  showDance();
  // a source of the music lit while it plays (decision 76)
  music.onPlaying = (playing) => {
    for (const source of music.sources) {
      controls.showAction(
        source.id,
        source.icon,
        source.label,
        source.id === playing,
      );
    }
  };
  // the switches as the address asks for them
  showLight();
  showTension();
  showSave();
  showTitle();
  // the button shows for a moment as the piece opens, so that it is found
  controls.wake();

  /** The keys of the row's controls and actions (decision 53), but Space, which the piece's gestures share. */
  function key(event: KeyboardEvent): boolean {
    // a key held with Shift by where it is, or what a key types
    const action = keyAction(PARAMETERS, {
      key: event.key,
      code: event.code,
      shiftKey: event.shiftKey,
    });
    if (action !== null) {
      event.preventDefault();
      step(action.parameter, action.direction);
      // the value the key changed comes into sight, alone; the scale's in
      // the tension's colours
      controls.choose(
        action.parameter === SCALE ? TENSION.id : action.parameter.id,
      );
      return true;
    }
    const pressed = event.key;
    if (event.shiftKey && event.code === "KeyX") {
      // held with Shift by where it is, the whole view (decisions 53 and 73)
      take({ kind: "act", id: "whole" });
    } else if (pressed === "z" || pressed === "Z") {
      take({ kind: "act", id: "nearer" });
      controls.choose(ZOOM.id);
    } else if (pressed === "x" || pressed === "X") {
      take({ kind: "act", id: "farther" });
      controls.choose(ZOOM.id);
    } else if (pressed === "r" || pressed === "R") {
      take({ kind: "act", id: "start" });
    } else if (pressed === "s" || pressed === "S") {
      take({ kind: "act", id: "save" });
    } else if (pressed === "h" || pressed === "H") {
      take({ kind: "act", id: "share" });
    } else if (pressed === "o" || pressed === "O") {
      take({ kind: "act", id: "qr" });
    } else if (pressed === "b" || pressed === "B") {
      take({ kind: "act", id: "reverse" });
    } else if (pressed === "l" || pressed === "L") {
      take({ kind: "switch", id: "light", on: !settings.on("light") });
    } else if (pressed === "t" || pressed === "T") {
      take({ kind: "switch", id: "tension", on: !settings.on("tension") });
      controls.choose(TENSION.id);
    } else if (pressed === "g" || pressed === "G") {
      take({ kind: "switch", id: "sketch", on: !settings.on("sketch") });
    } else if (pressed === "w" || pressed === "W") {
      controls.toggleGroup("music");
    } else {
      return false;
    }
    controls.wake();
    return true;
  }

  return { controls, music, take, key, keepAddress, showStart };
}
