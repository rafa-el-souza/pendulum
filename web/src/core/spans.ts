// The window of trails kept as curves (docs/decisions.md, decision 68): the
// spans since a snapshot, kept in pages of one pool on the graphics card. Each
// page holds spans of one square of a grid over the disc the chain reaches,
// in the order they came, so that a view draws only the squares it sees, and
// a mark, the count of spans each square had, says where the spans after an
// instant begin. The pool grows by doubling to its most; past it, the page
// taken longest ago leaves before its time. On the card, the pool is made of
// pieces of 2 MB, each made as its first page is taken, so that growing never
// copies nor sends again the spans it holds (decision 99).

import {
  SPAN_BYTES,
  type SpanBatch,
  type SpanLines,
  type SpanStyle,
} from "./curves.ts";
import type { View } from "./view.ts";

/** Squares along each side of the grid. */
export const GRID = 16;

/** The row of spans longer than half a square, drawn in every view. */
export const LONG = GRID * GRID;

const CELLS = GRID * GRID + 1;
const FLOATS = SPAN_BYTES / 4;

/**
 * The square a span falls in, on a grid of GRID by GRID squares reaching
 * `half` metres from the pivot each way: the square of its curve's middle,
 * the ends' mean plus an eighth of the difference of its tangents, the
 * nearest at the edge for a span beyond the grid; LONG for a span whose
 * chord is longer than half a square.
 */
export function cellOf(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mx0: number,
  my0: number,
  mx1: number,
  my1: number,
  half: number,
): number {
  const side = (2 * half) / GRID;
  if (Math.hypot(x1 - x0, y1 - y0) > side / 2) return LONG;
  const mx = (x0 + x1) / 2 + (mx0 - mx1) / 8;
  const my = (y0 + y1) / 2 + (my0 - my1) / 8;
  const ix = Math.max(0, Math.min(GRID - 1, Math.floor((mx + half) / side)));
  const iy = Math.max(0, Math.min(GRID - 1, Math.floor((my + half) / side)));
  return iy * GRID + ix;
}

/**
 * Whether square `cell` of a grid reaching `half` metres each way meets what
 * `view` sees, widened by a square, as far as a span of the square may reach
 * out of it; the row of long spans always does.
 */
export function meets(cell: number, view: View, half: number): boolean {
  if (cell >= LONG) return true;
  const side = (2 * half) / GRID;
  const x0 = -half + (cell % GRID) * side;
  const y0 = -half + Math.floor(cell / GRID) * side;
  const wx = view.width / 2 / view.scale + side;
  const wy = view.height / 2 / view.scale + side;
  return !(
    x0 + side < view.cx - wx ||
    x0 > view.cx + wx ||
    y0 + side < view.cy - wy ||
    y0 > view.cy + wy
  );
}

/**
 * Which pages hold each square's spans, in the order they came, in a pool of
 * `capacity` pages of `page` spans that grows by doubling up to `most`. A
 * span's slot is its page times `page`, plus its place in the page.
 */
export class SpanPages {
  readonly page: number;
  readonly most: number;
  #capacity: number;
  readonly #queue: number[][] = Array.from({ length: CELLS }, () => []);
  // the first span still held of each square's first page
  readonly #head = new Int32Array(CELLS);
  #fill: Int32Array;
  // when each page was taken from the pool, to find the oldest
  #taken: Float64Array;
  #sequence = 0;
  readonly #free: number[] = [];
  // the spans each square has ever had, and the count at the first slot of
  // its first page, so that a mark says where the spans after it begin
  readonly #added = new Float64Array(CELLS);
  readonly #base = new Float64Array(CELLS);
  #count = 0;
  /** The spans that left before their time, with the pool at its most. */
  early = 0;

  constructor(page: number, pages: number, most: number) {
    this.page = page;
    this.most = Math.max(1, most);
    this.#capacity = Math.max(1, Math.min(pages, this.most));
    this.#fill = new Int32Array(this.#capacity);
    this.#taken = new Float64Array(this.#capacity);
    for (let p = this.#capacity - 1; p >= 0; p--) this.#free.push(p);
  }

  /** The pages in the pool now. */
  get capacity(): number {
    return this.#capacity;
  }

  /** The pages that hold spans. */
  get used(): number {
    return this.#capacity - this.#free.length;
  }

  /** The pages still to be taken, grown into if need be, before one leaves early. */
  get free(): number {
    return this.most - this.used;
  }

  /** The spans held. */
  get count(): number {
    return this.#count;
  }

  /** The slot of a new span of square `cell`, past every span of the square before it. */
  add(cell: number): number {
    const queue = this.#queue[cell] ?? [];
    let p = queue[queue.length - 1];
    if (p === undefined || (this.#fill[p] ?? 0) >= this.page) {
      p = this.#take();
      this.#fill[p] = 0;
      this.#taken[p] = this.#sequence++;
      // a square left without pages starts its count again where it is
      if (queue.length === 0) this.#head[cell] = 0;
      queue.push(p);
    }
    const f = this.#fill[p] ?? 0;
    this.#fill[p] = f + 1;
    this.#added[cell] = (this.#added[cell] ?? 0) + 1;
    this.#count++;
    return p * this.page + f;
  }

  /** A free page: from the pool, grown if it may, or else the oldest page held, its spans gone before their time. */
  #take(): number {
    const ready = this.#free.pop();
    if (ready !== undefined) return ready;
    if (this.#capacity < this.most) {
      const grown = Math.min(this.most, 2 * this.#capacity);
      const fill = new Int32Array(grown);
      fill.set(this.#fill);
      this.#fill = fill;
      const taken = new Float64Array(grown);
      taken.set(this.#taken);
      this.#taken = taken;
      for (let p = grown - 1; p >= this.#capacity; p--) this.#free.push(p);
      this.#capacity = grown;
      const page = this.#free.pop();
      if (page !== undefined) return page;
    }
    // the first page of every square, the one taken longest ago
    let which = -1;
    let oldest = Number.POSITIVE_INFINITY;
    for (let c = 0; c < CELLS; c++) {
      const first = this.#queue[c]?.[0];
      if (first !== undefined && (this.#taken[first] ?? 0) < oldest) {
        oldest = this.#taken[first] ?? 0;
        which = c;
      }
    }
    const queue = this.#queue[which] ?? [];
    const first = queue.shift() ?? 0;
    const gone = (this.#fill[first] ?? 0) - (this.#head[which] ?? 0);
    this.early += gone;
    this.#count -= gone;
    this.#head[which] = 0;
    this.#rebase(which);
    return first;
  }

  /** The count at the first slot of a square's first page, from the spans added and those its pages hold. */
  #rebase(c: number): void {
    let held = 0;
    for (const p of this.#queue[c] ?? []) held += this.#fill[p] ?? 0;
    this.#base[c] = (this.#added[c] ?? 0) - held;
  }

  /** Where the spans added from now on begin, square by square. */
  mark(): Float64Array {
    return this.#added.slice();
  }

  /** Lets go of every span added before `mark`; the pages they filled go back to the pool. */
  dropBefore(mark: Float64Array): void {
    for (let c = 0; c < CELLS; c++) {
      const queue = this.#queue[c] ?? [];
      const to = mark[c] ?? 0;
      for (;;) {
        const first = queue[0];
        if (first === undefined) break;
        const fill = this.#fill[first] ?? 0;
        const head = this.#head[c] ?? 0;
        const h = Math.max(head, Math.min(fill, to - (this.#base[c] ?? 0)));
        this.#count -= h - head;
        this.#head[c] = h;
        if (h < fill) break;
        // a page with none of its spans left goes back
        queue.shift();
        this.#free.push(first);
        this.#head[c] = 0;
        this.#rebase(c);
      }
    }
  }

  /** Lets go of every span. */
  clear(): void {
    for (let c = 0; c < CELLS; c++) {
      for (const p of this.#queue[c] ?? []) this.#free.push(p);
      this.#queue[c] = [];
      this.#head[c] = 0;
      this.#base[c] = this.#added[c] ?? 0;
    }
    this.#count = 0;
  }

  /** Square `cell`'s spans held, as runs of slots in the order they came: the first slot and how many. */
  runs(cell: number): [first: number, count: number][] {
    const queue = this.#queue[cell] ?? [];
    const out: [number, number][] = [];
    queue.forEach((p, i) => {
      const from = i === 0 ? (this.#head[cell] ?? 0) : 0;
      const count = (this.#fill[p] ?? 0) - from;
      if (count > 0) out.push([p * this.page + from, count]);
    });
    return out;
  }
}

/** Spans a page holds. */
const PAGE = 1024;

/** The pool's pages at first: 2 MB. */
const FIRST_PAGES = 40;

/** Spans a piece of the pool holds on the graphics card, whole pages, and its bytes: 2 MB (decision 99). */
const PIECE_SPANS = FIRST_PAGES * PAGE;
const PIECE_BYTES = PIECE_SPANS * SPAN_BYTES;

/**
 * The most pages: 64 MB, room for the 400 000 spans the window keeps
 * between snapshots (sharp.ts) and for pages partly filled in every square.
 */
const MOST_PAGES = 1200;

/** The most pages of a window that keeps `keep` times as many spans (decision 70). */
export function mostPages(keep: number): number {
  return Math.ceil(MOST_PAGES * keep);
}

/**
 * Whether a window with `free` pages left is full: fewer than the squares
 * that may each ask for a page, so that one more frame could make a page
 * leave early (decision 70).
 */
export function windowFull(free: number): boolean {
  return free < CELLS;
}

/** A piece of the pool: its buffer on the graphics card, and its bytes here, whence what changed is sent. */
interface Piece {
  readonly buffer: WebGLBuffer;
  readonly u8: Uint8Array;
}

/** The window: the spans since a snapshot, on the graphics card, square by square. */
export class SpanWindow {
  readonly #gl: WebGL2RenderingContext;
  readonly #half: number;
  readonly #pages: SpanPages;
  // the pool on the card, piece by piece, each made as its first page is
  // taken (decision 99)
  readonly #pieces: Piece[] = [];
  // the bytes changed since they were last sent, page by page
  #dirtyFrom = new Int32Array(0);
  #dirtyTo = new Int32Array(0);
  readonly #dirty: number[] = [];
  /** The spans drawn in the last draw. */
  drawn = 0;

  /**
   * A window over the disc reaching `reach` metres from the pivot, with room
   * for `keep` times as many spans (decision 70).
   */
  constructor(gl: WebGL2RenderingContext, reach: number, keep = 1) {
    this.#gl = gl;
    this.#half = 1.25 * reach;
    this.#pages = new SpanPages(PAGE, FIRST_PAGES, mostPages(keep));
    this.#fit();
  }

  /** The spans held. */
  get count(): number {
    return this.#pages.count;
  }

  /** The spans that left before their time. */
  get early(): number {
    return this.#pages.early;
  }

  /** Whether the window is full: a page may soon leave before its time. */
  get full(): boolean {
    return windowFull(this.#pages.free);
  }

  /** The bytes the pool takes on the graphics card: the pieces made. */
  get bytes(): number {
    return this.#pieces.length * PIECE_BYTES;
  }

  /** Room to note what changed in every page of the pool, kept as it grows. */
  #fit(): void {
    const capacity = this.#pages.capacity;
    const from = new Int32Array(capacity).fill(-1);
    const to = new Int32Array(capacity);
    from.set(this.#dirtyFrom);
    to.set(this.#dirtyTo);
    this.#dirtyFrom = from;
    this.#dirtyTo = to;
  }

  /** The piece that holds slot `slot`, made, with any before it, if it was not (decision 99). */
  #piece(slot: number): Piece {
    const which = Math.floor(slot / PIECE_SPANS);
    for (;;) {
      const piece = this.#pieces[which];
      if (piece !== undefined) return piece;
      const gl = this.#gl;
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      // made on the card at its size, its bytes sent as spans fill them
      gl.bufferData(gl.ARRAY_BUFFER, PIECE_BYTES, gl.DYNAMIC_DRAW);
      this.#pieces.push({ buffer, u8: new Uint8Array(PIECE_BYTES) });
    }
  }

  /** Adds the spans of `batch`, each to its square, and sends what changed to the card. */
  add(batch: SpanBatch): void {
    const f32 = new Float32Array(batch.u8.buffer, 0, batch.count * FLOATS);
    for (let i = 0; i < batch.count; i++) {
      const s = i * FLOATS;
      const cell = cellOf(
        f32[s] ?? 0,
        f32[s + 1] ?? 0,
        f32[s + 2] ?? 0,
        f32[s + 3] ?? 0,
        f32[s + 4] ?? 0,
        f32[s + 5] ?? 0,
        f32[s + 6] ?? 0,
        f32[s + 7] ?? 0,
        this.#half,
      );
      const slot = this.#pages.add(cell);
      if (this.#pages.capacity !== this.#dirtyFrom.length) this.#fit();
      this.#piece(slot).u8.set(
        batch.u8.subarray(i * SPAN_BYTES, (i + 1) * SPAN_BYTES),
        (slot % PIECE_SPANS) * SPAN_BYTES,
      );
      const p = Math.floor(slot / PAGE);
      const at = slot - p * PAGE;
      if ((this.#dirtyFrom[p] ?? -1) < 0) {
        this.#dirtyFrom[p] = at;
        this.#dirtyTo[p] = at + 1;
        this.#dirty.push(p);
      } else {
        this.#dirtyFrom[p] = Math.min(this.#dirtyFrom[p] ?? at, at);
        this.#dirtyTo[p] = Math.max(this.#dirtyTo[p] ?? 0, at + 1);
      }
    }
    const gl = this.#gl;
    for (const p of this.#dirty) {
      const from = this.#dirtyFrom[p] ?? 0;
      const to = this.#dirtyTo[p] ?? 0;
      // a page lies within a piece
      const slot = p * PAGE + from;
      const piece = this.#piece(slot);
      const start = (slot % PIECE_SPANS) * SPAN_BYTES;
      gl.bindBuffer(gl.ARRAY_BUFFER, piece.buffer);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        start,
        piece.u8,
        start,
        (to - from) * SPAN_BYTES,
      );
      this.#dirtyFrom[p] = -1;
    }
    this.#dirty.length = 0;
  }

  /** Where the spans added from now on begin. */
  mark(): Float64Array {
    return this.#pages.mark();
  }

  /** Lets go of every span added before `mark`. */
  dropBefore(mark: Float64Array): void {
    this.#pages.dropBefore(mark);
  }

  /** Lets go of every span. */
  clear(): void {
    this.#pages.clear();
  }

  /** Draws the spans of the squares that meet `view`, with `lines` begun on it in `style`. */
  draw(lines: SpanLines, view: View, style: SpanStyle): void {
    lines.begin(view, style);
    this.drawn = 0;
    for (let cell = 0; cell <= LONG; cell++) {
      if (!meets(cell, view, this.#half)) continue;
      for (const [first, count] of this.#pages.runs(cell)) {
        // a run lies within a page, and so within a piece (decision 99)
        const piece = this.#pieces[Math.floor(first / PIECE_SPANS)];
        if (piece === undefined) {
          throw new Error("the window holds spans in a piece never made");
        }
        lines.from(piece.buffer, first % PIECE_SPANS, count);
        this.drawn += count;
      }
    }
    lines.end();
  }
}
