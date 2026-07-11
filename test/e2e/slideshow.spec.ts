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
  // The name field only shows in the intro phase; after the first upload the
  // restored name skips it, so only fill it when it's there.
  const name = page.getByLabel(/Dein Name/);
  if (await name.isVisible()) await name.fill("Slideshow-Tester");
  await page.locator("#file-input").setInputFiles(jpegFile());
  await page.getByPlaceholder("Kommentar (freiwillig)").fill(comment);
  await page.getByRole("button", { name: "Hochladen" }).click();
  // Nobody tagged → the details nudge appears; upload anyway. The opt-out
  // sticks per page load, but uploadPhoto navigates fresh each time.
  await page.getByRole("button", { name: "Ohne Infos hochladen" }).click();
  await expect(page.getByText(/Geschafft/)).toBeVisible({ timeout: 15_000 });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/show$/);
}

// The control bar auto-hides; a mouse move reveals it before we interact.
async function revealControls(page: Page) {
  await page.mouse.move(640, 700);
}

test("presenter: start from a photo, navigate chronologically, toggle order + duration", async ({
  page,
}) => {
  // Unique comments so the admin grid locator is unambiguous across test runs
  // (the local D1 is shared and accumulates photos).
  const rid = Math.random().toString(36).slice(2, 8);
  const eins = `Slideshow-Eins-${rid}`;
  const zwei = `Slideshow-Zwei-${rid}`;

  // Two photos in known order (Eins uploaded before Zwei -> adjacent, newest).
  await uploadPhoto(page, eins);
  await uploadPhoto(page, zwei);

  await login(page);

  // Start the slideshow from a chosen photo by clicking it in the admin grid.
  await page.goto("/admin");
  await page.locator("li", { hasText: eins }).getByRole("link").click();
  await expect(page).toHaveURL(/\/show\?start=/);
  await expect(page.getByText(eins)).toBeVisible();

  // The meta line under the comment shows the uploader name; the Infos
  // toggle hides it (and brings it back) without touching the comment.
  await expect(page.getByText(/von Slideshow-Tester/)).toBeVisible();
  await revealControls(page);
  await page.getByRole("button", { name: "Infos: An" }).click();
  await expect(page.getByText(/von Slideshow-Tester/)).toBeHidden();
  await expect(page.getByText(eins)).toBeVisible();
  await revealControls(page);
  await page.getByRole("button", { name: "Infos: Aus" }).click();
  await expect(page.getByText(/von Slideshow-Tester/)).toBeVisible();

  // The uploader toggle hides only the "von …" part (here: the whole meta
  // line, since the test photo has no date/place); the comment stays.
  await revealControls(page);
  await page.getByRole("button", { name: "Uploader: An" }).click();
  await expect(page.getByText(/von Slideshow-Tester/)).toBeHidden();
  await expect(page.getByText(eins)).toBeVisible();
  await revealControls(page);
  await page.getByRole("button", { name: "Uploader: Aus" }).click();
  await expect(page.getByText(/von Slideshow-Tester/)).toBeVisible();

  // Freeze autoplay so assertions are stable.
  await revealControls(page);
  await page.getByLabel(/Dauer pro Foto/).fill("31");
  await expect(page.getByText("Dauer: ∞")).toBeVisible();

  // Chronological: next photo after Eins is Zwei.
  await revealControls(page);
  await page.getByRole("button", { name: "Weiter ›" }).click();
  await expect(page.getByText(zwei)).toBeVisible();

  // Back to Eins.
  await revealControls(page);
  await page.getByRole("button", { name: "‹ Zurück" }).click();
  await expect(page.getByText(eins)).toBeVisible();

  // Order toggle flips chronological <-> random.
  await revealControls(page);
  await page.getByRole("button", { name: "Reihenfolge: Chronologisch" }).click();
  await expect(page.getByRole("button", { name: "Reihenfolge: Zufällig" })).toBeVisible();

  // Duration is still settable.
  await revealControls(page);
  await page.getByLabel(/Dauer pro Foto/).fill("15");
  await expect(page.getByText("Dauer: 15s")).toBeVisible();
});
