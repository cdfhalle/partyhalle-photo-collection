# PartyHalle — Project Plan

A minimal web app for a party: guests upload photos (with optional comments) via a QR
code, the collection is shown as a live slideshow on a projector, and an admin can
download the full collection. Built on **Next.js + Cloudflare** as a single-vendor,
EU-resident, low-cost stack.

---

## 1. Goals & scope

### In scope
- **Upload page** (`/upload`) — public, reached via QR code. Pick photos from phone or
  computer, optionally add a short comment and an optional name per photo. No login.
- **Slideshow page** (`/show`) — password-protected. Fullscreen, auto-advancing,
  **live-updating** as new photos arrive during the event. Shows the comment.
- **Admin page** (`/admin`) — password-protected. Grid of all photos with per-photo
  delete (moderation) and a **Download all (ZIP)** of full-resolution originals.

### Out of scope (for now)
- The "guess who uploaded" **quiz** — but we capture the uploader's name at upload time
  and store it, so the quiz is a pure add-on later with no schema rework.
- User accounts / multi-tenant. A single shared password is the whole auth model.
- Post-event data deletion tooling — the admin downloads the ZIP and the Cloudflare
  project is deleted manually after the party.

### Non-functional requirements
- **Minimalist, modern** visual design.
- **Accessible & intuitive** — several older guests will use the upload page on phones.
- **EU data residency** and reasonable security, since photos of people are personal data.
- **Short-lived** — runs for roughly the event window (~1 month), then torn down.
- **Public upload window opens ~2 weeks before the event** so guests can upload photos
  from their computers ahead of time. This wider exposure is hardened per §6.
- **UI language: German.**

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Single full-stack repo; route handlers for the API |
| Hosting | **Cloudflare Workers** via the **OpenNext** adapter (`@opennextjs/cloudflare`) | GA since Feb 2026; preferred way to run Next.js on Cloudflare |
| Photo storage | **Cloudflare R2** | Full-res originals; zero egress; EU jurisdiction |
| Metadata DB | **Cloudflare D1** (SQLite) | One small table; free tier covers it |
| Image resize for projector | **Cloudflare Images** transformations on R2 originals | On-the-fly resize; originals preserved for download |
| Styling | **Tailwind CSS** | Fast, clean, high-contrast UI |
| ZIP download | **`client-zip`** | Streams a ZIP straight from R2 in the Worker (no buffering) |
| Abuse prevention | **Cloudflare Turnstile** + WAF rate limiting / Bot Fight Mode | Human check + per-IP limits for the public upload window |
| Tests | **Playwright** (E2E) + **Vitest** with `@cloudflare/vitest-pool-workers` (unit) | See §8 |
| Local dev | **Wrangler / Miniflare** | Local D1 + R2 emulation |

Single vendor (Cloudflare) for hosting, storage, DB, image transforms, CDN, and DNS.
Estimated cost: **~$0–5/month** (R2 ~free under 10 GB, D1 free tier, Workers free tier or
$5/mo Paid for headroom, Images transforms free under 5,000/mo).

---

## 3. Architecture & data flow

Phone photos can be several MB, so files go **straight from the browser to R2** via a
short-lived presigned URL — the file never streams through the Worker:

**Upload**
1. Browser → `POST /api/upload-url` with `{ contentType, size }`.
2. Worker validates type/size, generates a **presigned R2 PUT URL** (R2 S3 API, signed
   with `aws4fetch`), returns `{ uploadUrl, objectKey }`.
3. Browser `PUT`s the file bytes directly to R2.
4. Browser → `POST /api/photos` with `{ objectKey, comment, name }`; Worker inserts the
   metadata row into D1.

**Slideshow display**
- `/show` polls `GET /api/photos` (~every 10 s) for the current list.
- Each `<img>` points at an auth-gated Worker route that serves the R2 original **resized
  to ~1920px** via the Cloudflare Images binding (fast on the projector; original untouched).

**Admin download**
- `GET /api/admin/download` lists all R2 objects and streams a ZIP of the
  **full-resolution originals** via `client-zip`.

The R2 S3 credentials and the Images binding live server-side only; the browser never gets
write access beyond a single scoped, expiring presigned URL.

---

## 4. Data model (D1)

```sql
CREATE TABLE photos (
  id            TEXT PRIMARY KEY,        -- uuid
  object_key    TEXT NOT NULL UNIQUE,    -- R2 key for the original
  comment       TEXT,                    -- optional, shown in slideshow
  uploader_name TEXT,                    -- optional, captured for the future quiz (hidden in slideshow)
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL         -- epoch ms
);

CREATE INDEX idx_photos_created_at ON photos (created_at);
```

`uploader_name` is intentionally **not** shown in the slideshow yet, preserving the
"guess who" quiz option.

---

## 5. Pages & UX

### `/upload` (public)
- One large, obvious **"Add photos"** button (multi-select; on phones can open the camera).
- Thumbnail previews of selected files.
- Optional **comment** and optional **name** field.
- One large **"Upload"** button with a clear progress + success state ("Thanks! Your
  photos are in 🎉"), and an easy "add more".
- Designed for older guests: large text, high contrast, big tap targets (≥44px), minimal
  steps, plain language, no jargon.

### `/show` (password-gated)
- Fullscreen, auto-advance with **adjustable slide duration changeable live** via an
  on-screen control (default ~8 s); gentle fade transitions.
- **Manual slide switching**: on-screen prev/next buttons plus keyboard (← → = prev/next,
  space = pause/resume). The operator can drive the slideshow by hand at any time.
- Comment overlaid; uploader name hidden.
- Live-updating: new uploads fold into the rotation within ~10 s.

### `/admin` (password-gated)
- Responsive grid of thumbnails (small transform), each showing its comment and uploader
  name, with a **delete** button (moderation for the open upload endpoint).
- **Download all (ZIP)** button (full-res originals).
- Simple count of photos.

### `/login`
- Single password field → sets the session cookie → redirects to the requested page.

---

## 6. Security & privacy

- **Auth:** one shared password (`APP_PASSWORD` secret). On success, set a signed
  (HMAC-SHA256 with `AUTH_SECRET`) **HttpOnly, Secure, SameSite=Lax** session cookie with
  an expiry. Next.js **middleware** protects `/show`, `/admin`, and the image/admin API
  routes; unauthenticated requests redirect to `/login`.
- **Open upload, hardened:** see the dedicated public-window design below.
- **Presigned URLs** are short-lived and scoped to a single object key.
- **EU residency:** R2 bucket pinned to EU jurisdiction; D1 in an EU-region account.
- **Transport:** HTTPS everywhere (automatic on Cloudflare).
- **Teardown:** after the event, download the ZIP and delete the Cloudflare project,
  removing all personal data. (No in-app "wipe everything" button, by request.)

### Public upload window (open ~2 weeks before the event)

Opening uploads to the public ahead of time widens the attack surface, so the upload path
is defended in layers. Crucially, **there is no public gallery** — uploaders never see
others' photos; only the gated `/admin` and the event slideshow display images. So even a
malicious upload is never shown publicly, and the admin reviews/deletes it before it can be
projected. On top of that:

1. **Capability URL** — the QR and invite link carry a long random token (`UPLOAD_TOKEN`);
   `/upload` returns 404 without it. The token is set as a cookie on first visit. Zero
   friction (the QR/link carries it); stops random discovery and drive-by bots.
2. **Cloudflare Turnstile** — invisible/low-friction human check on the form, verified
   server-side **before** a presigned URL is issued. Blocks automated abuse if the link
   leaks.
3. **Edge rate limiting + Bot Fight Mode** — Cloudflare WAF rate-limit rules cap requests
   per IP on the upload routes; Bot Fight Mode blocks known bots. No user friction.
4. **Time-boxed window** — the server enforces `UPLOAD_OPENS_AT` / `UPLOAD_CLOSES_AT`, so a
   leaked link does nothing outside the ~2-week window.
5. **Strict server-side validation** — verify the uploaded bytes are really an image by
   **magic-byte sniff** (not just the client-declared type), enforce a per-file size cap and
   a content-type allowlist; reject otherwise.
6. **Quotas / caps** — soft per-session and per-IP photo counts, plus a **global storage /
   photo-count cap** as a hard backstop so cost cannot be run up.
7. **Moderation** — all uploads land in the `/admin` grid with per-photo delete; an optional
   `approved` gate can require admin approval before a photo enters the slideshow.

*Optional upgrade:* issue **per-guest tokens** in invitations instead of one shared token —
enables revoking an individual link and auto-attributing uploads for the future quiz. Adds
distribution work; default is a single shared token to match the single-QR plan.

### Secrets & bindings (Wrangler)
- Secrets: `APP_PASSWORD`, `AUTH_SECRET`, `UPLOAD_TOKEN`, `TURNSTILE_SECRET_KEY`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`.
- Public vars: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- Bindings: `DB` (D1), `PHOTOS_BUCKET` (R2), `IMAGES` (Cloudflare Images).
- Config: `UPLOAD_MAX_BYTES`, allowed content types, per-session/per-IP upload limits,
  global storage cap, `UPLOAD_OPENS_AT`, `UPLOAD_CLOSES_AT`, default slide duration.

---

## 7. Accessibility

- Target WCAG AA contrast; large base font; scalable layout.
- Big tap targets and a single clear primary action per screen.
- Full keyboard operability; visible focus states; proper labels/alt text and ARIA where
  needed.
- Tested on mobile Safari and Chrome (the realistic guest devices).
- **EXIF orientation** normalized on display (handled by Cloudflare Images); **HEIC**
  iPhone uploads accepted and transcoded for display, originals preserved — both covered
  by tests.

---

## 8. Testing strategy (test-driven)

Each build phase is gated by its tests, written first.

- **Playwright (E2E)** — critical user journeys:
  - Upload: select an image → submit → success; metadata persisted.
  - Auth gate: `/show` and `/admin` redirect to `/login` without a cookie; correct
    password grants access; wrong password is rejected.
  - Slideshow renders uploaded photos and picks up a new upload on the next poll.
  - Admin: grid lists photos; per-photo delete removes one; download returns a ZIP.
- **Vitest** (`@cloudflare/vitest-pool-workers`) — pure Worker logic:
  - Upload validation (content type, size limits, magic-byte image sniff).
  - Presigned-URL generation.
  - Session-cookie sign/verify.
  - Abuse controls: capability-token gate, upload-window open/closed, quota enforcement,
    Turnstile verification (mocked).
- **Hermetic:** all tests run against **local D1 + R2** via Wrangler/Miniflare; production
  is never touched. Seed and reset state between tests.

---

## 9. Build phases

> Phase 0 includes `git init` (the directory is not yet a repo).

| Phase | Deliverable | Gated by |
|---|---|---|
| **0. Scaffold** | Next.js + TS + Tailwind; OpenNext + Wrangler config; D1/R2/Images bindings; Playwright + Vitest harness; `git init` | Harness runs green on a trivial test |
| **1. Upload** | `/upload` UI + presigned-URL flow + D1 metadata save; capability-token gate, Turnstile, upload-window check, magic-byte validation, quotas | Upload E2E + validation/abuse units |
| **2. Auth** | `/login`, signed cookie, middleware protecting `/show` & `/admin` & APIs | Auth-gate E2E + cookie units |
| **3. Admin** | `/admin` grid + per-photo delete + ZIP download | Admin E2E |
| **4. Slideshow** | `/show` live, auto-advancing, Images-resized display | Slideshow E2E |
| **5. Polish & deploy** | Accessibility pass, QR code generation, deploy to Cloudflare (EU) | Manual a11y/device check |

---

## 10. Deployment

- `wrangler deploy` via the OpenNext build (`npx opennextjs-cloudflare build`).
- Create R2 bucket (EU jurisdiction), D1 database, and bind both; set secrets.
- Provision a memorable domain/subdomain for the QR target; generate the QR pointing at
  `/upload`.
- After the event: download the ZIP, then delete the Cloudflare project/resources.

---

## 11. Cost summary

| Item | Cost |
|---|---|
| R2 storage (~5 GB) | Free (under 10 GB) → pennies |
| R2 egress | $0 |
| D1 | Free tier |
| Workers | Free tier, or $5/mo Paid for headroom |
| Cloudflare Images transforms (~1,000/mo) | Free (under 5,000/mo) |
| **Total** | **~$0–5/month**, single vendor, all EU |

---

## 12. Decisions

Confirmed:
1. **UI language: German.**
2. **Slide duration is adjustable live** in the slideshow, with **manual prev/next**
   controls (default ~8 s). Per-session upload limit defaults to ~20 photos.
3. **Domain:** start on the free Cloudflare `*.workers.dev` subdomain; can move to a custom
   domain later.
4. **Public upload window** opens ~2 weeks before the event, hardened per §6.

Still open (optional, non-blocking):
- **Per-guest tokens** vs a single shared upload token (default: single shared token).
- Optional **admin-approval gate** before photos enter the slideshow (default: off; rely on
  per-photo delete).

---

## 13. Future: the quiz

The data model already stores `uploader_name`. A later `/quiz` mode can show a photo and
ask guests to guess the uploader from a list of names — no migration needed, just a new
page and a scoring mechanism.
