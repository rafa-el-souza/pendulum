import { DEMO_SECONDS, demoWindow, renderDemoInto } from "./demo.ts";
import { builtInMicrophone } from "./devices.ts";
import { Hearing, WINDOW, type Signals } from "./signals.ts";

// Where the piece's music comes from (docs/decisions.md, decision 44): the
// microphone, a file, or the demonstration beat. Each starts on a touch, as
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
export type Source = "microphone" | "file" | "demo";

/** What starting a source came to. */
export type Outcome =
  | {
      readonly kind: "listening";
      readonly source: Source;
      readonly name: string;
    }
  | { readonly kind: "muted" }
  | { readonly kind: "refused" }
  | { readonly kind: "missing" }
  | { readonly kind: "failed" };

/** How loud the demonstration beat plays, as a share of full scale. */
const DEMO_VOLUME = 0.5;
/** The rate the beat is heard at when no sound is made at all, in Hz. */
const MUTED_RATE = 48_000;
/** How much of the beat is rendered before it plays, its first bar, and then before the page breathes, in s. */
const DEMO_OPENING = 2;
const DEMO_CHUNK = 1;
/** How long a browser may take to let sound play, in ms, before the beat goes on muted. */
const RESUME_MS = 1000;

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

/** The time on `context`'s clock of the sample being heard now, in s, or null while its clock has not run. */
function outputTime(context: AudioContext): number | null {
  const { contextTime, performanceTime } = context.getOutputTimestamp();
  if (
    contextTime === undefined ||
    performanceTime === undefined ||
    contextTime <= 0
  ) {
    return null;
  }
  return contextTime + (performance.now() - performanceTime) / 1000;
}

/** Listens to one source at a time, and hears it a frame at a time. */
export class Listening {
  /** The source listened to, or null. */
  source: Source | null = null;
  private context: AudioContext | null = null;
  /** Lets the source go. */
  private release: (() => void) | null = null;
  /** Fills a window with the latest samples, and gives the time of the last, or null while there are none. */
  private take: ((out: Float32Array<ArrayBuffer>) => number | null) | null =
    null;
  private hearing: Hearing | null = null;
  private readonly samples = new Float32Array(WINDOW);
  /** How many starts were asked for: a start that another has overtaken drops what it got. */
  private asked = 0;

  /**
   * Starts listening to `source`, `file` for a file, from a touch: what came
   * of it, or null when another start or a stop overtook it.
   */
  async start(source: Source, file?: File): Promise<Outcome | null> {
    this.letGo();
    const mine = ++this.asked;
    const context = this.audio();
    if (source === "demo") return this.demo(context, mine);
    if (context === null) return { kind: "failed" };
    if (source === "microphone") return this.microphone(context, mine);
    if (file === undefined) return { kind: "failed" };
    return this.file(context, file, mine);
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

  /** Whether `context` plays sound, once it has had a moment to start. */
  private async plays(context: AudioContext): Promise<boolean> {
    await Promise.race([
      context.resume().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, RESUME_MS)),
    ]);
    return context.state === "running";
  }

  /** The window of samples an analyser of `input` holds, taken through a branch that makes no sound. */
  private tap(context: AudioContext, input: AudioNode): AnalyserNode {
    const analyser = context.createAnalyser();
    analyser.fftSize = WINDOW;
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
  ): Promise<Outcome | null> {
    if (!("mediaDevices" in navigator)) return { kind: "missing" };
    const media = navigator.mediaDevices;
    let stream: MediaStream;
    try {
      stream = await media.getUserMedia({ audio: PROCESSING });
    } catch (error) {
      if (mine !== this.asked) return null;
      const name = error instanceof DOMException ? error.name : "";
      return name === "NotAllowedError" || name === "SecurityError"
        ? { kind: "refused" }
        : { kind: "missing" };
    }
    // the device's own microphone, where the default is a headset's
    const current = stream.getAudioTracks()[0]?.getSettings().deviceId ?? "";
    const own = builtInMicrophone(await media.enumerateDevices(), current);
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
    const label = stream.getAudioTracks()[0]?.label ?? "";
    return { kind: "listening", source: "microphone", name: label };
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
      this.listen(
        "demo",
        MUTED_RATE,
        (out) => {
          demoWindow(now() - origin, MUTED_RATE, out);
          return now() - origin;
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
    this.listen(
      "demo",
      rate,
      (out) => {
        const heard = outputTime(context);
        const t = heard === null ? now() - origin : heard - startsAt;
        demoWindow(t, rate, out);
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
    const sounds = await this.plays(context);
    if (mine !== this.asked) return null;
    return sounds
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
