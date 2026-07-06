import { test, expect } from "@playwright/test";

const TOKEN = "dev-upload-token";
const PASSWORD = "party-admin";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/show$/);
}

test("guest sends a help request, admin resolves and deletes it", async ({ page }) => {
  const message = `Hilfe-Test ${Date.now()}`;

  // Guest side: the "Hilfe" button opens the form; submitting shows the thanks
  // state. Locators are scoped to the dialog — the upload page has its own
  // name field.
  await page.goto(`/api/upload/enter?t=${TOKEN}`);
  await page.getByRole("button", { name: "Hilfe" }).click();
  const dialog = page.getByRole("dialog", { name: "Hilfe & Feedback" });
  await dialog.getByLabel("Deine Nachricht").fill(message);
  await dialog.getByLabel(/Dein Name/).fill("Feedback-Tester");
  await dialog.getByLabel(/Deine E-Mail-Adresse/).fill("tester@example.com");
  await dialog.getByRole("button", { name: "Nachricht absenden" }).click();
  await expect(dialog.getByText("Danke!")).toBeVisible();

  // Admin side: the report is listed with its context and can be resolved.
  await login(page);
  await page.goto("/admin/feedback");
  const item = page.locator("li", { hasText: message });
  await expect(item).toBeVisible();
  await expect(item.getByText(/von Feedback-Tester/)).toBeVisible();
  await expect(item.getByText(/\/upload/)).toBeVisible();
  // The contact email is a clickable mailto link.
  await expect(item.getByRole("link", { name: "tester@example.com" })).toHaveAttribute(
    "href",
    "mailto:tester@example.com",
  );

  await item.getByRole("button", { name: "Erledigt" }).click();
  await expect(item.getByRole("button", { name: "Wieder öffnen" })).toBeVisible();

  // Cleanup (with confirmation dialog): delete removes it from the list.
  page.once("dialog", (dialog) => dialog.accept());
  await item.getByRole("button", { name: "Löschen" }).click();
  await expect(page.locator("li", { hasText: message })).toHaveCount(0);
});

test("help requests work without an upload session (broken-link case)", async ({ page }) => {
  const message = `Hilfe-ohne-Cookie ${Date.now()}`;

  // No /api/upload/enter visit: the denied notice still offers the help button.
  await page.goto("/upload");
  await page.getByRole("button", { name: "Hilfe" }).click();
  await page.getByLabel("Deine Nachricht").fill(message);
  await page.getByRole("button", { name: "Nachricht absenden" }).click();
  await expect(page.getByText("Danke!")).toBeVisible();

  // Cleanup via the admin list.
  await login(page);
  await page.goto("/admin/feedback");
  const item = page.locator("li", { hasText: message });
  await expect(item.getByText(/anonym/)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await item.getByRole("button", { name: "Löschen" }).click();
  await expect(page.locator("li", { hasText: message })).toHaveCount(0);
});

test("feedback API rejects garbage and empty messages", async ({ page }) => {
  const empty = await page.request.post("/api/feedback", { data: { message: "   " } });
  expect(empty.status()).toBe(400);

  const garbage = await page.request.post("/api/feedback", {
    headers: { "Content-Type": "application/json" },
    data: "not json{{",
  });
  expect(garbage.status()).toBe(400);
});

test("quiz page shows the help button", async ({ page }) => {
  await page.goto("/quiz");
  await expect(page.getByRole("button", { name: "Hilfe" })).toBeVisible();
});
