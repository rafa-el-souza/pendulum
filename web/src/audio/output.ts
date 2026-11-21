// When the sample heard now sounded, on an audio context's own clock
// (docs/decisions.md, decisions 44 and 78): from the output's own stamp
// where the browser gives one that holds, else the clock less the latencies
// the browser tells. WebKit's stamp holds no water: its page time runs twice
// as fast as the page's, so that the sample heard seems never to move.

/** What a browser tells of an audio context's output, and the page's time now, in ms. */
export interface OutputClock {
  readonly currentTime: number;
  readonly baseLatency: number;
  readonly outputLatency: number | undefined;
  readonly stamp: {
    readonly contextTime?: number;
    readonly performanceTime?: number;
  } | null;
  readonly now: number;
}

/** How far ahead of the clock, and behind it, a stamp may put the sample heard, in s: past these, it does not hold. */
const AHEAD = 0.05;
const BEHIND = 1;

/** The time on the context's clock of the sample being heard now, in s. */
export function heardAt(clock: OutputClock): number {
  const lag = (clock.outputLatency ?? 0) + clock.baseLatency;
  const told = clock.currentTime - (Number.isFinite(lag) ? lag : 0);
  const { stamp, now } = clock;
  const contextTime = stamp?.contextTime ?? 0;
  const performanceTime = stamp?.performanceTime ?? 0;
  // a stamp from the page's future is out of true
  if (
    contextTime > 0 &&
    performanceTime > 0 &&
    performanceTime <= now + 1000 * AHEAD
  ) {
    const at = contextTime + (now - performanceTime) / 1000;
    if (at <= clock.currentTime + AHEAD && at >= clock.currentTime - BEHIND) {
      return at;
    }
  }
  return told;
}
