import { test, expect } from "@playwright/test";

// Matches APP_PASSWORD in .dev.vars (loaded by the dev server).
const PASSWORD = "party-admin";

test.describe("protected route gate", () => {
  test("redirects /show to login when not authenticated", async ({ page }) => {
    await page.goto("/show");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
  });

  test("redirects /admin to login with a next param", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  });
});

test.describe("login / logout", () => {
  test("rejects a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Passwort").fill("wrong-password");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByText("Falsches Passwort.")).toBeVisible();
  });

  test("logs in, reaches protected pages, then logs out", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Passwort").fill(PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();

    // Default destination after login is the slideshow.
    await expect(page).toHaveURL(/\/show$/);
    await expect(page.getByRole("heading", { name: "Diashow" })).toBeVisible();

    // Session also unlocks the admin page.
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

    // Logout clears the session.
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/show");
    await expect(page).toHaveURL(/\/login/);
  });
});
