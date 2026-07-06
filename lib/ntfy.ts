// Push notification to the host's phone via ntfy (https://docs.ntfy.sh) when a
// guest sends a help request. Gated: when no NTFY_URL is configured (local dev
// / tests) it is disabled and silently does nothing.
//
// NTFY_URL is the full topic URL (e.g. https://ntfy.sh/<random-topic>). The
// topic name is the only access control ntfy's free tier has, so it is treated
// as a secret (wrangler secret put NTFY_URL).
//
// NTFY_TOKEN (an ntfy account access token) is required in practice on
// ntfy.sh: anonymous publishes are rate-limited per source IP, and Cloudflare
// Workers share egress IPs with everyone else, so the anonymous quota is
// permanently exhausted (HTTP 429). Authenticated publishes count against the
// account instead.

/** True when ntfy notifications are configured (a topic URL is present). */
export function ntfyEnabled(url: string | undefined | null): boolean {
  return typeof url === "string" && url.length > 0;
}

export interface FeedbackNotification {
  message: string;
  name?: string | null;
  email?: string | null;
  page?: string | null;
}

/**
 * Post a new-feedback notification to the ntfy topic. Never throws — a broken
 * notification must not fail the guest's submission. Returns true only when
 * ntfy is enabled and accepted the message.
 */
export async function notifyFeedback(
  url: string | undefined | null,
  input: FeedbackNotification,
  token?: string | null,
): Promise<boolean> {
  if (!ntfyEnabled(url)) return false;

  const meta = [input.name, input.email, input.page].filter(Boolean).join(" · ");
  const body = meta ? `${input.message}\n\n— ${meta}` : input.message;

  // Header values must stay ASCII; anything user-written goes in the body.
  const headers: Record<string, string> = {
    Title: "PartyHalle: neue Hilfe-Anfrage",
    Tags: "sos",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(url as string, { method: "POST", headers, body });
    // Failures are deliberately non-fatal but must stay visible in `wrangler tail`.
    if (!res.ok) {
      console.warn(
        `[ntfy] publish failed (auth: ${Boolean(token)}): HTTP ${res.status} ${await res.text().catch(() => "")}`,
      );
    }
    return res.ok;
  } catch (err) {
    console.warn("[ntfy] publish error:", err);
    return false;
  }
}
