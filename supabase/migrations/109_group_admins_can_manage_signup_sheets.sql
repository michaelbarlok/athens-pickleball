-- ============================================================
-- Migration 109: Let group admins manage their own signup sheets
--
-- Migration 002 set the "Admins can manage signup sheets" policy
-- to `FOR ALL USING (profile.role = 'admin')`. That only allows
-- *site-level* admins to write rows. A group admin (group_role =
-- 'admin' on group_memberships) was rejected at the RLS layer when
-- they tried to create a sign-up sheet via /sheets/new — the page
-- calls supabase.from("signup_sheets").insert(...) directly, and
-- the RLS-aware client returned "new row violates row-level
-- security policy".
--
-- Group admins are authoritative inside their own group, so this
-- policy gives them full control over signup_sheets rows scoped to
-- their group_id. Site admins keep their existing FOR ALL policy
-- (no change). The is_group_admin() function already exists from
-- migration 035 and is SECURITY DEFINER so this won't recurse.
-- ============================================================

CREATE POLICY "Group admins can manage signup sheets"
  ON signup_sheets FOR ALL
  USING (is_group_admin(group_id))
  WITH CHECK (is_group_admin(group_id));

NOTIFY pgrst, 'reload schema';
