import type { Signals } from "../audio/signals.ts";
import {
  Listening,
  sharesSound,
  type Choice,
  type Outcome,
  type Source,
} from "../audio/source.ts";
import { cls } from "./css.ts";
import styles from "./music.module.css";
import { STRENGTHS } from "./routes.ts";

// The music card (docs/decisions.md, decisions 44 and 45): a small card over
// the controls' corner, opened by the row's music button or the W key, where
// the piece is told what to listen to and shows what it hears. A meter draws
// the last seconds of loudness with the attacks marked, and the three bands
// beside it; the sources are the microphone, which one chosen where there
// are several, a file, the sound of a tab or of the computer where the
// browser shares it, and the demonstration beat, each started by a touch;
// what the music does, its mode, and how strongly, in five steps (decision
// 46); and the card says that the sound stays on the device. How it looks,
// where it sits and its words are placeholders, which the author settles by
// trying.

/** How many seconds the meter shows, and in how many columns. */
const METER_SECONDS = 3;
const COLUMNS = 90;
/** How often the words under the meter change, in ms, so that they can be read. */
const WORDS_MS = 250;

/** Whether the page runs on an iPhone or an iPad, where opening the microphone stops the music playing on it. */
function onIos(): boolean {
  const agent = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(agent) ||
    (agent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

export interface MusicCard {
  /** Whether the card is open. */
  isOpen(): boolean;
  /** Opens the card, or shuts it; shutting it leaves the music playing. */
  toggle(): void;
  /** What the music says this frame, or null while the piece listens to nothing; the meter shows it. */
  hear(): Signals | null;
}

/** What the card says while a source plays, or what came of starting it. */
function said(outcome: Outcome): string {
  switch (outcome.kind) {
    case "listening":
      if (outcome.source === "microphone") {
        return outcome.name === ""
          ? "Listening through the microphone."
          : `Listening through ${outcome.name}.`;
      }
      if (outcome.source === "tab") {
        if (outcome.name === "browser") return "Listening to the shared tab.";
        if (outcome.name === "window") return "Listening to the shared window.";
        if (outcome.name === "monitor") {
          return "Listening to the sound of this computer.";
        }
        return "Listening to what is shared.";
      }
      return outcome.source === "file"
        ? `Playing ${outcome.name}.`
        : "Playing the demo beat.";
    case "declined":
      return "Nothing was shared.";
    case "soundless":
      return "No sound came with the share. In the browser's dialog, pick the tab playing the music and tick the box that shares its audio.";
    case "muted":
      return "The demo beat, muted: this browser plays no sound here.";
    case "unheard":
      return "This browser passes no sound to the page here.";
    case "refused":
      return "The microphone was not allowed. The browser's settings for this site can allow it.";
    case "missing":
      return "No microphone was found.";
    case "failed":
      return "This could not be played.";
  }
}

/** What the card offers of what the music does: the piece's modes, the one and the strength it opens at, and what to tell when either changes. */
export interface MusicChoices {
  readonly modes: readonly { readonly id: string; readonly name: string }[];
  readonly mode: string;
  readonly strength: number;
  changed(mode: string, strength: number): void;
}

export function mountMusicCard(choices: MusicChoices): MusicCard {
  const listening = new Listening();

  const card = document.createElement("div");
  card.className = cls(styles, "card");
  card.id = "music-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Music");
  card.hidden = true;

  const heading = document.createElement("p");
  heading.className = cls(styles, "heading");
  heading.textContent = "Music";
  const close = document.createElement("button");
  close.type = "button";
  close.className = cls(styles, "close");
  close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", () => {
    card.hidden = true;
  });

  // the meter: the last seconds of loudness, the attacks marked, and the bands
  const meter = document.createElement("div");
  meter.className = cls(styles, "meter");
  meter.setAttribute("role", "meter");
  meter.setAttribute("aria-label", "Sound arriving");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", "1");
  meter.setAttribute("aria-valuenow", "0");
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const loudness = document.createElement("span");
  loudness.className = cls(styles, "loudness");
  meter.append(canvas);

  // the sources, one pressed at a time
  const sources = document.createElement("div");
  sources.className = cls(styles, "sources");
  sources.setAttribute("role", "group");
  sources.setAttribute("aria-label", "Source of the sound");
  const sourceWord = document.createElement("span");
  sourceWord.className = cls(styles, "label");
  sourceWord.textContent = "source";
  sourceWord.setAttribute("aria-hidden", "true");
  sources.append(sourceWord);
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "audio/*";
  picker.hidden = true;
  const buttons = new Map<Source | "off", HTMLButtonElement>();
  // the sound of a tab where the browser shares it (decision 45)
  const kinds: [Source | "off", string, string][] = [
    ["off", "off", "Off"],
    ["microphone", "mic", "Microphone"],
    ["file", "file", "File"],
    ...(sharesSound()
      ? [
          ["tab", "tab", "Sound of a tab or the screen"] as [
            Source,
            string,
            string,
          ],
        ]
      : []),
    ["demo", "demo", "Demo beat"],
  ];
  for (const [id, word, name] of kinds) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls(styles, "source");
    b.textContent = word;
    b.setAttribute("aria-label", name);
    b.setAttribute("aria-pressed", String(id === "off"));
    b.addEventListener("click", () => {
      if (id === "off") stop();
      else if (id === "file") picker.click();
      else void begin(id);
    });
    buttons.set(id, b);
    sources.append(b);
  }
  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    if (file !== undefined) void begin("file", { file });
    picker.value = "";
  });

  // which microphone, where there are several (decision 45)
  const microphone = document.createElement("label");
  microphone.className = cls(styles, "choice");
  microphone.hidden = true;
  const microphoneWord = document.createElement("span");
  microphoneWord.textContent = "microphone";
  const devices = document.createElement("select");
  devices.className = cls(styles, "devices");
  microphone.append(microphoneWord, devices);
  devices.addEventListener("change", () => {
    void begin("microphone", { device: devices.value });
  });
  /** Lists the microphones, the one listened through chosen, where there are several. */
  async function listMicrophones(): Promise<void> {
    const found = await listening.microphones();
    if (listening.source !== "microphone" || found.length < 2) return;
    devices.replaceChildren(
      ...found.map(({ deviceId, label }, i) => {
        const option = document.createElement("option");
        option.value = deviceId;
        option.textContent =
          label === "" ? `Microphone ${String(i + 1)}` : label;
        option.selected = deviceId === listening.device;
        return option;
      }),
    );
    microphone.hidden = false;
  }

  // what the music does, and how strongly (decision 46)
  let modeAt = Math.max(
    0,
    choices.modes.findIndex(({ id }) => id === choices.mode),
  );
  let strength = choices.strength;
  const mode = document.createElement("div");
  mode.className = cls(styles, "row");
  mode.setAttribute("role", "group");
  mode.setAttribute("aria-label", "Mode");
  const modeWord = document.createElement("span");
  modeWord.className = cls(styles, "label");
  modeWord.textContent = "mode";
  modeWord.setAttribute("aria-hidden", "true");
  // the mode's name, said again when it changes; not a status, which the
  // card's words are
  const modeName = document.createElement("span");
  modeName.className = cls(styles, "name");
  modeName.setAttribute("aria-live", "polite");
  const turn = (word: string, label: string, by: number): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls(styles, "turn");
    b.textContent = word;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", () => {
      const count = choices.modes.length;
      modeAt = (modeAt + by + count) % count;
      showMode();
      tell();
    });
    return b;
  };
  mode.append(
    modeWord,
    turn("‹", "Previous mode", -1),
    modeName,
    turn("›", "Next mode", 1),
  );
  const strong = document.createElement("div");
  strong.className = cls(styles, "row");
  strong.setAttribute("role", "group");
  strong.setAttribute("aria-label", "Strength");
  const strongWord = document.createElement("span");
  strongWord.className = cls(styles, "label");
  strongWord.textContent = "strength";
  strongWord.setAttribute("aria-hidden", "true");
  strong.append(strongWord);
  const pips = STRENGTHS.map((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls(styles, "pip");
    b.setAttribute(
      "aria-label",
      `Strength ${String(i + 1)} of ${String(STRENGTHS.length)}`,
    );
    b.addEventListener("click", () => {
      strength = i + 1;
      showMode();
      tell();
    });
    strong.append(b);
    return b;
  });
  /** The mode and the strength as they are. */
  function showMode(): void {
    modeName.textContent = choices.modes[modeAt]?.name ?? "";
    pips.forEach((b, i) => {
      b.textContent = i < strength ? "●" : "○";
      b.setAttribute("aria-pressed", String(i + 1 === strength));
    });
  }
  function tell(): void {
    choices.changed(choices.modes[modeAt]?.id ?? "", strength);
  }
  showMode();

  const status = document.createElement("p");
  status.className = cls(styles, "status");
  status.setAttribute("role", "status");
  status.textContent = "Not listening.";
  const notes: HTMLElement[] = [];
  if (onIos()) {
    const ios = document.createElement("p");
    ios.className = cls(styles, "note");
    ios.textContent =
      "On an iPhone or iPad, opening the microphone stops the music playing on it: play the music on another device nearby.";
    notes.push(ios);
  }
  const privacy = document.createElement("p");
  privacy.className = cls(styles, "note");
  privacy.textContent = "Sound stays on this device.";
  card.append(
    heading,
    loudness,
    close,
    meter,
    sources,
    microphone,
    mode,
    strong,
    status,
    ...notes,
    privacy,
    picker,
  );
  document.body.append(card);

  // Escape shuts the card before anything else hears it.
  addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || card.hidden) return;
      event.stopImmediatePropagation();
      card.hidden = true;
    },
    { capture: true },
  );

  function press(id: Source | "off"): void {
    for (const [key, b] of buttons) {
      b.setAttribute("aria-pressed", String(key === id));
    }
  }

  // what the card says now, and the source it says it of
  let words = "Not listening.";
  async function begin(source: Source, choice: Choice = {}): Promise<void> {
    press(source);
    forget();
    if (source !== "microphone") microphone.hidden = true;
    words = "Starting…";
    status.textContent = words;
    const outcome = await listening.start(source, choice);
    if (outcome === null) return;
    words = said(outcome);
    status.textContent = words;
    if (outcome.kind !== "listening" && outcome.kind !== "muted") {
      press("off");
      microphone.hidden = true;
      if (outcome.kind === "unheard") listening.stop();
    }
    if (outcome.kind === "listening" && source === "microphone") {
      await listMicrophones();
    }
  }
  // a share stopped from the browser's own bar
  listening.onEnd = () => {
    forget();
    press("off");
    words = "The share was stopped.";
    status.textContent = words;
    loudness.textContent = "";
    meter.setAttribute("aria-valuenow", "0");
  };
  function stop(): void {
    listening.stop();
    forget();
    microphone.hidden = true;
    press("off");
    words = "Not listening.";
    status.textContent = words;
    loudness.textContent = "";
    meter.setAttribute("aria-valuenow", "0");
  }

  // the history the meter draws: each column's loudest level, and whether an
  // attack fell in it, by the column's number since the source started
  const levels = new Float32Array(COLUMNS);
  const attacks = new Uint8Array(COLUMNS);
  let lastColumn = -1;
  let wordsAt = 0;
  /** The meter starts empty, as a source starts. */
  function forget(): void {
    levels.fill(0);
    attacks.fill(0);
    lastColumn = -1;
  }
  function record(heard: Signals): void {
    const column = Math.floor((heard.at * COLUMNS) / METER_SECONDS);
    if (column < lastColumn) forget();
    if (column !== lastColumn) {
      // the columns since the frame before, which no frame saw, take the
      // level of this one, as a device drawing few frames a second leaves
      // them; before the first, none
      const from = lastColumn < 0 ? column - COLUMNS + 1 : lastColumn + 1;
      for (let c = Math.max(from, column - COLUMNS + 1); c <= column; c++) {
        const i = ((c % COLUMNS) + COLUMNS) % COLUMNS;
        levels[i] = lastColumn < 0 ? 0 : heard.level;
        attacks[i] = 0;
      }
      lastColumn = column;
    }
    const i = ((column % COLUMNS) + COLUMNS) % COLUMNS;
    levels[i] = Math.max(levels[i] ?? 0, heard.level);
    if (heard.onset > 0) attacks[i] = 1;
  }

  function draw(heard: Signals): void {
    const box = canvas.getBoundingClientRect();
    const ratio = devicePixelRatio;
    const width = Math.max(1, Math.round(box.width * ratio));
    const height = Math.max(1, Math.round(box.height * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const pen = canvas.getContext("2d");
    if (pen === null) return;
    const style = getComputedStyle(meter);
    const muted = style.color;
    const bright = style.getPropertyValue("--music-bright") || muted;
    pen.clearRect(0, 0, width, height);
    // the history, oldest at the left, and the bands at the right
    const bands = [heard.bass, heard.mid, heard.treble];
    const bandWidth = 4 * ratio;
    const gap = 3 * ratio;
    const historyWidth = width - bands.length * (bandWidth + gap) - gap;
    const step = historyWidth / COLUMNS;
    for (let k = 0; k < COLUMNS; k++) {
      const c = lastColumn - COLUMNS + 1 + k;
      const i = ((c % COLUMNS) + COLUMNS) % COLUMNS;
      const level = levels[i] ?? 0;
      const struck = attacks[i] === 1;
      pen.fillStyle = struck ? bright : muted;
      const h = Math.max(struck ? 2 * ratio : 0, level * height);
      pen.fillRect(k * step, height - h, Math.max(1, step - ratio), h);
    }
    bands.forEach((value, b) => {
      pen.fillStyle = muted;
      const h = Math.max(ratio, value * height);
      pen.fillRect(
        historyWidth + gap + b * (bandWidth + gap),
        height - h,
        bandWidth,
        h,
      );
    });
  }

  function say(heard: Signals): void {
    const now = performance.now();
    if (now - wordsAt < WORDS_MS) return;
    wordsAt = now;
    meter.setAttribute("aria-valuenow", heard.level.toFixed(2));
    loudness.textContent = heard.silent
      ? "silent"
      : `${heard.loudness < 0 ? "−" : ""}${Math.abs(Math.round(heard.loudness)).toString()} dB`;
  }

  return {
    isOpen: () => !card.hidden,
    toggle() {
      card.hidden = !card.hidden;
    },
    hear() {
      const heard = listening.hear();
      if (heard === null) return null;
      record(heard);
      if (!card.hidden) {
        draw(heard);
        say(heard);
      }
      return heard;
    },
  };
}
