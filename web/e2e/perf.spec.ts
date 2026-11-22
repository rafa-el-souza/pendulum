import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { collectErrors } from "./errors.ts";

// The recorder an address can ask for (decision 94): it records the frames,
// saves the record as a file, and leaves the address without its keys.

interface Record {
  readonly header: {
    readonly frames: number;
    readonly search: string;
    readonly label: string;
    readonly warm: number;
    readonly span: number;
  };
  readonly columns: { readonly [column: string]: readonly (number | null)[] };
  readonly shares: readonly (readonly number[])[];
}

test("?perf=1 records the frames and saves them as a file, and no link carries it on", async ({
  page,
}) => {
  const errors = collectErrors(page);
  const saved = page.waitForEvent("download");
  await page.goto("./?twins=64&perf=1&perfwarm=0.5&perfspan=1&perflabel=e2e");
  // read once as the page opens, the recorder's keys leave the address
  await expect(page).toHaveURL(/\/\?twins=64$/);
  const download = await saved;
  expect(download.suggestedFilename()).toMatch(
    /^pendulum-perf-e2e-[0-9T-]+Z\.json$/,
  );
  const path = await download.path();
  const record = JSON.parse(await readFile(path, "utf8")) as Record;
  const { header, columns, shares } = record;
  expect(header.search).toBe(
    "?twins=64&perf=1&perfwarm=0.5&perfspan=1&perflabel=e2e",
  );
  expect(header.label).toBe("e2e");
  expect([header.warm, header.span]).toEqual([0.5, 1]);
  expect(header.frames).toBeGreaterThan(0);
  for (const column of ["t", "total", "take", "draw", "draw.trails", "alive"]) {
    expect(columns[column]).toHaveLength(header.frames);
  }
  expect(shares).toHaveLength(header.frames);
  // the line in the corner becomes a link to the file
  await expect(
    page.getByRole("link", { name: /^perf · \d+ frames · / }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("without ?perf=1 nothing records", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("./?twins=64");
  await page.evaluate("new Promise((resolve) => setTimeout(resolve, 300))");
  await expect(page.getByLabel("Recorder")).toHaveCount(0);
  expect(errors).toEqual([]);
});
