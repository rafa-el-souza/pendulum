// Trails kept as curves (docs/decisions.md, decision 68), beside the image
// carried to each new view (decisions 66 and 67), and asked for by the
// address ("?trails=sharp"). Each trail's samples are joined into spans of
// curves (curves.ts), kept in a window (spans.ts) since the older of two
// snapshots of the image, taken every three half-lives of fade. The image of
// all the light is shown as before and takes each frame's new intervals;
// when the view changes it is made again: the older snapshot read from its
// view, faded since it was taken, where it did not see a coarse image of the
// whole disc, and over them the window and the spans still open, drawn anew,
// as fine, in the new view. The fade is kept as a number: the images hold
// their light divided by k, darkened for real only once k falls below a
// 64th. Each span keeps the fade clock at its ends, in half-lives, not the
// time, so that its light is right however the half-life changed since.
// The snapshot, and its coarse image, are read only into a view at most a
// quarter nearer than they saw, as the image carried is (decision 69); while
// the image lacks what they hold, the next snapshot waits, since a copy would
// lose it, unless the window is full: that copy is made with it (decision
// 70). The address can ask the window to keep more spans (decision 70). A
// strobe's stamps are kept as straight spans, at the instant of their flash
// (decision 91).

import type { Rgb } from "./color.ts";
import {
  Merger,
  SpanBatch,
  SpanLines,
  mostPieces,
  pushStraight,
  type SpanStyle,
} from "./curves.ts";
import { SpanWindow } from "./spans.ts";
import { WorkerCurves } from "./worker-curves.ts";
import { GROWTH_LIMIT, LightTarget, type Trails } from "./trails.ts";
import {
  MOST_ZOOM,
  SLACK,
  covers,
  fitScale,
  sameView,
  type View,
} from "./view.ts";

/**
 * Whether the trails are kept as curves (decision 71): unless the address
 * asks for layers, the image carried ("?trails=layers"); "?trails=sharp",
 * as the curves were asked for before they were the default, keeps them.
 */
export function readCurves(search: string): boolean {
  return new URLSearchParams(search).get("trails") !== "layers";
}

/** Whether an address asks for the meter: "?fps=1". */
export function readMeter(search: string): boolean {
  return new URLSearchParams(search).get("fps") === "1";
}

/** The most times as many spans an address can ask the curves to keep. */
export const KEEP_MOST = 20;

/** How many times as many spans the curves keep when the address asks for none (decision 71). */
export const KEEP_DEFAULT = 10;

/**
 * How many times as many spans an address asks the curves to keep (decision
 * 70): "?keep=3", from one to KEEP_MOST; KEEP_DEFAULT when it asks for none.
 */
export function readKeep(search: string): number {
  const asked = new URLSearchParams(search).get("keep");
  const keep = asked === null || asked === "" ? Number.NaN : Number(asked);
  return Number.isFinite(keep)
    ? Math.min(KEEP_MOST, Math.max(1, keep))
    : KEEP_DEFAULT;
}

/**
 * How many times the light from before the window may be stretched, read
 * from the older snapshot, before it is hidden (decision 72): "?stretch=2",
 * from one to MOST_ZOOM, which never hides it; GROWTH_LIMIT when the address
 * says none.
 */
export function readStretch(search: string): number {
  const asked = new URLSearchParams(search).get("stretch");
  const stretch = asked === null || asked === "" ? Number.NaN : Number(asked);
  return Number.isFinite(stretch)
    ? Math.min(MOST_ZOOM, Math.max(1, stretch))
    : GROWTH_LIMIT;
}

/** What of an address's search measures the trails, its mechanism, its window, how far its old light stretches and the meter, kept beside a saved moment as the music is. */
export function keepMeasures(search: string): string {
  const query = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of ["trails", "fps", "keep", "stretch"]) {
    const value = query.get(key);
    if (value !== null) kept.set(key, value);
  }
  const text = kept.toString();
  return text === "" ? "" : `?${text}`;
}

/** How the trails meet a new view: drawn anew from curves, or the image carried, as layers (decisions 66, 67 and 71). */
export type Mechanism = "sharp" | "layers";

/** What of the trails the curves cannot keep yet. */
export interface TrailsDrawn {
  /** Trails that leave a mark, kept in pixels (decision 42). */
  readonly mark: boolean;
  /** Whether the light's targets hold half floats: eight bits cannot keep the fade as a number. */
  readonly floating: boolean;
}

/**
 * The mechanism the trails use: curves when they are asked for (decision
 * 71), without a mark, in half floats, a strobe's stamps as well as lines
 * (decision 91); the image carried, as layers, otherwise.
 */
export function trailMechanism(asked: boolean, drawn: TrailsDrawn): Mechanism {
  return asked && !drawn.mark && drawn.floating ? "sharp" : "layers";
}

/**
 * Whether light kept as `seen` saw it may be read into `view` (decision
 * 69): while the view is at most `stretch` times nearer, by the camera or a
 * larger canvas, GROWTH_LIMIT as the image carried is kept unless the
 * address says otherwise (decision 72); past that, its lines would read as
 * wide, soft bands beside the fine ones.
 */
export function readable(
  seen: View,
  view: View,
  stretch = GROWTH_LIMIT,
): boolean {
  return view.scale / seen.scale <= stretch * SLACK;
}

/** Half-lives of fade between snapshots. */
export const SNAPSHOT_HALF_LIVES = 3;

/**
 * Spans since the last snapshot that bring the next one sooner, so that the
 * window keeps at most about twice as many: trails that stay, which never
 * fade, and many twins in slow motion keep it within its memory, and a
 * remake within its time.
 */
export const SNAPSHOT_SPANS = 200_000;

/** Whether a snapshot is due, `fade` half-lives and `spans` spans after the last, the window keeping `keep` times as many (decision 70). */
export function snapshotDue(fade: number, spans: number, keep = 1): boolean {
  return fade >= SNAPSHOT_HALF_LIVES || spans >= SNAPSHOT_SPANS * keep;
}

/**
 * Whether a snapshot is taken now (decision 70): when `due`, by copying the
 * image, unless the image is `lacking` light from before the window, which a
 * copy would lose for good; then it waits for the view to read it again,
 * unless the window is `full`, and that snapshot is composed with it.
 */
export function snapshotWhen(
  due: boolean,
  lacking: boolean,
  full: boolean,
): "no" | "copy" | "compose" {
  if (!due) return "no";
  if (!lacking) return "copy";
  return full ? "compose" : "no";
}

/** The light kept divided by `k`, at the fade clock `fade`. */
export interface Kept {
  readonly k: number;
  readonly fade: number;
}

/** What a snapshot taken at `at` is read times, into an image kept as `now`: its light then, faded since, in the image's units. */
export function snapshotGain(at: Kept, now: Kept): number {
  return (at.k * 2 ** -(now.fade - at.fade)) / now.k;
}

/** Where a step of the samples begins: the seconds of motion, the fade clock, and the half-lives a second the step fades at. */
export interface StepStart {
  readonly seconds: number;
  readonly fade: number;
  readonly rate: number;
}

/**
 * The samples' clock: the seconds of motion sampled, and the fade, in
 * half-lives, since the piece opened. A step fades at one over its
 * half-life, which the music's linger can change from step to step
 * (decision 49); trails that stay do not fade.
 */
export class TrailClock {
  seconds = 0;
  fade = 0;
  #rate = 0;

  /** A step begins, fading at `halfLife`; where it begins. */
  begin(halfLife: number): StepStart {
    this.#rate = halfLife > 0 && Number.isFinite(halfLife) ? 1 / halfLife : 0;
    return { seconds: this.seconds, fade: this.fade, rate: this.#rate };
  }

  /** `seconds` more of the step. */
  advance(seconds: number): void {
    this.seconds += seconds;
    this.fade += seconds * this.#rate;
  }
}

/** The clock `seconds` into a step that began at `start`: its seconds and its fade. */
export function clockAt(start: StepStart, seconds: number): [number, number] {
  return [start.seconds + seconds, start.fade + seconds * start.rate];
}

/** A snapshot: the image as it was, in the view it saw, and the coarse image of the whole disc. */
interface Snapshot {
  readonly image: LightTarget;
  readonly coarse: LightTarget;
  view: View;
  /**
   * The coarse image's view; none, its target let go, for a snapshot taken
   * in the whole view, which sees the whole disc.
   */
  coarseView: View | null;
  /** Where the window's spans after it begin. */
  mark: Float64Array;
  k: number;
  fade: number;
  /** The seconds of motion on the samples' clock when it was taken. */
  seconds: number;
}

/** The coarse image reaches this many times the chain's reach from the pivot. */
const COARSE_REACH = 1.05;

/** The largest side of the coarse image, in pixels. */
const COARSE_MOST = 4096;

/** The twins' workers, as the trails kept as curves ask them (decision 97). */
export interface TwinCurveSource {
  /** How many shares carry the twins. */
  readonly shares: number;
  /** The number the next command will carry, which an ask made now reaches the workers with. */
  readonly nextSeq: number;
  /** Whether every worker has had each command it was sent taken back. */
  readonly inStep: boolean;
  /** Each worker splits its twins' open curves before its next time. */
  split(): void;
  /** Each worker lets its twins' curves go. */
  forget(): void;
}

/** A frame of the trails kept as curves. */
export interface SharpFrame {
  /** The view the image is shown in. */
  readonly view: View;
  /** Whether the view is the whole one, at the pivot, as the piece opens. */
  readonly whole: boolean;
  /** Half-lives of fade the trails take this frame. */
  readonly fade: number;
  /** Half the width of a trail, in the drawing buffer's pixels. */
  readonly radius: number;
}

/** The trails kept as curves, drawing into the trails' image. */
export class SharpTrails {
  /** The chain's trails, a mass each. */
  readonly chain = new Merger();
  /** The twins' trails, as their workers join them into curves and send them back (decision 97). */
  readonly twins = new WorkerCurves();
  /** The intervals sampled since the last frame, and the spans they closed. */
  readonly fresh = new SpanBatch(4096);
  readonly closed = new SpanBatch(4096);
  /** The samples' clock. */
  readonly clock = new TrailClock();
  readonly #gl: WebGL2RenderingContext;
  readonly #trails: Trails;
  readonly #source: TwinCurveSource;
  readonly #reach: number;
  readonly #keep: number;
  readonly #stretch: number;
  readonly #lines: SpanLines;
  readonly #window: SpanWindow;
  readonly #open = new SpanBatch(1024);
  // the snapshot the window keeps the spans after, none while it keeps them
  // all, and the newer one, taken since
  #base: Snapshot | null = null;
  #newest: Snapshot | null = null;
  readonly #spare: Snapshot[] = [];
  // the coarse image of the whole disc: taking spans while the view is not
  // the whole one, and made from the image as it leaves it
  #coarse: LightTarget | null = null;
  #coarseView: View | null = null;
  #coarseLive = false;
  // the image's view when it was last made, and whether it was the whole one
  #imageView: View | null = null;
  #imageWhole = false;
  // the fade clock of the light shown, and at the last snapshot
  #fade = 0;
  #lastSnapshot = 0;
  #spansSince = 0;
  #remake = true;
  // whether the image lacks light from before the window, left out of the
  // last remake (decision 69), which a copy of it would lose (decision 70)
  #lacking = false;
  // the seconds of motion when the window began to keep every span, while
  // no snapshot is older
  #since = 0;
  #measured = Number.NEGATIVE_INFINITY;
  readonly #pixel = new Uint8Array(4);
  // A snapshot whose twins' curves split in their workers, a frame or more
  // later (decision 97): its image, copied as it fell due, or to be
  // composed once they are back; and the spans closed meanwhile, which go
  // into the window after its mark.
  #awaiting: { readonly taken: Snapshot | null } | null = null;
  readonly #queue = new SpanBatch(1024);
  /** The frames a snapshot due has waited for the twins' workers to be in step. */
  waited = 0;
  /** Whether to measure what a remake costs, the card's work waited for, every half second. */
  measuring = false;
  /** What the last measured remake cost, in ms; none yet. */
  remakeMs: number | null = null;

  /**
   * The curves of `trails`, the twins' joined by their workers in `source`,
   * over the disc `reach` metres from the pivot, the window keeping `keep`
   * times as many spans (decision 70), and the light from before it read
   * while stretched at most `stretch` times (decision 72).
   */
  constructor(
    gl: WebGL2RenderingContext,
    trails: Trails,
    source: TwinCurveSource,
    reach: number,
    keep = 1,
    stretch = GROWTH_LIMIT,
  ) {
    this.#gl = gl;
    this.#trails = trails;
    this.#source = source;
    this.twins.reset(source.shares);
    this.#reach = reach;
    this.#keep = keep;
    this.#stretch = stretch;
    this.#lines = new SpanLines(gl);
    this.#window = new SpanWindow(gl, reach, keep);
  }

  /** The bytes the curves take on the card: the window, the coarse image and the snapshots. */
  get bytes(): number {
    let bytes = this.#window.bytes + targetBytes(this.#coarse);
    for (const snapshot of [this.#base, this.#newest, ...this.#spare]) {
      if (snapshot === null) continue;
      bytes += targetBytes(snapshot.image) + targetBytes(snapshot.coarse);
    }
    return bytes;
  }

  /** The spans the window keeps. */
  get spans(): number {
    return this.#window.count;
  }

  /** The seconds of motion the curves keep: since the older snapshot, or since they began. */
  get kept(): number {
    return this.clock.seconds - (this.#base?.seconds ?? this.#since);
  }

  /** Lets every trail go: the light was cleared. */
  clear(): void {
    this.chain.forget();
    // the twins' workers let theirs go with their next command, and nothing
    // they send back of before it is drawn (decision 97)
    this.#source.forget();
    this.twins.forget(this.#source.nextSeq);
    this.fresh.clear();
    this.closed.clear();
    this.#window.clear();
    this.#queue.clear();
    this.#letGo(this.#awaiting?.taken ?? null);
    this.#awaiting = null;
    this.#letGo(this.#base);
    this.#letGo(this.#newest);
    this.#base = null;
    this.#newest = null;
    this.#coarse?.clear();
    this.#coarseLive = false;
    this.#lastSnapshot = this.#fade;
    this.#spansSince = 0;
    this.#remake = true;
    this.#lacking = false;
    this.#since = this.clock.seconds;
  }

  /**
   * Takes over from the image carried (layers): what it shows becomes the first
   * snapshot, and the window starts empty after it.
   */
  start(frame: SharpFrame): void {
    this.clear();
    // the image as it was last drawn, in the view it was drawn in; none
    // before the first frame, when there is nothing to keep
    const drawn = this.#trails.view;
    const view = drawn ?? frame.view;
    const whole = sameView(view, frame.view) && frame.whole;
    this.#trails.keepAsCurves(view);
    this.#fitCoarse(view);
    if (drawn !== null) this.#base = this.#snapshot(view, whole);
    this.#imageView = view;
    this.#imageWhole = whole;
  }

  /**
   * A rod stamped by a strobe's flash, from (ax, ay) to (bx, by), as a
   * straight span at the samples' clock now (decision 91): drawn into the
   * image this frame, and kept in the window, drawn anew in any view.
   */
  stamp(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    color: Rgb,
    light: number,
  ): void {
    const { fade } = this.clock;
    pushStraight(this.fresh, ax, ay, bx, by, color, light, fade);
    pushStraight(this.closed, ax, ay, bx, by, color, light, fade);
  }

  /**
   * The twins' workers failed, and `shares` carry the twins from now on:
   * the curves they last sent back still open stay in the window, whose
   * light the image has, and the curves start anew (decision 97).
   */
  workersLost(shares: number): void {
    this.#open.clear();
    this.twins.openSpans(this.#open);
    this.#window.add(this.#open);
    this.twins.reset(shares);
  }

  /** Takes the view of this frame, before anything is drawn: says whether it changed, and then the image is remade. */
  see(view: View): boolean {
    const changed = this.#trails.look(view);
    if (changed) this.#remake = true;
    return changed;
  }

  /** Hands the trails back to the image carried (layers), as the image is now. */
  stop(): void {
    this.clear();
    this.#coarse?.dispose();
    this.#coarse = null;
    this.#coarseView = null;
    for (const snapshot of this.#spare.splice(0)) {
      snapshot.image.dispose();
      snapshot.coarse.dispose();
    }
    this.#trails.carryAgain();
  }

  /** A snapshot no longer read: its targets are kept for the next. */
  #letGo(snapshot: Snapshot | null): void {
    if (snapshot !== null) this.#spare.push(snapshot);
  }

  /**
   * A frame: the trails fade by the frame's half-lives, take the spans
   * closed and the intervals sampled since the last, and are remade when the
   * view changed; a snapshot is taken when due.
   */
  frame(frame: SharpFrame, now: number): void {
    const trails = this.#trails;
    const { view, whole } = frame;
    this.#fitCoarse(view);
    // the coarse image takes spans only away from the whole view, and is let
    // go there; leaving it, it is made from the image, which saw the whole
    // disc
    let coarseNew = false;
    if (whole) {
      this.#coarseLive = false;
      this.#coarse?.dispose();
    } else if (!this.#coarseLive && this.#coarseView !== null) {
      const side = this.#coarseView.width;
      this.#coarse ??= new LightTarget(this.#gl, [side, side]);
      this.#coarse.fit();
    }
    const coarse = this.#coarse;
    const coarseView = this.#coarseView;
    if (!whole && !this.#coarseLive && coarse !== null && coarseView !== null) {
      if (this.#imageView !== null && this.#imageWhole) {
        trails.carryBetween(trails.image, this.#imageView, coarse, coarseView);
        coarseNew = true;
      } else {
        coarse.clear();
      }
      this.#coarseLive = true;
    }
    const style = (view: View): SpanStyle => ({
      radius: frame.radius,
      now: this.#fade,
      gain: 1 / trails.k,
      most: mostPieces(
        view.scale / fitScale(view.width, view.height, this.#reach),
      ),
    });
    if (frame.fade > 0) {
      trails.fadeKept(
        2 ** -frame.fade,
        this.#coarseLive && coarse !== null ? [coarse] : [],
      );
      this.#fade += frame.fade;
    }
    // A snapshot waits for the twins' workers to split their curves
    // (decision 97): the spans they split go into the window before its
    // mark, and the coarse images take those of a snapshot; once every
    // worker has answered, the mark is placed, and the spans closed
    // meanwhile follow it. Split as the coarse image was born, they go into
    // the window alone.
    const { twins } = this;
    this.#window.add(twins.splitBefore);
    const taken = this.#awaiting?.taken ?? null;
    if (taken !== null && taken.coarseView !== null) {
      const at = taken.coarseView;
      trails.drawInto(taken.coarse, () => {
        this.#lines.begin(at, { ...style(at), now: taken.fade, most: 2 });
        this.#lines.batch(twins.splitForCoarse);
        this.#lines.end();
      });
    }
    if (this.#awaiting !== null && this.#source.inStep) {
      this.#mark(view, whole, style);
    }
    this.#enter(this.closed);
    this.#enter(twins.closedForWindow);
    this.#enter(twins.splitAfter);
    this.#spansSince += this.closed.count + twins.closedForWindow.count;
    if (this.#coarseLive && coarse !== null && coarseView !== null) {
      if (coarseNew) {
        // made from the image just now: it takes the intervals the image
        // has not taken yet, and every open span is split here, into the
        // window alone, so that no interval reaches it twice; the twins'
        // with their workers' next command (decision 97)
        trails.drawInto(coarse, () => {
          this.#lines.begin(coarseView, {
            ...style(coarseView),
            most: 2,
          });
          this.#lines.batch(this.fresh);
          this.#lines.end();
        });
        this.#open.clear();
        this.chain.splitAll(this.#open);
        this.#enter(this.#open);
        this.#source.split();
        twins.coarse(this.#source.nextSeq);
      } else {
        // the spans closed, faded since they were born: it is read only in
        // the snapshots, and at a snapshot every open span is closed first
        trails.drawInto(coarse, () => {
          this.#lines.begin(coarseView, {
            ...style(coarseView),
            most: 2,
          });
          this.#lines.batch(this.closed);
          this.#lines.end();
        });
      }
      // the intervals of the twins' reports joined before it was born,
      // which it lacks, and a snapshot's split of the twins (decision 97)
      if (twins.freshForCoarse.count + twins.splitForCoarse.count > 0) {
        trails.drawInto(coarse, () => {
          this.#lines.begin(coarseView, {
            ...style(coarseView),
            most: 2,
          });
          this.#lines.batch(twins.freshForCoarse);
          this.#lines.batch(twins.splitForCoarse);
          this.#lines.end();
        });
      }
    }
    if (!this.#remake) {
      // the new intervals, as they were drawn
      trails.drawIn((into) => {
        this.#lines.begin(into, style(into));
        this.#lines.batch(this.fresh);
        this.#lines.end();
      });
    } else {
      this.#remakeImage(view, whole, style, now);
    }
    this.fresh.clear();
    this.closed.clear();
    twins.clear();
    const when = snapshotWhen(
      snapshotDue(
        this.#fade - this.#lastSnapshot,
        this.#spansSince,
        this.#keep,
      ),
      this.#lacking,
      this.#window.full,
    );
    if (when !== "no" && this.#awaiting === null) {
      if (!this.#source.inStep) {
        // a twins' worker is a frame late: its split would end curves the
        // image has not drawn yet, so the snapshot waits (decision 97)
        this.waited++;
      } else {
        // no span runs across a snapshot: those open end here, the chain's
        // now and the twins' with their workers' next command (decision
        // 96); a copy of the image is taken now, a composed one once the
        // twins' split is back
        this.#open.clear();
        this.chain.splitAll(this.#open);
        this.#window.add(this.#open);
        if (this.#coarseLive && coarse !== null && coarseView !== null) {
          trails.drawInto(coarse, () => {
            this.#lines.begin(coarseView, {
              ...style(coarseView),
              most: 2,
            });
            this.#lines.batch(this.#open);
            this.#lines.end();
          });
        }
        this.#source.split();
        twins.snapshot(this.#source.nextSeq);
        this.#awaiting = {
          taken: when === "copy" ? this.#snapshot(view, whole) : null,
        };
      }
    }
  }

  /** Into the window, or after the mark of a snapshot that waits for the twins' workers (decision 97). */
  #enter(spans: SpanBatch): void {
    if (this.#awaiting === null) this.#window.add(spans);
    else this.#queue.appendBatch(spans);
  }

  /**
   * The snapshot that waited is kept, every twins' worker having split its
   * curves (decision 97): its image composed now if it was to be, its mark
   * placed after their split, and the spans closed meanwhile after it.
   */
  #mark(view: View, whole: boolean, style: (view: View) => SpanStyle): void {
    const awaiting = this.#awaiting;
    if (awaiting === null) return;
    const snapshot = awaiting.taken ?? this.#snapshot(view, whole, style(view));
    snapshot.mark = this.#window.mark();
    if (this.#newest !== null) {
      // the newer becomes the one the window keeps the spans after
      this.#letGo(this.#base);
      this.#base = this.#newest;
      this.#window.dropBefore(this.#base.mark);
    }
    this.#newest = snapshot;
    this.#awaiting = null;
    this.twins.marked();
    this.#window.add(this.#queue);
    this.#queue.clear();
  }

  /** The image made again in `view`: the older snapshot, the window and the spans open. */
  #remakeImage(
    view: View,
    whole: boolean,
    style: (view: View) => SpanStyle,
    now: number,
  ): void {
    const trails = this.#trails;
    const measure = this.measuring && now - this.#measured >= 500;
    let began = 0;
    if (measure) {
      this.#wait();
      began = performance.now();
    }
    // the light before the window, from the older snapshot and its coarse
    // image, each while the view is near enough to read it; it comes back as
    // the view goes farther
    const base = this.#base;
    const from =
      base === null || !readable(base.view, view, this.#stretch)
        ? null
        : {
            image: base.image,
            view: base.view,
            coarse:
              base.coarseView === null ||
              !readable(base.coarseView, view, this.#stretch)
                ? null
                : { target: base.coarse, view: base.coarseView },
            gain: snapshotGain(base, { k: trails.k, fade: this.#fade }),
          };
    // left out, where the view sees: the snapshot, or its coarse image
    // past what the snapshot saw
    this.#lacking =
      base !== null &&
      (from === null ||
        (base.coarseView !== null &&
          from.coarse === null &&
          !covers(base.view, view)));
    trails.remake(from, (into) => {
      const drawn = style(into);
      this.#window.draw(this.#lines, into, drawn);
      this.#open.clear();
      this.chain.openSpans(this.#open);
      this.twins.openSpans(this.#open);
      this.#lines.begin(into, drawn);
      // the spans closed while a snapshot waits (decision 97)
      this.#lines.batch(this.#queue);
      this.#lines.batch(this.#open);
      this.#lines.end();
    });
    if (measure) {
      this.#wait();
      this.remakeMs = performance.now() - began;
      this.#measured = now;
    }
    this.#imageView = view;
    this.#imageWhole = whole;
    this.#remake = false;
  }

  /** Waits for the card to finish what it was given, by reading a pixel of the canvas. */
  #wait(): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.#pixel);
  }

  /** The coarse image fitted to the whole view of the drawing buffer, its light carried when that changed. */
  #fitCoarse(view: View): void {
    const fit = fitScale(view.width, view.height, this.#reach);
    const half = COARSE_REACH * this.#reach;
    const side = Math.max(1, Math.min(COARSE_MOST, Math.ceil(2 * half * fit)));
    const before = this.#coarseView;
    if (before !== null && before.width === side) return;
    const coarseView: View = {
      width: side,
      height: side,
      scale: side / (2 * half),
      cx: 0,
      cy: 0,
    };
    const old = this.#coarse;
    if (old !== null && before !== null && this.#coarseLive) {
      const coarse = new LightTarget(this.#gl, [side, side]);
      this.#trails.carryBetween(old, before, coarse, coarseView);
      this.#coarse = coarse;
    } else {
      this.#coarse = null;
    }
    old?.dispose();
    this.#coarseView = coarseView;
  }

  /**
   * A snapshot of the image as it is, in `view`, and, away from the whole
   * view, of the coarse image: the live one, or made from the image. With
   * `composed`, the style the spans are drawn in, the image is not copied
   * but made again with all its light (decision 70): the older snapshot and
   * its coarse image read in any view, and the window over them.
   */
  #snapshot(
    view: View,
    whole: boolean,
    composed: SpanStyle | null = null,
  ): Snapshot {
    const trails = this.#trails;
    const { width, height } = view;
    const reused = this.#spare.pop();
    const image = reused?.image ?? new LightTarget(this.#gl, [width, height]);
    const coarse = reused?.coarse ?? new LightTarget(this.#gl, [1, 1]);
    const base = this.#base;
    if (composed !== null && base !== null) {
      image.floating = trails.image.floating;
      image.resize(width, height);
      image.fit();
      trails.carryBetween(
        base.image,
        base.view,
        image,
        view,
        base.coarseView === null
          ? null
          : { target: base.coarse, view: base.coarseView },
        snapshotGain(base, { k: trails.k, fade: this.#fade }),
      );
      trails.drawInto(image, () => {
        this.#window.draw(this.#lines, view, composed);
      });
    } else {
      trails.copyBetween(trails.image, image);
    }
    const coarseView = whole ? null : this.#coarseView;
    if (coarseView === null) {
      coarse.dispose();
    } else if (this.#coarseLive && this.#coarse !== null) {
      trails.copyBetween(this.#coarse, coarse);
    } else {
      coarse.resize(coarseView.width, coarseView.height);
      trails.carryBetween(trails.image, view, coarse, coarseView);
    }
    this.#lastSnapshot = this.#fade;
    this.#spansSince = 0;
    return {
      image,
      coarse,
      view,
      coarseView,
      // placed once the twins' split is back (decision 97)
      mark: this.#window.mark(),
      k: trails.k,
      fade: this.#fade,
      seconds: this.clock.seconds,
    };
  }
}

/** The bytes a target of half floats takes, four channels of two bytes. */
function targetBytes(target: LightTarget | null): number {
  if (target === null || !target.made) return 0;
  return target.width * target.height * 8;
}
