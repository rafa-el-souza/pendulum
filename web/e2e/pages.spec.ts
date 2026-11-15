import { expect, test } from "@playwright/test";

import { PIECES, pieceHref } from "../src/pieces.ts";
import { collectErrors } from "./errors.ts";

// Every page opens without an error, and every piece gets the WebGL2 context
// it draws with (docs/decisions.md, decision 9).

test("the home page links every piece", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("./");
  for (const piece of PIECES) {
    await expect(page.getByRole("link", { name: piece.title })).toHaveAttribute(
      "href",
      pieceHref(piece),
    );
  }
  expect(errors).toEqual([]);
});

for (const piece of PIECES) {
  test(`${piece.id} opens and draws with WebGL2`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(pieceHref(piece));
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-webgl");
    const refusal = await html.getAttribute("data-webgl-error");
    expect(
      await html.getAttribute("data-webgl"),
      `no WebGL2; the browser said: ${refusal ?? "nothing"}`,
    ).toBe("webgl2");
    expect(errors).toEqual([]);
  });
}
