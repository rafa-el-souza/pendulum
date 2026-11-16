// The QR code of a page's address (docs/decisions.md, decision 40), by the
// `qr` library, which the author chose. A page loads this module only when a
// code is asked for, so that it does not weigh on the piece's opening. Error
// correction is the lowest, which holds the most: a code on a screen is read
// whole, and the longest address of a saved moment needs every letter of room.

import encodeQR from "qr";

/** The light modules kept all round a code, as its standard asks (ISO/IEC 18004, the quiet zone). */
export const QUIET = 4;

/** The modules of a QR code of `text`, dark ones true, with its quiet zone; null when the text is longer than a code holds. */
export function qrModules(text: string): boolean[][] | null {
  try {
    return encodeQR(text, "raw", { ecc: "low", border: QUIET });
  } catch (error) {
    if (error instanceof Error && /capacity/i.test(error.message)) return null;
    throw error;
  }
}

/** An SVG path of a code's dark modules, a module to a unit: one rectangle for each run of them along a row. */
export function qrPath(modules: readonly (readonly boolean[])[]): string {
  let path = "";
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== true) {
        x++;
        continue;
      }
      const from = x;
      while (row[x] === true) x++;
      const run = x - from;
      path += `M${String(from)} ${String(y)}h${String(run)}v1h-${String(run)}z`;
    }
  });
  return path;
}
