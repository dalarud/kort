import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/**
 * End-to-end tests run against the production build in demo mode (no API key) with
 * Chromium's fake camera. Run `npm run build` first.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Pixel 7"],
    baseURL: `http://localhost:${PORT}`,
    permissions: ["camera"],
    locale: "sv-SE",
    trace: "off",
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  webServer: {
    command: "node server/dist/index.js",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      DEMO_MODE: "true",
      DEMO_LATENCY_MS: "0",
      FX_URL: "off",
      RATE_LIMIT_MAX: "1000",
      LOG_LEVEL: "warn",
    },
  },
});
