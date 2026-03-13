-- Add group-level admin role to group_memberships
ALTER TABLE group_memberships
  ADD COLUMN group_role TEXT NOT NULL DEFAULT 'member'
  CHECK (group_role IN ('admin', 'member'));
