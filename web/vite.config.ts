/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { PIECES, checkPieces } from "./src/pieces.ts";

// One app with one page per piece (docs/decisions.md, decision 7). Every route
// is an HTML file of its own and every URL in the build is relative, so any
// static host serves it from any path, without rewrite rules.
checkPieces(PIECES);

const page = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    rolldownOptions: {
      input: {
        home: page("index.html"),
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
