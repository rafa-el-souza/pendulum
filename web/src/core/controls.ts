// A piece's controls, made from its registry of parameters (decision 10) and a
// few actions, and kept out of the piece's way (decisions 16 and 31). When the
// pointer moves, a finger lifts or a key is pressed, a small button comes into
// sight in a corner, and it fades again after a moment of stillness. The
// button opens a thin row of small icons, one per control, which scrolls
// sideways where it does not fit. An action's icon acts; a parameter's icon
// shows that one value, with its − and +, above the row. A key steps its
// parameter whether the row is open or not, and shows the value it changed.
// The row stays open or closed as the visitor leaves it, and keyboard focus
// keeps the controls in sight.

import { cssColor } from "./color.ts";
import { cls } from "./css.ts";
import styles from "./controls.module.css";
import { drawIcon, type Icon } from "./icons.ts";
import type { Parameter } from "./parameters.ts";

/** A button that does one thing, such as pausing. */
export interface Action {
  readonly id: string;
  readonly label: string;
  readonly icon: Icon;
  /** The keys (KeyboardEvent.key) that do it too. */
  readonly keys: readonly string[];
  /** How the keys are shown beside the button. */
  readonly keysShown: string;
  /** For a switch, whether it starts on; the button then says so to a screen reader. */
  readonly pressed?: boolean;
}

/** A control in the row: a parameter, stepped down and up, or an action. */
export type Control = Parameter | Action;

export interface ControlHandlers {
  step(parameter: Parameter, direction: 1 | -1): void;
  act(id: string): void;
}

export interface Controls {
  /** Brings the controls into sight, and lets them fade after a moment of stillness. */
  wake(): void;
  /** Shows a parameter's value with its − and +, as choosing its icon does, and brings it into sight. */
  choose(id: string): void;
  /** Brings a parameter's value into sight, unless the visitor is reading another one in the open row. */
  notice(id: string): void;
  /** Shows a parameter's value; `reached`, when given, is the value actually reached. */
  showValue(id: string, value: number, reached?: number): void;
  /** Changes what an action's button shows, as pause becomes resume, and whether a switch is on. */
  showAction(id: string, icon: Icon, label: string, pressed?: boolean): void;
}

/** How long the controls stay in sight after the last sign of a visitor, in ms. */
const STAY_MS = 2500;

/** The button's little chain swinging open and shut, in degrees, settling as a pendulum does. */
const SWING_OPEN = [0, 104, 82, 94, 88, 90];
const SWING_SHUT = [90, -14, 8, -4, 2, 0];
const SWING_AT = [0, 0.28, 0.5, 0.68, 0.84, 1];
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

/** The keys shown beside a control: arrows as arrows, and letters as capitals, as on the keys. */
function showKeys(keys: readonly (string | undefined)[]): string {
  const arrows: Record<string, string> = {
    ArrowDown: "↓",
    ArrowUp: "↑",
    ArrowLeft: "←",
    ArrowRight: "→",
  };
  return keys
    .filter((key): key is string => key !== undefined)
    .map((key) => arrows[key] ?? key.toUpperCase())
    .join(" ");
}

function isParameter(control: Control): control is Parameter {
  return "values" in control;
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
  /** The colours painted, when the value is shown in colours. */
  painted: string;
}

export function mountControls(
  sets: readonly (readonly Control[])[],
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
  launcher.append(glyph);
  launcher.setAttribute("aria-label", "Controls");
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", row.id);
  launcher.title = "Controls";

  // The button first, so that it takes focus first; the row shows to its left.
  const tray = document.createElement("div");
  tray.className = cls(styles, "tray");
  tray.append(launcher, row);

  // The value chosen, shown above the row.
  const readout = document.createElement("div");
  readout.className = cls(styles, "readout");
  dock.append(tray, readout);

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
    b.setAttribute("aria-keyshortcuts", keys.join(" "));
    b.title = `${label} (${keys.join(", ")})`;
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
  let chosen: string | null = null;

  /** Shows the value of the parameter `id` above the row, or none. */
  function setChosen(id: string | null): void {
    if (chosen === id) return;
    chosen = id;
    for (const [key, entry] of entries) {
      entry.reading.hidden = key !== id;
      entry.tool.setAttribute("aria-expanded", String(key === id));
    }
  }

  for (const set of sets) {
    const cluster = document.createElement("div");
    cluster.className = cls(styles, "set");
    for (const control of set) {
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
        b.title = `${action.label} (${action.keysShown})`;
        if (action.pressed !== undefined) {
          b.setAttribute("aria-pressed", String(action.pressed));
        }
        cluster.append(b);
        actionButtons.set(action.id, {
          button: b,
          keysShown: action.keysShown,
        });
        continue;
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
        wake();
      });
      tool.title = `${parameter.label} (${showKeys([parameter.keys.down[0], parameter.keys.up[0]])})`;
      tool.append(described);
      tool.setAttribute("aria-expanded", "false");
      tool.setAttribute("aria-controls", reading.id);
      tool.setAttribute("aria-describedby", described.id);
      cluster.append(tool);

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
      keysHint.textContent = showKeys([
        parameter.keys.down[0],
        parameter.keys.up[0],
      ]);
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
        painted: "",
      });
    }
    row.append(cluster);
  }
  document.body.append(dock);

  // In sight, and fading after a moment of stillness, unless a mouse rests
  // on them.
  const awake = cls(styles, "awake");
  let open = false;
  let timer = 0;
  let mouseOver = false;
  function sleep(): void {
    if (mouseOver) {
      timer = window.setTimeout(sleep, STAY_MS);
      return;
    }
    dock.classList.remove(awake);
    // with the row shut, the value a key showed goes with the controls
    if (!open && !dock.contains(document.activeElement)) setChosen(null);
  }
  function wake(): void {
    dock.classList.add(awake);
    clearTimeout(timer);
    timer = window.setTimeout(sleep, STAY_MS);
  }
  // Whatever the visitor does on the controls keeps them in sight. A click
  // leaves the focus where it was, so that a button clicked does not keep
  // them in sight, nor take a ring at the next key; a key that reaches them
  // by Tab still does.
  dock.addEventListener("pointermove", wake);
  dock.addEventListener("pointerdown", wake);
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

  // The row fades at a side with more of it out of sight, and a wheel turned
  // up and down scrolls it sideways.
  function edges(): void {
    row.dataset.more = moreToScroll(
      row.scrollLeft,
      row.scrollWidth,
      row.clientWidth,
    );
  }
  row.addEventListener("scroll", edges, { passive: true });
  new ResizeObserver(edges).observe(row);
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

  const still = matchMedia("(prefers-reduced-motion: reduce)");
  /** The button's chain swings to lie along the row when it opens, and back to hang when it shuts. */
  function swing(opening: boolean): void {
    const turns = opening ? SWING_OPEN : SWING_SHUT;
    glyph.style.transform = `rotate(${String(turns.at(-1))}deg)`;
    if (still.matches) return;
    glyph.animate(
      turns.map((turn, i) => ({
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
    if (!on) setChosen(null);
    swing(on);
    if (on) edges();
    wake();
  }
  launcher.addEventListener("click", () => {
    setOpen(!open);
  });
  // Escape shuts the row, and a focus that was in it goes back to the button.
  addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !open) return;
    const inside = dock.contains(document.activeElement);
    setOpen(false);
    if (inside) launcher.focus();
  });

  function choose(id: string): void {
    if (!entries.has(id)) throw new Error(`no control shows ${id}`);
    setChosen(id);
    wake();
  }

  const held = cls(styles, "held");
  return {
    wake,
    choose,
    notice(id) {
      if (open && chosen !== null && chosen !== id) wake();
      else choose(id);
    },
    showValue(id, value, reached) {
      const entry = entries.get(id);
      if (entry === undefined) throw new Error(`no control shows ${id}`);
      const at = reached ?? value;
      const text = entry.parameter.show(at);
      const swatches = entry.parameter.swatches?.(at).map((c) => cssColor(c));
      if (swatches === undefined) {
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
      const words = entry.parameter.speak?.(at) ?? text;
      if (entry.spoken !== null && entry.spoken.textContent !== words) {
        entry.spoken.textContent = words;
      }
      if (entry.described.textContent !== words) {
        entry.described.textContent = words;
      }
      entry.output.classList.toggle(held, reached !== undefined);
      entry.tool.classList.toggle(held, reached !== undefined);
    },
    showAction(id, icon, label, pressed) {
      const action = actionButtons.get(id);
      if (action === undefined) throw new Error(`no action ${id}`);
      const b = action.button;
      b.replaceChildren(drawIcon(icon));
      b.setAttribute("aria-label", label);
      if (pressed !== undefined)
        b.setAttribute("aria-pressed", String(pressed));
      b.title = `${label} (${action.keysShown})`;
    },
  };
}
