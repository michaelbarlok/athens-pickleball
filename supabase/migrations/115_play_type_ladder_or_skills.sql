-- Play types for recurring schedules + signup sheets.
--
-- A group's recurring schedule (a "play time") can either be a Ladder
-- session — uses the group's ladder_type for step movement, scoring,
-- and recap — or a Skills Session, which is just a sign-up roster
-- (drills/practice) with no session machinery on top.
--
-- The column on signup_sheets is copied from the schedule at auto-post
-- time so the sheet's type is frozen — admins changing a schedule's
-- play_type later won't retroactively flip already-posted sheets.

ALTER TABLE group_recurring_schedules
  ADD COLUMN IF NOT EXISTS play_type TEXT NOT NULL DEFAULT 'ladder'
  CHECK (play_type IN ('ladder', 'skills'));

ALTER TABLE signup_sheets
  ADD COLUMN IF NOT EXISTS play_type TEXT NOT NULL DEFAULT 'ladder'
  CHECK (play_type IN ('ladder', 'skills'));

NOTIFY pgrst, 'reload schema';
