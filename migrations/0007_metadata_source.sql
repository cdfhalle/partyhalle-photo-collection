-- Photo-of-print detection. A photo of a printed picture carries the *camera's*
-- EXIF date/GPS (the living room, minutes before upload), not the original's.
-- Track where when/where came from so date-based features can trust manual
-- entries and discount automatic ones. NULL = unknown (legacy rows, or no value).
ALTER TABLE photos ADD COLUMN taken_at_source TEXT; -- 'exif' | 'manual', provenance of taken_at
ALTER TABLE photos ADD COLUMN location_source TEXT; -- 'exif' | 'manual', provenance of location_name
