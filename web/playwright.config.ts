import { defineConfig, devices } from "@playwright/test";

// The build is served the way a static host would serve it (vite preview), and
// every page is opened in the three engines of the major browsers
// (docs/decisions.md, decision 9).
const URL = "http://127.0.0.1:4173/";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: URL },
  webServer: {
    command: "npm run build && npm run preview",
    url: URL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        // CI machines have no GPU, and Firefox turns WebGL off on a software
        // renderer unless told otherwise. A visitor's Firefox draws on a GPU.
        launchOptions: { firefoxUserPrefs: { "webgl.force-enabled": true } },
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
