-- Allow a Ladder and a Skills sheet to coexist at the same wall-clock
-- in the same group. The previous unique index on
-- (group_id, event_date, event_time) silently blocked that case — only
-- one of the two auto-posts would land, the other 23505 was swallowed
-- by the cron's duplicate handler and lost forever.
--
-- New shape: include play_type. A single recurring schedule still maps
-- to one play_type, so two fires of the same schedule still collide
-- (which is what the constraint exists to prevent). What's newly
-- allowed is two DIFFERENT schedules in the same group at the same
-- wall-clock as long as one is ladder and one is skills.

DROP INDEX IF EXISTS signup_sheets_group_event_datetime_unique;

CREATE UNIQUE INDEX IF NOT EXISTS signup_sheets_group_event_dt_playtype_unique
  ON signup_sheets (group_id, event_date, event_time, play_type)
  WHERE status <> 'cancelled';

NOTIFY pgrst, 'reload schema';
