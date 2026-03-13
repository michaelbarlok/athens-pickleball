-- ============================================================
-- Migration 013: Drop legacy columns from game_results
-- round_id and court_id are left over from the old "matches" table.
-- They are NOT NULL but the app never provides them, causing inserts to fail.
-- ============================================================

ALTER TABLE game_results DROP COLUMN IF EXISTS round_id;
ALTER TABLE game_results DROP COLUMN IF EXISTS court_id;

-- Also drop legacy array columns that were replaced by team_a_p1/p2, team_b_p1/p2
ALTER TABLE game_results DROP COLUMN IF EXISTS team1_player_ids;
ALTER TABLE game_results DROP COLUMN IF EXISTS team2_player_ids;
ALTER TABLE game_results DROP COLUMN IF EXISTS team1_score;
ALTER TABLE game_results DROP COLUMN IF EXISTS team2_score;
