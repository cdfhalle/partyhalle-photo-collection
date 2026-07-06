// Guest help requests / error reports. Pure D1 logic (no OpenNext import) so it
// stays unit-testable in the Workers test pool, like lib/photos.ts.

export const MAX_FEEDBACK_MESSAGE = 1000;
export const MAX_FEEDBACK_NAME = 80;
export const MAX_FEEDBACK_EMAIL = 254; // RFC 5321 address length limit
export const MAX_FEEDBACK_PAGE = 200;

export interface FeedbackRow {
  id: string;
  message: string;
  name: string | null;
  email: string | null;
  page: string | null;
  user_agent: string | null;
  session_id: string | null;
  created_at: number;
  resolved_at: number | null;
}

export interface NewFeedback {
  message: string;
  name?: string | null;
  /** Contact email for a reply — kept as typed, see cleanFeedbackEmail. */
  email?: string | null;
  /** Path of the page the report was sent from (e.g. "/upload"). */
  page?: string | null;
  userAgent?: string | null;
  /** Per-device upload session (see lib/tokens.ts SID_COOKIE); scopes rate limits. */
  sessionId?: string | null;
}

/** Trimmed, length-capped message — or null when empty/not a string. */
export function cleanFeedbackMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_FEEDBACK_MESSAGE);
  return trimmed.length ? trimmed : null;
}

/** Trimmed, length-capped name — or null when empty/not a string. */
export function cleanFeedbackName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_FEEDBACK_NAME);
  return trimmed.length ? trimmed : null;
}

/**
 * Trimmed, length-capped email — or null when empty/not a string. Deliberately
 * NOT validated for shape: a typo'd address ("anna(at)gmx.de") is still useful
 * to a human reader, so nothing a guest typed gets silently dropped. Use
 * looksLikeEmail() before rendering it as a mailto link.
 */
export function cleanFeedbackEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_FEEDBACK_EMAIL);
  return trimmed.length ? trimmed : null;
}

/** Loose plausibility check — gates mailto links, never guest input. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Only internal paths ("/..."), so the stored page can't smuggle foreign URLs. */
export function cleanFeedbackPage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_FEEDBACK_PAGE);
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) return null;
  return trimmed;
}

/** Store a new report. Returns its id. */
export async function createFeedback(
  env: { DB: D1Database },
  input: NewFeedback,
): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO feedback (id, message, name, email, page, user_agent, session_id, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  )
    .bind(
      id,
      input.message,
      input.name ?? null,
      input.email ?? null,
      input.page ?? null,
      input.userAgent ?? null,
      input.sessionId ?? null,
      Date.now(),
    )
    .run();
  return id;
}

/** All reports for the admin view: open ones first, newest first within each group. */
export async function listFeedback(env: { DB: D1Database }): Promise<FeedbackRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, message, name, email, page, user_agent, session_id, created_at, resolved_at
     FROM feedback ORDER BY (resolved_at IS NOT NULL), created_at DESC`,
  ).all<FeedbackRow>();
  return results ?? [];
}

/** Number of unresolved reports (for the admin header badge). */
export async function countOpenFeedback(env: { DB: D1Database }): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM feedback WHERE resolved_at IS NULL",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Total number of stored reports (hard backstop against spam filling D1). */
export async function countFeedback(env: { DB: D1Database }): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM feedback").first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Reports created since `since` — across everyone, or scoped to one device's
 * session when `sessionId` is given. Drives the submit rate limits.
 */
export async function countFeedbackSince(
  env: { DB: D1Database },
  since: number,
  sessionId?: string,
): Promise<number> {
  const stmt = sessionId
    ? env.DB.prepare(
        "SELECT COUNT(*) AS n FROM feedback WHERE created_at > ? AND session_id = ?",
      ).bind(since, sessionId)
    : env.DB.prepare("SELECT COUNT(*) AS n FROM feedback WHERE created_at > ?").bind(since);
  const row = await stmt.first<{ n: number }>();
  return row?.n ?? 0;
}

/** Mark a report resolved (or open again). Returns false if the id is unknown. */
export async function setFeedbackResolved(
  env: { DB: D1Database },
  id: string,
  resolved: boolean,
): Promise<boolean> {
  const result = await env.DB.prepare("UPDATE feedback SET resolved_at = ? WHERE id = ?")
    .bind(resolved ? Date.now() : null, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Delete a report. Returns false if the id is unknown. */
export async function deleteFeedback(env: { DB: D1Database }, id: string): Promise<boolean> {
  const result = await env.DB.prepare("DELETE FROM feedback WHERE id = ?").bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}
