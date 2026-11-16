import { expect, test } from "@playwright/test";

import { PIECES, onlyPiece, pieceHref } from "../src/pieces.ts";
import { collectErrors } from "./errors.ts";

// Every page opens without an error, and the piece gets the WebGL2 context it
// draws with (docs/decisions.md, decision 9). While there is only one piece,
// it opens at the site's root, and its own address forwards there with the
// settings it carries (decision 30).

const piece = onlyPiece(PIECES);

test(`the root opens ${piece.id} and draws with WebGL2`, async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page).toHaveTitle(piece.title);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    piece.summary,
  );
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-webgl");
  const refusal = await html.getAttribute("data-webgl-error");
  expect(
    await html.getAttribute("data-webgl"),
    `no WebGL2; the browser said: ${refusal ?? "nothing"}`,
  ).toBe("webgl2");
  expect(errors).toEqual([]);
});

test("the root links the site's icon, and every icon it links is there", async ({
  page,
  request,
}) => {
  await page.goto("./");
  const links = page.locator('link[rel="icon"], link[rel="apple-touch-icon"]');
  const icons: { href: string; type: string | null }[] = [];
  for (const link of await links.all()) {
    const href = await link.getAttribute("href");
    expect(href).not.toBeNull();
    icons.push({
      href: new URL(href ?? "", page.url()).href,
      type: await link.getAttribute("type"),
    });
  }
  for (const { href } of icons) {
    const response = await request.get(href);
    expect(response.status(), href).toBe(200);
    expect(response.headers()["content-type"], href).toMatch(
      href.endsWith(".svg") ? /^image\/svg\+xml/ : /^image\/png/,
    );
  }
});

test(`${piece.id}'s own address forwards to the root with its settings`, async ({
  page,
  baseURL,
}) => {
  const errors = collectErrors(page);
  await page.goto(`${pieceHref(piece)}?n=8&time=0.5`);
  await expect(page).toHaveURL(`${baseURL ?? ""}?n=8&time=0.5`);
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  expect(errors).toEqual([]);
});
