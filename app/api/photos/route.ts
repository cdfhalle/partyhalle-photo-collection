import { isAuthenticated } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { listPhotos, toSlideshowItems } from "@/lib/photos";

export const dynamic = "force-dynamic";

// JSON list the slideshow polls for live updates. Auth-gated; returns id +
// comment only (uploader name stays hidden).
export async function GET() {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }
  const photos = toSlideshowItems(await listPhotos(cfEnv()));
  return Response.json({ photos });
}
