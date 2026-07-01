import { NextRequest, NextResponse } from "next/server";
import { cfEnv } from "@/lib/server";
import { verifyUploadCookie, makeHumanCookie } from "@/lib/tokens";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const UPLOAD_COOKIE = "pa_upload";
const HUMAN_COOKIE = "pa_human";
const HUMAN_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

// Verifies a Turnstile token server-side and, on success, sets a signed
// "human" cookie so the whole upload session is trusted (no re-challenge per file).
export async function POST(req: NextRequest) {
  const env = cfEnv();

  // Must already hold the capability cookie (came through the QR/token gate).
  if (!(await verifyUploadCookie(req.cookies.get(UPLOAD_COOKIE)?.value, env.AUTH_SECRET))) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  let token: string | null = null;
  try {
    const form = await req.formData();
    const value = form.get("token");
    token = typeof value === "string" ? value : null;
  } catch {
    // no body / not multipart — treated as a missing token below
  }

  const ok = await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, req.headers.get("cf-connecting-ip"));
  if (!ok) return NextResponse.json({ error: "turnstile" }, { status: 403 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(HUMAN_COOKIE, await makeHumanCookie(env.AUTH_SECRET, HUMAN_TTL_MS), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(HUMAN_TTL_MS / 1000),
  });
  return res;
}
