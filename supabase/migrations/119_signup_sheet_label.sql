-- Frozen play-time label on each sign-up sheet.
--
-- A group may have multiple play times that auto-post sheets — same
-- group name + similar event time can leave players staring at two
-- visually identical cards trying to figure out which is which
-- (Ladder vs Skills, morning vs evening). Copying the schedule's
-- label onto the sheet at auto-post time gives every card a
-- distinguishing subtitle without requiring an extra JOIN at read
-- time.
--
-- Frozen, not joined: same reason play_type is frozen. A schedule
-- rename later shouldn't retroactively rename historical sheets.

ALTER TABLE signup_sheets
  ADD COLUMN IF NOT EXISTS label TEXT;

NOTIFY pgrst, 'reload schema';
