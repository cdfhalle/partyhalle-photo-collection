-- Guest help requests / error reports ("Hilfe & Feedback" button).
--
-- Deliberately not tied to the photos table: a report can come from any page,
-- including guests whose upload link is broken. session_id (the pa_sid cookie,
-- when present) scopes the per-device rate limit; resolved_at is NULL while a
-- report is still open in the admin view.
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  name TEXT,
  page TEXT,
  user_agent TEXT,
  session_id TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at);
