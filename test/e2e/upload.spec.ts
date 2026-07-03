import { test, expect } from "@playwright/test";

// Matches UPLOAD_TOKEN in .dev.vars (loaded by the dev server).
const TOKEN = "dev-upload-token";

// A minimal but valid-by-magic-bytes JPEG (starts with FF D8 FF, padded so the
// sniffer's length check passes). The bytes never need to decode.
function jpegFile() {
  const buffer = Buffer.alloc(64);
  buffer.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return { name: "party.jpg", mimeType: "image/jpeg", buffer };
}

test.describe("upload page gate", () => {
  test("blocks access without a valid token", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: "Kein Zugang" })).toBeVisible();
  });

  test("rejects an invalid token", async ({ page }) => {
    await page.goto(`/api/upload/enter?t=wrong-token`);
    await expect(page).toHaveURL(/\/upload$/);
    await expect(page.getByRole("heading", { name: "Kein Zugang" })).toBeVisible();
  });
});

test.describe("upload flow", () => {
  test("a valid token lets a guest upload a photo", async ({ page }) => {
    // Capability link sets the cookie and redirects to the form.
    await page.goto(`/api/upload/enter?t=${TOKEN}`);
    await expect(page).toHaveURL(/\/upload$/);
    await expect(page.getByRole("heading", { name: /Fotoooooooos/ })).toBeVisible();

    await page.getByLabel(/Dein Name/).fill("Anna");
    await page.locator("#file-input").setInputFiles(jpegFile());

    // The per-photo comment field appears once a file is selected.
    await page.getByPlaceholder("Kommentar (freiwillig)").fill("Tolle Party!");
    await page.getByRole("button", { name: "Hochladen" }).click();

    await expect(page.getByText(/Geschafft/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("✓ Hochgeladen")).toBeVisible();
  });
});
