import { expect, test, type Page } from "@playwright/test";

import { collectErrors } from "./errors.ts";

// The first piece in use: what the hand and the keyboard do runs in every
// engine without an error. How it looks and feels is judged by looking.

/** Lets the page draw a few frames. (A string, because this file is not typed with the DOM.) */
async function frames(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.evaluate(
      "new Promise((resolve) => requestAnimationFrame(resolve))",
    );
  }
}

test("the chain can be grabbed, swung, let go, paused and raised again", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("chain-in-hand/");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("the stage is not on the page");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await frames(page, 10);
  await page.mouse.move(cx, cy + 40);
  await page.mouse.down();
  for (let step = 1; step <= 12; step++) {
    await page.mouse.move(cx + 15 * step, cy + 40 - 8 * step);
    await frames(page, 1);
  }
  await page.mouse.up();
  await frames(page, 30);

  await page.keyboard.press(" ");
  await frames(page, 5);
  await page.keyboard.press(" ");
  await page.keyboard.press("r");
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("paused, the chain holds still; grabbing it sets it going again", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("chain-in-hand/");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const stage = page.locator("#stage");
  const box = await stage.boundingBox();
  if (box === null) throw new Error("the stage is not on the page");

  await frames(page, 10);
  await page.keyboard.press(" ");
  await frames(page, 3);
  const pausedBefore = await stage.screenshot();
  await frames(page, 10);
  expect((await stage.screenshot()).equals(pausedBefore)).toBe(true);

  // A press away from the chain: the hand pulls the nearest mass to it.
  await page.mouse.move(
    box.x + box.width / 2 + 100,
    box.y + box.height / 2 + 100,
  );
  await page.mouse.down();
  await frames(page, 3);
  const grabbedBefore = await stage.screenshot();
  await frames(page, 10);
  expect((await stage.screenshot()).equals(grabbedBefore)).toBe(false);
  await page.mouse.up();
  expect(errors).toEqual([]);
});
