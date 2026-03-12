-- ============================================================
-- Migration 005: Player Ratings (ELO-based)
-- Global rating system mapped to 2.0–5.0 USAP scale.
-- ============================================================

CREATE TABLE player_ratings (
  player_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  elo_points NUMERIC(8,2) NOT NULL DEFAULT 1500,
  display_rating NUMERIC(3,1) NOT NULL DEFAULT 3.0,
  games_played INTEGER NOT NULL DEFAULT 0,
  rating_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE player_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view player ratings"
  ON player_ratings FOR SELECT USING (true);

CREATE POLICY "Admins can manage player ratings"
  ON player_ratings FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Auto-create rating row when a profile is created
CREATE OR REPLACE FUNCTION create_player_rating()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO player_ratings (player_id) VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_create_player_rating
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_player_rating();
