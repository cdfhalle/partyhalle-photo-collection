import { test, expect } from "@playwright/test";

const TOKEN = "dev-upload-token";
const PASSWORD = "party-admin";

function jpegFile() {
  const buffer = Buffer.alloc(64);
  buffer.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return { name: "party.jpg", mimeType: "image/jpeg", buffer };
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/show$/);
}

test("admin APIs require authentication", async ({ page }) => {
  const download = await page.request.get("/api/admin/download");
  expect(download.status()).toBe(401);
  const photo = await page.request.get("/api/photo/anything?w=400");
  expect(photo.status()).toBe(401);
});

test("admin lists a photo, downloads a ZIP, and deletes it", async ({ page }) => {
  // Upload one photo with a unique comment.
  await page.goto(`/api/upload/enter?t=${TOKEN}`);
  await page.getByLabel(/Dein Name/).fill("Admin-Tester");
  await page.locator("#file-input").setInputFiles(jpegFile());
  await page.getByPlaceholder("Kommentar (freiwillig)").fill("Admin-Test-Foto");
  await page.getByRole("button", { name: "Hochladen" }).click();
  // Nobody tagged → the details nudge appears; upload anyway.
  await page.getByRole("button", { name: "Ohne Infos hochladen" }).click();
  await expect(page.getByText(/Geschafft/)).toBeVisible({ timeout: 15_000 });

  await login(page);

  // Grid shows the photo.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  await expect(page.getByText("Admin-Test-Foto")).toBeVisible();
  expect(await page.locator('img[src*="/api/photo/"]').count()).toBeGreaterThanOrEqual(1);

  // The thumbnail route returns a real image (regression: it used to 500 by
  // returning the Images binding's foreign Response class instead of a Response).
  const src = await page.locator('img[src*="/api/photo/"]').first().getAttribute("src");
  const thumb = await page.request.get(src!);
  expect(thumb.ok()).toBeTruthy();
  expect(thumb.headers()["content-type"]).toMatch(/^image\//);

  // Download returns a real ZIP (PK magic bytes).
  const zip = await page.request.get("/api/admin/download");
  expect(zip.ok()).toBeTruthy();
  expect(zip.headers()["content-type"]).toContain("zip");
  const body = await zip.body();
  expect(body[0]).toBe(0x50); // 'P'
  expect(body[1]).toBe(0x4b); // 'K'

  // The ZIP bundles the annotations: client-zip stores entries uncompressed,
  // so metadata.json and its content appear verbatim in the archive bytes.
  expect(body.includes("metadata.json")).toBe(true);
  expect(body.includes('"comment": "Admin-Test-Foto"')).toBe(true);
  expect(body.includes('"uploader": "Admin-Tester"')).toBe(true);

  // Delete (with confirmation dialog) removes it from the grid.
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator("li", { hasText: "Admin-Test-Foto" })
    .getByRole("button", { name: "Löschen" })
    .click();
  await expect(page.getByText("Admin-Test-Foto")).toHaveCount(0);
});

test("admin shows the upload QR code", async ({ page }) => {
  await login(page);
  await page.goto("/admin/qr");
  await expect(page.getByRole("heading", { name: "Upload-QR-Code" })).toBeVisible();
  await expect(page.locator("main svg")).toBeVisible();
  await expect(page.getByText("/api/upload/enter")).toBeVisible();
});
