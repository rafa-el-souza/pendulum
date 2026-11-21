import { SURE } from "../audio/beat.ts";
import type { Signals } from "../audio/signals.ts";
import {
  Listening,
  sharesSound,
  type Choice,
  type Outcome,
  type Source,
} from "../audio/source.ts";
import type { Action } from "./controls.ts";
import { cls } from "./css.ts";
import type { Icon } from "./icons.ts";
import styles from "./music.module.css";

// What the piece listens to, in the music's group of the row (docs/
// decisions.md, decisions 44, 45 and 76): the sources are buttons of the
// group, lit while they play, each started by a touch and stopped by
// another: the microphone, a file, the sound of a tab or of the computer
// where the browser shares it, and the demonstration beat. Above the group,
// while none of its values is chosen, a panel shows what the piece hears: a
// meter of the last seconds of loudness with the attacks marked and the
// three bands beside it, the words of what it is doing, with the music's
// tempo once the beat clock is sure of it (decision 78), which microphone
// where there are several, and, before anything plays, that the sound stays
// on the device. What the music does and how strongly are values of the
// group (chain-in-hand/parameters.ts). How it looks and its words are
// placeholders, which the author settles by trying.

/** How many seconds the meter shows, and in how many columns. */
const METER_SECONDS = 3;
const COLUMNS = 45;
/** How often the meter's value for a screen reader changes, in ms. */
const WORDS_MS = 250;

/** Whether the page runs on an iPhone or an iPad, where opening the microphone stops the music playing on it. */
function onIos(): boolean {
  const agent = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(agent) ||
    (agent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

/** What the panel says of how a start came out. */
export function said(outcome: Outcome): string {
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
      // a browser shares a tab's sound everywhere, a screen's on some
      // systems, and a window's nowhere (decision 49)
      if (outcome.surface === "browser") {
        return "The tab was shared without its sound. In the browser's dialog, tick the box that shares the tab's audio.";
      }
      if (outcome.surface === "window") {
        return "A window is shared without its sound. In the browser's dialog, pick the tab playing the music and tick the box that shares its audio.";
      }
      if (outcome.surface === "monitor") {
        return "The screen was shared without its sound. Where the browser offers it, tick the box that shares it; elsewhere, pick the tab playing the music and tick the box that shares its audio.";
      }
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

/** What the piece listens to: the group's panel and its sources. */
export interface Music {
  /** What the music's group shows above its row while none of its values is chosen. */
  readonly panel: HTMLElement;
  /** The sources, as the group's buttons, in their order. */
  readonly sources: readonly Action[];
  /** A source's button pressed: starts it, or stops it when it is the one playing. */
  press(id: string): void;
  /** What the music says this frame, or null while the piece listens to nothing; the meter shows it. */
  hear(): Signals | null;
  /** Told which source plays, or none, each time that changes, to light its button. */
  onPlaying: ((source: Source | null) => void) | null;
}

/** The words shown while nothing plays. */
const RESTING = "Not listening.";

/** How much less sure than SURE the beat clock may grow before a tempo shown goes. */
const UNSURE_BY = 0.2;

/**
 * The music's tempo in words, beside those of the source playing: where the
 * beat clock is sure of it and the music sounds, or, `shown` already, until
 * the clock is UNSURE_BY less sure than that; else nothing.
 */
export function tempoWords(heard: Signals, shown: boolean): string {
  const beat = heard.beat;
  const least = shown ? SURE - UNSURE_BY : SURE;
  if (beat === null || heard.silent || beat.confidence < least) return "";
  return `${String(Math.round(beat.bpm))} bpm.`;
}

export function mountMusic(): Music {
  const listening = new Listening();

  const panel = document.createElement("div");
  panel.className = cls(styles, "panel");
  panel.id = "music-panel";
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "What the piece hears");

  // the meter: the last seconds of loudness, the attacks marked, and the
  // bands; in sight while a source plays
  const meter = document.createElement("div");
  meter.className = cls(styles, "meter");
  meter.setAttribute("role", "meter");
  meter.setAttribute("aria-label", "Sound arriving");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", "1");
  meter.setAttribute("aria-valuenow", "0");
  meter.hidden = true;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  meter.append(canvas);

  const status = document.createElement("p");
  status.className = cls(styles, "status");
  status.setAttribute("role", "status");
  status.textContent = RESTING;
  // the tempo, beside the words and out of what a screen reader announces,
  // since it changes as the clock follows the music
  const tempo = document.createElement("span");
  tempo.className = cls(styles, "tempo");
  tempo.id = "music-tempo";
  tempo.hidden = true;
  const privacy = document.createElement("span");
  privacy.className = cls(styles, "note");
  privacy.textContent = "Sound stays on this device.";
  const words = document.createElement("div");
  words.className = cls(styles, "words");
  words.append(status, tempo, privacy);
  const line = document.createElement("div");
  line.className = cls(styles, "line");
  line.append(meter, words);

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

  // on an iPhone or an iPad, while the microphone listens
  const ios = document.createElement("p");
  ios.className = cls(styles, "note");
  ios.textContent =
    "On an iPhone or iPad, opening the microphone stops the music playing on it: play the music on another device nearby.";
  ios.hidden = true;

  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "audio/*";
  picker.hidden = true;
  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    if (file !== undefined) void begin("file", { file });
    picker.value = "";
  });
  panel.append(line, microphone, ios, picker);

  // the sound of a tab where the browser shares it (decision 45)
  const offered: { id: Source; label: string; icon: Icon }[] = [
    { id: "microphone", label: "Microphone", icon: "microphone" },
    { id: "file", label: "File", icon: "file" },
    ...(sharesSound()
      ? [
          {
            id: "tab" as const,
            label: "Sound of a tab or the screen",
            icon: "tab" as const,
          },
        ]
      : []),
    { id: "demo", label: "Demo beat", icon: "drum" },
  ];
  const sources: Action[] = offered.map((source) => ({
    ...source,
    keys: [],
    keysShown: "",
    pressed: false,
    lights: true,
  }));

  let playing: Source | null = null;
  const music: Music = {
    panel,
    sources,
    press(id) {
      const source = offered.find((s) => s.id === id)?.id;
      if (source === undefined) return;
      if (source === playing) stop();
      else if (source === "file") picker.click();
      else void begin(source);
    },
    hear() {
      const heard = listening.hear();
      if (heard === null) return null;
      record(heard);
      // drawn while in sight only
      if (panel.offsetParent !== null) {
        draw(heard);
        say(heard);
      }
      return heard;
    },
    onPlaying: null,
  };

  function light(source: Source | null): void {
    playing = source;
    meter.hidden = source === null;
    privacy.hidden = source !== null;
    ios.hidden = !(onIos() && source === "microphone");
    music.onPlaying?.(source);
  }

  async function begin(source: Source, choice: Choice = {}): Promise<void> {
    light(source);
    forget();
    if (source !== "microphone") microphone.hidden = true;
    status.textContent = "Starting…";
    const outcome = await listening.start(source, choice);
    if (outcome === null) return;
    status.textContent = said(outcome);
    if (outcome.kind !== "listening" && outcome.kind !== "muted") {
      light(null);
      microphone.hidden = true;
      // what went wrong stays said, and the privacy note waits for it to go
      privacy.hidden = true;
      if (outcome.kind === "unheard") listening.stop();
    }
    if (outcome.kind === "listening" && source === "microphone") {
      await listMicrophones();
    }
  }
  // a share stopped from the browser's own bar
  listening.onEnd = () => {
    forget();
    light(null);
    privacy.hidden = true;
    status.textContent = "The share was stopped.";
    meter.setAttribute("aria-valuenow", "0");
  };
  function stop(): void {
    listening.stop();
    forget();
    microphone.hidden = true;
    light(null);
    status.textContent = RESTING;
    meter.setAttribute("aria-valuenow", "0");
  }

  // the history the meter draws: each column's loudest level, and whether an
  // attack fell in it, by the column's number since the source started
  const levels = new Float32Array(COLUMNS);
  const attacks = new Uint8Array(COLUMNS);
  let lastColumn = -1;
  let saidAt = 0;
  /** The meter starts empty, as a source starts. */
  function forget(): void {
    tempo.textContent = "";
    tempo.hidden = true;
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
    if (now - saidAt < WORDS_MS) return;
    saidAt = now;
    meter.setAttribute("aria-valuenow", heard.level.toFixed(2));
    const bpm = tempoWords(heard, !tempo.hidden);
    if (tempo.textContent !== bpm) tempo.textContent = bpm;
    tempo.hidden = bpm === "";
  }

  return music;
}
