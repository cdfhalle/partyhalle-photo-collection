import { NextRequest, NextResponse } from "next/server";
import { cfEnv } from "@/lib/server";
import { tokenMatches, makeUploadCookie } from "@/lib/tokens";

export const dynamic = "force-dynamic";

const COOKIE = "pa_upload";
// Covers the ~2-week public window plus buffer; the upload route also enforces
// the configured open/close window independently.
const TTL_MS = 1000 * 60 * 60 * 24 * 21;

// Capability entry point. The QR / invite link points here with ?t=<token>.
// A valid token sets the signed upload cookie; then we redirect to /upload so
// the token leaves the address bar.
export async function GET(req: NextRequest) {
  const env = cfEnv();
  const provided = req.nextUrl.searchParams.get("t") ?? undefined;

  const res = NextResponse.redirect(new URL("/upload", req.url));
  if (tokenMatches(provided, env.UPLOAD_TOKEN)) {
    const cookie = await makeUploadCookie(env.AUTH_SECRET, TTL_MS);
    res.cookies.set(COOKIE, cookie, {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(TTL_MS / 1000),
    });
  }
  return res;
}
