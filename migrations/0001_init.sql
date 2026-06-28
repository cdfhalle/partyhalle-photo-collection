-- PartyHalle initial schema.
-- One row per uploaded photo. `uploader_name` is captured now (optional) so the
-- future "guess who uploaded" quiz needs no migration; it is not shown in the slideshow.
CREATE TABLE IF NOT EXISTS photos (
  id            TEXT PRIMARY KEY,
  object_key    TEXT NOT NULL UNIQUE,
  comment       TEXT,
  uploader_name TEXT,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos (created_at);
