// The twins carried by workers (docs/decisions.md, decision 51). The fan is
// dealt out in turn to W shares (twin-share.ts), each in a worker of its
// own, so that the device's cores advance it side by side while the main
// line moves the chain and draws. The main line keeps only the fan's count
// and what each share last reported, and tells the shares what happened to
// the twins as events, sent with the next frame's command, in order.
//
// A report comes back after the frame that asked for it, so the piece
// computes the chain a frame ahead while there are twins, and shows each
// frame once the twins of the same instant are back (decision 51). Where no
// worker can run, or one fails, the twins go back to the main line, all of
// them lost and born again: one share, run at once.

/* eslint-disable @typescript-eslint/no-non-null-assertion --
   Every index here runs within arrays sized for the shares, which the
   compiler's unchecked-index rule cannot see. */

import type { ChainState } from "../physics/step.ts";
import {
  TwinShare,
  type TwinCommand,
  type TwinEvent,
  type TwinReport,
} from "./twin-share.ts";
import { TwinBudget } from "./twins.ts";

/** Where a share runs, as the main line sees it. */
export interface SharePort {
  /** Sends a command; the share's report comes back to the `receive` it was opened with, later. */
  send(command: TwinCommand): void;
  /** Ends it. */
  close(): void;
}

/** Opens share `index` of `shares`, of chains of n masses, whose reports go to `receive` and whose failure goes to `fail`. */
export type OpenShare = (
  index: number,
  shares: number,
  n: number,
  receive: (report: TwinReport) => void,
  fail: (reason: string) => void,
) => SharePort;

/** What a worker is told first: which share it carries, and of what chain. */
export interface TwinSetup {
  readonly index: number;
  readonly shares: number;
  readonly n: number;
}

/**
 * How many workers carry the twins on a device of `cores` (as
 * navigator.hardwareConcurrency counts them): all but the one the page
 * draws on, from one to seven; three where the number is not known.
 */
export function sharesFor(cores: number | undefined): number {
  if (cores === undefined || !(cores >= 1)) return 3;
  return Math.min(7, Math.max(1, Math.floor(cores) - 1));
}

// A gap between frames longer than this is a pause of the page (a hidden
// tab, a debugger), not a frame.
const PAUSE_MS = 1000;
// How many of the last frames' gaps the screen's period is read from.
const GAPS = 60;

/**
 * The frames' rhythm, for the time each worker may take in a frame
 * (decision 51): the screen's own period, read from the last frames, never
 * slower than 60 Hz's, and the frames' period as they come, eased over the
 * frames. Frames that come later than the screen's rhythm leave no time
 * free: the page is already late, as where it draws without a GPU, and the
 * workers then take the least, so that the twins they carry are no more
 * than the page can draw.
 */
export class FrameRhythm {
  // the last frames' gaps, in ms, in turn
  readonly #gaps = new Float64Array(GAPS);
  #seen = 0;
  #screen = 1000 / 60;
  #period = 1000 / 60;

  /**
   * The screen's own period, in ms: the gap that a tenth of the last
   * frames' gaps are shorter than, so that a few short ones do not count,
   * and at most 60 Hz's, so that frames that all come late are not taken
   * for a slow screen.
   */
  get screen(): number {
    return this.#screen;
  }

  /** The frames' period as they come, eased over the frames, in ms. */
  get period(): number {
    return this.#period;
  }

  /** A frame came `gap` ms after the one before. */
  frame(gap: number): void {
    if (!(gap >= 0) || gap > PAUSE_MS) return;
    const ms = Math.min(100, Math.max(4, gap));
    this.#period += 0.1 * (ms - this.#period);
    this.#gaps[this.#seen % GAPS] = ms;
    this.#seen++;
    const seen = this.#gaps.slice(0, Math.min(this.#seen, GAPS)).sort();
    this.#screen = Math.min(1000 / 60, seen[Math.floor(0.1 * seen.length)]!);
  }

  /**
   * The time free in a frame, `elapsed` ms after it began, until `margin`
   * ms before the screen's next frame, less how much later than the
   * screen's rhythm the frames have been coming: none, or less than none,
   * while they come late.
   */
  free(elapsed: number, margin: number): number {
    const late = Math.max(0, this.#period - this.#screen);
    return this.#screen - elapsed - margin - late;
  }
}

/** A share opened in a worker of its own (twins.worker.ts). */
export const inWorker: OpenShare = (index, shares, n, receive, fail) => {
  const worker = new Worker(new URL("./twins.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.addEventListener("message", (event: MessageEvent<TwinReport>) => {
    receive(event.data);
  });
  worker.addEventListener("error", (event) => {
    event.preventDefault();
    fail(event.message || "the worker could not run");
  });
  worker.addEventListener("messageerror", () => {
    fail("a report could not be read");
  });
  const setup: TwinSetup = { index, shares, n };
  worker.postMessage(setup);
  return {
    send: (command) => {
      worker.postMessage(command);
    },
    close: () => {
      worker.terminate();
    },
  };
};

/** A share run on the main line, at once, where no worker can run. */
export const onMainLine: OpenShare = (index, shares, n, receive) => {
  const share = new TwinShare(index, shares, n);
  return {
    send: (command) => {
      receive(share.run(command));
    },
    close: () => undefined,
  };
};

export interface TwinWorkersOptions {
  /** How many shares carry the fan. */
  readonly shares: number;
  /** The masses of the chain, and so of each twin. */
  readonly n: number;
  /** The time a share may take in a frame, in ms, and a first guess of what a twin costs in it. */
  readonly budget: number;
  readonly cost: number;
  /** Where each share runs: in a worker. */
  readonly open: OpenShare;
  /** Told when the shares failed and the twins went back to the main line, every one of them lost. */
  readonly lost?: () => void;
}

/** A twin's report and its place in it: the twin's numbers start at k times the numbers a twin takes. */
export type TwinVisit = (j: number, report: TwinReport, k: number) => void;

/** The fan, dealt out to shares: twin j to share j mod W. */
export class TwinWorkers {
  #shares = 0;
  #ports: SharePort[] = [];
  #budgets: TwinBudget[] = [];
  #events: TwinEvent[][] = [];
  #shown: (TwinReport | null)[] = [];
  #arrived: { share: number; report: TwinReport }[] = [];
  #count = 0;
  #generation = 0;
  #n: number;
  #local = false;
  // counts the times the shares were opened, so that what shares since
  // closed send back is not taken
  #opening = 0;
  #budget: number;
  #cost: number;
  #ready = false;
  readonly #lost: () => void;

  constructor(options: TwinWorkersOptions) {
    this.#n = options.n;
    this.#budget = options.budget;
    this.#cost = options.cost;
    this.#lost = options.lost ?? (() => undefined);
    this.#open(options.shares, options.open);
    this.#ready = true;
  }

  /** The twins alive: the first `count` places of the fan. */
  get count(): number {
    return this.#count;
  }

  /** How many shares carry the fan. */
  get shares(): number {
    return this.#shares;
  }

  /** Whether the twins run on the main line, no worker being able to. */
  get local(): boolean {
    return this.#local;
  }

  /** Whether something happened to the twins that the shares have not been sent yet. */
  get pending(): boolean {
    return this.#events.some((events) => events.length > 0);
  }

  /** The twins the shares carry in their budgets: as many as the share that carries fewest allows. */
  affordable(): number {
    let most = Number.POSITIVE_INFINITY;
    this.#budgets.forEach((budget, w) => {
      most = Math.min(most, this.#shares * budget.affordable() + w);
    });
    return Number.isFinite(most) ? most : 0;
  }

  /** The time each share may take in a frame, in ms, from now on. */
  setBudget(ms: number): void {
    this.#budget = ms;
    for (const budget of this.#budgets) budget.budget = ms;
  }

  /** The chain went from `before` to `after` masses: each twin costs more, or less. */
  rescale(before: number, after: number): void {
    for (const budget of this.#budgets) budget.rescale(before, after);
    this.#cost *= (after / before) ** 1.5;
  }

  /**
   * Twins born from the chain as it is, each at its place in the fan
   * (decisions 20 and 43): those there already are born again, and the
   * next ones of the fan are added, in order, with no gap.
   */
  born(twins: readonly number[], chain: ChainState, spread: number): void {
    if (twins.length === 0) return;
    const byShare: number[][] = Array.from({ length: this.#shares }, () => []);
    let count = this.#count;
    for (const j of twins) {
      if (!Number.isInteger(j) || j < 0 || j > count) {
        throw new Error(
          `twin ${String(j)} would leave a gap in a fan of ${String(count)}`,
        );
      }
      if (j === count) count++;
      byShare[j % this.#shares]!.push(j);
    }
    this.#count = count;
    const theta = Float64Array.from(chain.theta);
    const omega = Float64Array.from(chain.omega);
    byShare.forEach((js, w) => {
      if (js.length > 0) {
        this.#events[w]!.push({
          kind: "born",
          twins: js,
          theta,
          omega,
          spread,
        });
      }
    });
  }

  /** Only the first `count` twins of the fan stay. */
  keep(count: number): void {
    if (count >= this.#count) return;
    this.#count = Math.max(0, count);
    for (const events of this.#events) {
      events.push({ kind: "keep", count: this.#count });
    }
  }

  /** The fan is put out: no twin is left, and nothing sent back from before is drawn. */
  clear(): void {
    this.#generation++;
    this.#count = 0;
    this.#shown.fill(null);
    for (const events of this.#events) events.push({ kind: "keep", count: 0 });
  }

  /** The twins take another number of masses, as the chain did (decision 4). */
  resample(n: number): void {
    if (n === this.#n) return;
    this.#n = n;
    for (const events of this.#events) events.push({ kind: "masses", n });
  }

  /** Time runs the other way for every twin (decision 28). */
  reverse(): void {
    for (const events of this.#events) events.push({ kind: "reverse" });
  }

  /** Sends each share the frame's command, with the events since the last. */
  send(frame: Omit<TwinCommand, "events" | "generation">): void {
    this.#ports.forEach((port, w) => {
      const events = this.#events[w] ?? [];
      this.#events[w] = [];
      port.send({ ...frame, events, generation: this.#generation });
    });
  }

  /**
   * Takes the reports that have come back since the last time: each one,
   * in the order they came, is shown from now on, its twins are handed to
   * `see` (for their trails and their light), and the time it took is
   * measured. A share that dropped twins, or that its budget cannot carry,
   * cuts the fan to the first part every share carries.
   */
  take(see?: TwinVisit): void {
    const arrived = this.#arrived;
    this.#arrived = [];
    for (const { share: w, report } of arrived) {
      if (report.generation !== this.#generation) continue;
      this.#shown[w] = report;
      if (report.pieces > 0) {
        const keep = this.#budgets[w]!.measured(
          report.count,
          report.asked,
          report.spent,
        );
        if (keep < report.asked) this.keep(this.#shares * keep + w);
      }
      if (see === undefined) continue;
      for (let k = 0; k < report.count; k++) {
        const j = w + k * this.#shares;
        if (j >= this.#count) break;
        see(j, report, k);
      }
    }
  }

  /** Each twin alive whose share has reported it, with that report: what is drawn. */
  each(visit: TwinVisit): void {
    const shares = this.#shares;
    for (let j = 0; j < this.#count; j++) {
      const w = j % shares;
      const report = this.#shown[w];
      if (report == null) continue;
      const k = (j - w) / shares;
      if (k < report.count) visit(j, report, k);
    }
  }

  /** Ends every share. */
  close(): void {
    for (const port of this.#ports) port.close();
    this.#ports = [];
  }

  #open(shares: number, open: OpenShare): void {
    const opening = ++this.#opening;
    this.#shares = shares;
    this.#ports = [];
    this.#budgets = Array.from(
      { length: shares },
      () => new TwinBudget(this.#budget, this.#cost),
    );
    this.#events = Array.from({ length: shares }, () => []);
    this.#shown = Array.from({ length: shares }, () => null);
    for (let index = 0; index < shares; index++) {
      try {
        this.#ports.push(
          open(
            index,
            shares,
            this.#n,
            (report) => {
              if (opening === this.#opening) {
                this.#arrived.push({ share: index, report });
              }
            },
            (reason) => {
              if (opening === this.#opening) this.#fallBack(reason);
            },
          ),
        );
      } catch (error) {
        // a worker that cannot even be made: the main line carries the twins
        if (open === onMainLine) throw error;
        this.#fallBack(error instanceof Error ? error.message : String(error));
        return;
      }
    }
  }

  /** The shares failed: every twin is lost, and one share on the main line carries the fan from now on. */
  #fallBack(reason: string): void {
    for (const port of this.#ports) port.close();
    console.warn(
      `The twins' workers failed (${reason}); the twins run on the main line.`,
    );
    this.#local = true;
    this.#count = 0;
    this.#generation++;
    this.#arrived = [];
    this.#open(1, onMainLine);
    if (this.#ready) this.#lost();
  }
}
