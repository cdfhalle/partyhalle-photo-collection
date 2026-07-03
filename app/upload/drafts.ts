// Draft persistence for the upload form: photos the guest has picked but not
// yet uploaded survive a reload (mobile browsers love to evict the tab while
// someone digs through their photo app). Files go to IndexedDB — localStorage
// can't hold Blobs — split across two stores so a comment keystroke only
// rewrites a tiny metadata record, never the multi-MB image blob.
//
// Everything here is best-effort: quota errors, Safari private mode, or a
// blocked IndexedDB must never break the form itself. Failures surface only as
// a `false` from saveDraftFile so the form can fall back to a beforeunload
// warning.

export interface DraftMeta {
  comment: string;
  dateStr: string;
  locationName: string;
  lat: number | null;
  lng: number | null;
  people: { name: string; x: number; y: number }[];
}

export interface Draft extends DraftMeta {
  key: string;
  file: File;
}

const DB_NAME = "pa-upload-drafts";
const FILES = "files"; // { key, file, order } — written once per photo (again after HEIC→JPEG)
const META = "meta"; //  { key, ...DraftMeta, savedAt } — written on every edit (small)

// Drafts older than this are abandoned, not "work in progress" — silently drop
// them instead of resurrecting a week-old half-filled form.
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(FILES, { keyPath: "key" });
        req.result.createObjectStore(META, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("IndexedDB blocked"));
    });
    // A failed open (e.g. private mode) shouldn't be cached forever, retrying
    // on the next call costs nothing.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/**
 * Persist the photo blob. `order` keeps the visual card order across reloads
 * (pass e.g. Date.now() + index). Returns false when persistence is broken on
 * this browser, so the caller can warn before unload instead.
 */
export async function saveDraftFile(key: string, file: File, order: number): Promise<boolean> {
  try {
    const db = await openDb();
    await promisify(db.transaction(FILES, "readwrite").objectStore(FILES).put({ key, file, order }));
    return true;
  } catch {
    return false;
  }
}

/** Swap a stored blob in place (HEIC→JPEG) without disturbing the card order. */
export async function replaceDraftFile(key: string, file: File): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(FILES, "readwrite");
    const store = tx.objectStore(FILES);
    const existing = await promisify(store.get(key) as IDBRequest<{ order?: number } | undefined>);
    // No record: the original write failed or the card was removed meanwhile —
    // don't resurrect it here.
    if (existing) await promisify(store.put({ key, file, order: existing.order ?? Date.now() }));
  } catch {
    // best-effort
  }
}

/** Persist the editable fields of one card. Cheap; call on every change. */
export async function saveDraftMeta(key: string, meta: DraftMeta): Promise<void> {
  try {
    const db = await openDb();
    await promisify(
      db.transaction(META, "readwrite").objectStore(META).put({ key, ...meta, savedAt: Date.now() }),
    );
  } catch {
    // best-effort
  }
}

/** Remove a draft after upload succeeds or the card is dismissed. */
export async function deleteDraft(key: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([FILES, META], "readwrite");
    tx.objectStore(FILES).delete(key);
    tx.objectStore(META).delete(key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
}

/** All saved drafts in their original card order; expired ones are purged. */
export async function loadDrafts(): Promise<Draft[]> {
  try {
    const db = await openDb();
    const tx = db.transaction([FILES, META], "readonly");
    const [files, metas] = await Promise.all([
      promisify(
        tx.objectStore(FILES).getAll() as IDBRequest<
          { key: string; file: File; order: number }[]
        >,
      ),
      promisify(tx.objectStore(META).getAll() as IDBRequest<(DraftMeta & { key: string; savedAt: number })[]>),
    ]);

    const metaByKey = new Map(metas.map((m) => [m.key, m]));
    const now = Date.now();
    const drafts: Draft[] = [];
    const expired: string[] = [];
    for (const f of files.sort((a, b) => a.order - b.order)) {
      const meta = metaByKey.get(f.key);
      const freshAt = Math.max(f.order, meta?.savedAt ?? 0);
      if (now - freshAt > MAX_AGE_MS || !(f.file instanceof File)) {
        expired.push(f.key);
        continue;
      }
      drafts.push({
        key: f.key,
        file: f.file,
        // Meta may be missing if the tab died before the first (debounced)
        // meta write; fall back to a blank card.
        comment: meta?.comment ?? "",
        dateStr: meta?.dateStr ?? "",
        locationName: meta?.locationName ?? "",
        lat: meta?.lat ?? null,
        lng: meta?.lng ?? null,
        people: Array.isArray(meta?.people) ? meta.people : [],
      });
    }
    // Purge expired drafts and orphaned meta rows (file write failed earlier).
    const fileKeys = new Set(files.map((f) => f.key));
    for (const m of metas) if (!fileKeys.has(m.key)) expired.push(m.key);
    for (const key of expired) void deleteDraft(key);

    return drafts;
  } catch {
    return [];
  }
}
