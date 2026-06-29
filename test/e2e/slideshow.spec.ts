import { test, expect, type Page } from "@playwright/test";

const TOKEN = "dev-upload-token";
const PASSWORD = "party-admin";

function jpegFile() {
  const buffer = Buffer.alloc(64);
  buffer.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return { name: "slide.jpg", mimeType: "image/jpeg", buffer };
}

async function uploadPhoto(page: Page, comment: string) {
  await page.goto(`/api/upload/enter?t=${TOKEN}`);
  await page.locator("#file-input").setInputFiles(jpegFile());
  await page.getByPlaceholder("Kommentar (freiwillig)").fill(comment);
  await page.getByRole("button", { name: "Hochladen" }).click();
  await expect(page.getByText(/Geschafft/)).toBeVisible({ timeout: 15_000 });
}

test("slideshow displays newest first, navigates, and adjusts duration", async ({ page }) => {
  // Two photos in known order; newest (Zwei) is shown first.
  await uploadPhoto(page, "Slideshow-Eins");
  await uploadPhoto(page, "Slideshow-Zwei");

  // Login redirects to /show.
  await page.goto("/login");
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/show$/);

  // Newest photo shown first.
  await expect(page.locator('img[src*="/api/photo/"]')).toBeAttached();
  await expect(page.getByText("Slideshow-Zwei")).toBeVisible();

  // Pause so auto-advance doesn't move the slide during assertions.
  await page.getByRole("button", { name: "Pause" }).click();

  // Manual next -> previous photo (Eins).
  await page.getByRole("button", { name: "Weiter ›" }).click();
  await expect(page.getByText("Slideshow-Eins")).toBeVisible();

  // Manual previous -> back to Zwei.
  await page.getByRole("button", { name: "‹ Zurück" }).click();
  await expect(page.getByText("Slideshow-Zwei")).toBeVisible();

  // Adjustable duration.
  await page.getByLabel("Dauer pro Foto in Sekunden").fill("15");
  await expect(page.getByText("Dauer: 15s")).toBeVisible();
});
