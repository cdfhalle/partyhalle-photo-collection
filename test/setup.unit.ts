import { beforeEach } from "vitest";
import { env } from "cloudflare:test";

// Each test runs in isolated storage that resets between tests, so recreate the
// schema before each one. Keep in sync with migrations/0001_init.sql,
// migrations/0002_quiz.sql and migrations/0003_upload_sessions.sql.
const CREATE_PHOTOS =
  "CREATE TABLE IF NOT EXISTS photos (" +
  "id TEXT PRIMARY KEY, object_key TEXT NOT NULL UNIQUE, comment TEXT, " +
  "uploader_name TEXT, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, " +
  "created_at INTEGER NOT NULL, session_id TEXT, taken_at INTEGER, location_name TEXT, " +
  "location_lat REAL, location_lng REAL, people TEXT)";

const CREATE_QUIZ =
  "CREATE TABLE IF NOT EXISTS quiz_questions (" +
  "id TEXT PRIMARY KEY, photo_id TEXT NOT NULL, prompt TEXT NOT NULL, " +
  "options TEXT NOT NULL, correct_index INTEGER NOT NULL, position INTEGER NOT NULL, " +
  "time_limit_secs INTEGER, points INTEGER, enabled INTEGER NOT NULL DEFAULT 1, " +
  "created_at INTEGER NOT NULL)";

beforeEach(async () => {
  await env.DB.exec(CREATE_PHOTOS);
  await env.DB.exec(CREATE_QUIZ);
  // Start each test from a clean slate (storage is shared across tests here).
  await env.DB.exec("DELETE FROM photos");
  await env.DB.exec("DELETE FROM quiz_questions");
  const objects = await env.PHOTOS_BUCKET.list();
  await Promise.all(objects.objects.map((o) => env.PHOTOS_BUCKET.delete(o.key)));
});
