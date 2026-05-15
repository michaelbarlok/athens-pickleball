-- Auto-sync tournament organizers with host-group admins.
--
-- When a tournament is hosted by a group (host_group_id is set), every
-- active group admin should appear as a tournament organizer — and the
-- list should update live as admins are promoted, demoted, or leave
-- the group. We could derive this at read time (and getTournamentManager
-- already does), but the displayed Organizer list, the
-- /api/tournaments/[id]/organizers endpoint, and any future export that
-- reads tournament_organizers directly would all drift. Make
-- tournament_organizers the source of truth by syncing it.
--
-- The challenge: an admin who's also been manually added to
-- tournament_organizers shouldn't disappear from the list when they
-- get demoted from the host group. We track origin with a `source`
-- column; only `host_group_admin` rows get auto-removed.

ALTER TABLE tournament_organizers
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'host_group_admin'));

-- ============================================================
-- Trigger: group admin promoted/added → add as organizer for every
-- tournament hosted by that group.
-- ============================================================
CREATE OR REPLACE FUNCTION sync_tournament_organizers_promote()
RETURNS TRIGGER AS $$
BEGIN
  -- Fires on INSERT with admin role, or UPDATE that promotes to admin.
  IF NEW.group_role = 'admin' AND (
       TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND OLD.group_role IS DISTINCT FROM 'admin')
     ) THEN
    INSERT INTO tournament_organizers (tournament_id, profile_id, source)
    SELECT t.id, NEW.player_id, 'host_group_admin'
    FROM tournaments t
    WHERE t.host_group_id = NEW.group_id
    ON CONFLICT (tournament_id, profile_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Trigger: group admin demoted or removed → remove `host_group_admin`
-- organizer rows. Manual rows are preserved.
-- ============================================================
CREATE OR REPLACE FUNCTION sync_tournament_organizers_demote()
RETURNS TRIGGER AS $$
BEGIN
  -- DELETE of an admin row, or UPDATE that demotes from admin.
  IF TG_OP = 'DELETE' AND OLD.group_role = 'admin' THEN
    DELETE FROM tournament_organizers o
    USING tournaments t
    WHERE t.id = o.tournament_id
      AND t.host_group_id = OLD.group_id
      AND o.profile_id = OLD.player_id
      AND o.source = 'host_group_admin';
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE'
        AND OLD.group_role = 'admin'
        AND NEW.group_role IS DISTINCT FROM 'admin' THEN
    DELETE FROM tournament_organizers o
    USING tournaments t
    WHERE t.id = o.tournament_id
      AND t.host_group_id = OLD.group_id
      AND o.profile_id = OLD.player_id
      AND o.source = 'host_group_admin';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS group_memberships_sync_organizers_promote ON group_memberships;
CREATE TRIGGER group_memberships_sync_organizers_promote
AFTER INSERT OR UPDATE OF group_role ON group_memberships
FOR EACH ROW EXECUTE FUNCTION sync_tournament_organizers_promote();

-- Two separate demote triggers because Postgres can't combine
-- `UPDATE OF column` with DELETE in one CREATE TRIGGER statement.
DROP TRIGGER IF EXISTS group_memberships_sync_organizers_demote_update ON group_memberships;
CREATE TRIGGER group_memberships_sync_organizers_demote_update
AFTER UPDATE OF group_role ON group_memberships
FOR EACH ROW EXECUTE FUNCTION sync_tournament_organizers_demote();

DROP TRIGGER IF EXISTS group_memberships_sync_organizers_demote_delete ON group_memberships;
CREATE TRIGGER group_memberships_sync_organizers_demote_delete
AFTER DELETE ON group_memberships
FOR EACH ROW EXECUTE FUNCTION sync_tournament_organizers_demote();

-- ============================================================
-- Trigger: tournament host_group_id changes → reconcile organizer
-- rows. Set from null → group, or A → B: remove old auto rows and
-- pull in the new group's current admins. Set back to null: remove
-- all auto rows.
-- ============================================================
CREATE OR REPLACE FUNCTION sync_tournament_organizers_on_host_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.host_group_id IS NOT NULL THEN
      INSERT INTO tournament_organizers (tournament_id, profile_id, source)
      SELECT NEW.id, gm.player_id, 'host_group_admin'
      FROM group_memberships gm
      WHERE gm.group_id = NEW.host_group_id
        AND gm.group_role = 'admin'
      ON CONFLICT (tournament_id, profile_id) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE path
  IF NEW.host_group_id IS DISTINCT FROM OLD.host_group_id THEN
    -- Remove auto rows tied to the old host group.
    DELETE FROM tournament_organizers
    WHERE tournament_id = NEW.id AND source = 'host_group_admin';
    -- Pull in the new host group's current admins.
    IF NEW.host_group_id IS NOT NULL THEN
      INSERT INTO tournament_organizers (tournament_id, profile_id, source)
      SELECT NEW.id, gm.player_id, 'host_group_admin'
      FROM group_memberships gm
      WHERE gm.group_id = NEW.host_group_id
        AND gm.group_role = 'admin'
      ON CONFLICT (tournament_id, profile_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tournaments_sync_organizers_on_host_change ON tournaments;
CREATE TRIGGER tournaments_sync_organizers_on_host_change
AFTER INSERT OR UPDATE OF host_group_id ON tournaments
FOR EACH ROW EXECUTE FUNCTION sync_tournament_organizers_on_host_change();

-- ============================================================
-- Backfill: existing tournaments with host_group_id set should have
-- their group admins propagated. (Currently zero such tournaments,
-- but this keeps the migration idempotent for any retroactive set.)
-- ============================================================
INSERT INTO tournament_organizers (tournament_id, profile_id, source)
SELECT t.id, gm.player_id, 'host_group_admin'
FROM tournaments t
JOIN group_memberships gm
  ON gm.group_id = t.host_group_id
 AND gm.group_role = 'admin'
WHERE t.host_group_id IS NOT NULL
ON CONFLICT (tournament_id, profile_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
