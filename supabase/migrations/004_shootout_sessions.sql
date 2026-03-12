-- ============================================================
-- Migration 004: Shootout Sessions & Participants
-- Full session lifecycle management with check-in and seeding.
-- ============================================================

-- ============================================================
-- shootout_sessions
-- ============================================================
CREATE TABLE shootout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id UUID REFERENCES signup_sheets(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES shootout_groups(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'checking_in', 'seeding', 'round_active', 'round_complete', 'session_complete')),
  num_courts INTEGER NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 1,
  is_same_day_continuation BOOLEAN NOT NULL DEFAULT false,
  prev_session_id UUID REFERENCES shootout_sessions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shootout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shootout sessions"
  ON shootout_sessions FOR SELECT USING (true);

CREATE POLICY "Admins can manage shootout sessions"
  ON shootout_sessions FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_shootout_sessions_updated_at
  BEFORE UPDATE ON shootout_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE shootout_sessions;

-- ============================================================
-- session_participants
-- Replaces player_session_states + session_pool_assignments.
-- Tracks per-session check-in, court assignment, and results.
-- ============================================================
CREATE TABLE session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES shootout_sessions(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES shootout_groups(id) NOT NULL,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  checked_in BOOLEAN NOT NULL DEFAULT false,
  court_number INTEGER,
  pool_finish INTEGER,
  target_court_next INTEGER,
  step_before INTEGER NOT NULL,
  step_after INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, player_id)
);

ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view session participants"
  ON session_participants FOR SELECT USING (true);

CREATE POLICY "Admins can manage session participants"
  ON session_participants FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

ALTER PUBLICATION supabase_realtime ADD TABLE session_participants;

-- ============================================================
-- Postgres function: compute_target_courts
-- Called on round_complete for every player in the session.
-- ============================================================
CREATE OR REPLACE FUNCTION compute_target_courts(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
  v_participant RECORD;
  v_pool_size INTEGER;
  v_target INTEGER;
BEGIN
  FOR v_participant IN
    SELECT sp.*,
      (SELECT COUNT(*) FROM session_participants sp2
       WHERE sp2.session_id = p_session_id AND sp2.court_number = sp.court_number) AS pool_size
    FROM session_participants sp
    WHERE sp.session_id = p_session_id
      AND sp.pool_finish IS NOT NULL
  LOOP
    -- 1st place: move up (lower court = harder)
    IF v_participant.pool_finish = 1 THEN
      v_target := v_participant.court_number - 1;
    -- Last place: move down
    ELSIF v_participant.pool_finish = v_participant.pool_size THEN
      v_target := v_participant.court_number + 1;
    -- Middle: stay
    ELSE
      v_target := v_participant.court_number;
    END IF;

    -- Floor at court 1 (no ceiling)
    v_target := GREATEST(1, v_target);

    UPDATE session_participants
    SET target_court_next = v_target
    WHERE id = v_participant.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Postgres function: update_steps_on_round_complete
-- Atomically updates steps in group_memberships after a round.
-- ============================================================
CREATE OR REPLACE FUNCTION update_steps_on_round_complete(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
  v_participant RECORD;
  v_group_id UUID;
  v_prefs RECORD;
  v_pool_size INTEGER;
  v_new_step INTEGER;
BEGIN
  -- Get group_id from the session
  SELECT group_id INTO v_group_id
  FROM shootout_sessions WHERE id = p_session_id;

  -- Get group preferences
  SELECT * INTO v_prefs
  FROM group_preferences WHERE group_id = v_group_id;

  FOR v_participant IN
    SELECT sp.*,
      (SELECT COUNT(*) FROM session_participants sp2
       WHERE sp2.session_id = p_session_id AND sp2.court_number = sp.court_number) AS pool_size
    FROM session_participants sp
    WHERE sp.session_id = p_session_id
      AND sp.pool_finish IS NOT NULL
  LOOP
    -- Get current step
    v_new_step := v_participant.step_before;

    -- 1st place moves up
    IF v_participant.pool_finish = 1 THEN
      v_new_step := GREATEST(v_prefs.min_step, v_participant.step_before - v_prefs.step_move_up);
    -- Last place moves down
    ELSIF v_participant.pool_finish = v_participant.pool_size THEN
      v_new_step := v_participant.step_before + v_prefs.step_move_down;
    END IF;

    -- Update session_participants with step_after
    UPDATE session_participants
    SET step_after = v_new_step
    WHERE id = v_participant.id;

    -- Update group_memberships with new step
    UPDATE group_memberships
    SET current_step = v_new_step,
        last_played_at = NOW(),
        total_sessions = total_sessions + 1
    WHERE group_id = v_group_id AND player_id = v_participant.player_id;
  END LOOP;

  -- Compute target courts for next session
  PERFORM compute_target_courts(p_session_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Helper: detect same-day previous session
-- ============================================================
CREATE OR REPLACE FUNCTION find_prev_session(
  p_group_id UUID,
  p_event_date DATE
)
RETURNS UUID AS $$
  SELECT ss.id
  FROM shootout_sessions ss
  JOIN signup_sheets sh ON sh.id = ss.sheet_id
  WHERE sh.event_date = p_event_date
    AND ss.group_id = p_group_id
    AND ss.status = 'session_complete'
  ORDER BY ss.created_at DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;
