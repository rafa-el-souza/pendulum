/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { PIECES, checkPieces, onlyPiece } from "./src/pieces.ts";

// One app with one page per piece (docs/decisions.md, decision 7). Every route
// is an HTML file of its own and every URL in the build is relative, so any
// static host serves it from any path, without rewrite rules. While there is
// only one piece, the root is that piece's page, and the piece's own page
// forwards to it (decision 30); a second piece stops the build here.
checkPieces(PIECES);
onlyPiece(PIECES);

const page = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    rolldownOptions: {
      input: {
        root: page("index.html"),
        ...Object.fromEntries(
          PIECES.map(({ id }) => [id, page(`${id}/index.html`)]),
        ),
      },
    },
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
