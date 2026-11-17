import { DEMO_SECONDS, DemoTap, renderDemoInto } from "./demo.ts";
import { builtInMicrophone } from "./devices.ts";
import { HEARD, Hearing, type Signals } from "./signals.ts";

// Where the piece's music comes from (docs/decisions.md, decisions 44 and
// 45): the microphone, a file, the demonstration beat, or the sound of a
// browser tab or of the whole computer. Each starts on a touch, as
// browsers ask, and stops when another starts or the visitor turns it off,
// which lets the microphone go. Nothing heard leaves the page: nothing is
// recorded and nothing is sent. Every frame takes the latest samples and
// hears them with the piece's own arithmetic (signals.ts).
//
// The microphone is asked for with the browser's treatment of voice off,
// echo cancelling, noise suppression and automatic gain: they are made for
// a call and spoil music, and on Android they put the whole device in call
// mode. Safari keeps the last two whatever it is asked.

/** A source of music. */
export type Source = "microphone" | "file" | "tab" | "demo";

/**
 * What starting a source came to: listening, with what is listened to (the
 * microphone's name, the file's, or what was shared: "browser" for a tab,
 * "window", "monitor" for the whole screen); the beat muted; a source
 * started whose sound the browser passes nowhere, its audio not running;
 * the microphone not allowed or not there; a share declined, or without
 * sound; or a failure.
 */
export type Outcome =
  | {
      readonly kind: "listening";
      readonly source: Source;
      readonly name: string;
    }
  | { readonly kind: "muted" }
  | { readonly kind: "unheard" }
  | { readonly kind: "refused" }
  | { readonly kind: "missing" }
  | { readonly kind: "declined" }
  | { readonly kind: "soundless"; readonly surface: string }
  | { readonly kind: "failed" };

/** What a source is started with: the file to play, or the microphone to listen through. */
export interface Choice {
  readonly file?: File;
  readonly device?: string;
}

/**
 * The options of a share that the browser's types do not name yet: the
 * whole computer's sound offered beside a screen (Chrome 105), and the
 * page's own tab left out of the choices (Chrome 112).
 */
interface ShareOptions extends DisplayMediaStreamOptions {
  readonly systemAudio?: "include" | "exclude";
  readonly selfBrowserSurface?: "include" | "exclude";
}

/**
 * Whether the browser can share the sound of a tab or of the screen: a
 * Chromium browser on a desktop, as Chrome and Edge are (decision 45).
 * Firefox and Safari share pictures without sound, and phones share
 * nothing.
 */
export function sharesSound(): boolean {
  const data = (
    navigator as Navigator & { userAgentData?: { readonly mobile: boolean } }
  ).userAgentData;
  return (
    data !== undefined &&
    !data.mobile &&
    "mediaDevices" in navigator &&
    typeof navigator.mediaDevices.getDisplayMedia === "function"
  );
}

/** How loud the demonstration beat plays, as a share of full scale. */
const DEMO_VOLUME = 0.5;
/** The rate the beat is heard at when no sound is made at all, in Hz. */
const MUTED_RATE = 48_000;
/** How much of the beat is rendered before it plays, its first bar, and then before the page breathes, in s. */
const DEMO_OPENING = 2;
const DEMO_CHUNK = 1;
/** How long a browser may take to start its sound, in ms, before the page says it passes none, and how often it looks. */
const PLAY_WAIT_MS = 4000;
const PLAY_LOOK_MS = 100;

const PROCESSING = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
} as const;

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/** A moment for the page to draw and take a touch. */
function breathe(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A wait of `ms` ms. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The time on `context`'s clock of the sample being heard now, in s: from
 * the output's own stamp where the browser gives one, else the clock less
 * the latencies it tells.
 */
function outputTime(context: AudioContext): number {
  if (typeof context.getOutputTimestamp === "function") {
    const { contextTime, performanceTime } = context.getOutputTimestamp();
    if (
      contextTime !== undefined &&
      performanceTime !== undefined &&
      contextTime > 0 &&
      performanceTime > 0
    ) {
      return contextTime + (performance.now() - performanceTime) / 1000;
    }
  }
  const lag =
    ("outputLatency" in context ? context.outputLatency : 0) +
    context.baseLatency;
  return context.currentTime - (Number.isFinite(lag) ? lag : 0);
}

/** Listens to one source at a time, and hears it a frame at a time. */
export class Listening {
  /** The source listened to, or null. */
  source: Source | null = null;
  /** The id of the microphone listened through, while it is the source. */
  device = "";
  /** Told when a source ends by itself, as a share stopped from the browser's own bar does. */
  onEnd: (() => void) | null = null;
  private context: AudioContext | null = null;
  /** Lets the source go. */
  private release: (() => void) | null = null;
  /** Fills a window with the latest samples, and gives the time of the last, or null while there are none. */
  private take: ((out: Float32Array<ArrayBuffer>) => number | null) | null =
    null;
  private hearing: Hearing | null = null;
  private readonly samples = new Float32Array(HEARD);
  /** How many starts were asked for: a start that another has overtaken drops what it got. */
  private asked = 0;

  /**
   * Starts listening to `source` from a touch, a file with the file chosen,
   * the microphone with the one chosen if one was: what came of it, or null
   * when another start or a stop overtook it.
   */
  async start(source: Source, choice: Choice = {}): Promise<Outcome | null> {
    this.letGo();
    const mine = ++this.asked;
    const context = this.audio();
    if (source === "demo") return this.demo(context, mine);
    if (context === null) return { kind: "failed" };
    // asked for at once, within the touch, as the browser requires
    if (source === "tab") return this.tab(context, mine);
    if (source === "microphone") {
      return this.microphone(context, mine, choice.device);
    }
    if (choice.file === undefined) return { kind: "failed" };
    return this.file(context, choice.file, mine);
  }

  /** The microphones the browser lists, with their names once one has been allowed. */
  async microphones(): Promise<{ deviceId: string; label: string }[]> {
    if (!("mediaDevices" in navigator)) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(
        ({ kind, deviceId }) =>
          kind === "audioinput" &&
          deviceId !== "" &&
          deviceId !== "default" &&
          deviceId !== "communications",
      )
      .map(({ deviceId, label }) => ({ deviceId, label }));
  }

  /** Stops listening, and lets the microphone go. */
  stop(): void {
    this.asked++;
    this.letGo();
    void this.context?.suspend().catch(() => undefined);
  }

  /** What the latest samples say, or null while nothing is listened to. */
  hear(): Signals | null {
    if (this.take === null || this.hearing === null) return null;
    const at = this.take(this.samples);
    return at === null ? null : this.hearing.hear(this.samples, at);
  }

  private letGo(): void {
    this.release?.();
    this.release = null;
    this.take = null;
    this.hearing = null;
    this.source = null;
    this.device = "";
  }

  /** The page's audio, made and woken within the touch, as browsers ask; null where there is none. */
  private audio(): AudioContext | null {
    try {
      this.context ??= new AudioContext();
    } catch {
      return null;
    }
    void this.context.resume().catch(() => undefined);
    return this.context;
  }

  /**
   * Whether `context` plays: running, and its clock moving, which a browser
   * may take a second or more to reach as its sound starts, and which one
   * with nowhere to send sound may never reach though it says it runs.
   * Watched for PLAY_WAIT_MS at most, and true as soon as the clock moves.
   */
  private async plays(context: AudioContext): Promise<boolean> {
    void context.resume().catch(() => undefined);
    const until = performance.now() + PLAY_WAIT_MS;
    let before: number | null = null;
    while (performance.now() < until) {
      if (context.state === "running") {
        if (before === null) before = context.currentTime;
        else if (context.currentTime > before) return true;
      }
      await wait(PLAY_LOOK_MS);
    }
    return false;
  }

  /** The window of samples an analyser of `input` holds, taken through a branch that makes no sound. */
  private tap(context: AudioContext, input: AudioNode): AnalyserNode {
    const analyser = context.createAnalyser();
    analyser.fftSize = HEARD;
    analyser.smoothingTimeConstant = 0;
    const silent = context.createGain();
    silent.gain.value = 0;
    input.connect(analyser).connect(silent).connect(context.destination);
    return analyser;
  }

  private listen(
    source: Source,
    rate: number,
    take: (out: Float32Array<ArrayBuffer>) => number | null,
    release: () => void,
  ): void {
    this.source = source;
    this.hearing = new Hearing(rate);
    this.take = take;
    this.release = release;
  }

  private async microphone(
    context: AudioContext,
    mine: number,
    device?: string,
  ): Promise<Outcome | null> {
    if (!("mediaDevices" in navigator)) return { kind: "missing" };
    const media = navigator.mediaDevices;
    let stream: MediaStream;
    try {
      stream = await media.getUserMedia({
        audio:
          device === undefined
            ? PROCESSING
            : { ...PROCESSING, deviceId: { exact: device } },
      });
    } catch (error) {
      if (mine !== this.asked) return null;
      const name = error instanceof DOMException ? error.name : "";
      return name === "NotAllowedError" || name === "SecurityError"
        ? { kind: "refused" }
        : { kind: "missing" };
    }
    // the device's own microphone, where the default is a headset's and
    // none was chosen
    const current = stream.getAudioTracks()[0]?.getSettings().deviceId ?? "";
    const own =
      device === undefined
        ? builtInMicrophone(await media.enumerateDevices(), current)
        : null;
    if (own !== null && mine === this.asked) {
      try {
        const other = await media.getUserMedia({
          audio: { ...PROCESSING, deviceId: { exact: own } },
        });
        stopTracks(stream);
        stream = other;
      } catch {
        // the one in use stays
      }
    }
    if (mine !== this.asked) {
      stopTracks(stream);
      return null;
    }
    const input = context.createMediaStreamSource(stream);
    const analyser = this.tap(context, input);
    this.listen(
      "microphone",
      context.sampleRate,
      (out) => {
        analyser.getFloatTimeDomainData(out);
        return context.currentTime;
      },
      () => {
        stopTracks(stream);
        input.disconnect();
        analyser.disconnect();
      },
    );
    const [track] = stream.getAudioTracks();
    this.device = track?.getSettings().deviceId ?? "";
    if (!(await this.plays(context))) {
      return mine === this.asked ? { kind: "unheard" } : null;
    }
    return mine === this.asked
      ? { kind: "listening", source: "microphone", name: track?.label ?? "" }
      : null;
  }

  /**
   * The sound of a browser tab, a window or the whole screen, which the
   * visitor picks in the browser's own dialog (decision 45). Browsers share
   * a picture with it, and refuse sound alone; the page asks for the picture
   * at a frame a second, never shows it, and keeps it while it listens,
   * since a share whose picture stops may stop its sound. The visitor may
   * leave the sound out of the share, and the card then says how to put it
   * in; stopping the share from the browser's own bar stops the listening.
   */
  private async tab(
    context: AudioContext,
    mine: number,
  ): Promise<Outcome | null> {
    if (!sharesSound()) return { kind: "failed" };
    let stream: MediaStream;
    try {
      const options: ShareOptions = {
        video: { frameRate: 1 },
        audio: PROCESSING,
        systemAudio: "include",
        selfBrowserSurface: "exclude",
      };
      stream = await navigator.mediaDevices.getDisplayMedia(options);
    } catch {
      return mine === this.asked ? { kind: "declined" } : null;
    }
    if (mine !== this.asked) {
      stopTracks(stream);
      return null;
    }
    // what was shared: a tab, a window or a screen ("browser", "window",
    // "monitor"), or "" where the browser does not tell
    const surface =
      stream.getVideoTracks()[0]?.getSettings().displaySurface ?? "";
    const [track] = stream.getAudioTracks();
    if (track === undefined) {
      stopTracks(stream);
      return { kind: "soundless", surface };
    }
    const input = context.createMediaStreamSource(stream);
    const analyser = this.tap(context, input);
    const ended = (): void => {
      if (mine !== this.asked) return;
      this.letGo();
      this.onEnd?.();
    };
    track.addEventListener("ended", ended);
    this.listen(
      "tab",
      context.sampleRate,
      (out) => {
        analyser.getFloatTimeDomainData(out);
        return context.currentTime;
      },
      () => {
        track.removeEventListener("ended", ended);
        stopTracks(stream);
        input.disconnect();
        analyser.disconnect();
      },
    );
    if (!(await this.plays(context))) {
      return mine === this.asked ? { kind: "unheard" } : null;
    }
    return mine === this.asked
      ? { kind: "listening", source: "tab", name: surface }
      : null;
  }

  private async file(
    context: AudioContext,
    file: File,
    mine: number,
  ): Promise<Outcome | null> {
    const url = URL.createObjectURL(file);
    const element = new Audio();
    element.src = url;
    element.loop = true;
    const input = context.createMediaElementSource(element);
    const analyser = this.tap(context, input);
    input.connect(context.destination);
    this.listen(
      "file",
      context.sampleRate,
      (out) => {
        analyser.getFloatTimeDomainData(out);
        return context.currentTime;
      },
      () => {
        element.pause();
        element.removeAttribute("src");
        element.load();
        URL.revokeObjectURL(url);
        input.disconnect();
        analyser.disconnect();
      },
    );
    try {
      await element.play();
    } catch {
      if (mine === this.asked) this.letGo();
      return mine === this.asked ? { kind: "failed" } : null;
    }
    if (!(await this.plays(context))) {
      return mine === this.asked ? { kind: "unheard" } : null;
    }
    return mine === this.asked
      ? { kind: "listening", source: "file", name: file.name }
      : null;
  }

  /**
   * The beat: its first bar rendered at once and played, while the rest is
   * rendered a second at a time, so that the page goes on drawing, and then
   * played round and round from where the first bar ends, on the same clock.
   * It is heard straight from its function, at the time of the sample being
   * played; where the browser makes no sound, at the page's time, muted.
   */
  private async demo(
    context: AudioContext | null,
    mine: number,
  ): Promise<Outcome | null> {
    const now = (): number => performance.now() / 1000;
    if (context === null) {
      const origin = now();
      const tap = new DemoTap(MUTED_RATE);
      this.listen(
        "demo",
        MUTED_RATE,
        (out) => {
          const t = now() - origin;
          tap.fill(t, out);
          return t;
        },
        () => undefined,
      );
      return { kind: "muted" };
    }
    const rate = context.sampleRate;
    const whole = context.createBuffer(
      1,
      Math.round(DEMO_SECONDS * rate),
      rate,
    );
    const data = whole.getChannelData(0);
    const opening = Math.round(DEMO_OPENING * rate);
    renderDemoInto(data, rate, 0, opening);
    const first = context.createBuffer(1, opening, rate);
    first.copyToChannel(data.subarray(0, opening), 0);
    const volume = context.createGain();
    volume.gain.value = DEMO_VOLUME;
    volume.connect(context.destination);
    const players: AudioBufferSourceNode[] = [context.createBufferSource()];
    const [player] = players;
    if (player === undefined) return { kind: "failed" };
    player.buffer = first;
    player.connect(volume);
    const lead = 0.05;
    const startsAt = context.currentTime + lead;
    const origin = now() + lead;
    player.start(startsAt);
    // heard at the page's time until the audio is found to play, and then
    // at the time of the sample being played
    let audible = false;
    const tap = new DemoTap(rate);
    this.listen(
      "demo",
      rate,
      (out) => {
        const t = audible ? outputTime(context) - startsAt : now() - origin;
        tap.fill(t, out);
        return t;
      },
      () => {
        for (const p of players) {
          try {
            p.stop();
          } catch {
            // one not yet started has nothing to stop
          }
          p.disconnect();
        }
        volume.disconnect();
      },
    );
    void this.demoRest(
      context,
      whole,
      opening,
      startsAt,
      players,
      volume,
      mine,
    );
    audible = await this.plays(context);
    if (mine !== this.asked) return null;
    return audible
      ? { kind: "listening", source: "demo", name: "" }
      : { kind: "muted" };
  }

  /** The rest of the beat, rendered a second at a time after its first bar, then played round and round. */
  private async demoRest(
    context: AudioContext,
    whole: AudioBuffer,
    from: number,
    startsAt: number,
    players: AudioBufferSourceNode[],
    volume: GainNode,
    mine: number,
  ): Promise<void> {
    const rate = whole.sampleRate;
    const data = whole.getChannelData(0);
    const chunk = Math.round(DEMO_CHUNK * rate);
    for (let start = from; start < data.length; start += chunk) {
      await breathe();
      if (mine !== this.asked) return;
      renderDemoInto(data, rate, start, Math.min(data.length, start + chunk));
    }
    await breathe();
    if (mine !== this.asked) return;
    const loop = context.createBufferSource();
    loop.buffer = whole;
    loop.loop = true;
    loop.connect(volume);
    players.push(loop);
    // on from where the first bar ends; or, on a device too slow for that,
    // from where the beat would be now, after a gap
    const joins = startsAt + DEMO_OPENING;
    const soonest = context.currentTime + 0.02;
    if (soonest <= joins) loop.start(joins, DEMO_OPENING);
    else loop.start(soonest, (soonest - startsAt) % DEMO_SECONDS);
  }
}
