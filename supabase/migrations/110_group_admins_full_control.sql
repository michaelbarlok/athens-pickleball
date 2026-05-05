-- ============================================================
-- Migration 110: Group admins get full control over their group's
--                memberships, sessions, and roster
--
-- 109 fixed sign-up sheets. This continues the same audit: every
-- table whose rows belong to a group should let a group admin
-- write at the RLS layer, not just site-level admins.
--
-- Specifically:
--   1. group_memberships — DELETE was never granted to group
--      admins (035 added INSERT, 059 added UPDATE). The admin UI's
--      "Remove member" button silently 0-rowed for a group admin.
--   2. shootout_sessions — `Admins can manage shootout sessions`
--      (004) is site-admin only.
--   3. session_participants — same shape as #2 (004).
--   4. registrations — `Users can manage own registrations` (002)
--      only allows the player themselves or site admins. A group
--      admin couldn't, e.g., kick a no-show off the roster from
--      the RLS-aware client.
--
-- All admin write surfaces above currently flow through API routes
-- using the service client, so this isn't fixing a reported bug
-- for these three tables. It's belt-and-suspenders so future code
-- that talks to the RLS-aware client (the way /sheets/new did) is
-- not silently broken for group admins.
--
-- is_group_admin() (035) is SECURITY DEFINER and stable, so it's
-- safe to use across these policies without RLS recursion.
-- ============================================================

-- ── group_memberships: group admins can remove members ─────
CREATE POLICY "Group admins can remove members"
  ON group_memberships FOR DELETE
  USING (is_group_admin(group_id));

-- ── shootout_sessions: group admins can manage their group's ─
CREATE POLICY "Group admins can manage shootout sessions"
  ON shootout_sessions FOR ALL
  USING (is_group_admin(group_id))
  WITH CHECK (is_group_admin(group_id));

-- ── session_participants: same ─────────────────────────────
CREATE POLICY "Group admins can manage session participants"
  ON session_participants FOR ALL
  USING (is_group_admin(group_id))
  WITH CHECK (is_group_admin(group_id));

-- ── registrations: group admins can manage rows on their ───
-- group's sheets (in addition to the player managing their own).
-- registrations doesn't carry group_id directly, so we resolve it
-- through signup_sheets.
CREATE POLICY "Group admins can manage registrations"
  ON registrations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM signup_sheets s
      WHERE s.id = registrations.sheet_id
        AND is_group_admin(s.group_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM signup_sheets s
      WHERE s.id = registrations.sheet_id
        AND is_group_admin(s.group_id)
    )
  );

NOTIFY pgrst, 'reload schema';
