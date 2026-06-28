import { defineConfig, devices } from "@playwright/test";

// E2E tests drive a real browser against `next dev`. Thanks to
// initOpenNextCloudflareForDev() in next.config.ts, the dev server exposes the
// local Cloudflare bindings, so end-to-end flows (upload -> R2 -> D1) work too.
export default defineConfig({
  testDir: "./test/e2e",
  globalSetup: "./test/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
