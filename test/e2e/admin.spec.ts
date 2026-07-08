import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const TOKEN = "dev-upload-token";
const PASSWORD = "party-admin";

function jpegFile() {
  const buffer = Buffer.alloc(64);
  buffer.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return { name: "party.jpg", mimeType: "image/jpeg", buffer };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/show$/);
}

// Local D1 keeps rows across runs, so every test scopes to its own photo via a
// unique comment.
async function uploadPhoto(page: Page, comment: string, uploader = "Admin-Tester") {
  await page.goto(`/api/upload/enter?t=${TOKEN}`);
  await page.getByLabel(/Dein Name/).fill(uploader);
  await page.locator("#file-input").setInputFiles(jpegFile());
  await page.getByPlaceholder("Kommentar (freiwillig)").fill(comment);
  await page.getByRole("button", { name: "Hochladen" }).click();
  // Nobody tagged → the details nudge appears; upload anyway.
  await page.getByRole("button", { name: "Ohne Infos hochladen" }).click();
  await expect(page.getByText(/Geschafft/)).toBeVisible({ timeout: 15_000 });
}

test("admin APIs require authentication", async ({ page }) => {
  const photos = await page.request.get("/api/photos");
  expect(photos.status()).toBe(401);
  const photo = await page.request.get("/api/photo/anything?w=400");
  expect(photo.status()).toBe(401);
});

test("admin lists a photo, downloads a ZIP, and deletes it", async ({ page }) => {
  const comment = `Admin-Test-Foto ${Date.now()}`;
  await uploadPhoto(page, comment);
  await login(page);

  // Grid shows the photo.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  await expect(page.getByText(comment)).toBeVisible();
  expect(await page.locator('img[src*="/api/photo/"]').count()).toBeGreaterThanOrEqual(1);

  // The thumbnail route returns a real image (regression: it used to 500 by
  // returning the Images binding's foreign Response class instead of a Response).
  const src = await page.locator('img[src*="/api/photo/"]').first().getAttribute("src");
  const thumb = await page.request.get(src!);
  expect(thumb.ok()).toBeTruthy();
  expect(thumb.headers()["content-type"]).toMatch(/^image\//);

  // The browser-built ZIP is a real archive (PK magic bytes) and bundles the
  // annotations: client-zip stores entries uncompressed, so metadata.json and
  // its content appear verbatim in the archive bytes.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Alle herunterladen (ZIP)" }).click();
  const download = await downloadPromise;
  const body = await readFile(await download.path());
  expect(body[0]).toBe(0x50); // 'P'
  expect(body[1]).toBe(0x4b); // 'K'
  expect(body.includes("metadata.json")).toBe(true);
  expect(body.includes(`"comment": "${comment}"`)).toBe(true);
  expect(body.includes('"uploader": "Admin-Tester"')).toBe(true);

  // Delete (with confirmation dialog) removes it from the grid.
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("li", { hasText: comment }).getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByText(comment)).toHaveCount(0);
});

test("admin rotates a photo in 90° steps", async ({ page }) => {
  const comment = `Rotations-Foto ${Date.now()}`;
  await uploadPhoto(page, comment);
  await login(page);
  await page.goto("/admin");

  const card = page.locator("li", { hasText: comment });
  await expect(card.locator("img")).toHaveAttribute("src", /r=0/);

  // Each click persists ±90° and busts the immutable thumbnail cache via the
  // r= query param, so the refreshed card must carry the new URL.
  await card.getByRole("button", { name: "Nach rechts drehen" }).click();
  await expect(card.locator("img")).toHaveAttribute("src", /r=90/, { timeout: 15_000 });
  await card.getByRole("button", { name: "Nach rechts drehen" }).click();
  await expect(card.locator("img")).toHaveAttribute("src", /r=180/, { timeout: 15_000 });
  await card.getByRole("button", { name: "Nach links drehen" }).click();
  await expect(card.locator("img")).toHaveAttribute("src", /r=90/, { timeout: 15_000 });
});

test("admin edits comment, date, place and tagged people", async ({ page }) => {
  const comment = `Editier-Foto ${Date.now()}`;
  const newComment = `Bearbeitet ${Date.now()}`;
  await uploadPhoto(page, comment);
  await login(page);
  await page.goto("/admin");

  const card = page.locator("li", { hasText: comment });
  // The thumbnail itself opens the edit dialog.
  await card.getByRole("button", { name: "Foto bearbeiten" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Kommentar").fill(newComment);
  // Deliberately pre-1990: old scanned photos must keep their real date
  // (a plausibility clamp used to silently erase these).
  await dialog.getByLabel("Wann aufgenommen?").fill("1954-06-20");
  await dialog.getByLabel("Wo? (Ort/Stadt)").fill("Berlin");
  // Tap the photo to drop a marker, then name the person.
  await dialog.locator("img").click({ position: { x: 40, y: 30 } });
  await dialog.getByPlaceholder("Name").fill("Zoe");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toHaveCount(0);

  // The card reflects the saved annotations.
  const editedCard = page.locator("li", { hasText: newComment });
  await expect(editedCard.getByText(newComment)).toBeVisible({ timeout: 15_000 });
  await expect(editedCard.getByText("20.06.1954 · Berlin")).toBeVisible();
  await expect(editedCard.getByText("👤 Zoe")).toBeVisible();

  // Reopening shows the persisted values, people included.
  await editedCard.getByRole("button", { name: "Foto bearbeiten" }).click();
  await expect(dialog.getByLabel("Kommentar")).toHaveValue(newComment);
  await expect(dialog.getByLabel("Wann aufgenommen?")).toHaveValue("1954-06-20");
  await expect(dialog.getByLabel("Wo? (Ort/Stadt)")).toHaveValue("Berlin");
  await expect(dialog.getByPlaceholder("Name")).toHaveValue("Zoe");
});

test("admin sorts by two criteria with directions", async ({ page }) => {
  const rid = Date.now();
  const older = `Sortier-Alt-${rid}`; // uploaded first by "Zara…"; gets a capture date below
  const newer = `Sortier-Neu-${rid}`; // uploaded second by "Anna…"; stays undated
  await uploadPhoto(page, older, `Zara-${rid}`);
  await uploadPhoto(page, newer, `Anna-${rid}`);
  await login(page);
  await page.goto("/admin");

  // The local D1 accumulates photos from other tests/runs, so only the
  // relative order of this test's two photos is asserted — polled, because a
  // sort change updates the URL before the re-sorted grid streams in.
  const indexOf = async (comment: string) => {
    const texts = await page.locator("main > ul > li").allTextContents();
    return texts.findIndex((t) => t.includes(comment));
  };
  const expectBefore = (first: string, second: string) =>
    expect
      .poll(async () => (await indexOf(first)) - (await indexOf(second)), { timeout: 10_000 })
      .toBeLessThan(0);
  const primary = page.getByLabel("Erstes Sortierkriterium");

  // Default: newest upload first.
  await expectBefore(newer, older);

  // By name: A–Z is the natural default when picking the criterion …
  await primary.selectOption("uploader");
  await expect(page).toHaveURL(/sort=uploader-asc/);
  await expectBefore(newer, older); // Anna < Zara

  // … and the arrow flips it to Z–A.
  await page.getByLabel("Erste Sortierrichtung umkehren").click();
  await expect(page).toHaveURL(/sort=uploader-desc/);
  await expectBefore(older, newer);

  // Give the older photo a capture date via the edit dialog.
  await page
    .locator("li", { hasText: older })
    .getByRole("button", { name: "Foto bearbeiten" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Wann aufgenommen?").fill("2026-07-04");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toHaveCount(0);

  // By taken date the dated photo leads; undated ones count as the earliest
  // possible date and sink to the end of the descending order.
  await primary.selectOption("taken");
  await expect(page).toHaveURL(/sort=taken-desc/);
  await expectBefore(older, newer);

  // The choice lives in the URL and survives a reload.
  await page.reload();
  await expect(primary).toHaveValue("taken");
  await expectBefore(older, newer);
});

test("admin shows the upload QR code", async ({ page }) => {
  await login(page);
  await page.goto("/admin/qr");
  await expect(page.getByRole("heading", { name: "Upload-QR-Code" })).toBeVisible();
  await expect(page.locator("main svg")).toBeVisible();
  await expect(page.getByText("/api/upload/enter")).toBeVisible();
});
