# Deploying PartyHalle to Cloudflare

These steps run against **your** Cloudflare account (interactive login + resource
creation), so they're done by you (or together). Everything is on the free
`*.workers.dev` domain to start; a custom domain can come later.

## 1. Prerequisites

```bash
npx wrangler login          # opens the browser for OAuth
npx wrangler whoami         # confirms the account
```

You'll also need **R2 enabled** on the account (Dashboard → R2 → enable; it asks
for a payment method but the volume here is within/near the free tier).

## 2. Create the storage + database

```bash
# Photo storage, with EU data residency:
npx wrangler r2 bucket create partyhalle-photos --jurisdiction eu

# Metadata database:
npx wrangler d1 create partyhalle-db
```

Then edit **`wrangler.jsonc`**:
- In `r2_buckets`, add `"jurisdiction": "eu"` to the `PHOTOS_BUCKET` entry.
- In `d1_databases`, replace the placeholder `database_id` with the id printed by
  `wrangler d1 create`.

## 3. Secrets

Generate strong random values for the token and signing secret:

```bash
npx wrangler secret put APP_PASSWORD     # the password you'll type at /login
npx wrangler secret put UPLOAD_TOKEN     # e.g. `openssl rand -hex 16`
npx wrangler secret put AUTH_SECRET      # e.g. `openssl rand -hex 32`
```

Optional — push a phone notification (via the [ntfy](https://ntfy.sh) app) for
every guest help request sent through the "?" button:

```bash
# Full topic URL; the random topic name is the only access control, keep it secret.
npx wrangler secret put NTFY_URL         # e.g. https://ntfy.sh/partyhalle-$(openssl rand -hex 8)
# Access token from an ntfy.sh account (Account → Access tokens). Required:
# anonymous publishes from Workers hit ntfy.sh's shared per-IP quota (HTTP 429).
npx wrangler secret put NTFY_TOKEN
```

Subscribe to the same topic in the ntfy app on your phone. Leaving the secrets
unset just disables the pings — requests still land in `/admin/feedback`.

## 4. Upload window + limits

Edit the `vars` in `wrangler.jsonc` (these are not secret):
- `UPLOAD_OPENS_AT` / `UPLOAD_CLOSES_AT` — ISO timestamps, e.g.
  `"2026-07-01T00:00:00Z"` … `"2026-07-16T00:00:00Z"`. Empty = unbounded.
- `UPLOAD_GLOBAL_CAP` — max total photos (cost/abuse backstop).
- `UPLOAD_MAX_BYTES` — per-file size cap.

## 5. Migrate the production database + deploy

```bash
npm run db:migrate:remote        # creates the photos table in remote D1
npm run deploy                   # opennextjs-cloudflare build && deploy
```

`deploy` prints your URL, e.g. `https://partyhalle.<account>.workers.dev`.

## 6. Hand out the QR code

Log in at `…/login`, then open **`/admin/qr`** — it shows the QR encoding the
production capability URL (`/api/upload/enter?t=<token>`). Print it or display it.
The same admin page lists photos, downloads the ZIP, and deletes photos.

## 7. Abuse prevention for the public window

Already enforced in the app: unguessable capability token, time-boxed upload
window, global photo cap, server-side magic-byte validation, and no public gallery.

Recommended additions before opening uploads publicly:
- **Cloudflare Turnstile** (app-level bot check; works on `*.workers.dev`).
  Not yet wired — see "Turnstile (follow-up)" below. This is the main extra bot
  defense available without a custom domain.
- **WAF / Bot Fight Mode / rate-limiting rules** require a **custom domain**
  (a zone you control); they do not apply to `*.workers.dev`.

### Turnstile (follow-up)
To enable: create a Turnstile widget in the Cloudflare dashboard, then add the
verify step. It needs `TURNSTILE_SITE_KEY` (passed to the upload form) and
`TURNSTILE_SECRET_KEY` (secret, used server-side to verify before storing). Because
uploads are multi-file, the clean design verifies **once per session** (a short
challenge on the upload page → a signed "human" cookie the upload route checks).

## 8. After the event

1. Download everything: `/admin` → **Alle herunterladen (ZIP)**.
2. Tear down the resources:
   ```bash
   npx wrangler delete                                  # the Worker
   npx wrangler d1 delete partyhalle-db
   npx wrangler r2 bucket delete partyhalle-photos --jurisdiction eu
   ```
   (Or delete them from the dashboard.)

## Notes
- Image resizing for the grid/slideshow uses the Cloudflare **Images** binding
  (transformations). If transforms fail, the app falls back to serving originals;
  enable Images in the dashboard if you want the optimized sizes.
- `next build` is run for you by `npm run deploy`; you can dry-run the production
  build locally with `npx opennextjs-cloudflare build`.
