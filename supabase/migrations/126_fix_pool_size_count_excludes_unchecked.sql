-- Fix last-place detection in the step + target-court functions.
--
-- Bug: both update_steps_on_round_complete and compute_target_courts
-- derive each court's `pool_size` with:
--
--   (SELECT COUNT(*) FROM session_participants sp2
--    WHERE sp2.session_id = p_session_id
--      AND sp2.court_number = sp.court_number)
--
-- That COUNT has no `checked_in` / `pool_finish` filter. The admin
-- check-in screen flips `checked_in = false` WITHOUT clearing
-- `court_number`, and re-seeding only writes courts for checked-in
-- players — so a seeded no-show leaves a row with `court_number`
-- still set and `checked_in = false`, `pool_finish = NULL`.
--
-- That stale row inflates `pool_size` by 1. The real last-place
-- finisher has `pool_finish = N` (N = number of ranked players on
-- the court), but the function tests `pool_finish = pool_size`
-- (= N + 1) — no match — so:
--   * update_steps_on_round_complete never demotes them a step
--   * compute_target_courts never moves them down a court for the
--     next session
-- First place is unaffected (`pool_finish = 1` always exists).
--
-- Fix: count only rows that actually received a finish position.
-- recomputeSessionStats stamps `pool_finish` for every checked-in,
-- court-assigned player immediately BEFORE these functions run, so
-- `pool_finish IS NOT NULL` is exactly the set of ranked players —
-- and `pool_finish = COUNT(pool_finish IS NOT NULL)` is exactly
-- "last ranked player on the court."
--
-- Both functions are recreated verbatim except for that one
-- subquery. update_steps_on_round_complete keeps the advisory lock
-- added by migration 083 and the idempotent re-run logic from 079.

CREATE OR REPLACE FUNCTION update_steps_on_round_complete(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_participant RECORD;
  v_group_id UUID;
  v_prefs RECORD;
  v_new_step INTEGER;
  v_was_first_time BOOLEAN;
  v_previous_step_after INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  SELECT group_id INTO v_group_id
  FROM shootout_sessions WHERE id = p_session_id;

  SELECT * INTO v_prefs
  FROM group_preferences WHERE group_id = v_group_id;

  FOR v_participant IN
    SELECT sp.*,
      (SELECT COUNT(*) FROM session_participants sp2
       WHERE sp2.session_id = p_session_id
         AND sp2.court_number = sp.court_number
         AND sp2.pool_finish IS NOT NULL) AS pool_size
    FROM session_participants sp
    WHERE sp.session_id = p_session_id
      AND sp.pool_finish IS NOT NULL
  LOOP
    v_was_first_time := v_participant.step_after IS NULL;
    v_previous_step_after := v_participant.step_after;

    v_new_step := v_participant.step_before;

    IF v_participant.pool_finish = 1 THEN
      v_new_step := v_participant.step_before - v_prefs.step_move_up;
    ELSIF v_participant.pool_finish = v_participant.pool_size THEN
      v_new_step := v_participant.step_before + v_prefs.step_move_down;
    END IF;

    v_new_step := GREATEST(v_prefs.min_step, LEAST(v_prefs.max_step, v_new_step));

    UPDATE session_participants
    SET step_after = v_new_step
    WHERE id = v_participant.id;

    IF v_was_first_time THEN
      UPDATE group_memberships
      SET current_step = v_new_step,
          last_played_at = NOW(),
          total_sessions = total_sessions + 1
      WHERE group_id = v_group_id AND player_id = v_participant.player_id;
    ELSE
      UPDATE group_memberships
      SET current_step = v_new_step
      WHERE group_id = v_group_id
        AND player_id = v_participant.player_id
        AND current_step = v_previous_step_after;
    END IF;
  END LOOP;

  PERFORM compute_target_courts(p_session_id);
END;
$$;

CREATE OR REPLACE FUNCTION compute_target_courts(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_participant RECORD;
  v_num_courts INTEGER;
  v_target INTEGER;
BEGIN
  SELECT num_courts INTO v_num_courts
  FROM shootout_sessions WHERE id = p_session_id;

  FOR v_participant IN
    SELECT sp.*,
      (SELECT COUNT(*) FROM session_participants sp2
       WHERE sp2.session_id = p_session_id
         AND sp2.court_number = sp.court_number
         AND sp2.pool_finish IS NOT NULL) AS pool_size
    FROM session_participants sp
    WHERE sp.session_id = p_session_id
      AND sp.pool_finish IS NOT NULL
  LOOP
    IF v_participant.pool_finish = 1 THEN
      v_target := v_participant.court_number - 1;
    ELSIF v_participant.pool_finish = v_participant.pool_size THEN
      v_target := v_participant.court_number + 1;
    ELSE
      v_target := v_participant.court_number;
    END IF;

    v_target := LEAST(v_num_courts, GREATEST(1, v_target));

    UPDATE session_participants
    SET target_court_next = v_target
    WHERE id = v_participant.id;
  END LOOP;
END;
$$;
