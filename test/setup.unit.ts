import { beforeEach } from "vitest";
import { env } from "cloudflare:test";

// Each test runs in isolated storage that resets between tests, so recreate the
// schema before each one. Keep in sync with migrations/0001_init.sql.
const CREATE_PHOTOS =
  "CREATE TABLE IF NOT EXISTS photos (" +
  "id TEXT PRIMARY KEY, object_key TEXT NOT NULL UNIQUE, comment TEXT, " +
  "uploader_name TEXT, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, " +
  "created_at INTEGER NOT NULL)";

beforeEach(async () => {
  await env.DB.exec(CREATE_PHOTOS);
  // Start each test from a clean slate (storage is shared across tests here).
  await env.DB.exec("DELETE FROM photos");
  const objects = await env.PHOTOS_BUCKET.list();
  await Promise.all(objects.objects.map((o) => env.PHOTOS_BUCKET.delete(o.key)));
});
