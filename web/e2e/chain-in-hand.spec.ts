import { expect, test, type Locator, type Page } from "@playwright/test";

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

/** The button that opens and shuts the row of controls (decision 31). */
function launcher(page: Page): Locator {
  return page.getByRole("button", { name: "Controls", exact: true });
}

/**
 * Opens the row of controls as a visitor does: the pointer moves over the
 * stage, which brings the button into sight, and rests on it, which keeps the
 * controls in sight while it clicks. The row stays open until it is shut.
 */
async function openControls(page: Page): Promise<void> {
  const box = await launcher(page).boundingBox();
  if (box === null) throw new Error("the controls' button is not on the page");
  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await launcher(page).click();
  await expect(launcher(page)).toHaveAttribute("aria-expanded", "true");
}

/** A control's icon in the open row, which a screen reader hears described by its value. */
function icon(page: Page, label: string): Locator {
  return page
    .getByRole("toolbar", { name: "Controls" })
    .getByRole("button", { name: label, exact: true });
}

/** The controls and the value they show, which fade in and out over the stage, to mask in a capture. */
function controlsBox(page: Page): Locator[] {
  return [page.locator("#controls")];
}

test("the chain can be grabbed, swung, let go, paused and raised again", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
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
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const stage = page.locator("#stage");
  const box = await stage.boundingBox();
  if (box === null) throw new Error("the stage is not on the page");
  // The controls fade in and out over the stage; only the chain is compared.
  const mask = controlsBox(page);

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
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const masses = icon(page, "Number of masses");
  const time = icon(page, "Speed of time");
  await expect(masses).toHaveAccessibleDescription("n = 2");
  await expect(time).toHaveAccessibleDescription("×0.8");

  // a key shows the value it changed, with its − and +
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  const shown = page.getByRole("group", { name: "Number of masses" });
  await expect(shown.locator("output")).toHaveText("n = 4");
  await expect(masses).toHaveAccessibleDescription("n = 4");
  await expect(page).toHaveURL(/[?&]n=4(&|$)/);

  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("group", { name: "Speed of time" }).locator("output"),
  ).toHaveText("×0.9");
  await expect(time).toHaveAccessibleDescription("×0.9");
  await expect(page).toHaveURL(/[?&]time=0\.9(&|$)/);

  // the icon in the row shows its value again, and its + takes clicks
  await masses.click();
  await shown.getByRole("button", { name: "More: Number of masses" }).click();
  await expect(shown.locator("output")).toHaveText("n = 6");
  await frames(page, 20);
  expect(errors).toEqual([]);
});

test("an address carries the masses and the time", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("./?n=64&time=0.5");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await expect(icon(page, "Number of masses")).toHaveAccessibleDescription(
    "n = 64",
  );
  await expect(icon(page, "Speed of time")).toHaveAccessibleDescription("×0.5");
  await frames(page, 20);
  expect(errors).toEqual([]);
});

test("the hand's keys run it from firm to elastic and back, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const grip = icon(page, "Firmness of the hand");
  await expect(grip).toHaveAccessibleDescription("5 of 5");

  await page.keyboard.press(",");
  await expect(grip).toHaveAccessibleDescription("4 of 5");
  await expect(page).toHaveURL(/[?&]hand=20(&|$)/);
  for (let press = 0; press < 3; press++) await page.keyboard.press(",");
  await expect(grip).toHaveAccessibleDescription("1 of 5");
  await expect(page).toHaveURL(/[?&]hand=4(&|$)/);
  await page.keyboard.press(".");
  await expect(grip).toHaveAccessibleDescription("2 of 5");
  await expect(page).toHaveURL(/[?&]hand=7(&|$)/);
  expect(errors).toEqual([]);
});

test("an elastic hand from the address swings and throws the chain, and the grip changes while it holds", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?hand=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await expect(icon(page, "Firmness of the hand")).toHaveAccessibleDescription(
    "1 of 5",
  );
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
  await page.goto("./?time=4");
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
  await page.goto("./?time=4");
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
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const twins = icon(page, "Number of twins");
  const trail = icon(page, "Length of the trails");

  // fewer twins, then none; any machine carries 64 of two masses
  await page.keyboard.press("9");
  await expect(twins).toHaveAccessibleDescription("64");
  await expect(page).toHaveURL(/[?&]twins=64(&|$)/);
  await page.keyboard.press("9");
  await expect(twins).toHaveAccessibleDescription("0");
  await expect(page).toHaveURL(/[?&]twins=0(&|$)/);
  await page.keyboard.press("0");
  await page.keyboard.press("0");
  await expect(page).not.toHaveURL(/twins=/);

  // shorter trails, then none, then trails that stay
  await expect(trail).toHaveAccessibleDescription("2.5 s");
  await page.keyboard.press("7");
  await expect(trail).toHaveAccessibleDescription("1 s");
  await expect(page).toHaveURL(/[?&]trail=1(&|$)/);
  await page.keyboard.press("7");
  await page.keyboard.press("7");
  await expect(trail).toHaveAccessibleDescription("off");
  await expect(page).toHaveURL(/[?&]trail=0(&|$)/);
  for (let press = 0; press < 5; press++) await page.keyboard.press("8");
  await expect(trail).toHaveAccessibleDescription("stays");
  await expect(page).toHaveURL(/[?&]trail=600(&|$)/);
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("an address asks for 4 096 twins and trails that stay, and the budget carries what it can", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?twins=4096&trail=600");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await expect(icon(page, "Length of the trails")).toHaveAccessibleDescription(
    "stays",
  );
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the palette's keys change the twins' colours, the control paints them, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  // its icon in the row shows the palette, as five dots painted
  await icon(page, "Colours of the twins").click();
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
  await page.goto("./?palette=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await expect(icon(page, "Colours of the twins")).toHaveAccessibleDescription(
    "silver",
  );
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the G key passes the whole frame through the sketch's light, and back", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-webgl", "webgl2");
  await expect(html).toHaveAttribute("data-light", "trails");
  const stage = page.locator("#stage");
  // The controls fade in and out over the stage; only the drawing is compared.
  const mask = controlsBox(page);

  // paused, every frame draws the same, so only the light can change it
  await frames(page, 10);
  await page.keyboard.press(" ");
  await frames(page, 3);
  const before = await stage.screenshot({ mask });

  await page.keyboard.press("g");
  await expect(html).toHaveAttribute("data-light", "frame");
  await frames(page, 3);
  expect((await stage.screenshot({ mask })).equals(before)).toBe(false);

  await page.keyboard.press("G");
  await expect(html).toHaveAttribute("data-light", "trails");
  await frames(page, 3);
  expect((await stage.screenshot({ mask })).equals(before)).toBe(true);
  expect(errors).toEqual([]);
});

test("the spread's keys bring the twins closer or farther at birth, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const spread = icon(page, "Spread of the twins at birth");
  await expect(spread).toHaveAccessibleDescription("10 to the minus 3 radians");

  await page.keyboard.press("3");
  await expect(spread).toHaveAccessibleDescription("10 to the minus 4 radians");
  await expect(page).toHaveURL(/[?&]spread=0\.0001(&|$)/);
  for (let press = 0; press < 5; press++) await page.keyboard.press("3");
  await expect(spread).toHaveAccessibleDescription("10 to the minus 9 radians");
  await expect(page).toHaveURL(/[?&]spread=1e-9(&|$)/);
  for (let press = 0; press < 8; press++) await page.keyboard.press("4");
  await expect(spread).toHaveAccessibleDescription("10 to the minus 1 radians");
  await expect(page).toHaveURL(/[?&]spread=0\.1(&|$)/);
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the keys 1 and 2 let the trails come from the tip or from every mass, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // 64 masses, time four times faster, so that every mass draws a lot
  await page.goto("./?n=64&time=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const ribbon = icon(page, "Trails from every mass");
  await expect(ribbon).toHaveAccessibleDescription("the tip");

  await frames(page, 5);
  await page.keyboard.press("2");
  await expect(ribbon).toHaveAccessibleDescription("every mass");
  await expect(page).toHaveURL(/[?&]ribbon=1(&|$)/);
  await frames(page, 10);
  await page.keyboard.press("1");
  await expect(ribbon).toHaveAccessibleDescription("the tip");
  await expect(page).not.toHaveURL(/ribbon=/);
  await frames(page, 5);
  expect(errors).toEqual([]);
});

test("the light switch puts out the twins and the trails and lights them again, without changing their controls", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?time=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const light = icon(page, "Light");
  const twins = icon(page, "Number of twins");
  const trail = icon(page, "Length of the trails");
  await expect(light).toHaveAttribute("aria-pressed", "true");
  const stage = page.locator("#stage");
  const mask = controlsBox(page);

  await frames(page, 15);
  await page.keyboard.press("l");
  await expect(light).toHaveAttribute("aria-pressed", "false");
  // paused in the dark, the frame shows the chain alone
  await page.keyboard.press(" ");
  await frames(page, 3);
  const dark = await stage.screenshot({ mask });
  await expect(twins).toHaveAccessibleDescription("512");
  await expect(trail).toHaveAccessibleDescription("2.5 s");
  await expect(page).toHaveURL(/\?time=4$/);

  await page.keyboard.press("L");
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await frames(page, 3);
  expect((await stage.screenshot({ mask })).equals(dark)).toBe(false);

  // in the dark, a control of the light lights it again
  await page.keyboard.press("l");
  await expect(light).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("8");
  await expect(light).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("the B key runs time backwards and forwards again, and grabbing the chain runs it forwards", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?time=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const backwards = icon(page, "Run time backwards");
  const forwards = icon(page, "Run time forwards");
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("the stage is not on the page");
  await expect(backwards).toBeAttached();

  await frames(page, 15);
  await page.keyboard.press("b");
  await expect(forwards).toBeAttached();
  await frames(page, 15);
  await page.keyboard.press("B");
  await expect(backwards).toBeAttached();

  // backwards again, then a grab: the hand runs time forwards
  await page.keyboard.press("b");
  await expect(forwards).toBeAttached();
  await page.mouse.move(
    box.x + box.width / 2 + 60,
    box.y + box.height / 2 + 60,
  );
  await page.mouse.down();
  await frames(page, 3);
  await expect(backwards).toBeAttached();
  await page.mouse.up();
  await frames(page, 5);
  expect(errors).toEqual([]);
});

test("gravity's keys weaken it to none and strengthen it, and turn it, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const strength = icon(page, "Strength of gravity");
  const direction = icon(page, "Direction of gravity");
  await expect(strength).toHaveAccessibleDescription(/as on Earth$/);
  await expect(direction).toHaveAccessibleDescription("straight down");

  // weaker, down to none, with the chain moving under it, and up a step
  await page.keyboard.press("q");
  await expect(strength).toHaveAccessibleDescription(/as on Mars$/);
  await expect(page).toHaveURL(/[?&]g=3\.71(&|$)/);
  for (let press = 0; press < 3; press++) await page.keyboard.press("q");
  await expect(strength).toHaveAccessibleDescription("none");
  await expect(page).toHaveURL(/[?&]g=0(&|$)/);
  await frames(page, 5);
  await page.keyboard.press("E");
  await expect(strength).toHaveAccessibleDescription(/as on Pluto$/);

  // a step to the right, the arrow in the row turning with it
  await page.keyboard.press("d");
  await expect(direction).toHaveAccessibleDescription(
    "15 degrees right of straight down",
  );
  await expect(page).toHaveURL(/[?&]tilt=15(&|$)/);
  await expect(direction.locator("svg")).toHaveAttribute(
    "style",
    /rotate\(-15deg\)/,
  );
  await frames(page, 5);
  expect(errors).toEqual([]);
});

test("gravity's direction comes round past straight up, either way", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?tilt=-165");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const direction = icon(page, "Direction of gravity");
  await expect(direction).toHaveAccessibleDescription(
    "165 degrees left of straight down",
  );
  await page.keyboard.press("A");
  await expect(direction).toHaveAccessibleDescription("straight up");
  await expect(page).toHaveURL(/[?&]tilt=180(&|$)/);
  await page.keyboard.press("D");
  await expect(direction).toHaveAccessibleDescription(
    "165 degrees left of straight down",
  );
  await expect(page).toHaveURL(/[?&]tilt=-165(&|$)/);
  await frames(page, 5);
  expect(errors).toEqual([]);
});

test("an address carries gravity's strength and direction, and the chain is raised against it", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?g=1.62&tilt=90");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await expect(icon(page, "Strength of gravity")).toHaveAccessibleDescription(
    /as on the Moon$/,
  );
  await expect(icon(page, "Direction of gravity")).toHaveAccessibleDescription(
    "90 degrees right of straight down",
  );
  await frames(page, 10);
  await page.keyboard.press("r");
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the controls wait behind one button, whose row shows one value at a time and shuts again", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await expect(launcher(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("toolbar", { name: "Controls" })).toBeHidden();

  await openControls(page);
  await expect(page.getByRole("toolbar", { name: "Controls" })).toBeVisible();
  const masses = icon(page, "Number of masses");
  const shown = page.getByRole("group", { name: "Number of masses" });
  await expect(shown).toBeHidden();

  // its icon shows its value, with its − and +, and hides it again
  await masses.click();
  await expect(masses).toHaveAttribute("aria-expanded", "true");
  await expect(shown.locator("output")).toHaveText("n = 2");
  await shown.getByRole("button", { name: "More: Number of masses" }).click();
  await expect(shown.locator("output")).toHaveText("n = 3");
  await expect(page).toHaveURL(/[?&]n=3(&|$)/);
  // another icon shows its value in place of the first
  await icon(page, "Speed of time").click();
  await expect(shown).toBeHidden();
  await expect(
    page.getByRole("group", { name: "Speed of time" }).locator("output"),
  ).toHaveText("×0.8");
  await icon(page, "Speed of time").click();
  await expect(page.getByRole("group", { name: "Speed of time" })).toBeHidden();

  // the button shuts the row
  await launcher(page).click();
  await expect(launcher(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("toolbar", { name: "Controls" })).toBeHidden();
  expect(errors).toEqual([]);
});

test("with the row shut, a key shows the value it changed, alone", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await page.keyboard.press("q");
  await expect(
    page.getByRole("group", { name: "Strength of gravity" }).locator("output"),
  ).toContainText("g = 3.71");
  await expect(page.getByRole("toolbar", { name: "Controls" })).toBeHidden();
  await expect(page).toHaveURL(/[?&]g=3\.71(&|$)/);
  expect(errors).toEqual([]);
});

test("Escape shuts the row of controls", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await page.keyboard.press("Escape");
  await expect(launcher(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("toolbar", { name: "Controls" })).toBeHidden();
  expect(errors).toEqual([]);
});

test("a value opens right above its icon, centred on it", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  for (const label of ["Number of masses", "Strength of gravity"]) {
    const tool = icon(page, label);
    await tool.click();
    const value = page.getByRole("group", { name: label });
    await expect(value).toBeVisible();
    const t = await tool.boundingBox();
    const v = await value.boundingBox();
    if (t === null || v === null) {
      throw new Error(`${label} or its value is not on the page`);
    }
    expect(Math.abs(v.x + v.width / 2 - (t.x + t.width / 2))).toBeLessThan(1);
    expect(v.y + v.height).toBeLessThanOrEqual(t.y + 1);
    expect(t.y - (v.y + v.height)).toBeLessThan(12);
  }
  expect(errors).toEqual([]);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("a touch where the controls are brings them back without grabbing the chain, and keeps them in sight longer", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
    // paused, so that a grab would show: it sets the chain going again
    await page.keyboard.press(" ");
    const resume = page.locator('#controls [aria-label="Resume"]');
    await expect(resume).toHaveCount(1);
    // out of sight: no longer in sight, nor fading, when they still take a
    // touch on what is seen
    const dock = page.locator("#controls");
    await expect(dock).not.toHaveClass(/awake|fading/, { timeout: 6000 });

    // a touch on the button, out of sight, only brings the controls back
    const box = await launcher(page).boundingBox();
    if (box === null)
      throw new Error("the controls' button is not on the page");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    await expect(dock).toHaveClass(/awake/);
    await expect(resume).toHaveCount(1);
    await frames(page, 5);
    await expect(launcher(page)).toHaveAttribute("aria-expanded", "false");
    // the button, now in sight, takes a touch, and a touch keeps the
    // controls in sight longer than a sign on the stage does
    await page.touchscreen.tap(x, y);
    await expect(launcher(page)).toHaveAttribute("aria-expanded", "true");
    await page.waitForTimeout(4000);
    await expect(dock).toHaveClass(/awake/);
    await expect(resume).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});

test.describe("on a narrow screen", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("where the row does not fit, a chevron shows there is more, and scrolls the row there", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
    await openControls(page);
    const right = page.locator('#controls [data-scroll="right"]');
    const left = page.locator('#controls [data-scroll="left"]');
    await expect(right).toBeVisible();
    await expect(left).toBeHidden();
    await right.click();
    await expect
      .poll(() =>
        page.evaluate("document.getElementById('controls-row').scrollLeft"),
      )
      .toBeGreaterThan(0);
    await expect(left).toBeVisible();
    expect(errors).toEqual([]);
  });
});
