// Server-side Cloudflare Turnstile verification. Gated: when no secret is
// configured (local dev / tests) it is disabled and everything passes through.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** True when Turnstile is configured (a secret key is present). */
export function turnstileEnabled(secret: string | undefined | null): boolean {
  return typeof secret === "string" && secret.length > 0;
}

/**
 * Verify a Turnstile token against Cloudflare's siteverify API. Returns true
 * when Turnstile is disabled (no secret), false when enabled but the token is
 * missing/invalid or the request fails.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  secret: string | undefined | null,
  remoteIp?: string | null,
): Promise<boolean> {
  if (!turnstileEnabled(secret)) return true;
  if (!token) return false;

  const body = new FormData();
  body.set("secret", secret as string);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(SITEVERIFY_URL, { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
