import { describe, expect, it } from "vitest";

import {
  PIECES,
  checkPieces,
  onlyPiece,
  pieceHref,
  type Piece,
} from "./pieces.ts";

const piece = (id: string): Piece => ({ id, title: id, summary: id });

describe("the registry of pieces", () => {
  it("gives each piece an address relative to the site's root, so the site works under any base path", () => {
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

describe("the site's root (decision 30)", () => {
  it("opens the piece while it is the only one", () => {
    const only = piece("chain-in-hand");
    expect(onlyPiece([only])).toBe(only);
  });

  it("opens the piece of this registry", () => {
    expect(onlyPiece(PIECES).id).toBe("chain-in-hand");
  });

  it.each([
    ["no piece", []],
    ["a second piece", [piece("chain-in-hand"), piece("second")]],
  ])(
    "refuses %s, for which the root has to list the pieces instead",
    (_, pieces) => {
      expect(() => onlyPiece(pieces)).toThrow(/decision 30/);
    },
  );
});
