-- Quiz feature.
--
-- Part A — richer per-photo metadata captured at upload (all nullable, so
-- existing rows are unaffected). These feed the admin question builder as
-- suggested answers; they are deliberately NOT shown in the public slideshow
-- (that would spoil the "guess when/where/who" quiz, like uploader_name).
ALTER TABLE photos ADD COLUMN taken_at     INTEGER; -- EXIF DateTimeOriginal, epoch ms
ALTER TABLE photos ADD COLUMN location_name TEXT;   -- geocoded/edited city
ALTER TABLE photos ADD COLUMN location_lat  REAL;   -- raw GPS latitude
ALTER TABLE photos ADD COLUMN location_lng  REAL;   -- raw GPS longitude
ALTER TABLE photos ADD COLUMN people        TEXT;   -- JSON: [{ name, x, y }] (x/y normalized 0-1)

-- Part B — admin-authored multiple-choice questions. The "quiz" is simply all
-- enabled rows ordered by position; game state (players/scores) is ephemeral and
-- lives in the game Worker's Durable Object, never here.
CREATE TABLE IF NOT EXISTS quiz_questions (
  id              TEXT PRIMARY KEY,
  photo_id        TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  prompt          TEXT NOT NULL,
  options         TEXT NOT NULL,          -- JSON array of option strings (2-6)
  correct_index   INTEGER NOT NULL,
  position         INTEGER NOT NULL,
  time_limit_secs INTEGER,                -- null = use game default
  points          INTEGER,                -- null = use game default
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_position ON quiz_questions (position);
