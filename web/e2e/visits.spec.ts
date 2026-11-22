import { expect, test } from "@playwright/test";

import { collectErrors } from "./errors.ts";

// Counting the site's visits (docs/decisions.md, decision 84): the address's
// switch for counting a device leaves the address as the page opens and is
// kept on the device, the QR code's card says so, and away from the
// published site nothing is asked of the counter.

test("the switch for counting a device leaves the address and is kept, and nothing is counted away from the published site", async ({
  page,
  baseURL,
}) => {
  const errors = collectErrors(page);
  const counter: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith("cloudflareinsights.com")) {
      counter.push(request.url());
    }
  });
  const kept = (): Promise<string | null> =>
    page.evaluate(() => localStorage.getItem("pendulum-count"));
  const note = page.locator("#link-card p").last();
  // the QR code is drawn once its module has loaded (decision 40); leaving
  // the page while it loads fails the import, so each card is let finish
  const card = page.getByRole("dialog", {
    name: "This page's address as a QR code",
  });

  await page.goto("./?count=0&n=8");
  await expect(page).toHaveURL(`${baseURL ?? ""}?n=8`);
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  expect(await kept()).toBe("0");
  await page.keyboard.press("o");
  await expect(note).toHaveText("This device is not counted.");
  await expect(card).toHaveAttribute("data-address", page.url());

  await page.goto("./?count=1");
  await expect(page).toHaveURL(baseURL ?? "");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  expect(await kept()).toBeNull();
  await page.keyboard.press("o");
  await expect(note).toHaveText("Visits are counted without cookies.");
  await expect(card).toHaveAttribute("data-address", page.url());

  expect(await page.locator('script[src*="cloudflareinsights"]').count()).toBe(
    0,
  );
  expect(counter).toEqual([]);
  expect(errors).toEqual([]);
});
