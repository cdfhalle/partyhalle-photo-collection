import { NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { getPhoto } from "@/lib/photos";
import { normalizeRotation } from "@/lib/metadata";
import { verifyUploadCookie, verifySidCookie, SID_COOKIE } from "@/lib/tokens";

export const dynamic = "force-dynamic";

// The R2 original is write-once (UUID key), and the transform is deterministic
// in `id + width + rotation`. Every URL builder appends the current rotation as
// `r=` (a pure cache key the route never reads), so each URL maps to an
// immutable image and can be cached hard: slideshow loops and admin re-visits
// never re-hit the worker (nor re-run an Images transformation). Kept `private`
// because the bytes are auth-gated — the edge won't cache them, but a repeat
// viewer's browser will.
const IMMUTABLE = "private, max-age=31536000, immutable";

// The stored content type when serving a rotated original: Images can output
// most of our input types directly; HEIC can't be an output (and is only
// reachable via direct-API uploads — browsers convert HEIC before upload).
const OUTPUT_FORMAT: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/avif"> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
  "image/avif": "image/avif",
};
const outputFormatFor = (contentType: string) => OUTPUT_FORMAT[contentType] ?? "image/jpeg";

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
  const rotation = normalizeRotation(photo.rotation);

  if ((width > 0 || rotation !== 0) && env.IMAGES) {
    try {
      // Thumbnails stay WebP; a rotated original keeps its own format so the
      // ZIP download gets e.g. rotated JPEGs, not surprise WebP files.
      const output =
        width > 0
          ? ({ format: "image/webp" } as const)
          : ({ format: outputFormatFor(photo.content_type), quality: 90 } as const);
      const result = await env.IMAGES.input(object.body)
        .transform({
          ...(width > 0 && { width }),
          ...(rotation !== 0 && { rotate: rotation }),
        })
        .output(output);
      // Wrap the transformed stream in a standard Response — the binding's own
      // result.response() is a foreign Response class Next.js rejects.
      return new Response(result.image(), {
        headers: { "content-type": output.format, "cache-control": IMMUTABLE },
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
