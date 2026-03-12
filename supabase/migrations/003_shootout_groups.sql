-- ============================================================
-- Migration 003: Shootout Groups
-- The foundational concept that scopes all rankings, steps,
-- and percentages per group.
-- ============================================================

-- ============================================================
-- shootout_groups
-- ============================================================
CREATE TABLE shootout_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shootout_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active groups"
  ON shootout_groups FOR SELECT USING (true);

CREATE POLICY "Admins can manage groups"
  ON shootout_groups FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_shootout_groups_updated_at
  BEFORE UPDATE ON shootout_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- group_preferences (one-to-one with shootout_groups)
-- ============================================================
CREATE TABLE group_preferences (
  group_id UUID PRIMARY KEY REFERENCES shootout_groups(id) ON DELETE CASCADE,
  pct_window_sessions INTEGER NOT NULL DEFAULT 6,
  new_player_start_step INTEGER NOT NULL DEFAULT 99,
  min_step INTEGER NOT NULL DEFAULT 1,
  step_move_up INTEGER NOT NULL DEFAULT 1,
  step_move_down INTEGER NOT NULL DEFAULT 1,
  game_limit_4p INTEGER NOT NULL DEFAULT 15,
  game_limit_5p INTEGER NOT NULL DEFAULT 11,
  win_by_2 BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE group_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view group preferences"
  ON group_preferences FOR SELECT USING (true);

CREATE POLICY "Admins can manage group preferences"
  ON group_preferences FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_group_preferences_updated_at
  BEFORE UPDATE ON group_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create preferences when a group is inserted
CREATE OR REPLACE FUNCTION create_group_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO group_preferences (group_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_create_group_preferences
  AFTER INSERT ON shootout_groups
  FOR EACH ROW EXECUTE FUNCTION create_group_preferences();

-- ============================================================
-- group_memberships (many-to-many: players ↔ groups)
-- Replaces player_ladder_state — all step and % data is per-group.
-- ============================================================
CREATE TABLE group_memberships (
  group_id UUID REFERENCES shootout_groups(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  current_step INTEGER NOT NULL,
  win_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, player_id)
);

ALTER TABLE group_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view group memberships"
  ON group_memberships FOR SELECT USING (true);

CREATE POLICY "Admins can manage group memberships"
  ON group_memberships FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Players can join groups"
  ON group_memberships FOR INSERT WITH CHECK (
    player_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- ============================================================
-- Add group_id FK to signup_sheets
-- ============================================================
ALTER TABLE signup_sheets ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES shootout_groups(id);

-- Add group_id FK to game_results
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES shootout_groups(id);
