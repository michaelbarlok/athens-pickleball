-- Score-reminder dedup flag for idle ladder sessions.
--
-- The auto-complete cron (runAutoCompleteIdleSessions) runs every 5
-- minutes. When it finds a round_active session that's been idle 30+
-- minutes (no game_result written) but still has unscored games, it
-- now nudges the players on each incomplete court + the group admins
-- to enter the missing score(s) — the "someone left without entering
-- the last score" case that otherwise strands the session In
-- Progress indefinitely.
--
-- Without a dedup marker that reminder would re-fire every 5-minute
-- tick. This column records when the reminder went out so it's sent
-- exactly once per session. NULL = not yet reminded.
--
-- Additive: one nullable column, no change to any existing row's
-- behavior.

ALTER TABLE shootout_sessions
  ADD COLUMN IF NOT EXISTS score_reminder_sent_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
