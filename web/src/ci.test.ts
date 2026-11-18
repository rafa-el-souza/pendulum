import { describe, expect, it } from "vitest";

import workflow from "../../.github/workflows/ci.yml?raw";
import manifest from "../package.json?raw";

// In CI the browser tests run in Playwright's own image (docs/decisions.md,
// decision 60), which carries the browsers of one version of Playwright and
// their system packages: an image of another version than the tests' finds
// no browser to open.

describe("the image the CI's browser tests run in", () => {
  it("is Playwright's, of the version the tests run with, pinned by its digest", () => {
    const { devDependencies } = JSON.parse(manifest) as {
      devDependencies: Record<string, string>;
    };
    const image =
      /image: mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble@sha256:[0-9a-f]{64}\n/.exec(
        workflow,
      );
    expect(image?.[1]).toBe(devDependencies["@playwright/test"]);
  });
});
