// The fingers on the stage (docs/decisions.md, decision 67). One finger
// grabs the chain, but not at once: it waits a moment, or until it moves a
// few pixels, so that a second finger can land and pinch, and two fingers
// never grab. A finger that lifts within the wait grabs nothing. After a
// pinch, the finger left grabs nothing until every finger has lifted; a new
// one landing beside it pinches again. While one finger holds the chain, the
// others are left alone.

/** Where a finger is on the stage, in CSS pixels. */
export interface Spot {
  readonly x: number;
  readonly y: number;
}

/** How long one finger waits before it grabs, in milliseconds, and how far it may move first, in CSS pixels. */
export interface Wait {
  readonly ms: number;
  readonly px: number;
}

/** The piece's wait, until the hand that tries it chooses another. */
export const WAIT: Wait = { ms: 120, px: 10 };

/**
 * The wait an address asks for, to try it ("?wait=200", or "?wait=200,16"
 * with the pixels), up to a second and a hundred pixels; the piece's own
 * otherwise.
 */
export function readWait(search: string): Wait {
  const asked = new URLSearchParams(search).get("wait");
  if (asked === null) return WAIT;
  const [ms, px = WAIT.px] = asked.split(",").map(Number);
  if (ms === undefined || !Number.isFinite(ms) || !Number.isFinite(px)) {
    return WAIT;
  }
  return {
    ms: Math.min(1000, Math.max(0, ms)),
    px: Math.min(100, Math.max(0, px)),
  };
}

/** What a finger asks of the piece: to grab the chain, to move the pinch, or nothing. */
export type TouchAct = "grab" | "pinch" | "none";

type State =
  | { readonly kind: "idle" }
  | {
      readonly kind: "waiting";
      readonly id: number;
      readonly from: Spot;
      readonly at: number;
    }
  | { readonly kind: "holding"; readonly id: number }
  | { readonly kind: "pinching"; readonly a: number; readonly b: number }
  // fingers left after a pinch or a hold, which grab nothing
  | { readonly kind: "spent" };

/** The fingers on the stage, and what each asks for. */
export class Touches {
  readonly #wait: Wait;
  readonly #spots = new Map<number, Spot>();
  #state: State = { kind: "idle" };

  constructor(wait: Wait) {
    this.#wait = wait;
  }

  /** The finger holding the chain, and where it is. */
  get holder(): { readonly id: number; readonly spot: Spot } | null {
    if (this.#state.kind !== "holding") return null;
    const spot = this.#spots.get(this.#state.id);
    return spot === undefined ? null : { id: this.#state.id, spot };
  }

  /** The middle of the two fingers that pinch, and how far apart they are. */
  get pair(): {
    readonly x: number;
    readonly y: number;
    readonly distance: number;
  } | null {
    if (this.#state.kind !== "pinching") return null;
    const a = this.#spots.get(this.#state.a);
    const b = this.#spots.get(this.#state.b);
    if (a === undefined || b === undefined) return null;
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: Math.hypot(b.x - a.x, b.y - a.y),
    };
  }

  /** A finger lands, `at` ms: a pinch begins when it is the second of two. */
  down(id: number, spot: Spot, at: number): TouchAct {
    this.#spots.set(id, spot);
    const state = this.#state;
    if (state.kind === "idle") {
      this.#state = { kind: "waiting", id, from: spot, at };
      return "none";
    }
    if (state.kind === "waiting") {
      this.#state = { kind: "pinching", a: state.id, b: id };
      return "pinch";
    }
    if (state.kind === "spent" && this.#spots.size === 2) {
      const [other] = [...this.#spots.keys()].filter((key) => key !== id);
      if (other !== undefined) {
        this.#state = { kind: "pinching", a: other, b: id };
        return "pinch";
      }
    }
    return "none";
  }

  /** A finger moves: the waiting one grabs once it has gone the wait's distance. */
  move(id: number, spot: Spot): TouchAct {
    if (!this.#spots.has(id)) return "none";
    this.#spots.set(id, spot);
    const state = this.#state;
    if (state.kind === "waiting" && state.id === id) {
      const moved = Math.hypot(spot.x - state.from.x, spot.y - state.from.y);
      if (moved > this.#wait.px) {
        this.#state = { kind: "holding", id };
        return "grab";
      }
      return "none";
    }
    if (state.kind === "pinching" && (state.a === id || state.b === id)) {
      return "pinch";
    }
    return "none";
  }

  /** The waiting finger grabs once it has waited the wait's time by `now` ms. */
  due(now: number): TouchAct {
    const state = this.#state;
    if (state.kind !== "waiting" || now - state.at < this.#wait.ms) {
      return "none";
    }
    this.#state = { kind: "holding", id: state.id };
    return "grab";
  }

  /**
   * A finger lifts, or the browser takes it back: the chain is let go when
   * it held it, and a pinch ends when it was one of the two.
   */
  up(id: number): "let go" | "end" | "none" {
    if (!this.#spots.delete(id)) return "none";
    const state = this.#state;
    const left: State =
      this.#spots.size > 0 ? { kind: "spent" } : { kind: "idle" };
    if (state.kind === "waiting" && state.id === id) {
      this.#state = left;
      return "none";
    }
    if (state.kind === "holding" && state.id === id) {
      this.#state = left;
      return "let go";
    }
    if (state.kind === "pinching" && (state.a === id || state.b === id)) {
      this.#state = left;
      return "end";
    }
    if (state.kind === "spent" && this.#spots.size === 0) {
      this.#state = { kind: "idle" };
    }
    return "none";
  }
}
