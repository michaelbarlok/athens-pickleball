-- ============================================================
-- Migration 002: Rename tables and add new columns
-- Transitions from v1 (RN) schema to v2 (Next.js) schema
-- ============================================================

-- Remove from realtime before renaming
ALTER PUBLICATION supabase_realtime DROP TABLE sign_ups;
ALTER PUBLICATION supabase_realtime DROP TABLE player_session_states;
ALTER PUBLICATION supabase_realtime DROP TABLE matches;
ALTER PUBLICATION supabase_realtime DROP TABLE rounds;
ALTER PUBLICATION supabase_realtime DROP TABLE announcements;

-- Drop old triggers before rename
DROP TRIGGER IF EXISTS set_players_updated_at ON players;
DROP TRIGGER IF EXISTS set_sessions_updated_at ON sessions;

-- Drop the view that references old table names
DROP VIEW IF EXISTS all_time_stats;

-- Drop old stored functions (will be recreated with new table names)
DROP FUNCTION IF EXISTS sign_up_for_session(UUID, UUID);
DROP FUNCTION IF EXISTS withdraw_from_session(UUID, UUID);

-- ============================================================
-- RENAME: players → profiles
-- ============================================================
ALTER TABLE players RENAME TO profiles;

-- Add new columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skill_level NUMERIC(3,1);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_court TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS member_since DATE DEFAULT CURRENT_DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_notify TEXT[] DEFAULT ARRAY['email'];

-- Populate display_name from full_name for existing rows
UPDATE profiles SET display_name = full_name WHERE display_name IS NULL;
ALTER TABLE profiles ALTER COLUMN display_name SET NOT NULL;

-- ============================================================
-- RENAME: sessions → signup_sheets
-- ============================================================
ALTER TABLE sessions RENAME TO signup_sheets;

-- Rename columns to match brief
ALTER TABLE signup_sheets RENAME COLUMN date TO event_date;
ALTER TABLE signup_sheets RENAME COLUMN start_time TO event_time;
ALTER TABLE signup_sheets RENAME COLUMN max_players TO player_limit;
ALTER TABLE signup_sheets RENAME COLUMN cutoff_time TO signup_closes_at;

-- Add new columns
ALTER TABLE signup_sheets ADD COLUMN IF NOT EXISTS signup_opens_at TIMESTAMPTZ;
ALTER TABLE signup_sheets ADD COLUMN IF NOT EXISTS withdraw_closes_at TIMESTAMPTZ;
ALTER TABLE signup_sheets ADD COLUMN IF NOT EXISTS allow_member_guests BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE signup_sheets ADD COLUMN IF NOT EXISTS notify_on_create BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE signup_sheets ADD COLUMN IF NOT EXISTS signup_reminder_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE signup_sheets ADD COLUMN IF NOT EXISTS withdraw_reminder_sent BOOLEAN NOT NULL DEFAULT false;

-- Update status check constraint to match new values
ALTER TABLE signup_sheets DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE signup_sheets ADD CONSTRAINT signup_sheets_status_check
  CHECK (status IN ('open', 'closed', 'cancelled'));

-- Migrate existing status values
UPDATE signup_sheets SET status = 'open' WHERE status = 'upcoming';
UPDATE signup_sheets SET status = 'closed' WHERE status IN ('active', 'completed');

-- ============================================================
-- RENAME: sign_ups → registrations
-- ============================================================
ALTER TABLE sign_ups RENAME TO registrations;

-- Rename FK column
ALTER TABLE registrations RENAME COLUMN session_id TO sheet_id;

-- Add new columns
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS registered_by UUID REFERENCES profiles(id);

-- ============================================================
-- RENAME: matches → game_results
-- ============================================================
ALTER TABLE matches RENAME TO game_results;

-- Restructure game_results columns
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS round_number INTEGER;
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS pool_number INTEGER;
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS team_a_p1 UUID REFERENCES profiles(id);
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS team_a_p2 UUID REFERENCES profiles(id);
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS team_b_p1 UUID REFERENCES profiles(id);
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS team_b_p2 UUID REFERENCES profiles(id);
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS score_a INTEGER;
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS score_b INTEGER;
ALTER TABLE game_results RENAME COLUMN score_entered_by TO entered_by;
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES profiles(id);
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS is_disputed BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- Update RLS policy names to reference new table names
-- ============================================================

-- Profiles policies (rename from players)
DROP POLICY IF EXISTS "Players can view all players" ON profiles;
DROP POLICY IF EXISTS "Players can update own profile" ON profiles;
DROP POLICY IF EXISTS "Players can insert own profile" ON profiles;

CREATE POLICY "Anyone can view profiles"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Signup sheets policies
DROP POLICY IF EXISTS "Anyone can view sessions" ON signup_sheets;
DROP POLICY IF EXISTS "Admins can manage sessions" ON signup_sheets;

CREATE POLICY "Anyone can view signup sheets"
  ON signup_sheets FOR SELECT USING (true);

CREATE POLICY "Admins can manage signup sheets"
  ON signup_sheets FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Registrations policies
DROP POLICY IF EXISTS "Players can view sign_ups for their sessions" ON registrations;
DROP POLICY IF EXISTS "Players can manage own sign_ups" ON registrations;

CREATE POLICY "Anyone can view registrations"
  ON registrations FOR SELECT USING (true);

CREATE POLICY "Users can manage own registrations"
  ON registrations FOR ALL USING (
    player_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Game results policies
DROP POLICY IF EXISTS "Anyone can view matches" ON game_results;
DROP POLICY IF EXISTS "Players can enter scores for their matches" ON game_results;
DROP POLICY IF EXISTS "Admins can insert matches" ON game_results;

CREATE POLICY "Anyone can view game results"
  ON game_results FOR SELECT USING (true);

CREATE POLICY "Players can enter scores"
  ON game_results FOR INSERT WITH CHECK (
    entered_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Players can update their scores"
  ON game_results FOR UPDATE USING (
    entered_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Courts policies (update reference)
DROP POLICY IF EXISTS "Admins can manage courts" ON courts;
CREATE POLICY "Admins can manage courts"
  ON courts FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Rounds policies (update reference)
DROP POLICY IF EXISTS "Admins can manage rounds" ON rounds;
CREATE POLICY "Admins can manage rounds"
  ON rounds FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Player session states policies (update reference, will be dropped in migration 008)
DROP POLICY IF EXISTS "Admins can manage player session states" ON player_session_states;
CREATE POLICY "Admins can manage player session states"
  ON player_session_states FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Announcements policies (update reference)
DROP POLICY IF EXISTS "Admins can create announcements" ON announcements;
CREATE POLICY "Admins can create announcements"
  ON announcements FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- Recreate stored functions with new table names
-- ============================================================

CREATE OR REPLACE FUNCTION sign_up_for_sheet(p_sheet_id UUID, p_player_id UUID)
RETURNS registrations AS $$
DECLARE
  v_sheet signup_sheets;
  v_confirmed_count INTEGER;
  v_registration registrations;
  v_status TEXT;
  v_waitlist_pos INTEGER;
BEGIN
  SELECT * INTO v_sheet FROM signup_sheets WHERE id = p_sheet_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sheet not found';
  END IF;

  IF v_sheet.status != 'open' THEN
    RAISE EXCEPTION 'Sheet is not open for sign-ups';
  END IF;

  IF NOW() > v_sheet.signup_closes_at THEN
    RAISE EXCEPTION 'Sign-up cutoff has passed';
  END IF;

  SELECT COUNT(*) INTO v_confirmed_count
  FROM registrations
  WHERE sheet_id = p_sheet_id AND status = 'confirmed';

  IF v_confirmed_count < v_sheet.player_limit THEN
    v_status := 'confirmed';
    v_waitlist_pos := NULL;
  ELSE
    v_status := 'waitlist';
    SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_waitlist_pos
    FROM registrations
    WHERE sheet_id = p_sheet_id AND status = 'waitlist';
  END IF;

  INSERT INTO registrations (sheet_id, player_id, status, waitlist_position)
  VALUES (p_sheet_id, p_player_id, v_status, v_waitlist_pos)
  RETURNING * INTO v_registration;

  RETURN v_registration;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION withdraw_from_sheet(p_sheet_id UUID, p_player_id UUID)
RETURNS VOID AS $$
DECLARE
  v_registration registrations;
  v_next_waitlist registrations;
BEGIN
  SELECT * INTO v_registration
  FROM registrations
  WHERE sheet_id = p_sheet_id AND player_id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  UPDATE registrations SET status = 'withdrawn' WHERE id = v_registration.id;

  IF v_registration.status = 'confirmed' THEN
    SELECT * INTO v_next_waitlist
    FROM registrations
    WHERE sheet_id = p_sheet_id AND status = 'waitlist'
    ORDER BY waitlist_position ASC
    LIMIT 1;

    IF FOUND THEN
      UPDATE registrations
      SET status = 'confirmed', waitlist_position = NULL
      WHERE id = v_next_waitlist.id;

      UPDATE registrations
      SET waitlist_position = waitlist_position - 1
      WHERE sheet_id = p_sheet_id
        AND status = 'waitlist'
        AND waitlist_position > v_next_waitlist.waitlist_position;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Recreate updated_at triggers
-- ============================================================
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_signup_sheets_updated_at
  BEFORE UPDATE ON signup_sheets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Re-add to realtime with new names
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE registrations;
ALTER PUBLICATION supabase_realtime ADD TABLE game_results;
ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
