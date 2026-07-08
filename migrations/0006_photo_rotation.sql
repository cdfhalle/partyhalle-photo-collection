-- Admin rotation in 90° steps, applied at serve time (after EXIF orientation,
-- like Cloudflare Images' `rotate`). NULL/0 = as uploaded. People x/y live in
-- displayed (rotated) space; rotating a photo rewrites them too.
ALTER TABLE photos ADD COLUMN rotation INTEGER;
