-- Optional contact email on help requests, so the host can reply to guests.
-- Stored exactly as typed (trimmed, length-capped) — a typo'd address is still
-- often decipherable by a human; the admin view only renders it as a mailto
-- link when it looks like a real address.
ALTER TABLE feedback ADD COLUMN email TEXT;
