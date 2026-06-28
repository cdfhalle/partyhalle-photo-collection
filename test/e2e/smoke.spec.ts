import { test, expect } from "@playwright/test";

// Phase 0 harness check: confirms Playwright can boot the dev server and load a
// page. Real journeys (upload, auth gate, slideshow, admin) arrive in later phases.
test("home page loads", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("body")).toBeVisible();
});
