-- Per-profile gender field. Drives strict enforcement of gendered
-- tournament divisions (Men's, Women's, Mixed): a player can only
-- register for divisions their gender allows.
--
-- This migration adds the column nullable so existing profiles don't
-- block. A follow-up migration will flip it to NOT NULL once the
-- admin has backfilled every existing row.
--
-- Allowed values are constrained to 'male' or 'female'. The platform's
-- division model is strictly binary today; if that changes later,
-- relaxing this CHECK is a one-liner.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender TEXT
  CHECK (gender IS NULL OR gender IN ('male', 'female'));

NOTIFY pgrst, 'reload schema';
