import { describe, expect, it } from "vitest";

import { PIECES, checkPieces, pieceHref, type Piece } from "./pieces.ts";

const piece = (id: string): Piece => ({ id, title: id, summary: id });

describe("the registry of pieces", () => {
  it("links each piece relative to the home page, so the site works under any base path", () => {
    expect(pieceHref(piece("chain-in-hand"))).toBe("chain-in-hand/");
  });

  it("accepts the pieces it lists", () => {
    expect(() => {
      checkPieces(PIECES);
    }).not.toThrow();
  });

  it("refuses two pieces with one id, which would build only one page", () => {
    expect(() => {
      checkPieces([piece("same-id"), piece("same-id")]);
    }).toThrow(/same-id/);
  });

  it.each([
    "",
    "Chain",
    "chain in hand",
    "../chain",
    "chain/",
    "-chain",
    "chain-",
  ])(
    "refuses %j as an id, since ids are folder names and route segments",
    (id) => {
      expect(() => {
        checkPieces([piece(id)]);
      }).toThrow();
    },
  );
});
