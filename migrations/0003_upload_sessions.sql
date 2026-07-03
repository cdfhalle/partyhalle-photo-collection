-- Per-device upload sessions.
--
-- Each browser that uploads gets a random session id (signed `pa_sid` cookie).
-- Photos are tagged with it so the upload page can restore its own "already
-- uploaded" list after a reload — and only its own: the id is an unguessable
-- UUID, and rows from before this migration stay NULL, which matches no session.
ALTER TABLE photos ADD COLUMN session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_photos_session_id ON photos (session_id);
