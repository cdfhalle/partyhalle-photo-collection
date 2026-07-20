# PartyHalle

> [!IMPORTANT]
> **This project was almost entirely AI-generated.** The code, tests, docs, and
> commit history were produced by an AI coding assistant (Claude) under human
> direction. It ran a real event successfully, but review it yourself before
> relying on it — treat it as AI-generated output, not hand-audited software.

A little party photo app I built for my own get-together. Guests scan a QR code and
upload photos from their phones — no accounts, no app install. The photos play as a
live slideshow on a projector during the party, and afterwards become the material
for a Kahoot-style guessing game ("when/where was this taken, who's in it?").

It did its job at a party in July 2026 and is shared here in case it's fun or useful
for someone else's. The UI is in **German**, and a few bits are personal to my event
(e.g. the host's name in `app/upload/UploadForm.tsx`) — swap those out for your own.

## Features

- **`/upload`** — public upload page, reached only via an unguessable QR link.
  Multi-photo upload with per-photo comment and optional uploader name,
  client-side HEIC conversion, EXIF date/GPS capture (with reverse geocoding),
  tap-to-tag people, drafts that survive reloads, optional Cloudflare Turnstile
  bot check.
- **`/show`** — password-protected fullscreen slideshow. Live-updates as photos
  arrive, with toggleable metadata overlays (date, place, people, uploader).
  Copes with flaky venue Wi-Fi without dropping to a black screen.
- **`/admin`** — moderation grid: rotate, edit metadata, tag people, delete,
  download all originals as a streamed ZIP. Plus a QR-code page for handing out
  the upload link and a feedback inbox.
- **`/quiz`** — live multiplayer quiz on the collected photos. Guests join with a
  PIN + nickname; the host drives rounds from a projector presenter view
  (`/admin/quiz/present`) with countdowns, live answer counts, reveal, and a
  Kahoot-style leaderboard. Questions are hand-curated in `/admin/quiz` from the
  photos' captured metadata.
- **"?" help button** — guests can send a help request; optionally pushed to the
  host's phone via [ntfy](https://ntfy.sh).

## Stack

Single-vendor Cloudflare setup, designed to run for ~a month at ~$0–5 total:

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) on Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare) |
| Photos | R2 (EU jurisdiction), on-the-fly resizing via Cloudflare Images |
| Metadata | D1 (SQLite), migrations in `migrations/` |
| Live quiz | Separate Worker (`game/`) with a `GameRoom` Durable Object on the Agents SDK |
| Auth | One shared password (host) + capability-URL upload token (guests) |
| Styling | Tailwind CSS |

See [PLAN.md](PLAN.md) for the fuller write-up (architecture, data model, and the
thinking behind keeping public uploads from being abused) and [DEPLOY.md](DEPLOY.md)
for setup.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # local secrets; defaults work out of the box
npm run db:migrate:local         # create the local D1 schema
npm run dev                      # app on http://localhost:3000
```

Local Cloudflare bindings (D1/R2/Images) are emulated by Wrangler through
`initOpenNextCloudflareForDev()` — no Cloudflare account needed for dev.

For the live quiz, run the game Worker in a second terminal:

```bash
npm run dev:game                 # Durable Object Worker on http://localhost:8787
```

Log in at `/login` with `APP_PASSWORD` from `.dev.vars` (default `party-admin`).
The guest upload link is shown at `/admin/qr`.

Note: Next 16 allows only **one** dev server per project — don't start a second
`npm run dev`.

## Tests

```bash
npm test          # unit tests (Vitest + @cloudflare/vitest-pool-workers)
npm run test:e2e  # Playwright E2E; reuses a running dev server on :3000 or starts one
```

## Deployment

See [DEPLOY.md](DEPLOY.md). Short version: create an R2 bucket and D1 database,
put the ids in `wrangler.jsonc`, set secrets with `wrangler secret put`, then
`npm run db:migrate:remote && npm run deploy` (and `npm run deploy:game` for the
quiz Worker, pointing the app's `GAME_HOST` var at it).

## License

[MIT](LICENSE)
