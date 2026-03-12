-- ============================================================
-- Migration 008: Drop legacy tables
-- Only run after verifying session_participants is working.
-- ============================================================

-- Drop old player_session_states (replaced by session_participants + group_memberships)
DROP POLICY IF EXISTS "Anyone can view player session states" ON player_session_states;
DROP POLICY IF EXISTS "Admins can manage player session states" ON player_session_states;
DROP TABLE IF EXISTS player_session_states;

-- Recreate all_time_stats view using new table names
CREATE OR REPLACE VIEW all_time_stats AS
SELECT
  p.id AS player_id,
  p.full_name,
  p.display_name,
  p.skill_level,
  pr.display_rating,
  pr.elo_points,
  COALESCE(SUM(CASE WHEN gr.score_a > gr.score_b AND (gr.team_a_p1 = p.id OR gr.team_a_p2 = p.id) THEN 1
                     WHEN gr.score_b > gr.score_a AND (gr.team_b_p1 = p.id OR gr.team_b_p2 = p.id) THEN 1
                     ELSE 0 END), 0) AS total_wins,
  COALESCE(SUM(CASE WHEN gr.score_a < gr.score_b AND (gr.team_a_p1 = p.id OR gr.team_a_p2 = p.id) THEN 1
                     WHEN gr.score_b < gr.score_a AND (gr.team_b_p1 = p.id OR gr.team_b_p2 = p.id) THEN 1
                     ELSE 0 END), 0) AS total_losses,
  COUNT(DISTINCT sp.session_id) AS sessions_played
FROM profiles p
LEFT JOIN player_ratings pr ON p.id = pr.player_id
LEFT JOIN session_participants sp ON p.id = sp.player_id
LEFT JOIN game_results gr ON (gr.team_a_p1 = p.id OR gr.team_a_p2 = p.id OR gr.team_b_p1 = p.id OR gr.team_b_p2 = p.id)
WHERE p.is_active = true
GROUP BY p.id, p.full_name, p.display_name, p.skill_level, pr.display_rating, pr.elo_points;
