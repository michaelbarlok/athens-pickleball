-- Clamp player steps to the group's configured min_step / max_step range
-- Previously, only min_step was enforced (for winners moving up).
-- Last-place finishers could exceed max_step with no cap.

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
      v_new_step := v_participant.step_before - v_prefs.step_move_up;
    -- Last place moves down
    ELSIF v_participant.pool_finish = v_participant.pool_size THEN
      v_new_step := v_participant.step_before + v_prefs.step_move_down;
    END IF;

    -- Clamp to group range
    v_new_step := GREATEST(v_prefs.min_step, LEAST(v_prefs.max_step, v_new_step));

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
