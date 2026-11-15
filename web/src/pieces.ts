// Every piece of Pendulum, in the order the home page lists them. Each one is a
// page of its own at <id>/index.html (docs/decisions.md, decision 7); the build
// takes its entries from here (vite.config.ts).

export interface Piece {
  /** Folder of the piece's page and segment of its route: lowercase words joined by hyphens. */
  readonly id: string;
  /** Working name, shown on the home page and in the tab. */
  readonly title: string;
  /** One sentence for the home page. */
  readonly summary: string;
}

export const PIECES: readonly Piece[] = [];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The link to a piece from the home page. Relative, so the site works under any base path. */
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
