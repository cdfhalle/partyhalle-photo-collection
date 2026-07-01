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

export interface PhotoRow {
  id: string;
  object_key: string;
  comment: string | null;
  uploader_name: string | null;
  content_type: string;
  size_bytes: number;
  created_at: number;
}

const SELECT_COLUMNS =
  "id, object_key, comment, uploader_name, content_type, size_bytes, created_at";

/** All photos, newest first (for the admin grid and ZIP download). */
export async function listPhotos(env: { DB: D1Database }): Promise<PhotoRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_COLUMNS} FROM photos ORDER BY created_at DESC`,
  ).all<PhotoRow>();
  return results ?? [];
}

/** A single photo by id, or null. */
export async function getPhoto(env: { DB: D1Database }, id: string): Promise<PhotoRow | null> {
  return (
    (await env.DB.prepare(`SELECT ${SELECT_COLUMNS} FROM photos WHERE id = ?`)
      .bind(id)
      .first<PhotoRow>()) ?? null
  );
}

/**
 * Shape photos for the slideshow: id + comment only (uploader name is hidden,
 * reserved for the future quiz). `listPhotos` is newest-first; the slideshow
 * shows them chronologically (oldest-first) as the "story of the night".
 */
export function toSlideshowItems(
  photos: PhotoRow[],
): { id: string; comment: string | null }[] {
  return photos
    .slice()
    .reverse()
    .map((p) => ({ id: p.id, comment: p.comment }));
}

/** Delete a photo's object from R2 and its row from D1. Returns false if not found. */
export async function deletePhoto(env: PhotoStore, id: string): Promise<boolean> {
  const photo = await getPhoto(env, id);
  if (!photo) return false;
  await env.PHOTOS_BUCKET.delete(photo.object_key);
  await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(id).run();
  return true;
}
