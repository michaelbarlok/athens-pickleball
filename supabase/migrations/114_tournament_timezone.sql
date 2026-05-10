-- ============================================================
-- Migration 114: Tournament timezone column
--
-- tournaments.start_time is `time without time zone`, so today every
-- email that interpolates the tournament time renders the bare HH:MM
-- with no zone context — the recipient has to guess. As groups outside
-- East Tennessee come on the platform, "9:00 AM" in a TN-hosted
-- tournament email is the same characters as a CA-hosted one, but
-- means different wall-clock times.
--
-- Add an IANA timezone column. Defaults to America/New_York for
-- backfill since every existing tournament is in East TN. New
-- tournaments inherit the default unless the organizer overrides it.
-- The notify and payment-reminder routes consult this column when
-- formatting times for outbound email.
-- ============================================================

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York';

NOTIFY pgrst, 'reload schema';
