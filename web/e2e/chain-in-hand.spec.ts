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
  await frames(page, 10);

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
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the twins are born, die when the chain is grabbed, and are born again when it is let go, through changes in the number of masses", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // time runs four times faster, so that the fan has opened by the grab
  await page.goto("chain-in-hand/?time=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("the stage is not on the page");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await frames(page, 20);
  // more masses with the twins alive, then fewer
  for (let press = 0; press < 6; press++) await page.keyboard.press("ArrowUp");
  await frames(page, 20);
  for (let press = 0; press < 6; press++)
    await page.keyboard.press("ArrowDown");
  await frames(page, 20);
  // grabbed, they die; let go, they are born from the chain as it is
  await page.mouse.move(cx + 60, cy + 60);
  await page.mouse.down();
  await frames(page, 10);
  await page.keyboard.press("ArrowUp");
  await page.mouse.move(cx + 120, cy - 20);
  await frames(page, 5);
  await page.mouse.up();
  await frames(page, 10);
  // raised again, they are born again
  await page.keyboard.press("r");
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the tips leave trails, kept in half floats or eight bits as the engine allows, through a pause and a raise", async ({
  page,
  browserName,
}) => {
  const errors = collectErrors(page);
  await page.goto("chain-in-hand/?time=4");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-webgl", "webgl2");
  await expect(html).toHaveAttribute("data-trails", /^(half-float|8-bit)$/);
  // which one each engine gave, in the test's output
  console.log(
    `${browserName} keeps trails in ${String(await html.getAttribute("data-trails"))}`,
  );
  await frames(page, 15);
  await page.keyboard.press(" ");
  await frames(page, 5);
  await page.keyboard.press(" ");
  await page.keyboard.press("r");
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the twins' and the trails' keys change their number and length, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("chain-in-hand/");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const twins = page
    .getByRole("group", { name: "Number of twins" })
    .locator("output");
  const trail = page
    .getByRole("group", { name: "Length of the trails" })
    .locator("output");

  // fewer twins, then none; any machine carries 64 of two masses
  await page.keyboard.press("9");
  await expect(twins).toHaveText("64");
  await expect(page).toHaveURL(/[?&]twins=64(&|$)/);
  await page.keyboard.press("9");
  await expect(twins).toHaveText("0");
  await expect(page).toHaveURL(/[?&]twins=0(&|$)/);
  await page.keyboard.press("0");
  await page.keyboard.press("0");
  await expect(page).not.toHaveURL(/twins=/);

  // shorter trails, then none, then trails that stay
  await expect(trail).toContainText("2.5 s");
  await page.keyboard.press("7");
  await expect(trail).toContainText("1 s");
  await expect(page).toHaveURL(/[?&]trail=1(&|$)/);
  await page.keyboard.press("7");
  await page.keyboard.press("7");
  await expect(trail).toContainText("off");
  await expect(page).toHaveURL(/[?&]trail=0(&|$)/);
  for (let press = 0; press < 5; press++) await page.keyboard.press("8");
  await expect(trail).toContainText("stays");
  await expect(page).toHaveURL(/[?&]trail=600(&|$)/);
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("an address asks for 4 096 twins and trails that stay, and the budget carries what it can", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("chain-in-hand/?twins=4096&trail=600");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await expect(
    page.getByRole("group", { name: "Length of the trails" }).locator("output"),
  ).toContainText("stays");
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the palette's keys change the twins' colours, the control paints them, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("chain-in-hand/");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const palette = page
    .getByRole("group", { name: "Colours of the twins" })
    .locator("output");
  const dots = palette.locator("[aria-hidden='true'] > span");
  // the colours the page paints the dots with (a string, as in frames())
  const painted = (): Promise<string[]> =>
    page.evaluate(
      `[...document.querySelectorAll('[aria-label="Colours of the twins"] output [aria-hidden="true"] > span')].map((dot) => getComputedStyle(dot).color)`,
    );

  await expect(palette).toContainText("dusk");
  await expect(dots).toHaveCount(5);
  const dusk = await painted();
  expect(new Set(dusk).size).toBe(5);

  await page.keyboard.press("6");
  await expect(palette).toContainText("fire");
  await expect(page).toHaveURL(/[?&]palette=1(&|$)/);
  expect(await painted()).not.toEqual(dusk);

  await page.keyboard.press("5");
  await expect(palette).toContainText("dusk");
  await expect(page).not.toHaveURL(/palette=/);
  expect(await painted()).toEqual(dusk);
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("an address carries the palette", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("chain-in-hand/?palette=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await expect(
    page.getByRole("group", { name: "Colours of the twins" }).locator("output"),
  ).toContainText("silver");
  await frames(page, 10);
  expect(errors).toEqual([]);
});
