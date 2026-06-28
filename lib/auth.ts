import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cfEnv } from "./server";
import { verifySessionCookie } from "./tokens";

export const SESSION_COOKIE = "pa_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

/** True if the current request carries a valid session cookie. */
export async function isAuthenticated(): Promise<boolean> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionCookie(cookie, cfEnv().AUTH_SECRET);
}

/** Guard a protected page: redirect unauthenticated users to /login?next=<path>. */
export async function requireAuth(selfPath: string): Promise<void> {
  if (!(await isAuthenticated())) {
    redirect(`/login?next=${encodeURIComponent(selfPath)}`);
  }
}

/** Only allow internal, non-protocol-relative redirect targets (no open redirects). */
export function safeNext(value: string | undefined | null): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("://")
  ) {
    return value;
  }
  return "/show";
}
