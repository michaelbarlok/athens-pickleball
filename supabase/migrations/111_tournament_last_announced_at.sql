-- ============================================================
-- Migration 111: Track when a tournament was last broadcast-emailed
--
-- Adds tournaments.last_announced_at so the new
-- /api/tournaments/[id]/notify-members route can rate-limit "Notify
-- Members" to once per hour per tournament. Prevents accidental
-- double-sends from a misclick or page reload while letting an
-- organizer re-broadcast after correcting a typo on the next day.
-- ============================================================

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS last_announced_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
