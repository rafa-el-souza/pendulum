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
  // The controls fade in and out over the stage; only the chain is compared.
  const mask = [page.getByRole("toolbar")];

  await frames(page, 10);
  await page.keyboard.press(" ");
  await frames(page, 3);
  const pausedBefore = await stage.screenshot({ mask });
  await frames(page, 10);
  expect((await stage.screenshot({ mask })).equals(pausedBefore)).toBe(true);

  // A press away from the chain: the hand pulls the nearest mass to it.
  await page.mouse.move(
    box.x + box.width / 2 + 100,
    box.y + box.height / 2 + 100,
  );
  await page.mouse.down();
  await frames(page, 3);
  const grabbedBefore = await stage.screenshot({ mask });
  await frames(page, 10);
  expect((await stage.screenshot({ mask })).equals(grabbedBefore)).toBe(false);
  await page.mouse.up();
  expect(errors).toEqual([]);
});

test("the keys and the controls change the masses and the time, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("chain-in-hand/");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const masses = page.getByRole("group", { name: "Number of masses" });
  const time = page.getByRole("group", { name: "Speed of time" });
  await expect(masses.locator("output")).toHaveText("n = 2");
  await expect(time.locator("output")).toHaveText("×0.8");

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(masses.locator("output")).toHaveText("n = 4");
  await expect(page).toHaveURL(/[?&]n=4(&|$)/);

  await page.keyboard.press("ArrowRight");
  await expect(time.locator("output")).toHaveText("×0.9");
  await expect(page).toHaveURL(/[?&]time=0\.9(&|$)/);

  // A key woke the controls, so their buttons take clicks.
  await masses.getByRole("button", { name: "More: Number of masses" }).click();
  await expect(masses.locator("output")).toHaveText("n = 6");
  await frames(page, 20);
  expect(errors).toEqual([]);
});

test("an address carries the masses and the time", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("chain-in-hand/?n=64&time=0.5");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await expect(
    page.getByRole("group", { name: "Number of masses" }).locator("output"),
  ).toHaveText("n = 64");
  await expect(
    page.getByRole("group", { name: "Speed of time" }).locator("output"),
  ).toHaveText("×0.5");
  await frames(page, 20);
  expect(errors).toEqual([]);
});

test("the hand's keys run it from firm to elastic and back, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("chain-in-hand/");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const grip = page
    .getByRole("group", { name: "Firmness of the hand" })
    .locator("output");
  await expect(grip).toContainText("5 of 5");

  await page.keyboard.press(",");
  await expect(grip).toContainText("4 of 5");
  await expect(page).toHaveURL(/[?&]hand=20(&|$)/);
  for (let press = 0; press < 3; press++) await page.keyboard.press(",");
  await expect(grip).toContainText("1 of 5");
  await expect(page).toHaveURL(/[?&]hand=4(&|$)/);
  await page.keyboard.press(".");
  await expect(grip).toContainText("2 of 5");
  await expect(page).toHaveURL(/[?&]hand=7(&|$)/);
  expect(errors).toEqual([]);
});

test("an elastic hand from the address swings and throws the chain, and the grip changes while it holds", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("chain-in-hand/?hand=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await expect(
    page.getByRole("group", { name: "Firmness of the hand" }).locator("output"),
  ).toContainText("1 of 5");
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
    // firmer while it holds, halfway through the swing
    if (step === 6) await page.keyboard.press(".");
  }
  await page.mouse.up();
  await frames(page, 30);
  expect(errors).toEqual([]);
});
