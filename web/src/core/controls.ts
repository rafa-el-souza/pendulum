// A piece's controls, made from its registry of parameters (decision 10) and a
// few actions: discreet, out of sight until the pointer moves, a finger
// touches or a key is pressed, and gone again after a moment of stillness
// (decision 16). Every control has a key, shown beside it on screens with a
// pointer that hovers; keyboard focus keeps them in sight.

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
}

export interface ControlHandlers {
  step(parameter: Parameter, direction: 1 | -1): void;
  act(id: string): void;
}

export interface Controls {
  /** Brings the controls into sight, and lets them fade after a moment of stillness. */
  wake(): void;
  /** Shows a parameter's value; `reached`, when given, is the value actually reached. */
  showValue(id: string, value: number, reached?: number): void;
  /** Changes what an action's button shows, as pause becomes resume. */
  showAction(id: string, icon: Icon, label: string): void;
}

/** How long the controls stay in sight after the last sign of a visitor, in ms. */
const STAY_MS = 2500;

/** The keys shown beside a control: arrows as arrows. */
function showKeys(keys: readonly (string | undefined)[]): string {
  const arrows: Record<string, string> = {
    ArrowDown: "↓",
    ArrowUp: "↑",
    ArrowLeft: "←",
    ArrowRight: "→",
  };
  return keys
    .filter((key): key is string => key !== undefined)
    .map((key) => arrows[key] ?? key)
    .join(" ");
}

export function mountControls(
  parameters: readonly Parameter[],
  actions: readonly Action[],
  handlers: ControlHandlers,
): Controls {
  const bar = document.createElement("div");
  bar.className = cls(styles, "bar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Controls");

  const button = (
    content: string | SVGSVGElement,
    label: string,
    keys: readonly string[],
    onClick: () => void,
  ): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls(styles, "button");
    b.append(content);
    b.setAttribute("aria-label", label);
    b.setAttribute("aria-keyshortcuts", keys.join(" "));
    b.title = `${label} (${keys.join(", ")})`;
    b.addEventListener("click", onClick);
    return b;
  };

  const hint = (text: string): HTMLSpanElement => {
    const span = document.createElement("span");
    span.className = cls(styles, "keys");
    span.setAttribute("aria-hidden", "true");
    span.textContent = text;
    return span;
  };

  const outputs = new Map<
    string,
    {
      parameter: Parameter;
      output: HTMLOutputElement;
      /** Where the value is shown, and where it is said, when the two differ. */
      shown: HTMLElement;
      spoken: HTMLElement | null;
    }
  >();
  for (const parameter of parameters) {
    const group = document.createElement("div");
    group.className = cls(styles, "group");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", parameter.label);
    const output = document.createElement("output");
    output.className = cls(styles, "value");
    output.setAttribute("aria-live", "polite");
    let shown: HTMLElement = output;
    let spoken: HTMLElement | null = null;
    if (parameter.icon !== undefined || parameter.speak !== undefined) {
      shown = document.createElement("span");
      if (parameter.icon !== undefined) {
        const icon = document.createElement("span");
        icon.className = cls(styles, "icon");
        icon.append(drawIcon(parameter.icon));
        output.append(icon);
      }
      output.append(shown);
      if (parameter.speak !== undefined) {
        // shown to the eye, and said in words to a screen reader
        shown.setAttribute("aria-hidden", "true");
        spoken = document.createElement("span");
        spoken.className = cls(styles, "spoken");
        output.append(spoken);
      }
    }
    group.append(
      button("−", `Less: ${parameter.label}`, parameter.keys.down, () => {
        handlers.step(parameter, -1);
      }),
      output,
      button("+", `More: ${parameter.label}`, parameter.keys.up, () => {
        handlers.step(parameter, 1);
      }),
      hint(showKeys([parameter.keys.down[0], parameter.keys.up[0]])),
    );
    bar.append(group);
    outputs.set(parameter.id, { parameter, output, shown, spoken });
  }

  const actionButtons = new Map<string, HTMLButtonElement>();
  for (const action of actions) {
    const group = document.createElement("div");
    group.className = cls(styles, "group");
    const b = button(drawIcon(action.icon), action.label, action.keys, () => {
      handlers.act(action.id);
    });
    group.append(b, hint(action.keysShown));
    bar.append(group);
    actionButtons.set(action.id, b);
  }
  document.body.append(bar);

  const awake = cls(styles, "awake");
  const held = cls(styles, "held");
  let timer = 0;
  return {
    wake() {
      bar.classList.add(awake);
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        bar.classList.remove(awake);
      }, STAY_MS);
    },
    showValue(id, value, reached) {
      const entry = outputs.get(id);
      if (entry === undefined) throw new Error(`no control shows ${id}`);
      const at = reached ?? value;
      const text = entry.parameter.show(at);
      if (entry.shown.textContent !== text) entry.shown.textContent = text;
      if (entry.spoken !== null) {
        const words = entry.parameter.speak?.(at) ?? text;
        if (entry.spoken.textContent !== words) {
          entry.spoken.textContent = words;
        }
      }
      entry.output.classList.toggle(held, reached !== undefined);
    },
    showAction(id, icon, label) {
      const b = actionButtons.get(id);
      if (b === undefined) throw new Error(`no action ${id}`);
      b.replaceChildren(drawIcon(icon));
      b.setAttribute("aria-label", label);
      b.title = `${label} (${b.getAttribute("aria-keyshortcuts") ?? ""})`;
    },
  };
}
