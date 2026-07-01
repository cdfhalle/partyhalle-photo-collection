// HMAC-signed values and constant-time comparison, built on Web Crypto
// (available in both the Workers runtime and Node).

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64url(new Uint8Array(signature));
}

/** Length-independent constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

/** Sign a payload, producing "<payload>.<signature>". */
export async function sign(payload: string, secret: string): Promise<string> {
  return `${payload}.${await hmac(secret, payload)}`;
}

/** Verify a signed value and return the payload, or null if tampered. */
export async function verify(signed: string, secret: string): Promise<string | null> {
  const dot = signed.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = signed.slice(0, dot);
  const signature = signed.slice(dot + 1);
  const expected = await hmac(secret, payload);
  return timingSafeEqual(signature, expected) ? payload : null;
}

// Signed, expiring, scope-tagged cookies. The scope binds a cookie to its
// purpose so an "upload" cookie can never be replayed as a "session" cookie.

/** Issue a signed cookie value `<scope>:<expiry>` that expires after ttlMs. */
export async function makeScopedCookie(
  scope: string,
  secret: string,
  ttlMs: number,
): Promise<string> {
  return sign(`${scope}:${Date.now() + ttlMs}`, secret);
}

/** True if the cookie is a valid, unexpired cookie for exactly this scope. */
export async function verifyScopedCookie(
  scope: string,
  signed: string | undefined,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!signed) return false;
  const payload = await verify(signed, secret);
  if (!payload) return false;
  const [cookieScope, expiresAtStr] = payload.split(":");
  if (cookieScope !== scope) return false;
  const expiresAt = Number(expiresAtStr);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

// Public upload capability cookie (set after a valid upload token).
export const makeUploadCookie = (secret: string, ttlMs: number) =>
  makeScopedCookie("upload", secret, ttlMs);
export const verifyUploadCookie = (signed: string | undefined, secret: string, now?: number) =>
  verifyScopedCookie("upload", signed, secret, now);

// Authenticated session cookie (set after the shared password).
export const makeSessionCookie = (secret: string, ttlMs: number) =>
  makeScopedCookie("session", secret, ttlMs);
export const verifySessionCookie = (signed: string | undefined, secret: string, now?: number) =>
  verifyScopedCookie("session", signed, secret, now);

// "Human verified" cookie, set after a successful Turnstile challenge so the
// upload route accepts a whole session without re-challenging every file.
export const makeHumanCookie = (secret: string, ttlMs: number) =>
  makeScopedCookie("human", secret, ttlMs);
export const verifyHumanCookie = (signed: string | undefined, secret: string, now?: number) =>
  verifyScopedCookie("human", signed, secret, now);

/** Constant-time comparison of the public upload (capability) token. */
export function tokenMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  return timingSafeEqual(provided, expected);
}
