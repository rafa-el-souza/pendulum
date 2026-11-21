import { BEAT_PROCESSOR, BeatClock, type BeatAt } from "./beat.ts";

// The beat clock on the browser's audio line (docs/decisions.md, decision
// 78): the line hands it every sample of the source, in blocks of 128 or so,
// at an even pace whatever the page's frames do, and it tells the page what
// it says each time that changes, once a hop. The page reads the latest and
// moves it on to the moment it draws. This file runs on the audio line, as a
// module of its own (source.ts loads it); the clock itself is beat.ts.

/** What the audio line's scope offers its modules, which the page's types do not name. */
declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor,
): void;

class BeatProcessor extends AudioWorkletProcessor {
  readonly #clock = new BeatClock(sampleRate);
  #mono = new Float32Array(128);
  #told: BeatAt | null = null;

  /** Hears a block: its channels' mean, as the page's analyser hears them. */
  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0] ?? [];
    const first = channels[0];
    if (first === undefined) return true;
    const n = first.length;
    if (this.#mono.length !== n) this.#mono = new Float32Array(n);
    const mono = this.#mono;
    mono.set(first);
    for (let c = 1; c < channels.length; c++) {
      const channel = channels[c] ?? first;
      for (let i = 0; i < n; i++) mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0);
    }
    if (channels.length > 1) {
      for (let i = 0; i < n; i++) mono[i] = (mono[i] ?? 0) / channels.length;
    }
    // the block's last sample sounds this long after its first
    this.#clock.hear(mono, currentTime + (n - 1) / sampleRate);
    const now = this.#clock.now;
    if (now !== null && now !== this.#told) {
      this.#told = now;
      this.port.postMessage(now);
    }
    return true;
  }
}

registerProcessor(BEAT_PROCESSOR, BeatProcessor);
