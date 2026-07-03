import { NextRequest } from "next/server";
import { cfEnv } from "@/lib/server";
import { getPhoto } from "@/lib/photos";
import { getQuestion } from "@/lib/quiz";

export const dynamic = "force-dynamic";

// Public photo endpoint for the live quiz. Players aren't logged in, so this is
// intentionally unauthenticated — but it only ever serves a photo that is
// referenced by an *enabled* quiz question (keyed by question id, not photo id),
// so the general gallery stays gated. Reuses the Cloudflare Images resize path
// from /api/photo/[id].
export async function GET(req: NextRequest, ctx: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await ctx.params;
  const env = cfEnv();

  const question = await getQuestion(env, questionId);
  if (!question || !question.enabled) {
    return new Response("Not found", { status: 404 });
  }

  const photo = await getPhoto(env, question.photoId);
  if (!photo) return new Response("Not found", { status: 404 });

  const object = await env.PHOTOS_BUCKET.get(photo.object_key);
  if (!object) return new Response("Not found", { status: 404 });

  const contentType = object.httpMetadata?.contentType ?? photo.content_type;
  const width = Number(req.nextUrl.searchParams.get("w") ?? 0);
  // Browser cache only — worker-generated responses are not stored in the CDN
  // cache, so `public` here just lets any client keep it. In practice only the
  // presenter screen loads this image; 1h TTL bounds staleness if a question is
  // re-pointed to a different photo (the URL is keyed by question, not photo).
  const cache = "public, max-age=3600";

  if (width > 0 && env.IMAGES) {
    try {
      const result = await env.IMAGES.input(object.body)
        .transform({ width })
        .output({ format: "image/webp" });
      return new Response(result.image(), {
        headers: { "content-type": "image/webp", "cache-control": cache },
      });
    } catch {
      const fresh = await env.PHOTOS_BUCKET.get(photo.object_key);
      if (!fresh) return new Response("Not found", { status: 404 });
      // Short TTL: don't let a transiently failed transform pin the full-size
      // original under the ?w= URL for the whole hour.
      return new Response(fresh.body, {
        headers: { "content-type": contentType, "cache-control": "public, max-age=300" },
      });
    }
  }

  return new Response(object.body, {
    headers: { "content-type": contentType, "cache-control": cache },
  });
}
