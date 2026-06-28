import { downloadZip } from "client-zip";
import { isAuthenticated } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { listPhotos } from "@/lib/photos";

export const dynamic = "force-dynamic";

// Streams a ZIP of all full-resolution originals. client-zip builds the archive
// as a stream, so we never buffer the whole collection in memory.
export async function GET() {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const env = cfEnv();
  const photos = await listPhotos(env);

  async function* files() {
    for (const photo of photos) {
      const object = await env.PHOTOS_BUCKET.get(photo.object_key);
      if (!object) continue;
      yield {
        name: photo.object_key.split("/").pop() ?? `${photo.id}`,
        lastModified: new Date(photo.created_at),
        input: object.body as ReadableStream,
      };
    }
  }

  const zip = downloadZip(files());
  return new Response(zip.body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="partyhalle-fotos.zip"',
    },
  });
}
