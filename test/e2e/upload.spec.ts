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

test.describe("persistence across reloads", () => {
  test("a pending draft (photo + comment) survives a reload", async ({ page }) => {
    await page.goto(`/api/upload/enter?t=${TOKEN}`);
    await page.getByLabel(/Dein Name/).fill("Bertha");
    await page.locator("#file-input").setInputFiles(jpegFile());
    await page.getByPlaceholder("Kommentar (freiwillig)").fill("Noch nicht hochgeladen");
    // Let the debounced IndexedDB meta write land before reloading.
    await page.waitForTimeout(700);

    await page.reload();

    // Name and draft were restored, so the form is in the details phase again.
    await expect(page.getByRole("heading", { name: /Super, Bertha/ })).toBeVisible();
    await expect(page.getByPlaceholder("Kommentar (freiwillig)")).toHaveValue(
      "Noch nicht hochgeladen",
    );
  });

  test("uploaded photos reappear after a reload, with the other-devices note", async ({
    page,
  }) => {
    await page.goto(`/api/upload/enter?t=${TOKEN}`);
    await page.getByLabel(/Dein Name/).fill("Carla");
    await page.locator("#file-input").setInputFiles(jpegFile());
    await page.getByRole("button", { name: "Hochladen" }).click();
    await expect(page.getByText(/Geschafft/)).toBeVisible({ timeout: 15_000 });

    await page.reload();

    // No pending drafts anymore, but the done grid is fed from the server.
    await expect(page.getByText(/✓ Hochgeladen \(\d+\)/)).toBeVisible();
    await expect(page.getByText(/anderen Gerät oder Browser/)).toBeVisible();
    // The name survives too (restored into the intro's name field).
    await expect(page.getByLabel(/Dein Name/)).toHaveValue("Carla");
  });
});

test.describe("session isolation", () => {
  test("another browser session can never list or fetch a foreign photo", async ({
    page,
    browser,
  }) => {
    // First device uploads a photo and we grab its id from the API response.
    await page.goto(`/api/upload/enter?t=${TOKEN}`);
    await page.getByLabel(/Dein Name/).fill("Dora");
    await page.locator("#file-input").setInputFiles(jpegFile());
    const uploadResponse = page.waitForResponse(
      (res) => res.url().includes("/api/upload") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Hochladen" }).click();
    const { id } = (await (await uploadResponse).json()) as { id: string };
    await expect(page.getByText(/Geschafft/)).toBeVisible({ timeout: 15_000 });
    // Sanity check: the owner can fetch their own photo.
    expect((await page.request.get(`/api/photo/${id}`)).status()).toBe(200);

    // Second device: same invite token, but its own cookies → its own session.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(`/api/upload/enter?t=${TOKEN}`);
    await expect(otherPage.getByRole("heading", { name: /Fotoooooooos/ })).toBeVisible();

    // Nothing of Dora's leaks: no done grid, empty "mine" list, photo is a 404.
    await expect(otherPage.getByText("✓ Hochgeladen")).not.toBeVisible();
    const mine = await otherPage.request.get("/api/upload/mine");
    expect(((await mine.json()) as { photos: unknown[] }).photos).toEqual([]);
    expect((await otherPage.request.get(`/api/photo/${id}`)).status()).toBe(404);
    await other.close();

    // And with no cookies at all, the photo bytes stay locked away entirely.
    const anonymous = await browser.newContext();
    expect((await anonymous.request.get(`/api/photo/${id}`)).status()).toBe(401);
    await anonymous.close();
  });
});
