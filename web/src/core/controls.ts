// A piece's controls, made from its registry of parameters (decision 10) and a
// few actions, and kept out of the piece's way (decisions 16, 31 and 32). When
// the pointer moves, a finger lifts or a key is pressed, a small button comes
// into sight in a corner, and it fades again after a moment of stillness. The
// button opens a thin row of small icons, which scrolls sideways where it does
// not fit, with a chevron at a side where there is more. The row holds a few
// actions and the groups of controls (decision 54): a group's icon opens the
// group's own row right above it, and an action's icon acts. A parameter's
// icon opens that one value, with its − and +, right above itself. A key
// steps its parameter whether the row is open or not, and shows the value it
// changed: with the row open, in its group. A group may show more than
// values above its row, as the music's meter and words do while none of its
// values is chosen, and a key may open it, as W does the music's (decision
// 76). A group may hold groups of its own, whose rows open stacked above
// the group's, as the dance's above the music's, and a group's row too wide
// for the screen scrolls sideways, faded at a side with more (decision 89).
// The row, the group and the value stay as the visitor leaves them, and
// come back so when the row is opened again. A parameter whose values are
// colours to choose from, as the palettes, opens a sheet of them all in
// place of its − and +, each chosen in one touch (decision 105). On a touch screen, a touch on the controls keeps them in sight for
// longer, a touch where they are brings them back without grabbing the
// chain, and a touch on the stage puts them away. Keyboard focus and a mouse
// resting on them keep them in sight.

import { cssColor, type Rgb } from "./color.ts";
import { cls } from "./css.ts";
import styles from "./controls.module.css";
import {
  drawBars,
  drawIcon,
  setBars,
  swingingPart,
  type Icon,
} from "./icons.ts";
import type { Parameter, Sheet } from "./parameters.ts";

/** A button that does one thing, such as pausing. */
export interface Action {
  readonly id: string;
  readonly label: string;
  readonly icon: Icon;
  /** The keys that do it too: what a key types (KeyboardEvent.key), or a key held with Shift by where it is, as "Shift+KeyX" (decision 53). */
  readonly keys: readonly string[];
  /** How the keys are shown beside the button. */
  readonly keysShown: string;
  /** For a switch, whether it starts on; the button then says so to a screen reader. */
  readonly pressed?: boolean;
  /** For a switch that shows itself lit while on, as the music's sources do (decision 76). */
  readonly lights?: boolean;
}

/** A control in the row: a parameter, stepped down and up, or an action. */
export type Control = Parameter | Action;

/**
 * A group of controls (decision 54): its icon in the row opens the group's own
 * row of icons right above it. A group in the row may hold groups of its own,
 * one level deep, each opening its row stacked above the group's (decision
 * 89).
 */
export interface Group {
  readonly id: string;
  readonly label: string;
  readonly icon: Icon;
  readonly controls: readonly (Control | Group)[];
  /** What the group shows right above its row while none of its values is chosen, as the music's meter and words (decision 76). */
  readonly panel?: HTMLElement;
  /** The keys that open the group, or shut it, which the piece listens for and `toggleGroup` answers, and how its title shows them. */
  readonly keys?: readonly string[];
  readonly keysShown?: string;
  /** The controls that each begin a set of the group's row, apart from the one before as the row's sets are (decision 89). */
  readonly breaks?: readonly string[];
}

/** What the row holds: controls, and groups of them. */
export type Item = Control | Group;

export interface ControlHandlers {
  step(parameter: Parameter, direction: 1 | -1): void;
  /** A value chosen in one touch, as a palette in a sheet (decision 105). */
  set(parameter: Parameter, value: number): void;
  act(id: string): void;
}

/** How a value stands, besides the value itself. */
export interface Showing {
  /** The value actually reached, held below the one asked for, as time is when the machine cannot keep up: shown in the hand's colour. */
  reached?: number;
  /** Whether the value has nothing to do now, as a mode's amplitude while the chain starts raised: shown faint, and still there to choose. */
  idle?: boolean;
  /** Colours to paint as dots in place of the parameter's own, for a value whose colours depend on another, as the white's on the palette. */
  swatches?: readonly Rgb[];
  /** What to show in place of the value's own text, as a number the piece measures, the lens's (decision 64). */
  text?: string;
  /** What a screen reader hears, and the icon's title says, in place of the value's own words, as the lens's number said whole. */
  words?: string;
  /** For a sheet whose cells are another parameter's values, the cell chosen, as the tension's palette (decision 105). */
  cell?: number;
}

export interface Controls {
  /** Brings the controls into sight, and lets them fade after a moment of stillness. */
  wake(): void;
  /** Shows a parameter's value with its − and +, as choosing its icon does, in its group with the row open, and brings it into sight. */
  choose(id: string): void;
  /** Brings a parameter's value into sight, unless the visitor is reading another value or another group in the open row. */
  notice(id: string): void;
  /** Shows a parameter's value, and how it stands beside it. */
  showValue(id: string, value: number, showing?: Showing): void;
  /** Changes what an action's button shows, as pause becomes resume, and whether a switch is on. */
  showAction(id: string, icon: Icon, label: string, pressed?: boolean): void;
  /** Shows an action's button faint while it has nothing to do, as the whole view's while the view is whole, and still there to press. */
  showIdle(id: string, idle: boolean): void;
  /** Opens the row on the group `id`, as its key does, or shuts the group when it is the one open. */
  toggleGroup(id: string): void;
  /** Shows three bars risen to `levels`, from 0 to 1, in place of the group's icon, as the music's while the piece listens; null brings the icon back (decision 76). */
  showLevels(id: string, levels: readonly number[] | null): void;
  /** Shows a group's icon lit, or not, as the dance's while the music dances, its words saying so (decision 89). */
  lightGroup(id: string, lit: boolean, label: string): void;
}

/** How long the controls stay in sight after a sign of a visitor on the stage, in ms. */
const STAY_MS = 2500;
/** How long they stay after a touch on them: a finger needs longer than a mouse to read them and reach the next (decision 32), in ms. */
const STAY_TOUCHED_MS = 8000;
/** How long they take to fade, as the stylesheet says, and go on taking a touch while they do, in ms. */
const FADE_MS = 600;
/** How far round the controls a touch still counts as theirs, where a finger's miss lands, in CSS px. */
const TOUCH_MARGIN = 12;
/** How far the value chosen keeps from the screen's sides, in CSS px. */
const EDGE = 8;

/**
 * The button's pendulum swinging as the row opens or shuts, in degrees from
 * where it hangs: out to the other side, and back, losing its swing, to hang
 * where it was (decision 59).
 */
const SWING = [0, 56, -22, 10, -4, 0];
const SWING_AT = [0, 0.3, 0.55, 0.74, 0.88, 1];
const SWING_MS = 900;

/** Which side of the row has more of it out of sight, or "" when it fits. Within a pixel of an end counts as at it. */
export function moreToScroll(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
): "" | "left" | "right" | "both" {
  const left = scrollLeft > 1;
  const right = scrollWidth - clientWidth - scrollLeft > 1;
  if (left && right) return "both";
  if (left) return "left";
  return right ? "right" : "";
}

/** Where a box `width` wide starts so as to be centred on `centre`, kept between `min` and `max`, or at `min` when it is wider than that. */
export function centredOver(
  centre: number,
  width: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(centre - width / 2, max - width));
}

/** A box on the screen, as getBoundingClientRect gives it, in CSS px. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Whether a point is on one of the boxes, or within `margin` of one. */
export function onControls(
  boxes: readonly Box[],
  margin: number,
  x: number,
  y: number,
): boolean {
  return boxes.some(
    (box) =>
      x >= box.left - margin &&
      x <= box.right + margin &&
      y >= box.top - margin &&
      y <= box.bottom + margin,
  );
}

/** A key held with Shift by where it is, "Shift+KeyP", "Shift+Digit7" or "Shift+ArrowUp", as the key's own letter, digit or name, or null for any other key. */
function shifted(key: string): string | null {
  const match = /^Shift\+(?:Key|Digit)?(.+)$/.exec(key);
  return match?.[1] ?? null;
}

/** A key as a screen reader's shortcut names it: "Shift+P" for a key held with Shift. */
function shortcut(key: string): string {
  const held = shifted(key);
  return held === null ? key : `Shift+${held}`;
}

/**
 * The keys shown beside a control: arrows as arrows, and letters as capitals,
 * as on the keys; keys held with Shift after the word, "Shift 7 8" or "Shift
 * ↓ ↑", since a font may lack the ⇧ sign.
 */
export function showKeys(keys: readonly (string | undefined)[]): string {
  const arrows: Record<string, string> = {
    ArrowDown: "↓",
    ArrowUp: "↑",
    ArrowLeft: "←",
    ArrowRight: "→",
  };
  const shown = (key: string): string => arrows[key] ?? key.toUpperCase();
  const pressed = keys.filter((key): key is string => key !== undefined);
  const held = pressed.map(shifted);
  if (held.length > 0 && held.every((key) => key !== null)) {
    return `Shift ${held.map(shown).join(" ")}`;
  }
  return pressed
    .map((key) => {
      const letter = shifted(key);
      return letter === null ? shown(key) : `Shift+${shown(letter)}`;
    })
    .join(" ");
}

/** A control's title: its name, and its keys where it has any. */
function titled(label: string, keys: string): string {
  return keys === "" ? label : `${label} (${keys})`;
}

function isParameter(control: Control): control is Parameter {
  return "values" in control;
}

function isGroup(item: Item | Group): item is Group {
  return "controls" in item;
}

/**
 * Where the arrow `key` takes the choice in a sheet of `count` cells,
 * `columns` to a line, from the cell `at`: along the line, to the line above
 * or below, or to the first or the last with Home and End, stopping at
 * either end, as in a group of radio buttons (decision 105). Null for any
 * other key, which the piece takes.
 */
export function sheetMove(
  at: number,
  key: string,
  columns: number,
  count: number,
): number | null {
  const moves: Record<string, number> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: columns,
    ArrowUp: -columns,
    Home: -at,
    End: count - 1 - at,
  };
  const move = moves[key];
  if (move === undefined) return null;
  return Math.min(count - 1, Math.max(0, at + move));
}

/** What a parameter's value shows and says, kept to update it. */
interface Entry {
  readonly parameter: Parameter;
  /** Its icon in the row, which shows its value when chosen. */
  readonly tool: HTMLButtonElement;
  readonly toolIcon: SVGSVGElement;
  /** The value in words, which the icon in the row is described by. */
  readonly described: HTMLElement;
  /** Its value with its − and +, above the row, in sight while chosen. */
  readonly reading: HTMLElement;
  readonly output: HTMLOutputElement;
  /** Where the value is shown, and where it is said, when the two differ. */
  readonly shown: HTMLElement;
  readonly spoken: HTMLElement | null;
  readonly readingIcon: SVGSVGElement;
  /** Its keys, beside the value where a pointer hovers. */
  readonly keys: HTMLElement;
  /** The keys as its title shows them. */
  readonly keysShown: string;
  /** The colours painted, when the value is shown in colours. */
  painted: string;
  /** For a value chosen in a sheet, its parts (decision 105). */
  readonly sheet: SheetShown | null;
}

/** What a sheet shows, kept to update it (decision 105). */
interface SheetShown {
  readonly spec: Sheet;
  /** The words at its head. */
  readonly name: HTMLElement;
  /** The words above the cells, for a parameter whose cells are another's: one for each of its own values. */
  readonly words: Map<number, HTMLButtonElement>;
  /** The cells, one for each value, in their grid. */
  readonly cells: Map<number, HTMLButtonElement>;
  readonly grid: HTMLElement;
  /** The value and the cell shown, and the cell under the pointer or in focus, if any. */
  value: number;
  cell: number;
  over: number | null;
}

export function mountControls(
  sets: readonly (readonly Item[])[],
  handlers: ControlHandlers,
): Controls {
  const dock = document.createElement("div");
  dock.className = cls(styles, "dock");
  dock.id = "controls";

  const row = document.createElement("div");
  row.className = cls(styles, "row");
  row.id = "controls-row";
  row.setAttribute("role", "toolbar");
  row.setAttribute("aria-label", "Controls");
  row.hidden = true;

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = cls(styles, "launcher");
  const glyph = drawIcon("controls");
  const swinging = swingingPart(glyph);
  launcher.append(glyph);
  launcher.setAttribute("aria-label", "Controls");
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", row.id);
  launcher.title = "Controls";

  // The row, and at each side a chevron that shows there is more of it that
  // way, and scrolls it there; for a pointer only, since focus moving along
  // the row scrolls it too.
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const track = document.createElement("div");
  track.className = cls(styles, "track");
  const chevron = (side: "left" | "right"): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls(styles, "more");
    b.dataset.scroll = side;
    b.tabIndex = -1;
    b.setAttribute("aria-hidden", "true");
    b.append(drawIcon(side));
    b.addEventListener("click", () => {
      row.scrollBy({
        left: (side === "left" ? -0.7 : 0.7) * row.clientWidth,
        behavior: still.matches ? "auto" : "smooth",
      });
    });
    return b;
  };
  track.append(row, chevron("left"), chevron("right"));

  // The button first, so that it takes focus first; the row shows to its left.
  const tray = document.createElement("div");
  tray.className = cls(styles, "tray");
  tray.append(launcher, track);

  // The open group's row, right above the row and its own icon (decision 54),
  // and the row of a group in it, stacked above (decision 89).
  const shelf = document.createElement("div");
  shelf.className = cls(styles, "shelf");
  shelf.hidden = true;
  const upper = document.createElement("div");
  upper.className = cls(styles, "shelf");
  upper.hidden = true;

  // The value chosen, which opens right above its icon.
  const readout = document.createElement("div");
  readout.className = cls(styles, "readout");
  dock.append(upper, shelf, tray, readout);

  const button = (
    className: string,
    content: string | SVGSVGElement,
    label: string,
    keys: readonly string[],
    onClick: () => void,
  ): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls(styles, className);
    b.append(content);
    b.setAttribute("aria-label", label);
    if (keys.length > 0) {
      b.setAttribute("aria-keyshortcuts", keys.map(shortcut).join(" "));
      b.title = `${label} (${showKeys(keys)})`;
    } else {
      b.title = label;
    }
    b.addEventListener("click", onClick);
    return b;
  };

  const hidden = (className: string): HTMLSpanElement => {
    const span = document.createElement("span");
    span.className = cls(styles, className);
    return span;
  };

  const entries = new Map<string, Entry>();
  const actionButtons = new Map<
    string,
    { button: HTMLButtonElement; keysShown: string }
  >();
  // each group's icon and its own row, the group it is in, if any, and the
  // group of each control
  const groups = new Map<
    string,
    {
      button: HTMLButtonElement;
      row: HTMLElement;
      icon: Icon;
      panel: HTMLElement | null;
      parent: string | null;
    }
  >();
  // the bars shown in place of a group's icon while its levels move
  const bars = new Map<string, SVGSVGElement>();
  const groupOf = new Map<string, string>();
  let chosen: string | null = null;
  let group: string | null = null;
  // the group open within the open group (decision 89)
  let inner: string | null = null;
  let open = false;
  // what was open last, which comes back as it was left (decisions 54 and
  // 89): the group, in each group the group open within it, and in each
  // group the value
  let lastGroup: string | null = null;
  const lastInner = new Map<string, string | null>();
  const lastChosen = new Map<string, string | null>();

  /** Shows the value of the parameter `id` above its icon, or none. */
  function setChosen(id: string | null): void {
    if (chosen === id) return;
    chosen = id;
    for (const [key, entry] of entries) {
      entry.reading.hidden = key !== id;
      entry.tool.setAttribute("aria-expanded", String(key === id));
    }
    showPanels();
    place();
  }

  /** The open group's panel, in the value's place while none of its values is chosen (decision 76). */
  function panelShown(): HTMLElement | null {
    if (!open || group === null || chosen !== null) return null;
    return groups.get(group)?.panel ?? null;
  }
  function showPanels(): void {
    const shown = panelShown();
    for (const { panel } of groups.values()) {
      if (panel !== null) panel.hidden = panel !== shown;
    }
  }

  /** Shows the row of the group `id` above its icon, or none, with the group that was open in it and the value that was open there. */
  function setGroup(id: string | null): void {
    group = id;
    for (const [key, { button, row: own, parent }] of groups) {
      if (parent !== null) continue;
      own.hidden = key !== id;
      button.setAttribute("aria-expanded", String(key === id));
    }
    shelf.hidden = id === null;
    setInner(id === null ? null : (lastInner.get(id) ?? null));
  }

  /** Shows the row of the group `id`, within the open group, stacked above its row, or none, with the value that was open in it (decision 89). */
  function setInner(id: string | null): void {
    inner = id;
    for (const [key, { button, row: own, parent }] of groups) {
      if (parent === null) continue;
      own.hidden = key !== id;
      button.setAttribute("aria-expanded", String(key === id));
    }
    upper.hidden = id === null;
    const at = id ?? group;
    setChosen(at === null ? null : (lastChosen.get(at) ?? null));
    showPanels();
    place();
  }

  /** What is open now is what opens next time. */
  function remember(): void {
    lastGroup = group;
    if (group === null) return;
    lastInner.set(group, inner);
    const at = inner ?? group;
    lastChosen.set(
      at,
      chosen !== null && groupOf.get(chosen) === at ? chosen : null,
    );
  }

  /** A group's row too wide for the screen scrolls, faded at a side with more of it out of sight (decision 89). */
  function fit(own: HTMLElement): void {
    const room = innerWidth - 2 * EDGE;
    const wide = own.scrollWidth > room + 1;
    if (wide) own.style.maxWidth = `${String(room)}px`;
    else own.style.removeProperty("max-width");
    own.toggleAttribute("data-wide", wide);
    own.dataset.more = wide
      ? moreToScroll(own.scrollLeft, own.scrollWidth, own.clientWidth)
      : "";
  }

  /**
   * The open group's row opens right above its icon, centred on it, and
   * stays on the screen (decision 54). The value chosen opens right above its
   * icon, centred on it, and stays on the screen; with its group shut, above
   * the group's icon; with the row shut, above the button (decision 32).
   */
  function place(): void {
    const dockLeft = dock.getBoundingClientRect().left;
    const shown = group === null ? undefined : groups.get(group);
    // each open row over its icon: the group's, and the one open in it
    for (const id of [group, inner]) {
      const opened = id === null ? undefined : groups.get(id);
      if (!open || opened === undefined) continue;
      fit(opened.row);
      const at = opened.button.getBoundingClientRect();
      const left = centredOver(
        at.left + at.width / 2,
        opened.row.offsetWidth,
        EDGE,
        innerWidth - EDGE,
      );
      opened.row.style.left = `${String(left - dockLeft)}px`;
    }
    if (open && shown !== undefined) {
      // the panel above it, centred on the group's icon too
      const panel = panelShown();
      if (panel !== null) {
        const at = centredOver(
          shown.button.getBoundingClientRect().left +
            shown.button.offsetWidth / 2,
          panel.offsetWidth,
          EDGE,
          innerWidth - EDGE,
        );
        readout.style.left = `${String(at - dockLeft)}px`;
      }
    }
    if (chosen === null) return;
    const entry = entries.get(chosen);
    if (entry === undefined) return;
    // a sheet with the row shut shows its head alone (decision 105)
    entry.reading.toggleAttribute("data-compact", !open);
    const anchor = anchorOf(chosen, entry.tool).getBoundingClientRect();
    // its keys, beside it where a pointer hovers, stay on the screen too
    const keys = entry.keys.offsetWidth;
    const left = centredOver(
      anchor.left + anchor.width / 2,
      entry.reading.offsetWidth,
      EDGE,
      innerWidth - EDGE - (keys === 0 ? 0 : keys + 2),
    );
    readout.style.left = `${String(left - dockLeft)}px`;
  }

  /**
   * Where the value of the control `id` opens: above its icon where its row
   * is open; with the row open and its group shut, above the icon of the
   * group, or of the group within it, that is in sight; with the row shut,
   * above the button.
   */
  function anchorOf(id: string, tool: HTMLElement): HTMLElement {
    if (!open) return launcher;
    const owner = groupOf.get(id);
    if (owner === undefined) return tool;
    if (owner === group || owner === inner) return tool;
    const owned = groups.get(owner);
    if (owned === undefined) return tool;
    if (owned.parent !== null && owned.parent === group) return owned.button;
    return groups.get(owned.parent ?? owner)?.button ?? tool;
  }

  /** Puts a control's icon `into` a row: an action's, which acts, or a parameter's, which opens its value. */
  function add(into: HTMLElement, control: Control): void {
    if (!isParameter(control)) {
      const action = control;
      const b = button(
        "tool",
        drawIcon(action.icon),
        action.label,
        action.keys,
        () => {
          handlers.act(action.id);
        },
      );
      b.title = titled(action.label, action.keysShown);
      if (action.pressed !== undefined) {
        b.setAttribute("aria-pressed", String(action.pressed));
      }
      if (action.lights === true) b.dataset.lights = "";
      into.append(b);
      actionButtons.set(action.id, {
        button: b,
        keysShown: action.keysShown,
      });
      return;
    }

    const parameter = control;
    if (parameter.icon === undefined) {
      throw new Error(
        `${parameter.id} has no icon, and the row names its controls without words`,
      );
    }
    const keys = [...parameter.keys.down, ...parameter.keys.up];
    const reading = document.createElement("div");
    reading.className = cls(styles, "reading");
    reading.id = `control-${parameter.id}`;
    reading.setAttribute("role", "group");
    reading.setAttribute("aria-label", parameter.label);
    reading.hidden = true;

    const toolIcon = drawIcon(parameter.icon);
    const described = hidden("spoken");
    described.id = `control-${parameter.id}-value`;
    const tool = button("tool", toolIcon, parameter.label, keys, () => {
      setChosen(chosen === parameter.id ? null : parameter.id);
      remember();
      wake();
    });
    const keysShown =
      parameter.keysShown ??
      showKeys([parameter.keys.down[0], parameter.keys.up[0]]);
    tool.title = `${parameter.label} (${keysShown})`;
    tool.append(described);
    tool.setAttribute("aria-expanded", "false");
    tool.setAttribute("aria-controls", reading.id);
    tool.setAttribute("aria-describedby", described.id);
    into.append(tool);
    if (parameter.sheet !== undefined) {
      addSheet(parameter, parameter.sheet, {
        reading,
        tool,
        toolIcon,
        described,
        keysShown,
      });
      return;
    }

    const output = document.createElement("output");
    output.className = cls(styles, "value");
    output.setAttribute("aria-live", "polite");
    const holder = hidden("icon");
    const readingIcon = drawIcon(parameter.icon);
    holder.append(readingIcon);
    const shown = document.createElement("span");
    output.append(holder, shown);
    let spoken: HTMLElement | null = null;
    if (parameter.speak !== undefined || parameter.swatches !== undefined) {
      // shown to the eye in a way of its own, and said in words to a screen reader
      shown.setAttribute("aria-hidden", "true");
      spoken = hidden("spoken");
      output.append(spoken);
    }
    const keysHint = hidden("keys");
    keysHint.setAttribute("aria-hidden", "true");
    keysHint.textContent = keysShown;
    reading.append(
      button(
        "button",
        "−",
        `Less: ${parameter.label}`,
        parameter.keys.down,
        () => {
          handlers.step(parameter, -1);
        },
      ),
      output,
      button(
        "button",
        "+",
        `More: ${parameter.label}`,
        parameter.keys.up,
        () => {
          handlers.step(parameter, 1);
        },
      ),
      keysHint,
    );
    readout.append(reading);
    entries.set(parameter.id, {
      parameter,
      tool,
      toolIcon,
      described,
      reading,
      output,
      shown,
      spoken,
      readingIcon,
      keys: keysHint,
      keysShown,
      painted: "",
      sheet: null,
    });
  }

  /**
   * A parameter's value chosen in a sheet of colours, in one touch (decision
   * 105): the words of the value chosen at its head, then, for a parameter
   * whose cells are another's values, its own values in words, then the
   * cells, each a strip of its colours. A touch on a cell chooses it, and
   * the sheet stays open, to compare with the next; the pointer over a cell,
   * or the focus on it, puts its name at the head; the arrows move along the
   * sheet and choose. With the row shut, as a key opens a value above the
   * button, the head alone.
   */
  function addSheet(
    parameter: Parameter,
    spec: Sheet,
    parts: {
      reading: HTMLElement;
      tool: HTMLButtonElement;
      toolIcon: SVGSVGElement;
      described: HTMLElement;
      keysShown: string;
    },
  ): void {
    const { reading, tool, toolIcon, described, keysShown } = parts;
    reading.classList.add(cls(styles, "sheet"));
    const output = document.createElement("output");
    output.className = cls(styles, "head");
    output.setAttribute("aria-live", "polite");
    const holder = hidden("icon");
    const readingIcon = drawIcon(parameter.icon ?? "palette");
    holder.append(readingIcon);
    const name = document.createElement("span");
    output.append(holder, name);
    const keysHint = hidden("keys");
    keysHint.setAttribute("aria-hidden", "true");
    keysHint.textContent = keysShown;
    const heading = document.createElement("div");
    heading.className = cls(styles, "heading");
    heading.append(output, keysHint);
    reading.append(heading);

    const of = spec.cells ?? parameter;
    const words = new Map<number, HTMLButtonElement>();
    if (spec.cells !== undefined) {
      const said = document.createElement("div");
      said.className = cls(styles, "words");
      said.setAttribute("role", "radiogroup");
      said.setAttribute("aria-label", parameter.label);
      for (const value of parameter.values) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls(styles, "word");
        b.setAttribute("role", "radio");
        b.textContent = parameter.show(value);
        b.addEventListener("click", () => {
          handlers.set(parameter, value);
        });
        words.set(value, b);
        said.append(b);
      }
      reading.append(said);
    }

    const grid = document.createElement("div");
    grid.className = cls(styles, "cells");
    grid.setAttribute("role", "radiogroup");
    grid.setAttribute("aria-label", of.label);
    grid.style.setProperty("--columns", String(spec.columns));
    const cells = new Map<number, HTMLButtonElement>();
    const shown: SheetShown = {
      spec,
      name,
      words,
      cells,
      grid,
      value: parameter.initial,
      cell: of.initial,
      over: null,
    };
    const values = of.values;
    values.forEach((value, at) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = cls(styles, "cell");
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", of.show(value));
      b.title = of.show(value);
      b.tabIndex = -1;
      const strip = document.createElement("span");
      strip.className = cls(styles, "strip");
      const colors = spec.strip(value).map((c) => cssColor(c));
      strip.style.background = `linear-gradient(to right, ${colors.join(", ")})`;
      b.append(strip);
      b.addEventListener("click", () => {
        handlers.set(of, value);
      });
      const over = (on: boolean): void => {
        if (on) shown.over = value;
        else if (shown.over === value) shown.over = null;
        nameSheet(parameter, shown);
      };
      b.addEventListener("pointerenter", () => {
        over(true);
      });
      b.addEventListener("pointerleave", () => {
        over(false);
      });
      b.addEventListener("focus", () => {
        over(true);
      });
      b.addEventListener("blur", () => {
        over(false);
      });
      // the arrows go no further than the sheet, as the piece's own keys
      // would take them; as many to a line as the screen shows
      b.addEventListener("keydown", (event) => {
        const columns =
          getComputedStyle(grid).gridTemplateColumns.split(" ").length;
        const next = sheetMove(at, event.key, columns, values.length);
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        const value = values[next];
        if (value === undefined) return;
        cells.get(value)?.focus();
        handlers.set(of, value);
      });
      cells.set(value, b);
      grid.append(b);
    });
    reading.append(grid);
    readout.append(reading);
    entries.set(parameter.id, {
      parameter,
      tool,
      toolIcon,
      described,
      reading,
      output,
      shown: name,
      spoken: null,
      readingIcon,
      keys: keysHint,
      keysShown,
      painted: "",
      sheet: shown,
    });
  }

  /** The words for a sheet's value and cell chosen. */
  function sheetWords(parameter: Parameter, shown: SheetShown): string {
    const { spec, value, cell } = shown;
    return spec.words?.(value, cell) ?? parameter.show(value);
  }

  /** The words at a sheet's head: the name of the cell under the pointer or in focus, or those of the value and the cell chosen. */
  function nameSheet(parameter: Parameter, shown: SheetShown): void {
    const of = shown.spec.cells ?? parameter;
    const words =
      shown.over !== null ? of.show(shown.over) : sheetWords(parameter, shown);
    if (shown.name.textContent !== words) shown.name.textContent = words;
  }

  /** A sheet showing `value`, and `cell` among its cells, and what a screen reader hears for them. */
  function showSheet(
    parameter: Parameter,
    shown: SheetShown,
    value: number,
    cell: number,
  ): string {
    shown.value = value;
    shown.cell = cell;
    const { spec } = shown;
    for (const [v, b] of shown.words) {
      b.setAttribute("aria-checked", String(v === value));
    }
    const chosenCell = spec.cells === undefined ? value : cell;
    for (const [v, b] of shown.cells) {
      const on = v === chosenCell;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    nameSheet(parameter, shown);
    return sheetWords(parameter, shown);
  }

  /**
   * A group's icon, which opens its own row above it, or shuts it: in the
   * row, a group's row right above it; in a group's row, a group's row
   * stacked above that (decision 89), and no deeper.
   */
  function addGroup(item: Group, parent: string | null): HTMLButtonElement {
    const own = document.createElement("div");
    own.className = cls(styles, "group");
    own.id = `group-${item.id}`;
    own.setAttribute("role", "toolbar");
    own.setAttribute("aria-label", item.label);
    own.hidden = true;
    const opener = button(
      "tool",
      drawIcon(item.icon),
      item.label,
      item.keys ?? [],
      () => {
        if (parent === null) setGroup(group === item.id ? null : item.id);
        else setInner(inner === item.id ? null : item.id);
        remember();
        wake();
      },
    );
    if (item.keysShown !== undefined) {
      opener.title = `${item.label} (${item.keysShown})`;
    }
    opener.setAttribute("aria-expanded", "false");
    opener.setAttribute("aria-controls", own.id);
    for (const member of item.controls) {
      if (item.breaks?.includes(member.id) === true) {
        own.append(hidden("break"));
      }
      if (!isGroup(member)) {
        groupOf.set(member.id, item.id);
        add(own, member);
      } else if (parent !== null) {
        throw new Error(`${member.id} is a group two deep, in ${item.id}`);
      } else {
        own.append(addGroup(member, item.id));
      }
    }
    // a wide row's fade, and the value chosen above it, follow it as it
    // scrolls, and a wheel turned up and down scrolls it sideways, as the
    // row's do
    own.addEventListener(
      "scroll",
      () => {
        place();
      },
      { passive: true },
    );
    own.addEventListener(
      "wheel",
      (event) => {
        const fits = own.scrollWidth <= own.clientWidth;
        if (fits || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
        event.preventDefault();
        own.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      },
      { passive: false },
    );
    (parent === null ? shelf : upper).append(own);
    const panel = item.panel ?? null;
    if (panel !== null) {
      panel.hidden = true;
      readout.append(panel);
    }
    groups.set(item.id, {
      button: opener,
      row: own,
      icon: item.icon,
      panel,
      parent,
    });
    return opener;
  }

  for (const set of sets) {
    const cluster = document.createElement("div");
    cluster.className = cls(styles, "set");
    for (const item of set) {
      if (isGroup(item)) cluster.append(addGroup(item, null));
      else add(cluster, item);
    }
    row.append(cluster);
  }
  document.body.append(dock);

  // In sight until a moment after the last sign of a visitor, unless a mouse
  // rests on them; then they fade, and go on taking a touch while they do.
  const awake = cls(styles, "awake");
  const fading = cls(styles, "fading");
  let timer = 0;
  let fadeTimer = 0;
  // when they may fade, in performance.now() time
  let until = 0;
  let mouseOver = false;
  function sleep(): void {
    dock.classList.remove(awake);
    clearTimeout(fadeTimer);
    const faded = (): void => {
      dock.classList.remove(fading);
      // with the row shut, the value a key showed goes with the controls
      if (!open && !dock.contains(document.activeElement)) setChosen(null);
    };
    if (still.matches) {
      faded();
      return;
    }
    dock.classList.add(fading);
    fadeTimer = window.setTimeout(faded, FADE_MS);
  }
  function due(): void {
    const left = until - performance.now();
    if (left > 1) timer = window.setTimeout(due, left);
    else if (mouseOver) timer = window.setTimeout(due, STAY_MS);
    else sleep();
  }
  /** In sight for at least `stay` ms more. */
  function wake(stay = STAY_MS): void {
    clearTimeout(fadeTimer);
    dock.classList.remove(fading);
    dock.classList.add(awake);
    until = Math.max(until, performance.now() + stay);
    clearTimeout(timer);
    timer = window.setTimeout(due, until - performance.now());
  }
  /** Put away at once, as when a finger goes back to the stage. */
  function rest(): void {
    until = 0;
    clearTimeout(timer);
    if (dock.classList.contains(awake)) sleep();
  }
  // Whatever the visitor does on the controls keeps them in sight, and a
  // touch for longer. A click leaves the focus where it was, so that a button
  // clicked does not keep them in sight, nor take a ring at the next key; a
  // key that reaches them by Tab still does.
  dock.addEventListener("pointermove", () => {
    wake();
  });
  dock.addEventListener("pointerdown", (event) => {
    wake(event.pointerType === "mouse" ? STAY_MS : STAY_TOUCHED_MS);
  });
  dock.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") mouseOver = true;
  });
  dock.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse") return;
    mouseOver = false;
    wake();
  });
  dock.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  /** Where the controls are on the screen: the button with the row, the open group's row, and the value chosen. */
  function boxes(): Box[] {
    const all: Box[] = [tray.getBoundingClientRect()];
    for (const id of [group, inner]) {
      const shown = id === null ? undefined : groups.get(id);
      if (shown !== undefined) all.push(shown.row.getBoundingClientRect());
    }
    if (chosen !== null || panelShown() !== null) {
      all.push(readout.getBoundingClientRect());
    }
    return all;
  }
  // A touch where the controls are, seen or not, is for them: it brings them
  // back, and never reaches the stage to grab the chain. It only brings them
  // back: the click it ends in does nothing, so that a control out of sight
  // is never worked by a touch that could not see it. A touch anywhere else
  // on the stage puts them away (decision 32).
  // whether the next click ends a touch that only brought the controls back;
  // any later click starts with a pointer down or a key of its own
  let swallowClick = false;
  addEventListener(
    "pointerdown",
    (event) => {
      swallowClick = false;
      if (event.pointerType === "mouse") return;
      if (event.target instanceof Node && dock.contains(event.target)) return;
      if (onControls(boxes(), TOUCH_MARGIN, event.clientX, event.clientY)) {
        event.stopPropagation();
        event.preventDefault();
        wake(STAY_TOUCHED_MS);
        swallowClick = true;
      } else {
        rest();
      }
    },
    { capture: true },
  );
  addEventListener(
    "keydown",
    () => {
      swallowClick = false;
    },
    { capture: true },
  );
  addEventListener(
    "click",
    (event) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
      event.preventDefault();
    },
    { capture: true },
  );

  // The row fades at a side with more of it out of sight, and a wheel turned
  // up and down scrolls it sideways.
  function edges(): void {
    track.dataset.more = moreToScroll(
      row.scrollLeft,
      row.scrollWidth,
      row.clientWidth,
    );
  }
  // the value chosen follows its icon as the row scrolls
  const settle = (): void => {
    edges();
    place();
  };
  row.addEventListener("scroll", settle, { passive: true });
  // and so does a value, or a group's panel, whose words grow or shrink
  const resized = new ResizeObserver(settle);
  resized.observe(row);
  resized.observe(readout);
  addEventListener("resize", settle);
  row.addEventListener(
    "wheel",
    (event) => {
      const fits = row.scrollWidth <= row.clientWidth;
      if (fits || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
      // a wheel that counts in lines, as Firefox's may, moves about 16 px a line
      row.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
    },
    { passive: false },
  );

  /** The button's pendulum swings out and back as the row opens or shuts. */
  function swing(): void {
    if (still.matches || swinging === null) return;
    swinging.animate(
      SWING.map((turn, i) => ({
        transform: `rotate(${String(turn)}deg)`,
        offset: SWING_AT[i] ?? null,
        easing: "ease-in-out",
      })),
      { duration: SWING_MS },
    );
  }

  function setOpen(on: boolean): void {
    open = on;
    row.hidden = !on;
    launcher.setAttribute("aria-expanded", String(on));
    // opened, as it was left: its group, and the value open in it (decision
    // 54); shut, it keeps them for the next time
    setGroup(on ? lastGroup : null);
    swing();
    settle();
    wake();
  }
  launcher.addEventListener("click", () => {
    setOpen(!open);
  });
  // Escape shuts the group open within a group, then the open group, then
  // the row, and a focus that was in what it shut goes back to the icon that
  // opened it.
  addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !open) return;
    const within = inner === null ? undefined : groups.get(inner);
    if (within !== undefined) {
      const inside = within.row.contains(document.activeElement);
      setInner(null);
      remember();
      if (inside) within.button.focus();
      wake();
      return;
    }
    const shown = group === null ? undefined : groups.get(group);
    if (shown !== undefined) {
      const inside = shown.row.contains(document.activeElement);
      setGroup(null);
      remember();
      if (inside) shown.button.focus();
      wake();
      return;
    }
    const inside = dock.contains(document.activeElement);
    setOpen(false);
    if (inside) launcher.focus();
  });

  /**
   * A key's value, above its icon in its group with the row open, or alone
   * above the button; what the visitor reaches for is what opens next time.
   */
  function choose(id: string): void {
    if (!entries.has(id)) throw new Error(`no control shows ${id}`);
    const owner = groupOf.get(id) ?? null;
    const parent = owner === null ? null : (groups.get(owner)?.parent ?? null);
    const top = parent ?? owner;
    if (open && top !== null && top !== group) setGroup(top);
    if (open && parent !== null && inner !== owner) setInner(owner);
    setChosen(id);
    if (top !== null && owner !== null) {
      lastGroup = top;
      if (parent !== null) lastInner.set(top, owner);
      lastChosen.set(owner, id);
    }
    wake();
  }

  const held = cls(styles, "held");
  const faint = cls(styles, "idle");
  return {
    wake,
    choose,
    notice(id) {
      const owner = groupOf.get(id) ?? null;
      const reading = chosen !== null && chosen !== id;
      const at = inner ?? group;
      const elsewhere = at !== null && owner !== at;
      if (open && (reading || elsewhere)) {
        wake();
        return;
      }
      setChosen(id);
      wake();
    },
    showValue(id, value, showing = {}) {
      const { reached, idle = false, swatches: painting } = showing;
      const entry = entries.get(id);
      if (entry === undefined) throw new Error(`no control shows ${id}`);
      const at = reached ?? value;
      if (entry.sheet !== null) {
        const words = showSheet(
          entry.parameter,
          entry.sheet,
          at,
          showing.cell ?? entry.sheet.cell,
        );
        if (entry.described.textContent !== words) {
          entry.described.textContent = words;
        }
        if (id === chosen) place();
        return;
      }
      const text = showing.text ?? entry.parameter.show(at);
      const swatches = (painting ?? entry.parameter.swatches?.(at))?.map((c) =>
        cssColor(c),
      );
      const before = entry.shown.textContent;
      if (swatches === undefined || swatches.length === 0) {
        // in words, where a value has no colours to paint, as colours off
        entry.painted = "";
        if (entry.shown.textContent !== text) entry.shown.textContent = text;
      } else if (entry.painted !== swatches.join()) {
        // one dot for each colour, painted through a custom property
        entry.painted = swatches.join();
        entry.shown.replaceChildren(
          ...swatches.map((color) => {
            const dot = document.createElement("span");
            dot.className = cls(styles, "swatch");
            dot.style.setProperty("--swatch", color);
            dot.textContent = "●";
            return dot;
          }),
        );
      }
      const turn = entry.parameter.iconTurn?.(at);
      if (turn !== undefined) {
        const rotate = `rotate(${String(turn)}deg)`;
        entry.readingIcon.style.transform = rotate;
        entry.toolIcon.style.transform = rotate;
      }
      const words = showing.words ?? entry.parameter.speak?.(at) ?? text;
      if (entry.spoken !== null && entry.spoken.textContent !== words) {
        entry.spoken.textContent = words;
      }
      if (entry.described.textContent !== words) {
        entry.described.textContent = words;
      }
      // the title says the words given in place of the name, as the lens's
      // number said whole, and the name again once they are gone
      const title = `${showing.words ?? entry.parameter.label} (${entry.keysShown})`;
      if (entry.tool.title !== title) entry.tool.title = title;
      entry.output.classList.toggle(held, reached !== undefined);
      entry.tool.classList.toggle(held, reached !== undefined);
      entry.output.classList.toggle(faint, idle);
      entry.tool.classList.toggle(faint, idle);
      // a value that grew or shrank stays centred on its icon
      if (id === chosen && entry.shown.textContent !== before) place();
    },
    showAction(id, icon, label, pressed) {
      const action = actionButtons.get(id);
      if (action === undefined) throw new Error(`no action ${id}`);
      const b = action.button;
      b.replaceChildren(drawIcon(icon));
      b.setAttribute("aria-label", label);
      if (pressed !== undefined)
        b.setAttribute("aria-pressed", String(pressed));
      b.title = titled(label, action.keysShown);
    },
    showIdle(id, idle) {
      const action = actionButtons.get(id);
      if (action === undefined) throw new Error(`no action ${id}`);
      action.button.classList.toggle(faint, idle);
    },
    toggleGroup(id) {
      if (!groups.has(id)) throw new Error(`no group ${id}`);
      if (open && group === id) setGroup(null);
      else if (open) setGroup(id);
      else {
        lastGroup = id;
        setOpen(true);
      }
      remember();
      wake();
    },
    showLevels(id, levels) {
      const shown = groups.get(id);
      if (shown === undefined) throw new Error(`no group ${id}`);
      let drawn = bars.get(id);
      if (levels === null) {
        if (drawn === undefined) return;
        bars.delete(id);
        shown.button.replaceChildren(drawIcon(shown.icon));
        return;
      }
      if (drawn === undefined) {
        drawn = drawBars();
        bars.set(id, drawn);
        shown.button.replaceChildren(drawn);
      }
      // nothing to see with the row shut; with reduced motion asked for,
      // the bars stand still halfway, which says the piece listens
      if (!open) return;
      setBars(drawn, still.matches ? levels.map(() => 0.5) : levels);
    },
    lightGroup(id, lit, label) {
      const shown = groups.get(id);
      if (shown === undefined) throw new Error(`no group ${id}`);
      shown.button.toggleAttribute("data-lit", lit);
      shown.button.setAttribute("aria-label", label);
      shown.button.title = label;
    },
  };
}
