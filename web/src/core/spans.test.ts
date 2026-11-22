import { describe, expect, it } from "vitest";

import {
  SPAN_BYTES,
  SpanBatch,
  pushPoint,
  type SpanLines,
  type SpanStyle,
} from "./curves.ts";
import {
  GRID,
  LONG,
  SpanPages,
  SpanWindow,
  cellOf,
  meets,
  mostPages,
  windowFull,
} from "./spans.ts";
import { bufferView, type View } from "./view.ts";

// The window of trails kept as curves (docs/decisions.md, decision 68): the
// spans in pages of one pool, each page holding spans of one square of a
// grid over the disc the chain reaches, so that only the squares a view
// sees are drawn.

const HALF = 1.25;
const SIDE = (2 * HALF) / GRID;

describe("the square a span falls in", () => {
  it("is the square of its curve's middle", () => {
    // straight, from (0.1, 0.1) to (0.11, 0.1): its middle at (0.105, 0.1)
    const ix = Math.floor((0.105 + HALF) / SIDE);
    const iy = Math.floor((0.1 + HALF) / SIDE);
    expect(cellOf(0.1, 0.1, 0.11, 0.1, 0.01, 0, 0.01, 0, HALF)).toBe(
      iy * GRID + ix,
    );
    // bent: the middle of a Hermite curve is the ends' mean plus an eighth
    // of the difference of its tangents, here 0.08 up
    const up = Math.floor((0.1 + 0.08 + HALF) / SIDE);
    expect(cellOf(0.1, 0.1, 0.11, 0.1, 0.32, 0.32, 0.32, -0.32, HALF)).toBe(
      up * GRID + ix,
    );
  });

  it("is the row of long spans for a span longer than half a square", () => {
    expect(cellOf(0, 0, SIDE / 2 + 1e-6, 0, 0, 0, 0, 0, HALF)).toBe(LONG);
    expect(cellOf(0, 0, SIDE / 2 - 1e-6, 0, 0, 0, 0, 0, HALF)).not.toBe(LONG);
  });

  it("is the square at the grid's edge for a span beyond it", () => {
    expect(cellOf(-5, -5, -5, -5, 0, 0, 0, 0, HALF)).toBe(0);
    expect(cellOf(5, 5, 5, 5, 0, 0, 0, 0, HALF)).toBe(GRID * GRID - 1);
  });
});

describe("the squares a view draws", () => {
  it("are every square at the whole view", () => {
    const whole = bufferView(800, 600, 1);
    for (let cell = 0; cell <= LONG; cell++)
      expect(meets(cell, whole, HALF)).toBe(true);
  });

  it("are those within a square of what a near view sees, and the row of long spans always", () => {
    const near = bufferView(800, 600, 1, { zoom: 64, cx: 0.5, cy: -0.5 });
    const seen: number[] = [];
    for (let cell = 0; cell < LONG; cell++)
      if (meets(cell, near, HALF)) seen.push(cell);
    // the view is under a hundredth of a metre across: the square of its
    // centre and those next to it, no more than three by three
    const centre =
      Math.floor((-0.5 + HALF) / SIDE) * GRID + Math.floor((0.5 + HALF) / SIDE);
    expect(seen).toContain(centre);
    expect(seen.length).toBeLessThanOrEqual(9);
    expect(meets(LONG, near, HALF)).toBe(true);
  });
});

describe("the window's pages", () => {
  it("count the pages still to be taken before one leaves early (decision 70)", () => {
    const pages = new SpanPages(2, 1, 4);
    expect(pages.free).toBe(4);
    pages.add(0);
    pages.add(0);
    pages.add(1);
    expect(pages.free).toBe(2);
    pages.add(2);
    pages.add(3);
    expect(pages.free).toBe(0);
  });

  it("are full once fewer are free than squares that may each ask for one, and are as many as the window keeps times more (decision 70)", () => {
    expect(windowFull(LONG)).toBe(true);
    expect(windowFull(LONG + 1)).toBe(false);
    expect(mostPages(1)).toBe(1200);
    expect(mostPages(2.5)).toBe(3000);
  });

  it("fill each square's pages in order, a page from the pool once the last is full", () => {
    const pages = new SpanPages(4, 4, 4);
    const slots = Array.from({ length: 6 }, () => pages.add(5));
    expect(slots).toEqual([0, 1, 2, 3, 4, 5]);
    // another square takes a page of its own
    expect(pages.add(7)).toBe(8);
    expect(pages.count).toBe(7);
    expect(pages.used).toBe(3);
    expect(pages.runs(5)).toEqual([
      [0, 4],
      [4, 2],
    ]);
    expect(pages.runs(7)).toEqual([[8, 1]]);
    expect(pages.runs(6)).toEqual([]);
  });

  it("grow by doubling to their most, and then the page taken longest ago leaves early, counted", () => {
    const pages = new SpanPages(2, 1, 4);
    expect(pages.capacity).toBe(1);
    pages.add(0);
    pages.add(0);
    pages.add(1);
    expect(pages.capacity).toBe(2);
    pages.add(1);
    pages.add(2);
    expect(pages.capacity).toBe(4);
    pages.add(2);
    pages.add(3);
    pages.add(3);
    expect(pages.early).toBe(0);
    // the pool at its most and full: square 0's page, the first taken, leaves
    const slot = pages.add(4);
    expect(pages.capacity).toBe(4);
    expect(pages.early).toBe(2);
    expect(pages.runs(0)).toEqual([]);
    expect(pages.runs(4)).toEqual([[slot, 1]]);
    expect(pages.count).toBe(7);
  });

  it("let go of every span before a mark, the pages wholly before it back to the pool, and keep those after it", () => {
    const pages = new SpanPages(4, 8, 8);
    for (let i = 0; i < 6; i++) pages.add(1);
    pages.add(2);
    const mark = pages.mark();
    for (let i = 0; i < 3; i++) pages.add(1);
    pages.dropBefore(mark);
    expect(pages.count).toBe(3);
    // the first page went back; the second keeps its two spans after the mark
    expect(pages.runs(1)).toEqual([
      [4 + 2, 2],
      [12, 1],
    ]);
    expect(pages.runs(2)).toEqual([]);
    expect(pages.used).toBe(2);
  });

  it("let every page go at once", () => {
    const pages = new SpanPages(4, 4, 4);
    for (let i = 0; i < 9; i++) pages.add(i % 3);
    pages.clear();
    expect(pages.count).toBe(0);
    expect(pages.used).toBe(0);
    expect(pages.runs(0)).toEqual([]);
    // and a mark taken before clearing lets go of nothing more after it
    const mark = pages.mark();
    pages.add(0);
    pages.dropBefore(mark);
    expect(pages.count).toBe(1);
  });
});

/**
 * A graphics card that keeps each buffer's bytes, and counts the bytes sent
 * to it with their data, and each buffer it was asked to make, by its size.
 */
class FakeCard {
  readonly ARRAY_BUFFER = 0x8892;
  readonly DYNAMIC_DRAW = 0x88e8;
  readonly buffers = new Map<object, Uint8Array>();
  readonly made: number[] = [];
  sent = 0;
  #bound: object | null = null;

  createBuffer(): object {
    const buffer = {};
    this.buffers.set(buffer, new Uint8Array(0));
    return buffer;
  }

  bindBuffer(_target: number, buffer: object | null): void {
    this.#bound = buffer;
  }

  bufferData(_target: number, data: number | Uint8Array): void {
    if (this.#bound === null) throw new Error("no buffer bound");
    const bytes =
      typeof data === "number" ? new Uint8Array(data) : data.slice();
    if (typeof data !== "number") this.sent += data.byteLength;
    this.made.push(bytes.byteLength);
    this.buffers.set(this.#bound, bytes);
  }

  bufferSubData(
    _target: number,
    offset: number,
    source: Uint8Array,
    from = 0,
    length = source.length - from,
  ): void {
    const into =
      this.#bound === null ? undefined : this.buffers.get(this.#bound);
    if (into === undefined) throw new Error("no buffer bound");
    if (offset + length > into.length) throw new Error("past the buffer's end");
    into.set(source.subarray(from, from + length), offset);
    this.sent += length;
  }

  /** The bytes every buffer takes. */
  get holding(): number {
    let bytes = 0;
    for (const buffer of this.buffers.values()) bytes += buffer.byteLength;
    return bytes;
  }
}

/** Lines that read each span they are asked to draw from the card's buffers. */
class FakeLines {
  readonly drawn: number[][] = [];
  readonly #card: FakeCard;

  constructor(card: FakeCard) {
    this.#card = card;
  }

  begin(): void {}

  end(): void {}

  from(buffer: object, first: number, count: number): void {
    const bytes = this.#card.buffers.get(buffer);
    if (bytes === undefined) throw new Error("a buffer the card never made");
    for (let i = first; i < first + count; i++) {
      this.drawn.push([
        ...bytes.subarray(i * SPAN_BYTES, (i + 1) * SPAN_BYTES),
      ]);
    }
  }
}

// a view of the whole grid of a window reaching a metre from the pivot
const SEEN: View = { width: 1000, height: 1000, scale: 100, cx: 0, cy: 0 };
const STYLE: SpanStyle = { radius: 1, now: 0, gain: 1, most: 2 };

describe("the window on the graphics card", () => {
  // Spans in batches of 64, cycling through every square of the grid, and,
  // past the first rounds, a square given more than a page: the pool's
  // pages grow from 40 to 320. Each span is a point at its square's middle,
  // its fade clock its number, so that every span's bytes differ.
  function filled(): {
    card: FakeCard;
    window: SpanWindow;
    added: number[][][];
    sends: { spans: number; sent: number }[];
  } {
    const card = new FakeCard();
    const window = new SpanWindow(card as unknown as WebGL2RenderingContext, 1);
    const side = (2 * 1.25) / GRID;
    const added: number[][][] = Array.from({ length: LONG + 1 }, () => []);
    const sends: { spans: number; sent: number }[] = [];
    const batch = new SpanBatch(64);
    let n = 0;
    const flush = (): void => {
      const before = card.sent;
      window.add(batch);
      sends.push({ spans: batch.count, sent: card.sent - before });
      batch.clear();
    };
    const span = (cell: number): void => {
      const x = -1.25 + ((cell % GRID) + 0.5) * side;
      const y = -1.25 + (Math.floor(cell / GRID) + 0.5) * side;
      pushPoint(batch, x, y, [1, 0.5, 0.25], 1, n++);
      const i = batch.count - 1;
      added[cell]?.push([
        ...batch.u8.subarray(i * SPAN_BYTES, (i + 1) * SPAN_BYTES),
      ]);
      if (batch.count === 64) flush();
    };
    for (let round = 0; round < 3; round++) {
      for (let cell = 0; cell < GRID * GRID; cell++) span(cell);
    }
    for (let i = 0; i < 1500; i++) span(37);
    flush();
    return { card, window, added, sends };
  }

  it("grows a piece at a time, never sending again the spans it holds (decision 99)", () => {
    const { card, window, sends } = filled();
    // each batch sends the card its own spans, and nothing more
    for (const { spans, sent } of sends) {
      expect(sent).toBeLessThanOrEqual(spans * SPAN_BYTES);
    }
    // every buffer the card was asked to make is the size of the first
    expect(new Set(card.made).size).toBe(1);
    expect(card.made.length).toBeGreaterThan(1);
    // and the window says what the card holds
    expect(window.bytes).toBe(card.holding);
  });

  it("draws each span from where it was put, square by square in the order they came (decision 99)", () => {
    const { card, window, added } = filled();
    const lines = new FakeLines(card);
    window.draw(lines as unknown as SpanLines, SEEN, STYLE);
    expect(lines.drawn).toEqual(added.flat());
    expect(window.drawn).toBe(added.flat().length);
  });
});
