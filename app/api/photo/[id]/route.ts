import { NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { getPhoto } from "@/lib/photos";
import { verifyUploadCookie, verifySidCookie, SID_COOKIE } from "@/lib/tokens";

export const dynamic = "force-dynamic";

// A photo original is write-once (UUID key, never edited) and the resize is
// deterministic, so `id + width` maps to an immutable image. Cache it hard in
// the browser so slideshow loops and admin re-visits never re-hit the worker
// (nor re-run an Images transformation). Kept `private` because the bytes are
// auth-gated — the edge won't cache them, but a repeat viewer's browser will.
const IMMUTABLE = "private, max-age=31536000, immutable";

// Serves a stored photo. Two viewer classes:
//  - authenticated (shared password): any photo — slideshow and admin grid.
//  - upload guest (capability + per-device sid cookie): ONLY photos tagged with
//    exactly their own session id, so the upload page can show its restored
//    "already uploaded" thumbnails. A foreign or pre-session photo (NULL
//    session_id) is a 404 — indistinguishable from a nonexistent id.
// With ?w=<px> it resizes via the Cloudflare Images binding; if that binding
// isn't available (e.g. local dev), it falls back to the original.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = cfEnv();

  let sid: string | null = null;
  if (!(await isAuthenticated())) {
    const canUpload = await verifyUploadCookie(req.cookies.get("pa_upload")?.value, env.AUTH_SECRET);
    sid = canUpload
      ? await verifySidCookie(req.cookies.get(SID_COOKIE)?.value, env.AUTH_SECRET)
      : null;
    if (!sid) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const { id } = await ctx.params;
  const photo = await getPhoto(env, id);
  if (!photo) return new Response("Not found", { status: 404 });
  // Guest viewers: strict session ownership.
  if (sid !== null && photo.session_id !== sid) {
    return new Response("Not found", { status: 404 });
  }

  const object = await env.PHOTOS_BUCKET.get(photo.object_key);
  if (!object) return new Response("Not found", { status: 404 });

  const contentType = object.httpMetadata?.contentType ?? photo.content_type;
  const width = Number(req.nextUrl.searchParams.get("w") ?? 0);

  if (width > 0 && env.IMAGES) {
    try {
      const result = await env.IMAGES.input(object.body)
        .transform({ width })
        .output({ format: "image/webp" });
      // Wrap the transformed stream in a standard Response — the binding's own
      // result.response() is a foreign Response class Next.js rejects.
      return new Response(result.image(), {
        headers: { "content-type": "image/webp", "cache-control": IMMUTABLE },
      });
    } catch {
      // Images binding unavailable — serve the original instead (re-fetch since
      // the first body stream was consumed by the failed transform).
      const fresh = await env.PHOTOS_BUCKET.get(photo.object_key);
      if (!fresh) return new Response("Not found", { status: 404 });
      // Short TTL, not IMMUTABLE: this serves the full-size original under the
      // ?w= URL, and a transient transform failure (e.g. Images quota) must not
      // pin that oversized fallback in the browser for a year.
      return new Response(fresh.body, {
        headers: { "content-type": contentType, "cache-control": "private, max-age=300" },
      });
    }
  }

  return new Response(object.body, {
    headers: { "content-type": contentType, "cache-control": IMMUTABLE },
  });
}
