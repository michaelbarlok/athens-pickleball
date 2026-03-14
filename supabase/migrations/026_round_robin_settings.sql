-- ============================================================
-- Migration 026: Round robin game settings
-- Adds score-to-win settings for pool play and playoffs,
-- and a best-of-3 option for championship finals.
-- ============================================================

ALTER TABLE tournaments
  ADD COLUMN score_to_win_pool INTEGER DEFAULT 11 CHECK (score_to_win_pool IS NULL OR score_to_win_pool > 0),
  ADD COLUMN score_to_win_playoff INTEGER DEFAULT 11 CHECK (score_to_win_playoff IS NULL OR score_to_win_playoff > 0),
  ADD COLUMN finals_best_of_3 BOOLEAN DEFAULT FALSE;
