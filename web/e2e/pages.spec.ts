import { expect, test, type Page } from "@playwright/test";

import { PIECES, pieceHref } from "../src/pieces.ts";

// Every page opens without an error, and every piece gets the WebGL2 context
// it draws with (docs/decisions.md, decision 9).

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

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
    await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
    expect(errors).toEqual([]);
  });
}
