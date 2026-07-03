import { NextRequest, NextResponse } from "next/server";
import { cfEnv } from "@/lib/server";
import { verifyUploadCookie, verifySidCookie, SID_COOKIE } from "@/lib/tokens";
import { listSessionPhotos } from "@/lib/photos";

export const dynamic = "force-dynamic";

const COOKIE = "pa_upload";

// The photos this device/browser already uploaded (id + comment), so the upload
// page can restore its "✓ Hochgeladen" list after a reload. Scoped to the
// signed per-device session id — one session can never list another's photos.
export async function GET(req: NextRequest) {
  const env = cfEnv();

  if (!(await verifyUploadCookie(req.cookies.get(COOKIE)?.value, env.AUTH_SECRET))) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const sid = await verifySidCookie(req.cookies.get(SID_COOKIE)?.value, env.AUTH_SECRET);
  // No sid yet (first visit, or pre-sid cookie): nothing attributable to show.
  const photos = sid ? await listSessionPhotos(env, sid) : [];
  return NextResponse.json({ photos });
}
