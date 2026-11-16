// Every piece of Pendulum. Each one is a page of its own at <id>/index.html
// (docs/decisions.md, decision 7), and the build takes its entries from here
// (vite.config.ts). While there is only one, it opens at the site's root, and
// its own page forwards there (decision 30).

export interface Piece {
  /** Folder of the piece's page and segment of its route: lowercase words joined by hyphens. */
  readonly id: string;
  /** Its name, which begins the page's title, shown in the tab and naming a bookmark. */
  readonly title: string;
  /** One sentence, the description of the piece's page. */
  readonly summary: string;
}

export const PIECES: readonly Piece[] = [
  {
    // the folder and the route keep the working name, the chain in the hand;
    // the piece is called Pendulum for now (docs/decisions.md, decision 37)
    id: "chain-in-hand",
    title: "Pendulum",
    summary:
      "One chain to grab and throw, from one mass to a rope, with twins that show chaos.",
  },
];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A piece's own address, relative to the site's root, so that the site works under any base path. */
export function pieceHref(piece: Piece): string {
  return `${piece.id}/`;
}

/** Throws unless every id is a slug and no two pieces share one. */
export function checkPieces(pieces: readonly Piece[]): void {
  const seen = new Set<string>();
  for (const { id } of pieces) {
    if (!SLUG.test(id)) {
      throw new Error(
        `piece id ${JSON.stringify(id)} is not lowercase words joined by hyphens`,
      );
    }
    if (seen.has(id)) {
      throw new Error(`two pieces share the id ${JSON.stringify(id)}`);
    }
    seen.add(id);
  }
}

/**
 * The piece the site's root opens, which it does only while that piece is
 * the only one (decision 30). Throws for any other number of pieces, since
 * the root then has to list them.
 */
export function onlyPiece(pieces: readonly Piece[]): Piece {
  const [first, ...rest] = pieces;
  if (first === undefined || rest.length > 0) {
    throw new Error(
      `the site's root opens the only piece (docs/decisions.md, decision 30), and there are ${String(pieces.length)}: give the root a list of the pieces instead`,
    );
  }
  return first;
}
