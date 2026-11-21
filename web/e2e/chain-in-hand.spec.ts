import { expect, test, type Locator, type Page } from "@playwright/test";
import { decodeQR } from "qr/decode.js";

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

/** A control's icon in the open row or in a group's row, which a screen reader hears described by its value. */
function icon(page: Page, label: string): Locator {
  return page
    .locator("#controls")
    .getByRole("button", { name: label, exact: true, includeHidden: true });
}

/**
 * Opens the group whose row holds a control's icon, as a visitor does, unless
 * it is open (decision 54), and gives the icon.
 */
async function reveal(page: Page, label: string): Promise<Locator> {
  const owner = await page
    .locator("#controls [role=toolbar][id^='group-']")
    .filter({
      has: page.locator(`button[aria-label=${JSON.stringify(label)}]`),
    })
    .getAttribute("id");
  if (owner === null) throw new Error(`no group holds ${label}`);
  const opener = page.locator(
    `#controls [aria-controls=${JSON.stringify(owner)}]`,
  );
  if ((await opener.getAttribute("aria-expanded")) !== "true") {
    await opener.click();
  }
  await expect(opener).toHaveAttribute("aria-expanded", "true");
  return icon(page, label);
}

/** The names of the icons in a row, in their order. */
async function labels(row: Locator): Promise<(string | null)[]> {
  return Promise.all(
    (await row.getByRole("button").all()).map((b) =>
      b.getAttribute("aria-label"),
    ),
  );
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

  // back in its group, the value open there comes back, and its + takes
  // clicks (decision 54)
  await reveal(page, "Number of masses");
  await expect(shown).toBeVisible();
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

/**
 * The light the page shows round the middle, where the chain and its trails
 * are, away from the controls' button in its corner: the sum over the
 * pixels of a capture of how far each is above the ground in the corner.
 */
async function lightShown(page: Page): Promise<number> {
  const png = (await page.screenshot()).toString("base64");
  return page.evaluate<number>(`(async () => {
    const bytes = Uint8Array.from(atob("${png}"), (c) => c.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
    const ground = data[0] + data[1] + data[2];
    let sum = 0;
    for (let y = Math.floor(height * 0.1); y < height * 0.9; y++) {
      for (let x = Math.floor(width * 0.2); x < width * 0.8; x++) {
        const i = 4 * (y * width + x);
        sum += Math.max(0, data[i] + data[i + 1] + data[i + 2] - ground);
      }
    }
    return sum;
  })()`);
}

test("the trails stay where the chain drew them when the canvas changes size, once and over a run of changes (decision 66)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 640, height: 400 });
  // trails that stay, of a chain swinging fast, without twins, kept as
  // layers, the image carried (decision 71)
  await page.goto("./?twins=0&time=4&trail=600&trails=layers");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await frames(page, 40);
  await page.keyboard.press(" ");
  await frames(page, 3);
  const before = await lightShown(page);
  // a smaller canvas, at a smaller scale: the trails as they were, not gone
  await page.setViewportSize({ width: 560, height: 360 });
  await frames(page, 3);
  const smaller = await lightShown(page);
  expect(smaller).toBeGreaterThan(0.5 * before);
  // a window's edge dragged out and back, a frame a step
  for (const width of [580, 600, 620, 640, 620, 600]) {
    await page.setViewportSize({ width, height: 330 + width / 10 });
    await frames(page, 1);
  }
  await page.setViewportSize({ width: 640, height: 400 });
  await frames(page, 3);
  const back = await lightShown(page);
  expect(back).toBeGreaterThan(0.5 * before);
  expect(back).toBeLessThan(1.5 * before);
  expect(errors).toEqual([]);
});

/** The stage's middle on the page, and its box. */
async function stageMiddle(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("the stage is not on the page");
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    width: box.width,
    height: box.height,
  };
}

/** The camera the page's address carries (decision 67): its zoom and the point it looks at, as written, or none. */
function cameraOf(page: Page): { zoom: string | null; at: string | null } {
  const query = new URL(page.url()).searchParams;
  return { zoom: query.get("zoom"), at: query.get("at") };
}

/** A finger of a touch screen on the stage, as the page hears one: every engine takes these from the page itself. */
async function finger(
  page: Page,
  type: "pointerdown" | "pointermove" | "pointerup",
  id: number,
  x: number,
  y: number,
): Promise<void> {
  await page.evaluate(
    `document.getElementById("stage").dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { pointerId: ${String(id)}, pointerType: "touch", isPrimary: ${String(id === 1)}, clientX: ${String(x)}, clientY: ${String(y)}, bubbles: true, cancelable: true }))`,
  );
}

test("the wheel brings the view nearer about the mouse and back to the whole view, Z and X about the middle, and the address follows once the view stays (decision 67)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?twins=0");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const middle = await stageMiddle(page);
  await page.mouse.move(middle.x + 80, middle.y + 60);
  await page.mouse.wheel(0, -400);
  await frames(page, 3);
  // about a point off the middle: the zoom and the point it looks at, its
  // comma a comma
  await expect.poll(() => cameraOf(page).at).not.toBeNull();
  expect(Number(cameraOf(page).zoom)).toBeGreaterThan(1);
  expect(page.url()).toMatch(/[?&]at=-?[\d.]+,-?[\d.]+(&|$)/);
  // as far out as the whole view, and no farther: the address as it was
  await page.mouse.wheel(0, 4000);
  await expect(page).toHaveURL(/\?twins=0$/);
  // three steps of 1.25 about the middle, where the pivot stays
  for (let i = 0; i < 3; i++) await page.keyboard.press("z");
  await expect.poll(() => cameraOf(page)).toEqual({ zoom: "1.95", at: null });
  for (let i = 0; i < 3; i++) await page.keyboard.press("x");
  await expect(page).toHaveURL(/\?twins=0$/);
  await frames(page, 5);
  expect(errors).toEqual([]);
});

test("with the row shut, Z and X show the zoom above the button, alone, and Shift with X brings the whole view back at once (decision 73)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?twins=0");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const zoom = page.getByRole("group", { name: "Zoom" });
  await page.keyboard.press("z");
  await expect(zoom.locator("output")).toHaveText("×1.25");
  await expect(zoom).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Controls" })).toBeHidden();
  await expect.poll(() => cameraOf(page)).toEqual({ zoom: "1.25", at: null });
  await page.keyboard.press("x");
  await expect(zoom.locator("output")).toHaveText("×1");
  await expect(page).toHaveURL(/\?twins=0$/);
  // an address opened near, and the whole view at one key
  await page.goto("./?twins=0&zoom=8&at=0.3,-0.6");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await page.keyboard.press("Shift+X");
  await expect(page).toHaveURL(/\?twins=0$/);
  await page.keyboard.press("z");
  await expect(zoom.locator("output")).toHaveText("×1.25");
  await frames(page, 5);
  expect(errors).toEqual([]);
});

test("the screen's group opens on the zoom, whose − and + step the view about the middle, and the whole view, faint while the view is whole; the wheel's zoom shows there too, and the address follows (decision 73)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?twins=0");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await icon(page, "The screen").click();
  const screen = page.getByRole("toolbar", { name: "The screen" });
  await expect(screen).toBeVisible();
  expect(await labels(screen)).toEqual([
    "Zoom",
    "The whole view",
    "Colour of the ground",
    "The sketch's light",
    "Share this page's address",
    "QR code of this page's address",
  ]);
  const whole = icon(page, "The whole view");
  await expect(whole).toHaveAttribute("aria-keyshortcuts", "Shift+X");
  await expect(whole).toHaveClass(/_idle_/);

  // the zoom's value, with its − and +, as X and Z
  await icon(page, "Zoom").click();
  const zoom = page.getByRole("group", { name: "Zoom" });
  await expect(zoom.locator("output")).toHaveText("×1");
  const more = zoom.getByRole("button", { name: "More: Zoom" });
  await more.click();
  await more.click();
  await expect(zoom.locator("output")).toHaveText("×1.56");
  await expect(whole).not.toHaveClass(/_idle_/);
  await expect.poll(() => cameraOf(page)).toEqual({ zoom: "1.56", at: null });
  await zoom.getByRole("button", { name: "Less: Zoom" }).click();
  await expect(zoom.locator("output")).toHaveText("×1.25");

  // the whole view, at once
  await whole.click();
  await expect(zoom.locator("output")).toHaveText("×1");
  await expect(whole).toHaveClass(/_idle_/);
  await expect(page).toHaveURL(/\?twins=0$/);

  // the wheel's zoom, about the mouse, shows in the value too
  const middle = await stageMiddle(page);
  await page.mouse.move(middle.x + 80, middle.y + 60);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => cameraOf(page).at).not.toBeNull();
  await expect(zoom.locator("output")).toHaveText(
    `×${String(cameraOf(page).zoom)}`,
  );
  await expect(whole).not.toHaveClass(/_idle_/);
  await frames(page, 5);
  expect(errors).toEqual([]);
});

test("an address opens the view near, and the middle button moves it without grabbing the chain, the address following (decision 67)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?twins=0&zoom=4&at=0.3,-0.4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  // paused, so that a grab would show: it sets the chain going again
  await page.keyboard.press(" ");
  const resume = page.locator('#controls [aria-label="Resume"]');
  await expect(resume).toHaveCount(1);
  const middle = await stageMiddle(page);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down({ button: "middle" });
  for (let step = 1; step <= 5; step++) {
    await page.mouse.move(middle.x + 20 * step, middle.y);
    await frames(page, 1);
  }
  await page.mouse.up({ button: "middle" });
  // dragged right, the world with it: the view looks farther left
  await expect.poll(() => cameraOf(page).at).not.toBe("0.3,-0.4");
  const at = cameraOf(page).at ?? "";
  expect(Number(at.split(",")[0])).toBeLessThan(0.3);
  expect(Number(at.split(",")[1])).toBeCloseTo(-0.4, 3);
  await expect(resume).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("Space pauses as it is let go, and held with a drag moves the view instead (decision 67)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?twins=0&zoom=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const resume = page.locator('#controls [aria-label="Resume"]');
  await page.keyboard.press(" ");
  await expect(resume).toHaveCount(1);
  await page.keyboard.press(" ");
  await expect(resume).toHaveCount(0);
  const middle = await stageMiddle(page);
  await page.mouse.move(middle.x, middle.y);
  await page.keyboard.down(" ");
  await page.mouse.down();
  for (let step = 1; step <= 5; step++) {
    await page.mouse.move(middle.x, middle.y - 20 * step);
    await frames(page, 1);
  }
  await page.mouse.up();
  await page.keyboard.up(" ");
  // dragged up, the world with it: the view looks lower
  await expect.poll(() => cameraOf(page).at).toMatch(/^0,-[\d.]+$/);
  await frames(page, 3);
  await expect(resume).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("two fingers pinch the view nearer without grabbing the chain, and one finger grabs once it has waited (decision 67)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?twins=0");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await page.keyboard.press(" ");
  const resume = page.locator('#controls [aria-label="Resume"]');
  await expect(resume).toHaveCount(1);
  const middle = await stageMiddle(page);
  // the second finger lands within the first one's wait: a pinch
  await finger(page, "pointerdown", 1, middle.x - 50, middle.y);
  await finger(page, "pointerdown", 2, middle.x + 50, middle.y);
  for (let step = 1; step <= 5; step++) {
    await finger(page, "pointermove", 1, middle.x - 50 - 20 * step, middle.y);
    await finger(page, "pointermove", 2, middle.x + 50 + 20 * step, middle.y);
    await frames(page, 1);
  }
  await finger(page, "pointerup", 1, middle.x - 150, middle.y);
  await finger(page, "pointerup", 2, middle.x + 150, middle.y);
  // from 100 pixels apart to 300: three times nearer, about the middle
  await expect.poll(() => cameraOf(page)).toEqual({ zoom: "3", at: null });
  await frames(page, 3);
  await expect(resume).toHaveCount(1);
  // one finger, held past its wait, grabs: the chain goes again
  await finger(page, "pointerdown", 3, middle.x, middle.y + 40);
  await page.waitForTimeout(300);
  await frames(page, 2);
  await expect(resume).toHaveCount(0);
  await finger(page, "pointerup", 3, middle.x, middle.y + 40);
  expect(errors).toEqual([]);
});

test("the trails are carried while the view comes a quarter nearer than they were drawn at, and cleared past it (decision 67)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 640, height: 400 });
  await page.goto("./?twins=0&time=4&trail=600&trails=layers");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await frames(page, 40);
  await page.keyboard.press(" ");
  await frames(page, 3);
  const before = await lightShown(page);
  // Z, a quarter nearer: carried
  await page.keyboard.press("z");
  await frames(page, 3);
  expect(await lightShown(page)).toBeGreaterThan(0.5 * before);
  // Z again, 1.56 times the scale they were drawn at: cleared, the chain
  // alone left, as the light switch leaves it
  await page.keyboard.press("z");
  await frames(page, 3);
  const nearer = await lightShown(page);
  await page.keyboard.press("l");
  await frames(page, 3);
  expect(nearer).toBeLessThan(1.2 * (await lightShown(page)));
  expect(errors).toEqual([]);
});

test("the trails are carried a quarter nearer again once the light drawn farther has faded, and cleared while a mark keeps it (decision 69)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 640, height: 400 });
  // Z, the trails left to fade, then Z again: the light then, and the chain's
  // alone, as the light switch leaves it
  const pressedAgain = async (trail: string): Promise<[number, number]> => {
    await page.goto(`./?twins=0&time=4&trail=${trail}&trails=layers`);
    await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
    await frames(page, 40);
    await page.keyboard.press("z");
    // at four times real time, more than five half-lives of 0.5 s go by
    await frames(page, 90);
    await page.keyboard.press(" ");
    await frames(page, 3);
    await page.keyboard.press("z");
    await frames(page, 3);
    const nearer = await lightShown(page);
    await page.keyboard.press("l");
    await frames(page, 3);
    return [nearer, await lightShown(page)];
  };
  // trails of half a second: what the whole view drew has faded away
  const [faded, fadedAlone] = await pressedAgain("0.5");
  expect(faded).toBeGreaterThan(1.5 * fadedAlone);
  // a mark keeps what the whole view drew: cleared, as before
  const [marked, markedAlone] = await pressedAgain("100");
  expect(marked).toBeLessThan(1.2 * markedAlone);
  expect(errors).toEqual([]);
});

test("the trails are cleared when the canvas grows by more than a quarter, and carried when it grows less (decision 66)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 640, height: 400 });
  await page.goto("./?twins=0&time=4&trail=600&trails=layers");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await frames(page, 40);
  await page.keyboard.press(" ");
  await frames(page, 3);
  const before = await lightShown(page);
  // a tenth larger, as a phone turned: carried
  await page.setViewportSize({ width: 704, height: 440 });
  await frames(page, 3);
  expect(await lightShown(page)).toBeGreaterThan(0.5 * before);
  // twice as large again: cleared, the chain alone left, as the light switch
  // leaves it, whatever light the chain itself adds at this size
  await page.setViewportSize({ width: 1408, height: 880 });
  await frames(page, 3);
  const grown = await lightShown(page);
  await page.keyboard.press("l");
  await frames(page, 3);
  expect(grown).toBeLessThan(1.2 * (await lightShown(page)));
  expect(errors).toEqual([]);
});

test("kept as curves, the trails are drawn anew as the view comes nearer and as the canvas grows, where the image carried clears them, and come back as they were with the whole view (decision 68)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 640, height: 400 });
  await page.goto("./?twins=0&time=4&trail=600&trails=sharp");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await frames(page, 40);
  await page.keyboard.press(" ");
  await frames(page, 3);
  const before = await lightShown(page);
  // Z twice, 1.56 times nearer, where the image carried is cleared
  await page.keyboard.press("z");
  await page.keyboard.press("z");
  await frames(page, 3);
  const nearer = await lightShown(page);
  // X twice, the whole view again: the same light, remade from the curves
  await page.keyboard.press("x");
  await page.keyboard.press("x");
  await frames(page, 3);
  const back = await lightShown(page);
  expect(back).toBeGreaterThan(0.97 * before);
  expect(back).toBeLessThan(1.03 * before);
  // a canvas twice as large, where the image carried is cleared
  await page.setViewportSize({ width: 1280, height: 800 });
  await frames(page, 3);
  const grown = await lightShown(page);
  // nearer and larger, against the chain alone there, as the light switch
  // leaves it
  await page.keyboard.press("l");
  await frames(page, 3);
  expect(grown).toBeGreaterThan(1.5 * (await lightShown(page)));
  await page.setViewportSize({ width: 640, height: 400 });
  await page.keyboard.press("z");
  await page.keyboard.press("z");
  await frames(page, 3);
  expect(nearer).toBeGreaterThan(1.5 * (await lightShown(page)));
  expect(errors).toEqual([]);
});

test("the meter says the frames a second and, kept as curves, the last remake, the mechanism, its memory and the seconds of motion they keep; a strobe's trails go on as the image carried; the address keeps them, how much the curves keep and how far their old light stretches beside a saved moment (decisions 68, 70 and 72)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?twins=0&fps=1&trails=sharp&keep=3&stretch=2");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const meter = page.locator("output", { hasText: "fps" });
  await expect(meter).toHaveText(
    /^\d+(\.\d)? fps · remake (\d+ ms|–) · sharp · \d+ MB · kept \d+(\.\d)? s$/,
  );
  // the curves keep the motion since they began, half a second and more
  await expect(meter).toHaveText(/ · kept (0\.[5-9]|[1-9]\d*(\.\d)?) s$/);
  // a strobe's stamps are not kept as curves yet
  await page.keyboard.press("Shift+Digit8");
  await expect(meter).toHaveText(/^\d+(\.\d)? fps · layers$/);
  await page.keyboard.press("Shift+Digit7");
  await expect(meter).toHaveText(/ · sharp · /);
  // a moment saved keeps them in the address's readable part, as the music
  await page.keyboard.press("s");
  await expect(page).toHaveURL(
    /\?trails=sharp&fps=1&keep=3&stretch=2#[A-Za-z0-9_-]+$/,
  );
  expect(errors).toEqual([]);
});

test("the trails are kept as curves unless the address asks for layers, which the meter names and a saved moment keeps (decision 71)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?twins=0&fps=1");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const meter = page.locator("output", { hasText: "fps" });
  await expect(meter).toHaveText(/ · sharp · \d+ MB · kept /);
  await page.goto("./?twins=0&fps=1&trails=layers");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await expect(meter).toHaveText(/^\d+(\.\d)? fps · layers$/);
  // a moment saved keeps them in the address's readable part
  await page.keyboard.press("s");
  await expect(page).toHaveURL(/\?trails=layers&fps=1#[A-Za-z0-9_-]+$/);
  expect(errors).toEqual([]);
});

test("the twins' and the trails' keys change their number, how long the trails last and their style, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const twins = icon(page, "Number of twins");
  const trail = icon(page, "How long the trails last");
  const style = icon(page, "Style of the trails");
  const ribbon = icon(page, "Trails from every mass");

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
  // up to ten seconds, drawn by a strobe on Shift and 8 and as lines again on
  // Shift and 7 (decision 53), then the step that leaves a mark, then the
  // one that stays
  for (let press = 0; press < 4; press++) await page.keyboard.press("8");
  await expect(trail).toHaveAccessibleDescription("10 s");
  await expect(ribbon).not.toHaveClass(/_idle_/);
  await page.keyboard.press("Shift+Digit8");
  await expect(style).toHaveAccessibleDescription("a strobe");
  await expect(page).toHaveURL(/[?&]style=1(&|$)/);
  // a strobe stamps the whole chain, and which masses draw has nothing to do
  await expect(ribbon).toHaveClass(/_idle_/);
  await frames(page, 10);
  await page.keyboard.press("Shift+Digit7");
  await expect(style).toHaveAccessibleDescription("lines");
  await expect(page).not.toHaveURL(/style=/);
  await expect(ribbon).not.toHaveClass(/_idle_/);
  await page.keyboard.press("8");
  await expect(trail).toHaveAccessibleDescription("leaves a mark");
  await expect(page).toHaveURL(/[?&]trail=100(&|$)/);
  await frames(page, 10);
  await page.keyboard.press("8");
  await expect(trail).toHaveAccessibleDescription("stays");
  await expect(page).toHaveURL(/[?&]trail=600(&|$)/);
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("an address asks for trails that leave a mark, which draw with the sketch's light too", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?trail=100&ribbon=1");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await expect(
    icon(page, "How long the trails last"),
  ).toHaveAccessibleDescription("leaves a mark");
  await frames(page, 30);
  await page.keyboard.press("g");
  await frames(page, 30);
  expect(errors).toEqual([]);
});

test("an address asks for 4 096 twins and trails that stay, and the budget carries what it can", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?twins=4096&trail=600");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await expect(
    icon(page, "How long the trails last"),
  ).toHaveAccessibleDescription("stays");
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the twins are carried by workers, one for each of the machine's cores but one, which carry more of 4 096 as the masses are fewer", async ({
  page,
  browserName,
}) => {
  const errors = collectErrors(page);
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await page.goto("./?twins=4096");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await frames(page, 30);
  const cores = Number(await page.evaluate("navigator.hardwareConcurrency"));
  const opened = workers.length;
  expect(opened).toBe(Math.min(7, Math.max(1, cores - 1)));
  for (const url of workers) expect(url).toMatch(/twins\.worker/);
  // How many they carry, as the twins' control says, in the test's output
  // (decision 51): fewer as the masses are more.
  const carried: string[] = [];
  for (const n of [2, 8, 16]) {
    if (n !== 2) {
      await page.goto(`./?n=${String(n)}&twins=4096`);
      await frames(page, 30);
    }
    // what the twins' control says to a screen reader
    const said = String(
      await page.evaluate(
        `document.getElementById("control-twins-value")?.textContent ?? ""`,
      ),
    );
    carried.push(`${String(n)} masses: ${said.trim()}`);
  }
  console.log(
    `${browserName}, ${String(cores)} cores, ${String(opened)} worker${opened === 1 ? "" : "s"}, of 4 096 twins carries ${carried.join(", ")}`,
  );
  expect(errors).toEqual([]);
});

test("the palette's keys change the twins' colours, the control paints them, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  // its icon in the twins' group shows the palette, as five dots painted
  await (await reveal(page, "Colours of the twins")).click();
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

test("Shift with the masses' keys goes round what of the chain is drawn, its rods, its masses, none of it and the whole of it again, the masses' keys alone still step the masses, and the address and the title follow (decision 65)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  // last in the chain's group, the whole chain as the piece opens
  await (await reveal(page, "What of the chain is drawn")).click();
  const drawn = page
    .getByRole("group", { name: "What of the chain is drawn" })
    .locator("output");
  await expect(drawn).toContainText("whole");
  await expect(page).not.toHaveURL(/chain=/);

  await page.keyboard.press("Shift+ArrowUp");
  await expect(drawn).toContainText("rods");
  await expect(page).toHaveURL(/[?&]chain=1(&|$)/);
  await expect(page).toHaveTitle("Pendulum · rods alone");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(drawn).toContainText("masses");
  await expect(page).toHaveURL(/[?&]chain=2(&|$)/);
  await expect(page).toHaveTitle("Pendulum · masses alone");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(drawn).toContainText("none");
  await expect(page).toHaveURL(/[?&]chain=3(&|$)/);
  await expect(page).toHaveTitle("Pendulum · chain hidden");
  await frames(page, 10);
  // round to the whole chain, and back down to none of it
  await page.keyboard.press("Shift+ArrowUp");
  await expect(drawn).toContainText("whole");
  await expect(page).not.toHaveURL(/chain=/);
  await page.keyboard.press("Shift+ArrowDown");
  await expect(drawn).toContainText("none");
  await expect(page).toHaveURL(/[?&]chain=3(&|$)/);

  // the masses' own keys, without Shift, step the masses as before
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(/[?&]n=3&chain=3(&|$)/);
  await expect(page).toHaveTitle("Pendulum · 3 masses, chain hidden");
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("Shift with the palette's keys steps when dense light turns white, the control paints it in the palette's colours, and the address and the title follow (decision 61)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  // beside the palette in the twins' group, five dots of its middle colour
  await (await reveal(page, "When dense light turns white")).click();
  const white = page
    .getByRole("group", { name: "When dense light turns white" })
    .locator("output");
  const dots = white.locator("[aria-hidden='true'] > span");
  const painted = (): Promise<string[]> =>
    page.evaluate(
      `[...document.querySelectorAll('[aria-label="When dense light turns white"] output [aria-hidden="true"] > span')].map((dot) => getComputedStyle(dot).color)`,
    );
  // the piece opens keeping the colour, later
  await expect(white).toContainText("later");
  await expect(dots).toHaveCount(5);
  const later = await painted();
  expect(new Set(later).size).toBe(5);
  await expect(page).not.toHaveURL(/white=/);

  // at once, the densest dots white, as the piece was before
  await page.keyboard.press("Shift+Digit5");
  await page.keyboard.press("Shift+Digit5");
  await expect(white).toContainText("at once");
  await expect(page).toHaveURL(/[?&]white=0(&|$)/);
  await expect(page).toHaveTitle("Pendulum · colours that whiten at once");
  expect((await painted()).at(-1)).toBe("rgb(255, 255, 255)");

  // never, and in another palette's colours
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+Digit6");
  await expect(white).toContainText("never");
  await expect(page).toHaveURL(/[?&]white=3(&|$)/);
  const never = await painted();
  expect(never.at(-1)).not.toBe("rgb(255, 255, 255)");
  await page.keyboard.press("6");
  await expect(page).toHaveURL(/[?&]palette=1&white=3(&|$)/);
  expect(await painted()).not.toEqual(never);
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

test("the ground's keys dress the piece and the page in another ground, coming round either way, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?n=8");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const ground = icon(page, "Colour of the ground");
  await expect(ground).toHaveAccessibleDescription("night");
  const stage = page.locator("#stage");
  // the row, and the value a key opens above it
  const mask = [
    ...controlsBox(page),
    page.getByRole("group", { name: "Colour of the ground" }),
  ];
  // the page's ground (a string, as in frames())
  const pageGround = (): Promise<string> =>
    page.evaluate("getComputedStyle(document.body).backgroundColor");
  const night = await pageGround();

  // paused, every frame draws the same, so only the ground can change it;
  // the ground's value is open above its icon in every capture
  await frames(page, 10);
  await page.keyboard.press(" ");
  await reveal(page, "Colour of the ground");
  await ground.click();
  await frames(page, 3);
  const before = await stage.screenshot({ mask });

  await page.keyboard.press("i");
  await expect(ground).toHaveAccessibleDescription("slate");
  await expect(page).toHaveURL(/\?n=8&ground=1$/);
  expect(await pageGround()).not.toBe(night);
  await frames(page, 3);
  expect((await stage.screenshot({ mask })).equals(before)).toBe(false);

  await page.keyboard.press("U");
  await expect(ground).toHaveAccessibleDescription("night");
  await expect(page).toHaveURL(/\?n=8$/);
  expect(await pageGround()).toBe(night);
  await frames(page, 3);
  expect((await stage.screenshot({ mask })).equals(before)).toBe(true);

  // from the first, a step down comes round to the last
  await page.keyboard.press("u");
  await expect(ground).toHaveAccessibleDescription("teal");
  await expect(page).toHaveURL(/\?n=8&ground=10$/);
  await page.keyboard.press(" ");
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the Y key steps the tension's scale, coming round, and turns the tension's colours on, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?n=8");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  // one control in the row, off and then each scale (decision 53)
  const tension = icon(page, "Colours of the tension");
  await expect(tension).toHaveAccessibleDescription("off");

  await page.keyboard.press("y");
  await expect(tension).toHaveAccessibleDescription("incandescent");
  await expect(page).toHaveURL(/\?n=8&scale=1&tension=1$/);
  await frames(page, 5);

  // the last scale comes round to the first; the colours stay on
  await page.keyboard.press("Y");
  await page.keyboard.press("y");
  await page.keyboard.press("y");
  await expect(tension).toHaveAccessibleDescription("heat");
  await expect(page).toHaveURL(/\?n=8&tension=1$/);
  await frames(page, 5);
  expect(errors).toEqual([]);
});

test("an address carries the ground and the tension's scale", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?scale=2&ground=5&tension=1");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await expect(icon(page, "Colour of the ground")).toHaveAccessibleDescription(
    "wine",
  );
  await expect(
    icon(page, "Colours of the tension"),
  ).toHaveAccessibleDescription("neon");
  expect(
    await page.evaluate("getComputedStyle(document.body).backgroundColor"),
  ).toBe("rgb(42, 9, 18)");
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the G key passes the whole frame through the sketch's light, and back, and the address follows", async ({
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
  await expect(page).toHaveURL(/\?sketch=1$/);
  await frames(page, 3);
  expect((await stage.screenshot({ mask })).equals(before)).toBe(false);

  await page.keyboard.press("G");
  await expect(html).toHaveAttribute("data-light", "trails");
  await expect(page).not.toHaveURL(/sketch/);
  await frames(page, 3);
  expect((await stage.screenshot({ mask })).equals(before)).toBe(true);
  expect(errors).toEqual([]);
});

test("the spread's keys bring the twins closer or farther at birth, past ten centimetres round the pivot to a whole turn, and the address and the title follow", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const spread = icon(page, "How far apart the twins are born");
  await expect(spread).toHaveAccessibleDescription(
    "1 millimetre apart at the tip",
  );

  await page.keyboard.press("3");
  await expect(spread).toHaveAccessibleDescription(
    "a tenth of a millimetre apart at the tip",
  );
  await expect(page).toHaveURL(/[?&]spread=0\.0001(&|$)/);
  for (let press = 0; press < 5; press++) await page.keyboard.press("3");
  await expect(spread).toHaveAccessibleDescription(
    "1 nanometre apart at the tip",
  );
  await expect(page).toHaveURL(/[?&]spread=1e-9(&|$)/);
  for (let press = 0; press < 8; press++) await page.keyboard.press("4");
  await expect(spread).toHaveAccessibleDescription(
    "10 centimetres apart at the tip",
  );
  await expect(page).toHaveURL(/[?&]spread=0\.1(&|$)/);
  await frames(page, 10);

  // past ten centimetres, the fan opens round the pivot (decision 63)
  await page.keyboard.press("4");
  await expect(spread).toHaveAccessibleDescription(
    "15 degrees round the pivot",
  );
  await expect(page).toHaveURL(/[?&]spread=0\.26(&|$)/);
  for (let press = 0; press < 5; press++) await page.keyboard.press("4");
  await expect(spread).toHaveAccessibleDescription(
    "360 degrees round the pivot",
  );
  await expect(page).toHaveURL(/[?&]spread=6\.28(&|$)/);
  await expect(page).toHaveTitle(/born across 360°/);
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the twins open fading as chaos carries them off; Shift and P draws them as dust, fading too; the P key goes round to let them stay and fade again; and the address and the title follow", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // time runs four times faster, so that twins part and are born again
  await page.goto("./?time=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const fade = icon(page, "Life of the twins");
  const look = icon(page, "Look of the twins");
  // the piece opens with the twins that fade (decision 58)
  await expect(fade).toHaveAccessibleDescription("fade");
  await expect(look).toHaveAccessibleDescription("chains");
  await expect(page).not.toHaveTitle(/twins that/);
  await frames(page, 90);
  // their tips alone, a plume of points while they fade (decisions 50, 53)
  await page.keyboard.press("Shift+KeyP");
  await expect(look).toHaveAccessibleDescription("dust");
  await expect(fade).toHaveAccessibleDescription("fade");
  await expect(page).toHaveURL(/[?&]look=1(&|$)/);
  await expect(page).not.toHaveURL(/fade=/);
  await expect(page).toHaveTitle(/twins as dust/);
  await frames(page, 30);
  // round the twins held and leashed (decision 64) to those that stay
  await page.keyboard.press("p");
  await expect(fade).toHaveAccessibleDescription(/^held$|^Twins held/);
  await page.keyboard.press("p");
  await expect(fade).toHaveAccessibleDescription("leashed");
  await page.keyboard.press("p");
  await expect(fade).toHaveAccessibleDescription("stay");
  await expect(look).toHaveAccessibleDescription("dust");
  await expect(page).toHaveURL(/[?&]fade=0&look=1(&|$)/);
  await expect(page).toHaveTitle(/twins that stay, twins as dust/);
  await frames(page, 30);
  // P alone, with caps lock on, still goes round whether they fade
  await page.keyboard.press("P");
  await expect(fade).toHaveAccessibleDescription("fade");
  await expect(page).not.toHaveURL(/fade=/);
  await frames(page, 30);
  await page.keyboard.press("Shift+KeyP");
  await expect(look).toHaveAccessibleDescription("chains");
  await expect(page).not.toHaveURL(/look=/);
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the P key goes on to the twins held near the chain, which show how often differences double, and to the twins leashed to it; Shift with 3 and 4 says how near, faint while they fade or stay; the address and the title follow", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // three masses, time four times faster, so that the lens measures soon
  await page.goto("./?n=3&twins=64&time=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const life = icon(page, "Life of the twins");
  const near = icon(page, "How near the twins are held");
  await expect(life).toHaveAccessibleDescription("fade");
  await expect(near).toHaveAccessibleDescription("within 20 centimetres");
  await expect(near).toHaveClass(/_idle_/);
  await page.keyboard.press("p");
  await expect(page).toHaveURL(/[?&]fade=3(&|$)/);
  await expect(page).toHaveTitle(/twins held/);
  // held until the lens has measured half a second, then its number
  // (decision 64), said whole and in the icon's title
  await expect(life).toHaveAccessibleDescription(
    /^Twins held: differences double every \d\.\d\d s$/,
    { timeout: 15_000 },
  );
  await expect(life).toHaveAttribute(
    "title",
    /^Twins held: differences double every \d\.\d\d s \(P\)$/,
  );
  await expect(near).not.toHaveClass(/_idle_/);
  // a lens wider than 20 cm shows no number, which would read too long
  await page.keyboard.press("Shift+Digit4");
  await expect(near).toHaveAccessibleDescription("within 30 centimetres");
  await expect(page).toHaveURL(/[?&]hold=0\.3(&|$)/);
  await expect(page).toHaveTitle(/twins held, within 30 cm/);
  await expect(life).toHaveAccessibleDescription("held");
  await page.keyboard.press("Shift+Digit3");
  await page.keyboard.press("Shift+Digit3");
  await expect(near).toHaveAccessibleDescription("within 10 centimetres");
  await expect(page).toHaveURL(/[?&]hold=0\.1(&|$)/);
  await page.keyboard.press("p");
  await expect(life).toHaveAccessibleDescription("leashed");
  await expect(near).not.toHaveClass(/_idle_/);
  await expect(life).toHaveAttribute("title", "Life of the twins (P)");
  await expect(page).toHaveURL(/[?&]fade=4(&|$)/);
  await expect(page).toHaveTitle(/twins leashed/);
  await frames(page, 20);
  await page.keyboard.press("p");
  await expect(life).toHaveAccessibleDescription("stay");
  await expect(near).toHaveClass(/_idle_/);
  await expect(page).toHaveURL(/[?&]fade=0(&|$)/);
  await expect(page).not.toHaveTitle(/within/);
  expect(errors).toEqual([]);
});

test("an address asks for 4 096 twins, which fade as the piece opens and are born again from the chain let go", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?twins=4096&time=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("the stage is not on the page");
  await frames(page, 60);
  // grabbed, they die; let go, they are born from the chain and fade again
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2);
  await page.mouse.down();
  await frames(page, 5);
  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2);
  await page.mouse.up();
  await frames(page, 30);
  await openControls(page);
  await expect(icon(page, "Life of the twins")).toHaveAccessibleDescription(
    "fade",
  );
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

test("the light switch puts out the twins and the trails and lights them again, without changing their controls, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?time=4");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const light = icon(page, "Light of the twins and trails");
  const twins = icon(page, "Number of twins");
  const trail = icon(page, "How long the trails last");
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
  await expect(page).toHaveURL(/\?time=4&light=0$/);

  await page.keyboard.press("L");
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?time=4$/);
  await frames(page, 3);
  expect((await stage.screenshot({ mask })).equals(dark)).toBe(false);

  // in the dark, a control of the light lights it again
  await page.keyboard.press("l");
  await expect(light).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("8");
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?time=4&trail=10$/);
  expect(errors).toEqual([]);
});

test("the T key and the control's − paint the chain by its tension and back, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?n=8");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  // one control in the row, off and then each scale (decision 53)
  const tension = icon(page, "Colours of the tension");
  await expect(tension).toHaveAccessibleDescription("off");
  const stage = page.locator("#stage");
  const mask = controlsBox(page);

  // paused, every frame draws the same, so only the colours can change it;
  // the control's value open above the row, as the T and the − leave it,
  // and the pointer on its icon, so that each capture shows them alike
  await frames(page, 10);
  await icon(page, "Pause").click();
  await reveal(page, "Colours of the tension");
  await tension.click();
  await frames(page, 3);
  const plain = await stage.screenshot({ mask });

  // the T turns them on in the scale they had
  await page.keyboard.press("t");
  await expect(tension).toHaveAccessibleDescription("heat");
  await frames(page, 3);
  expect((await stage.screenshot({ mask })).equals(plain)).toBe(false);
  await expect(page).toHaveURL(/\?n=8&tension=1$/);

  // below the first scale, off
  await page
    .getByRole("button", { name: "Less: Colours of the tension", exact: true })
    .click();
  await expect(tension).toHaveAccessibleDescription("off");
  await expect(page).toHaveURL(/\?n=8$/);
  await tension.hover();
  await frames(page, 3);
  expect((await stage.screenshot({ mask })).equals(plain)).toBe(true);

  // running, and through another number of masses, it draws without error
  await page.keyboard.press("T");
  await icon(page, "Resume").click();
  await frames(page, 10);
  await page.keyboard.press("ArrowUp");
  await frames(page, 10);
  await expect(tension).toHaveAccessibleDescription("heat");
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

test("the shake's keys stand the chain on its head and let it fall, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const shake = icon(page, "Shake of the pivot");
  await expect(shake).toHaveAccessibleDescription("still");

  await page.keyboard.press("v");
  await expect(shake).toHaveAccessibleDescription(
    "800 times a second, a millimetre either way",
  );
  await expect(page).toHaveURL(/[?&]shake=800(&|$)/);
  await frames(page, 10);
  for (let press = 0; press < 3; press++) await page.keyboard.press("V");
  await expect(shake).toHaveAccessibleDescription(
    "1600 times a second, a millimetre either way",
  );
  await expect(page).toHaveURL(/[?&]shake=1600(&|$)/);
  await frames(page, 10);
  for (let press = 0; press < 3; press++) await page.keyboard.press("c");
  await expect(shake).toHaveAccessibleDescription("still");
  await expect(page).not.toHaveURL(/shake=/);
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("an address with a shake opens with the chain standing, which draws in the tension's colours and runs backwards", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?n=4&shake=1200");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await frames(page, 20);
  await page.keyboard.press("t");
  await frames(page, 20);
  await page.keyboard.press("b");
  await frames(page, 10);
  await page.keyboard.press("r");
  await frames(page, 10);
  expect(errors).toEqual([]);
});

test("the mode's keys start the chain in a normal mode and back, the amplitude's swing it wider, and the address follows", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const mode = icon(page, "Start");
  const amplitude = icon(page, "Amplitude of the mode");
  await expect(mode).toHaveAccessibleDescription("raised to one side");
  await expect(amplitude).toHaveAccessibleDescription(
    "30 degrees either way at most",
  );
  // with the chain raised, the amplitude has nothing to do, and shows faint
  await expect(amplitude).toHaveClass(/_idle_/);
  await expect(amplitude).not.toHaveClass(/_held_/);

  await page.keyboard.press("m");
  await expect(mode).toHaveAccessibleDescription("normal mode 1");
  await expect(page).toHaveURL(/[?&]mode=1(&|$)/);
  await expect(amplitude).not.toHaveClass(/_idle_/);
  await frames(page, 5);
  await page.keyboard.press("K");
  await expect(amplitude).toHaveAccessibleDescription(
    "45 degrees either way at most",
  );
  await expect(page).toHaveURL(/[?&]amplitude=45(&|$)/);
  await frames(page, 5);
  await page.keyboard.press("r");
  await frames(page, 5);

  await page.keyboard.press("n");
  await expect(mode).toHaveAccessibleDescription("raised to one side");
  await expect(page).not.toHaveURL(/[?&]mode=/);
  await expect(amplitude).toHaveClass(/_idle_/);
  await frames(page, 5);
  expect(errors).toEqual([]);
});

test("an address starts the chain in a mode; with fewer masses it starts in its highest, held back, and more masses start the mode asked for", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?mode=4&amplitude=5");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const mode = icon(page, "Start");
  await expect(icon(page, "Amplitude of the mode")).toHaveAccessibleDescription(
    "5 degrees either way at most",
  );
  // two masses have two modes
  await expect(mode).toHaveAccessibleDescription("normal mode 2");
  await expect(mode).toHaveClass(/_held_/);
  await frames(page, 5);
  await page.keyboard.press("ArrowUp");
  await expect(mode).toHaveAccessibleDescription("normal mode 3");
  await page.keyboard.press("ArrowUp");
  await expect(mode).toHaveAccessibleDescription("normal mode 4");
  await expect(mode).not.toHaveClass(/_held_/);
  await expect(page).toHaveURL(/[?&]mode=4(&|$)/);
  await frames(page, 5);
  expect(errors).toEqual([]);
});

/** The button that saves the moment, whose name says whether one is kept (decision 34). */
function saveButton(page: Page): Locator {
  return page
    .locator("#controls")
    .getByRole("button", { name: /^Save this moment/ });
}

/** The save button in sight, in the group of time and the start (decision 54), whose name a screen reader hears. */
async function shownSave(page: Page): Promise<Locator> {
  await reveal(page, "Start again");
  return saveButton(page);
}

/** A title with a saved moment's minute and mark (decision 38), after what differs, if anything. */
const SAVED_TITLE =
  /^Pendulum( · .+)? · \d{1,2} [A-Z][a-z]{2}( \d{4})? \d{2}:\d{2} · [0-9A-HJKMNP-TV-Z]{4}$/;

test("the S key saves the moment and the screen into the address, the start says so, and R starts the chain there", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await expect(page).toHaveTitle("Pendulum");
  await openControls(page);
  const mode = icon(page, "Start");
  await expect(await shownSave(page)).toHaveAccessibleName("Save this moment");
  await frames(page, 10);

  // two masses: the screen in fifteen bytes since the tenth code (decision
  // 65) and the moment in sixteen, 42 letters
  await page.keyboard.press("s");
  await expect(page).toHaveURL(/\/#[A-Za-z0-9_-]{42}$/);
  await expect(page).toHaveTitle(SAVED_TITLE);
  await expect(await shownSave(page)).toHaveAccessibleName(
    "Save this moment over the one saved",
  );
  await expect(mode).toHaveAccessibleDescription("the moment saved");
  await expect(mode).not.toHaveClass(/_held_/);
  await expect(icon(page, "Amplitude of the mode")).toHaveClass(/_idle_/);
  const saved = page.url();
  const mark = (await page.title()).slice(-4);
  await frames(page, 10);
  await page.keyboard.press("r");
  await frames(page, 5);
  // another value goes into the code, beside the same moment, and the title names it
  await page.keyboard.press("e");
  await expect(page).toHaveURL(/\/#[A-Za-z0-9_-]{42}$/);
  expect(page.url()).not.toBe(saved);
  await expect(page).toHaveTitle(SAVED_TITLE);
  await expect(page).toHaveTitle(
    new RegExp(`^Pendulum · Jupiter · .+ · ${mark}$`),
  );
  await frames(page, 5);
  expect(errors).toEqual([]);
});

test("the start's first step forgets a saved moment and goes back to the start it had, and the next steps from there (decision 56)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const mode = icon(page, "Start");
  await frames(page, 5);
  await page.keyboard.press("s");
  await expect(page).toHaveURL(/\/#[A-Za-z0-9_-]{42}$/);
  await expect(mode).toHaveAccessibleDescription("the moment saved");

  // the + forgets the moment and goes back to the chain raised to one side;
  // the next chooses mode 1
  await page.keyboard.press("m");
  await expect(mode).toHaveAccessibleDescription("raised to one side");
  await expect(page).not.toHaveURL(/#/);
  await expect(await shownSave(page)).toHaveAccessibleName("Save this moment");
  await page.keyboard.press("m");
  await expect(mode).toHaveAccessibleDescription("normal mode 1");
  await expect(page).toHaveURL(/\?mode=1$/);

  // saved in mode 1, the − goes back to mode 1, not on to the side
  await page.keyboard.press("s");
  await expect(mode).toHaveAccessibleDescription("the moment saved");
  await page.keyboard.press("n");
  await expect(mode).toHaveAccessibleDescription("normal mode 1");
  await expect(page).toHaveURL(/\?mode=1$/);
  await expect(icon(page, "Amplitude of the mode")).not.toHaveClass(/_idle_/);
  await frames(page, 5);
  expect(errors).toEqual([]);
});

test("a saved moment opens elsewhere as the screen it was: the controls, the switches, the pause and the title", async ({
  page,
  browser,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?n=8&g=1.62");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await frames(page, 10);
  await page.keyboard.press("t");
  await page.keyboard.press("g");
  await page.keyboard.press("l");
  await expect(page).toHaveURL(/\?n=8&g=1\.62&light=0&tension=1&sketch=1$/);
  await page.keyboard.press(" ");
  await page.keyboard.press("s");
  await expect(page).toHaveURL(/\/#[A-Za-z0-9_-]+$/);
  await expect(page).toHaveTitle(
    /^Pendulum · 8 masses, the Moon, light out, tension colours, sketch light, paused · /,
  );
  const title = await page.title();

  // opened in a browser of its own, as a link shared is
  const elsewhere = await browser.newContext();
  const other = await elsewhere.newPage();
  const otherErrors = collectErrors(other);
  await other.goto(page.url());
  const html = other.locator("html");
  await expect(html).toHaveAttribute("data-webgl", "webgl2");
  await expect(html).toHaveAttribute("data-light", "frame");
  await expect(other).toHaveTitle(title);
  await openControls(other);
  await expect(icon(other, "Light of the twins and trails")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(
    icon(other, "Colours of the tension"),
  ).toHaveAccessibleDescription("heat");
  await expect(icon(other, "Resume")).toBeVisible();
  await expect(icon(other, "Number of masses")).toHaveAccessibleDescription(
    "n = 8",
  );
  await expect(await shownSave(other)).toHaveAccessibleName(
    "Save this moment over the one saved",
  );
  await frames(other, 5);
  await elsewhere.close();
  expect(errors).toEqual([]);
  expect(otherErrors).toEqual([]);
});

test("the H key and its button hand the page's address and title to the device's sheet for sharing", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // a sheet that keeps what it is handed, since no engine opens one in a test
  await page.addInitScript(
    "window.shared = []; Object.defineProperty(navigator, 'share', { configurable: true, value: (data) => { window.shared.push(data); return Promise.resolve(); } });",
  );
  await page.goto("./?n=8");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await page.keyboard.press("h");
  await expect.poll(() => page.evaluate("window.shared.length")).toBe(1);
  expect(await page.evaluate("window.shared[0]")).toEqual({
    title: "Pendulum · 8 masses",
    url: page.url(),
  });
  await openControls(page);
  await (await reveal(page, "Share this page's address")).click();
  await expect.poll(() => page.evaluate("window.shared.length")).toBe(2);
  expect(errors).toEqual([]);
});

test("without a sheet for sharing, the address is copied, and the button and a word say so", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // no sheet, and a clipboard that keeps what it is given
  await page.addInitScript(
    "window.copied = []; Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text) => { window.copied.push(text); return Promise.resolve(); } } });",
  );
  await page.goto("./?g=1.62");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await (await reveal(page, "Share this page's address")).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Link copied" }),
  ).toBeVisible();
  await expect(icon(page, "Link copied")).toBeVisible();
  expect(await page.evaluate("window.copied")).toEqual([page.url()]);
  expect(errors).toEqual([]);
});

/**
 * The QR code the card shows, drawn on a canvas in the page, as its pixels.
 * (A string, because this file is not typed with the DOM.)
 */
async function cardPixels(
  page: Page,
): Promise<{ width: number; height: number; data: Uint8Array }> {
  const { width, height, data } = await page.evaluate<{
    width: number;
    height: number;
    data: number[];
  }>(`(async () => {
    const size = 320;
    const svg = document.querySelector("#link-card svg").cloneNode(true);
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    const image = new Image();
    image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, size, size);
    return { width: size, height: size, data: Array.from(context.getImageData(0, 0, size, size).data) };
  })()`);
  return { width, height, data: Uint8Array.from(data) };
}

test("the O key and its button show the page's address as a QR code that reads back as the address, following it, and Escape shuts it", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?n=8&g=1.62");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const card = page.getByRole("dialog", {
    name: "This page's address as a QR code",
  });
  await expect(card).toBeHidden();
  await page.keyboard.press("o");
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("img", { name: "QR code of this page's address" }),
  ).toBeVisible();
  await expect(card).toHaveAttribute("data-address", page.url());
  await expect(card).toContainText("Pendulum · 8 masses, the Moon");
  expect(decodeQR(await cardPixels(page))).toBe(page.url());

  // a moment saved changes the address, and the code follows it
  await page.keyboard.press("s");
  await expect(card).toHaveAttribute("data-address", /\/#[A-Za-z0-9_-]+$/);
  await expect(card).toHaveAttribute("data-address", page.url());
  expect(decodeQR(await cardPixels(page))).toBe(page.url());

  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await openControls(page);
  await (await reveal(page, "QR code of this page's address")).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toBeHidden();
  expect(errors).toEqual([]);
});

test("an address longer than a QR code holds says so in place of the code", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./?n=384&twins=0&trail=0");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await page.keyboard.press(" ");
  // the screen in fifteen bytes and 384 masses in eight each: 4 116 letters
  await page.keyboard.press("s");
  await expect(page).toHaveURL(/\/#[A-Za-z0-9_-]{4116}$/);
  await page.keyboard.press("o");
  const card = page.getByRole("dialog", {
    name: "This page's address as a QR code",
  });
  await expect(card).toContainText("too long for a QR code");
  await expect(
    card.getByRole("img", { name: "QR code of this page's address" }),
  ).toBeHidden();
  expect(errors).toEqual([]);
});

test("an address with a moment starts the chain there, and another number of masses forgets it", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // one mass, half a radian out, at rest
  await page.goto("./?n=1#moment=AAAAPwAAAAA");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await expect(await shownSave(page)).toHaveAccessibleName(
    "Save this moment over the one saved",
  );
  await expect(icon(page, "Amplitude of the mode")).toHaveClass(/_idle_/);
  await frames(page, 10);
  await page.keyboard.press("r");
  await frames(page, 5);
  // two masses, where the piece opens, leave nothing in the address
  await page.keyboard.press("ArrowUp");
  await expect(page).not.toHaveURL(/#moment=/);
  await expect(page).not.toHaveURL(/[?&]n=/);
  await expect(await shownSave(page)).toHaveAccessibleName("Save this moment");
  await frames(page, 5);
  expect(errors).toEqual([]);
});

test("a moment for another number of masses is not taken", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("./?n=2#moment=AAAAPwAAAAA");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  await expect(await shownSave(page)).toHaveAccessibleName("Save this moment");
  await frames(page, 5);
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
  // the masses' icon, in the chain's group (decision 54)
  const masses = await reveal(page, "Number of masses");
  const shown = page.getByRole("group", { name: "Number of masses" });
  await expect(shown).toBeHidden();

  // its icon shows its value, with its − and +, and hides it again
  await masses.click();
  await expect(masses).toHaveAttribute("aria-expanded", "true");
  await expect(shown.locator("output")).toHaveText("n = 2");
  await shown.getByRole("button", { name: "More: Number of masses" }).click();
  await expect(shown.locator("output")).toHaveText("n = 3");
  await expect(page).toHaveURL(/[?&]n=3(&|$)/);
  // another icon of the group shows its value in place of the first
  const hand = page.getByRole("group", { name: "Firmness of the hand" });
  await icon(page, "Firmness of the hand").click();
  await expect(shown).toBeHidden();
  await expect(hand.locator("output")).toContainText("●●●●●");
  await icon(page, "Firmness of the hand").click();
  await expect(hand).toBeHidden();

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
  // two values of the chain's group (decision 54)
  for (const label of ["Number of masses", "Strength of gravity"]) {
    const tool = await reveal(page, label);
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
  // the first level fits down to 360 px wide (decision 54); narrower, it scrolls
  test.use({ viewport: { width: 320, height: 640 } });

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

/** A second of a tone at 440 Hz, as a WAV file of 16-bit samples at 8 kHz, for the music's group to play. */
function toneFile(): Buffer {
  const rate = 8000;
  const samples = rate;
  const data = Buffer.alloc(44 + 2 * samples);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + 2 * samples, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(2 * rate, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(2 * samples, 40);
  for (let i = 0; i < samples; i++) {
    const value = 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate);
    data.writeInt16LE(Math.round(32767 * value), 44 + 2 * i);
  }
  return data;
}

/** The music's group of the row (decisions 44 and 76), and its parts, in sight or not. */
function music(page: Page) {
  const group = page.locator("#group-music");
  const panel = page.locator("#music-panel");
  return {
    group,
    panel,
    status: panel.getByRole("status", { includeHidden: true }),
    tempo: panel.locator("#music-tempo"),
    meter: panel.getByRole("meter", {
      name: "Sound arriving",
      includeHidden: true,
    }),
    source: (name: string) =>
      group.getByRole("button", { name, exact: true, includeHidden: true }),
    note: icon(page, "Music"),
  };
}

/** Brings the controls back into sight after a wait, as a visitor's mouse does. */
async function awaken(page: Page): Promise<void> {
  const box = await launcher(page).boundingBox();
  if (box === null) throw new Error("the controls' button is not on the page");
  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Waits until the panel's meter shows sound arriving; failing, says what the
 * panel said, and the page's errors.
 */
/**
 * A WAV file of clicks at `bpm`, 16-bit at 22 050 Hz: twenty beats, so that
 * it comes round on the beat as it plays in a loop; each click a burst of
 * noise falling over 4 ms.
 */
function clicksFile(bpm: number): Buffer {
  const rate = 22_050;
  const beat = Math.round((60 / bpm) * rate);
  const samples = 20 * beat;
  const data = Buffer.alloc(44 + 2 * samples);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + 2 * samples, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(2 * rate, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(2 * samples, 40);
  let seed = 1;
  for (let i = 0; i < samples; i++) {
    const since = (i % beat) / rate;
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    const noise = seed / 2_147_483_648 - 0.5;
    const value = since < 0.03 ? 1.6 * noise * Math.exp(-since / 0.004) : 0;
    data.writeInt16LE(Math.round(32_767 * value), 44 + 2 * i);
  }
  return data;
}

async function hearsSound(page: Page, errors: string[]): Promise<void> {
  const { meter, status } = music(page);
  try {
    await expect
      .poll(async () => Number(await meter.getAttribute("aria-valuenow")), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
  } catch (error) {
    const said = (await status.textContent()) ?? "";
    throw new Error(
      `the meter stayed at 0; the panel said "${said}"; the page's errors: ${JSON.stringify(errors)}`,
      { cause: error },
    );
  }
}

test("the W key and the row's note open the music's group, whose demo beat lights, moves the meter and the note, and stops at a second touch (decisions 44 and 76)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  const { group, panel, status, meter, source, note } = music(page);
  await expect(group).toBeHidden();
  await page.keyboard.press("w");
  await expect(group).toBeVisible();
  await expect(panel).toBeVisible();
  await expect(status).toHaveText("Not listening.");
  await expect(panel).toContainText("Sound stays on this device.");
  await expect(source("Demo beat")).toHaveAttribute("aria-pressed", "false");

  // the beat plays aloud, or muted where the browser gives no sound
  await source("Demo beat").click();
  await expect(source("Demo beat")).toHaveAttribute("aria-pressed", "true");
  await expect(status).toHaveText(
    /^(Playing the demo beat\.|The demo beat, muted)/,
    { timeout: 10_000 },
  );
  await hearsSound(page, errors);
  // the note in the row is three bars while the piece listens
  await expect(note.locator("rect")).toHaveCount(3);

  // a second touch stops it, and the note comes back
  await awaken(page);
  await source("Demo beat").click();
  await expect(status).toHaveText("Not listening.");
  await expect(source("Demo beat")).toHaveAttribute("aria-pressed", "false");
  await expect(meter).toHaveAttribute("aria-valuenow", "0");
  await expect(note.locator("rect")).toHaveCount(0);

  // W shuts the group and opens it again; Escape shuts it, and the note
  // opens it
  await page.keyboard.press("w");
  await expect(group).toBeHidden();
  await page.keyboard.press("w");
  await expect(group).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(group).toBeHidden();
  await note.click();
  await expect(group).toBeVisible();
  expect(errors).toEqual([]);
});

test("the music's panel opens right above its group, in a value's place, and gives way to a value chosen and to another group, so that nothing draws over it (decision 76)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
    const { group, panel, source } = music(page);
    await page.keyboard.press("w");
    await source("Demo beat").click();
    await expect(source("Demo beat")).toHaveAttribute("aria-pressed", "true");
    const over = await panel.boundingBox();
    const under = await group.boundingBox();
    if (over === null || under === null) throw new Error("no panel or group");
    expect(over.y + over.height).toBeLessThanOrEqual(under.y + 1);
    expect(over.x).toBeGreaterThanOrEqual(0);
    expect(over.x + over.width).toBeLessThanOrEqual(width);

    // the mode's value takes the panel's place, and gives it back
    const mode = icon(page, "What the music does");
    await mode.click();
    await expect(panel).toBeHidden();
    await expect(
      page.getByRole("group", { name: "What the music does" }),
    ).toBeVisible();
    await mode.click();
    await expect(panel).toBeVisible();

    // another group shuts the music's, panel and all, while the beat plays on
    await icon(page, "The chain").click();
    await expect(
      page.getByRole("toolbar", { name: "The chain" }),
    ).toBeVisible();
    await expect(group).toBeHidden();
    await expect(panel).toBeHidden();
    await expect(source("Demo beat")).toHaveAttribute("aria-pressed", "true");
    // and the music's opens again as it was left
    await awaken(page);
    await icon(page, "Music").click();
    await expect(panel).toBeVisible();
    await source("Demo beat").click();
  }
  expect(errors).toEqual([]);
});

test("the music's group plays a file of music chosen from the device, and hears it", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await page.keyboard.press("w");
  const { panel, status, source } = music(page);
  await panel.locator('input[type="file"]').setInputFiles({
    name: "tone.wav",
    mimeType: "audio/wav",
    buffer: toneFile(),
  });
  // a browser may take a few seconds to start its sound
  await expect(status).toHaveText("Playing tone.wav.", { timeout: 10_000 });
  await expect(source("File")).toHaveAttribute("aria-pressed", "true");
  await hearsSound(page, errors);
  await awaken(page);
  await source("File").click();
  await expect(status).toHaveText("Not listening.");
  expect(errors).toEqual([]);
});

test("the music's panel says the demo beat's tempo once the beat clock is sure of it, and stays on a phone's screen (decision 78)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // muted: the beat's clock hears it from the beat's function, aloud or
  // not, and the sound server is left to the tests that play
  await page.addInitScript(
    "Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });",
  );
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await page.keyboard.press("w");
  const { panel, status, tempo, source } = music(page);
  await source("Demo beat").click();
  await expect(status).toHaveText(/^The demo beat, muted/);
  await expect(tempo).toHaveText("120 bpm.", { timeout: 20_000 });
  await expect(tempo).toBeVisible();
  // the panel grows with it, and stays on a phone's screen
  await expect
    .poll(async () => {
      const box = await panel.boundingBox();
      return box !== null && box.x >= 0 && box.x + box.width <= 390;
    })
    .toBe(true);
  await awaken(page);
  await source("Demo beat").click();
  await expect(status).toHaveText("Not listening.");
  await expect(tempo).toBeHidden();
  expect(errors).toEqual([]);
});

test("the beat clock on the audio line hears a file of clicks, and the panel says their tempo (decision 78)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await page.keyboard.press("w");
  const { panel, status, tempo, source } = music(page);
  await panel.locator('input[type="file"]').setInputFiles({
    name: "clicks.wav",
    mimeType: "audio/wav",
    buffer: clicksFile(100),
  });
  await expect(status).toHaveText("Playing clicks.wav.", { timeout: 10_000 });
  await expect(tempo).toHaveText("100 bpm.", { timeout: 20_000 });
  await awaken(page);
  await source("File").click();
  await expect(status).toHaveText("Not listening.");
  expect(errors).toEqual([]);
});

test("the music's group listens through the microphone, and lets it go", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "no fake microphone is set up for WebKit here (playwright.config.ts)",
  );
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await page.keyboard.press("w");
  const { status, source } = music(page);
  await source("Microphone").click();
  await expect(status).toHaveText(/^Listening through /, { timeout: 10_000 });
  await expect(source("Microphone")).toHaveAttribute("aria-pressed", "true");
  await hearsSound(page, errors);
  await awaken(page);
  await source("Microphone").click();
  await expect(status).toHaveText("Not listening.");
  expect(errors).toEqual([]);
});

test("where the browser shares a tab's sound, the music's group listens to a share, and elsewhere offers none", async ({
  page,
  browserName,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await page.keyboard.press("w");
  const { status, source } = music(page);
  const tab = source("Sound of a tab or the screen");
  if (browserName !== "chromium") {
    // Firefox and Safari share pictures without sound (decision 45)
    await expect(tab).toHaveCount(0);
    expect(errors).toEqual([]);
    return;
  }
  // Chromium's fake share, accepted without asking (playwright.config.ts),
  // is a screen with sound
  await tab.click();
  await expect(status).toHaveText("Listening to the sound of this computer.");
  await expect(tab).toHaveAttribute("aria-pressed", "true");
  await tab.click();
  await expect(status).toHaveText("Not listening.");
  expect(errors).toEqual([]);
});

test("where there are several microphones, the music's panel lists them and listens through the one chosen", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "only Chromium's fake devices have two microphones here (playwright.config.ts)",
  );
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await page.keyboard.press("w");
  const { panel, status, source } = music(page);
  const list = panel.getByRole("combobox", { name: "microphone" });
  await expect(list).toBeHidden();
  await source("Microphone").click();
  await expect(status).toHaveText(/^Listening through /);
  await expect(list).toBeVisible();
  const names = await list.locator("option").allTextContents();
  expect(names.length).toBeGreaterThanOrEqual(2);
  const last = names.at(-1) ?? "";
  await list.selectOption({ label: last });
  await expect(status).toHaveText(`Listening through ${last}.`);
  await hearsSound(page, errors);
  await awaken(page);
  await source("Microphone").click();
  await expect(list).toBeHidden();
  expect(errors).toEqual([]);
});

test("the music's mode and strength, values of its group, are kept in the address, beside a saved moment too, and an address opens with them (decisions 46, 76, 77 and 79)", async ({
  page,
}) => {
  // it steps through the modes one by one, each mode a step more: on
  // Chromium in the CI it took 24 of its 30 s before the tuned chain came
  test.slow();
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await page.keyboard.press("w");
  const mode = page.getByRole("group", { name: "What the music does" });
  const strength = page.getByRole("group", {
    name: "How strongly the music acts",
  });
  const less = (group: Locator, label: string) =>
    group.getByRole("button", { name: `Less: ${label}` });
  const more = (group: Locator, label: string) =>
    group.getByRole("button", { name: `More: ${label}` });
  // the piece opens in the light, at the middle strength
  await icon(page, "What the music does").click();
  await expect(mode).toContainText("light");
  // the candidates come next, the forces first (decisions 49, 75, 77 and
  // 79), and "none" last, round from the first
  for (const name of ["speaker", "dance", "breath", "sway", "tuned", "glow"]) {
    await more(mode, "What the music does").click();
    await expect(mode).toContainText(name);
    await expect(page).toHaveURL(new RegExp(`[?&]music=${name}(&|$)`));
  }
  for (let i = 0; i < 7; i++) await less(mode, "What the music does").click();
  await expect(mode).toContainText("none");
  await expect(page).toHaveURL(/[?&]music=none(&|$)/);
  await icon(page, "How strongly the music acts").click();
  await expect(strength).toContainText("●●●○○");
  await more(strength, "How strongly the music acts").click();
  await more(strength, "How strongly the music acts").click();
  await more(strength, "How strongly the music acts").click();
  await expect(strength).toContainText("●●●●●");
  await expect(page).toHaveURL(/[?&]strength=5(&|$)/);
  // round again to the light, which leaves the address
  await icon(page, "What the music does").click();
  await more(mode, "What the music does").click();
  await expect(mode).toContainText("light");
  await expect(page).not.toHaveURL(/music=/);

  // a saved moment's code goes after the "#", and the music stays before it
  await less(mode, "What the music does").click();
  await page.keyboard.press("s");
  await expect(page).toHaveURL(/\?music=none&strength=5#.+/);

  // an address opens with its mode and strength
  await page.goto("./?music=none&strength=2");
  await page.keyboard.press("w");
  await icon(page, "What the music does").click();
  await expect(mode).toContainText("none");
  await icon(page, "How strongly the music acts").click();
  await expect(strength).toContainText("●●○○○");
  expect(errors).toEqual([]);
});

test("while the music acts on the chain as a force, time does not run backwards and its button is faded; with the music off, it runs backwards again (decisions 75 and 77)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  const { source } = music(page);
  // the dancing hand, the breath and the swaying gravity, each with the demo
  // beat playing
  let backwards = icon(page, "Run time backwards");
  for (const name of ["breath", "sway", "dance"]) {
    await page.goto(`./?music=${name}`);
    await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
    // the music's group opens the row; Escape shuts the group, and the row
    // stays open
    await page.keyboard.press("w");
    await source("Demo beat").click();
    await hearsSound(page, errors);
    await page.keyboard.press("Escape");
    await awaken(page);
    backwards = await reveal(page, "Run time backwards");
    await expect(backwards).toHaveClass(/_idle_/);
    await page.keyboard.press("b");
    await frames(page, 3);
    await expect(backwards).toBeAttached();
    await expect(icon(page, "Run time forwards")).toHaveCount(0);
  }

  // the music off, by its source touched again: the button lights, and B
  // runs time backwards
  await page.keyboard.press("w");
  await awaken(page);
  await source("Demo beat").click();
  await page.keyboard.press("Escape");
  await expect(backwards).not.toHaveClass(/_idle_/);
  await page.keyboard.press("b");
  await expect(icon(page, "Run time forwards")).toBeAttached();
  expect(errors).toEqual([]);
});

test("the row opens on the pause, the light and six groups, each opening its own row above it, and what was open comes back (decision 54)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const row = page.getByRole("toolbar", { name: "Controls" });
  expect(await labels(row)).toEqual([
    "Pause",
    "Light of the twins and trails",
    "Time and the start",
    "The chain",
    "The twins",
    "The trails",
    "Music",
    "The screen",
  ]);

  // a group's row opens right above the first level, with its own icons
  const trails = icon(page, "The trails");
  await trails.click();
  await expect(trails).toHaveAttribute("aria-expanded", "true");
  const trailsRow = page.getByRole("toolbar", { name: "The trails" });
  await expect(trailsRow).toBeVisible();
  expect(await labels(trailsRow)).toEqual([
    "How long the trails last",
    "Style of the trails",
    "Trails from every mass",
  ]);
  const above = await trailsRow.boundingBox();
  const below = await row.boundingBox();
  if (above === null || below === null) throw new Error("no rows");
  expect(above.y + above.height).toBeLessThanOrEqual(below.y + 1);

  // a value opens above its icon in the group
  await icon(page, "How long the trails last").click();
  await expect(
    page.getByRole("group", { name: "How long the trails last" }),
  ).toBeVisible();

  // a key leads the row to its control's group, its value in sight
  await page.keyboard.press("ArrowUp");
  const chainRow = page.getByRole("toolbar", { name: "The chain" });
  await expect(chainRow).toBeVisible();
  await expect(trailsRow).toBeHidden();
  await expect(
    page.getByRole("group", { name: "Number of masses" }),
  ).toBeVisible();

  // shut by the button and opened again, as it was left
  await launcher(page).click();
  await expect(chainRow).toBeHidden();
  await launcher(page).click();
  await expect(chainRow).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Number of masses" }),
  ).toBeVisible();

  // and each group keeps the value last open in it
  await icon(page, "The trails").click();
  await expect(
    page.getByRole("group", { name: "How long the trails last" }),
  ).toBeVisible();

  // Escape shuts the group, then the row
  await page.keyboard.press("Escape");
  await expect(trailsRow).toBeHidden();
  await expect(row).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row).toBeHidden();
  expect(errors).toEqual([]);
});

test("on a phone 390 or 360 px wide, the first level fits beside the button without scrolling, and a group opens above it (decision 54)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 780 });
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
    await openControls(page);
    await expect(page.locator("#controls [data-more]")).toHaveAttribute(
      "data-more",
      "",
    );
    for (const button of await page
      .getByRole("toolbar", { name: "Controls" })
      .getByRole("button")
      .all()) {
      const box = await button.boundingBox();
      if (box === null)
        throw new Error("an icon of the row is not on the page");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await icon(page, "The twins").click();
    const twins = page.getByRole("toolbar", { name: "The twins" });
    await expect(twins).toBeVisible();
    const box = await twins.boundingBox();
    if (box === null) throw new Error("the twins' row is not on the page");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  expect(errors).toEqual([]);
});

test("the screen's group has a button for the sketch's light, which the G key turns too (decision 54)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-webgl", "webgl2");
  await openControls(page);
  const sketch = await reveal(page, "The sketch's light");
  await expect(sketch).toHaveAttribute("aria-pressed", "false");
  await sketch.click();
  await expect(sketch).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-light", "frame");
  await expect(page).toHaveURL(/[?&]sketch=1(&|$)/);
  await page.keyboard.press("g");
  await expect(sketch).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).toHaveAttribute("data-light", "trails");
  await frames(page, 5);
  expect(errors).toEqual([]);
});
