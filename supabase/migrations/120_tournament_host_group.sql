-- Optional group host for a tournament.
--
-- When set, the tournament is "hosted by" a group: only active
-- members of that group can register / accept partner requests.
-- Group admins of the host group implicitly inherit organizer rights
-- (enforced at the application layer in lib/tournament-auth.ts so the
-- check follows live group_memberships changes — no syncing of
-- tournament_organizers rows).
--
-- Existing tournaments are individual-hosted; host_group_id stays
-- NULL and the tournament-register API skips the membership gate
-- entirely. ON DELETE SET NULL means deleting a group converts its
-- hosted tournaments back into individual-hosted ones rather than
-- cascading-deleting historical bracket data.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS host_group_id UUID NULL
  REFERENCES shootout_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tournaments_host_group_id_idx
  ON tournaments (host_group_id)
  WHERE host_group_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
