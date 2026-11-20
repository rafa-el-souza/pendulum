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
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // a microphone that the page may use without asking, which hears a
        // beep the browser makes, for the music's tests (decisions 44 and 76)
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        // CI machines have no GPU. Headless Firefox there gave no WebGL2 even
        // with it forced, so in CI Firefox runs headed on a virtual display
        // (xvfb-run, in ci.yml), and WebGL is allowed on the software
        // renderer, which Firefox refuses by default. A visitor's Firefox
        // draws on a GPU and needs neither.
        headless: !process.env.CI,
        // The same fake microphone, without asking, for the music's tests.
        launchOptions: {
          firefoxUserPrefs: {
            "webgl.force-enabled": true,
            "media.navigator.streams.fake": true,
            "media.navigator.permission.disabled": true,
          },
        },
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
