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
    // Dedicated test port so the harness always starts a fresh server with
    // current .dev.vars and never reuses a manual `npm run dev` on :3000.
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
