import { extensionFor, type ImageType } from "./imageType";

// Minimal structural view of the bindings these functions need, so they stay
// easy to unit-test with the local D1 / R2 from `cloudflare:test`.
export interface PhotoStore {
  DB: D1Database;
  PHOTOS_BUCKET: R2Bucket;
}

export interface NewPhoto {
  bytes: Uint8Array;
  contentType: ImageType;
  comment?: string | null;
  name?: string | null;
}

/** Store the original in R2 and its metadata in D1. Returns the new photo id. */
export async function storePhoto(env: PhotoStore, input: NewPhoto): Promise<string> {
  const id = crypto.randomUUID();
  const objectKey = `photos/${id}.${extensionFor(input.contentType)}`;

  await env.PHOTOS_BUCKET.put(objectKey, input.bytes, {
    httpMetadata: { contentType: input.contentType },
  });

  await env.DB.prepare(
    `INSERT INTO photos (id, object_key, comment, uploader_name, content_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      objectKey,
      input.comment ?? null,
      input.name ?? null,
      input.contentType,
      input.bytes.byteLength,
      Date.now(),
    )
    .run();

  return id;
}

/** Total number of stored photos (used for the global cap). */
export async function countPhotos(env: { DB: D1Database }): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM photos").first<{ n: number }>();
  return row?.n ?? 0;
}
