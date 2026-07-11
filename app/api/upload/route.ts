import { NextRequest, NextResponse } from "next/server";
import { cfEnv } from "@/lib/server";
import {
  verifyUploadCookie,
  verifyHumanCookie,
  verifySidCookie,
  makeSidCookie,
  SID_COOKIE,
} from "@/lib/tokens";
import { turnstileEnabled } from "@/lib/turnstile";
import { isUploadOpen } from "@/lib/uploadWindow";
import { readConfig } from "@/lib/config";
import { validateImage } from "@/lib/validation";
import { storePhoto, countPhotos } from "@/lib/photos";
import {
  cleanLocationName,
  parseLat,
  parseLng,
  parseSource,
  parseTakenAt,
  sanitizePeople,
} from "@/lib/metadata";

export const dynamic = "force-dynamic";

const COOKIE = "pa_upload";
const MAX_COMMENT = 280;
const MAX_NAME = 80;
// Matches the upload cookie TTL set by /api/upload/enter.
const SID_TTL_MS = 1000 * 60 * 60 * 24 * 21;

export async function POST(req: NextRequest) {
  const env = cfEnv();

  // 1. Capability cookie (set by /api/upload/enter after a valid token).
  const cookie = req.cookies.get(COOKIE)?.value;
  if (!(await verifyUploadCookie(cookie, env.AUTH_SECRET))) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  // When Turnstile is enabled, require the per-session "human" cookie
  // (set by /api/upload/verify) — so a bot with the capability cookie can't
  // POST here directly without passing the challenge.
  if (turnstileEnabled(env.TURNSTILE_SECRET_KEY)) {
    if (!(await verifyHumanCookie(req.cookies.get("pa_human")?.value, env.AUTH_SECRET))) {
      return NextResponse.json({ error: "turnstile" }, { status: 403 });
    }
  }

  const config = readConfig(env as unknown as Record<string, unknown>);

  // 2. Upload window.
  if (!isUploadOpen(Date.now(), config.uploadOpensAt, config.uploadClosesAt)) {
    return NextResponse.json({ error: "closed" }, { status: 403 });
  }

  // 3. Global cap (hard backstop on cost/abuse).
  if ((await countPhotos(env)) >= config.uploadGlobalCap) {
    return NextResponse.json({ error: "full" }, { status: 429 });
  }

  // 4. Parse the multipart body.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  // 5. Validate by magic bytes + size (never trust the declared type).
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = validateImage(bytes, config.uploadMaxBytes);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  // 6. Per-device session id (tags the photo so this device can re-list its own
  // uploads after a reload). Devices that entered before the sid existed get one
  // minted here, on their first successful upload.
  const existingSid = await verifySidCookie(req.cookies.get(SID_COOKIE)?.value, env.AUTH_SECRET);
  const sid = existingSid ?? crypto.randomUUID();

  // 7. Store original in R2 + metadata in D1. The quiz metadata (when/where/who)
  // is optional and fully validated/clamped — client input is never trusted.
  const takenAtRaw = form.get("takenAt");
  const id = await storePhoto(env, {
    bytes,
    contentType: result.contentType,
    comment: cleanField(form.get("comment"), MAX_COMMENT),
    name: cleanField(form.get("name"), MAX_NAME),
    sessionId: sid,
    takenAt: typeof takenAtRaw === "string" ? parseTakenAt(takenAtRaw) : null,
    takenAtSource: parseSource(form.get("takenAtSource")),
    locationName: cleanLocationName(form.get("locationName")),
    locationSource: parseSource(form.get("locationSource")),
    lat: parseLat(form.get("lat")),
    lng: parseLng(form.get("lng")),
    people: sanitizePeople(form.get("people")),
  });

  const res = NextResponse.json({ id }, { status: 201 });
  if (!existingSid) {
    res.cookies.set(SID_COOKIE, await makeSidCookie(sid, env.AUTH_SECRET, SID_TTL_MS), {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SID_TTL_MS / 1000),
    });
  }
  return res;
}

function cleanField(value: FormDataEntryValue | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}
