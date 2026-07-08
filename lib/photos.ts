import { extensionFor, type ImageType } from "./imageType";
import {
  normalizeRotation,
  parsePeople,
  rotatePeople,
  serializePeople,
  type Person,
  type Rotation,
} from "./metadata";

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
  // Per-device upload session (see lib/tokens.ts SID_COOKIE); scopes "my uploads".
  sessionId?: string | null;
  // Quiz metadata (all optional): when / where / who.
  takenAt?: number | null;
  locationName?: string | null;
  lat?: number | null;
  lng?: number | null;
  people?: Person[] | null;
}

/** Store the original in R2 and its metadata in D1. Returns the new photo id. */
export async function storePhoto(env: PhotoStore, input: NewPhoto): Promise<string> {
  const id = crypto.randomUUID();
  const objectKey = `photos/${id}.${extensionFor(input.contentType)}`;

  await env.PHOTOS_BUCKET.put(objectKey, input.bytes, {
    httpMetadata: { contentType: input.contentType },
  });

  await env.DB.prepare(
    `INSERT INTO photos
       (id, object_key, comment, uploader_name, content_type, size_bytes, created_at,
        session_id, taken_at, location_name, location_lat, location_lng, people)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      objectKey,
      input.comment ?? null,
      input.name ?? null,
      input.contentType,
      input.bytes.byteLength,
      Date.now(),
      input.sessionId ?? null,
      input.takenAt ?? null,
      input.locationName ?? null,
      input.lat ?? null,
      input.lng ?? null,
      serializePeople(input.people ?? []),
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
  session_id: string | null;
  taken_at: number | null;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  people: string | null; // JSON string; use parsePeople() to read
  rotation: number | null; // admin display rotation, 90° steps; use normalizeRotation()
}

const SELECT_COLUMNS =
  "id, object_key, comment, uploader_name, content_type, size_bytes, created_at, " +
  "session_id, taken_at, location_name, location_lat, location_lng, people, rotation";

/** All photos, newest first (for the admin grid and ZIP download). */
export async function listPhotos(env: { DB: D1Database }): Promise<PhotoRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_COLUMNS} FROM photos ORDER BY created_at DESC`,
  ).all<PhotoRow>();
  return results ?? [];
}

/**
 * The photos one upload session (device/browser) uploaded, oldest first —
 * mirrors the order the upload page's "done" grid grows in. Strictly scoped:
 * only rows tagged with exactly this session id; pre-session rows (NULL)
 * match nothing.
 */
export async function listSessionPhotos(
  env: { DB: D1Database },
  sessionId: string,
): Promise<Pick<PhotoRow, "id" | "comment">[]> {
  if (!sessionId) return [];
  const { results } = await env.DB.prepare(
    "SELECT id, comment FROM photos WHERE session_id = ? ORDER BY created_at ASC",
  )
    .bind(sessionId)
    .all<Pick<PhotoRow, "id" | "comment">>();
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

export type SortKey = "uploaded" | "taken" | "uploader";
export type SortDir = "asc" | "desc";
export interface SortSpec {
  key: SortKey;
  dir: SortDir;
}

/** Admin grid default: newest upload first, capture time breaking ties. */
export const DEFAULT_SORT: [SortSpec, SortSpec] = [
  { key: "uploaded", dir: "desc" },
  { key: "taken", dir: "desc" },
];

type Sortable = Pick<PhotoRow, "created_at" | "taken_at" | "uploader_name">;

// Ascending comparison for one criterion. Missing values count as the
// smallest possible ("earliest date" / empty name), so they sink to the end
// of a descending order.
function compareBy(key: SortKey, a: Sortable, b: Sortable): number {
  switch (key) {
    case "uploaded":
      return a.created_at - b.created_at;
    case "taken":
      return (
        (a.taken_at ?? Number.NEGATIVE_INFINITY) - (b.taken_at ?? Number.NEGATIVE_INFINITY) || 0
      );
    case "uploader":
      return (a.uploader_name ?? "").localeCompare(b.uploader_name ?? "", "de", {
        sensitivity: "base",
      });
  }
}

/**
 * Sort photos by a chain of criteria (admin grid): later specs break the ties
 * the earlier ones leave. When every spec ties, the stable sort keeps the
 * input order (listPhotos: newest upload first).
 */
export function sortPhotos<T extends Sortable>(photos: T[], specs: SortSpec[]): T[] {
  return photos.slice().sort((a, b) => {
    for (const spec of specs) {
      const cmp = compareBy(spec.key, a, b);
      if (cmp !== 0) return spec.dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

const SORT_KEYS: readonly SortKey[] = ["uploaded", "taken", "uploader"];

/**
 * The two sort slots from the admin page's untrusted `?sort=` param (e.g.
 * "taken-desc,uploader-asc"); each slot falls back to its default on garbage.
 */
export function parseSortParam(value: unknown): [SortSpec, SortSpec] {
  const parts = typeof value === "string" ? value.split(",") : [];
  const slot = (index: number): SortSpec => {
    const [key, dir] = (parts[index] ?? "").split("-");
    return SORT_KEYS.includes(key as SortKey) && (dir === "asc" || dir === "desc")
      ? { key: key as SortKey, dir }
      : DEFAULT_SORT[index];
  };
  return [slot(0), slot(1)];
}

/**
 * Shape photos for the slideshow: id + comment only (uploader name is hidden,
 * reserved for the future quiz). `listPhotos` is newest-first; the slideshow
 * shows them chronologically (oldest-first) as the "story of the night".
 */
export function toSlideshowItems(
  photos: Pick<PhotoRow, "id" | "comment" | "rotation">[],
): { id: string; comment: string | null; rotation: Rotation }[] {
  return photos
    .slice()
    .reverse()
    .map((p) => ({ id: p.id, comment: p.comment, rotation: normalizeRotation(p.rotation) }));
}

/** The file name a photo gets inside the download ZIP. */
export function photoFileName(photo: Pick<PhotoRow, "id" | "object_key">): string {
  return photo.object_key.split("/").pop() || photo.id;
}

export interface PhotoAnnotations {
  file: string;
  uploadedAt: string; // ISO 8601
  uploader: string | null;
  comment: string | null;
  takenAt: string | null; // ISO 8601
  location: { name: string | null; lat: number | null; lng: number | null } | null;
  people: Person[];
}

/**
 * Shape photo rows into the `metadata.json` entries bundled into the ZIP
 * download, so the annotations (time, place, people, comment) survive the
 * export. Entry order and `file` names mirror the image entries in the ZIP.
 */
export function toDownloadMetadata(photos: PhotoRow[]): PhotoAnnotations[] {
  return photos.map((p) => ({
    file: photoFileName(p),
    uploadedAt: new Date(p.created_at).toISOString(),
    uploader: p.uploader_name,
    comment: p.comment,
    takenAt: p.taken_at === null ? null : new Date(p.taken_at).toISOString(),
    location:
      p.location_name === null && p.location_lat === null && p.location_lng === null
        ? null
        : { name: p.location_name, lat: p.location_lat, lng: p.location_lng },
    people: parsePeople(p.people),
  }));
}

export interface PhotoMetadataUpdate {
  comment: string | null;
  takenAt: number | null;
  locationName: string | null;
  people: Person[];
}

/**
 * Overwrite a photo's editable annotations (admin edit dialog). lat/lng stay
 * untouched — they are EXIF provenance, not part of the edited "place" name.
 * Returns false if the id is unknown.
 */
export async function updatePhotoMetadata(
  env: { DB: D1Database },
  id: string,
  update: PhotoMetadataUpdate,
): Promise<boolean> {
  const result = await env.DB.prepare(
    "UPDATE photos SET comment = ?, taken_at = ?, location_name = ?, people = ? WHERE id = ?",
  )
    .bind(
      update.comment,
      update.takenAt,
      update.locationName,
      serializePeople(update.people),
      id,
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * Turn a photo's display rotation by ±90° and rewrite the stored people
 * coordinates into the new displayed space, so pins keep matching the image.
 * Returns the new rotation, or null if the id is unknown.
 */
export async function rotatePhoto(
  env: { DB: D1Database },
  id: string,
  delta: 90 | -90,
): Promise<Rotation | null> {
  const photo = await getPhoto(env, id);
  if (!photo) return null;
  const rotation = normalizeRotation(normalizeRotation(photo.rotation) + delta);
  const people = serializePeople(rotatePeople(parsePeople(photo.people), delta));
  await env.DB.prepare("UPDATE photos SET rotation = ?, people = ? WHERE id = ?")
    .bind(rotation, people, id)
    .run();
  return rotation;
}

/** Delete a photo's object from R2 and its row from D1. Returns false if not found. */
export async function deletePhoto(env: PhotoStore, id: string): Promise<boolean> {
  const photo = await getPhoto(env, id);
  if (!photo) return false;
  await env.PHOTOS_BUCKET.delete(photo.object_key);
  await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(id).run();
  return true;
}
