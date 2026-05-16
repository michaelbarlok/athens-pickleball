-- ============================================================
-- Clubs: an umbrella entity above shootout_groups.
-- ============================================================
-- A Club groups together one or more shootout_groups under a single
-- "organization" identity (e.g. "Cleveland Pickleball Association"
-- with a Ladder league, a Skills sessions group, and a Tournament
-- crew all sitting under it).
--
-- Design rules locked in with the user:
--   1. Club admins inherit FULL group admin rights on every group
--      with club_id pointing here. Enforced in app-layer
--      isGroupAdmin() — no fake rows are written to group_memberships,
--      so club admins never appear as members in any group's roster.
--   2. Visibility + invite flow mirror groups: public/private +
--      shareable token via club_invites.
--   3. One club per group (FK on shootout_groups.club_id, nullable).
--   4. Tournament hosting is XOR: tournaments.host_club_id added,
--      with a CHECK that bars setting both host_group_id and
--      host_club_id on the same row. Either, neither, never both.
--   5. Standalone groups remain first-class — every existing group
--      stays club_id = NULL with no behavior change.
--
-- Additivity guarantee: this migration adds tables and nullable
-- columns. It performs zero UPDATEs against existing rows and zero
-- DELETEs. Every ON DELETE behavior from a referencing table to
-- clubs is SET NULL (groups + tournaments) or CASCADE (memberships +
-- invites) — deleting a club orphans its groups back to standalone
-- but never cascades into group data.

-- ────────────────────────────────────────────────────────────
-- 1. clubs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clubs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  city        TEXT,
  state       TEXT,
  visibility  TEXT NOT NULL DEFAULT 'public'
              CHECK (visibility IN ('public', 'private')),
  logo_url    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clubs_slug_idx ON clubs (slug);
CREATE INDEX IF NOT EXISTS clubs_is_active_idx ON clubs (is_active);

-- ────────────────────────────────────────────────────────────
-- 2. club_memberships
-- ────────────────────────────────────────────────────────────
-- Composite PK matches group_memberships shape so the join semantics
-- and dedup-on-rejoin logic feel familiar.
CREATE TABLE IF NOT EXISTS club_memberships (
  club_id    UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  club_role  TEXT NOT NULL DEFAULT 'member'
             CHECK (club_role IN ('admin', 'member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (club_id, profile_id)
);

CREATE INDEX IF NOT EXISTS club_memberships_profile_idx
  ON club_memberships (profile_id);
CREATE INDEX IF NOT EXISTS club_memberships_admin_idx
  ON club_memberships (club_id) WHERE club_role = 'admin';

-- ────────────────────────────────────────────────────────────
-- 3. club_invites — shareable token, same shape as group_invites
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token      UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS club_invites_club_idx ON club_invites (club_id);

-- ────────────────────────────────────────────────────────────
-- 4. shootout_groups.club_id — optional parent club
-- ────────────────────────────────────────────────────────────
-- SET NULL on delete: if a club is deleted, the constituent groups
-- become standalone again. Group data, rankings, memberships, and
-- everything else inside the group are entirely untouched.
ALTER TABLE shootout_groups
  ADD COLUMN IF NOT EXISTS club_id UUID NULL
  REFERENCES clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shootout_groups_club_idx
  ON shootout_groups (club_id) WHERE club_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 5. tournaments.host_club_id — alternate hosting model
-- ────────────────────────────────────────────────────────────
-- Constraint: a tournament can be hosted by EITHER a group OR a club,
-- but never both. (Mirrors the user-locked "XOR" decision.) Existing
-- rows all have host_club_id IS NULL (the column didn't exist yet)
-- so the constraint is satisfiable without backfill.
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS host_club_id UUID NULL
  REFERENCES clubs(id) ON DELETE SET NULL;

-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`; drop-then-add is
-- the safe pattern. The DROP IF EXISTS is a no-op on first apply.
ALTER TABLE tournaments
  DROP CONSTRAINT IF EXISTS tournaments_host_xor_check;
ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_host_xor_check
  CHECK (NOT (host_group_id IS NOT NULL AND host_club_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS tournaments_host_club_idx
  ON tournaments (host_club_id) WHERE host_club_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 6. tournament_organizers.source — accept the new auto category
-- ────────────────────────────────────────────────────────────
-- The existing CHECK was ('manual', 'host_group_admin'). Add
-- 'host_club_admin' so future club-admin triggers can flag rows
-- they own.
ALTER TABLE tournament_organizers
  DROP CONSTRAINT IF EXISTS tournament_organizers_source_check;
ALTER TABLE tournament_organizers
  ADD CONSTRAINT tournament_organizers_source_check
  CHECK (source IN ('manual', 'host_group_admin', 'host_club_admin'));

-- ────────────────────────────────────────────────────────────
-- 7. RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_invites ENABLE ROW LEVEL SECURITY;

-- Anyone can read public clubs; members read their private clubs;
-- site admins read everything.
DROP POLICY IF EXISTS "Read clubs" ON clubs;
CREATE POLICY "Read clubs"
  ON clubs FOR SELECT USING (
    visibility = 'public'
    OR EXISTS (
      SELECT 1 FROM club_memberships cm
      WHERE cm.club_id = clubs.id
        AND cm.profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Site admins can do everything; club admins can manage their own
-- club; otherwise no client-side writes (forms route through API
-- with the service client).
DROP POLICY IF EXISTS "Club admins or site admins manage clubs" ON clubs;
CREATE POLICY "Club admins or site admins manage clubs"
  ON clubs FOR ALL USING (
    EXISTS (
      SELECT 1 FROM club_memberships cm
      WHERE cm.club_id = clubs.id
        AND cm.profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
        AND cm.club_role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Members can read their own memberships + any public-club roster.
-- Admins manage memberships server-side via service client.
DROP POLICY IF EXISTS "Read club memberships" ON club_memberships;
CREATE POLICY "Read club memberships"
  ON club_memberships FOR SELECT USING (
    profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM clubs c
      WHERE c.id = club_memberships.club_id
        AND (
          c.visibility = 'public'
          OR EXISTS (
            SELECT 1 FROM club_memberships cm2
            WHERE cm2.club_id = c.id
              AND cm2.profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Anyone can look up an invite by token (matches group_invites).
DROP POLICY IF EXISTS "Read club invites" ON club_invites;
CREATE POLICY "Read club invites" ON club_invites FOR SELECT USING (true);

DROP POLICY IF EXISTS "Club members create invites" ON club_invites;
CREATE POLICY "Club members create invites"
  ON club_invites FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM club_memberships cm
      WHERE cm.club_id = club_invites.club_id
        AND cm.profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

-- ────────────────────────────────────────────────────────────
-- 8. updated_at trigger on clubs
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION clubs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clubs_set_updated_at_trg ON clubs;
CREATE TRIGGER clubs_set_updated_at_trg
BEFORE UPDATE ON clubs
FOR EACH ROW EXECUTE FUNCTION clubs_set_updated_at();

NOTIFY pgrst, 'reload schema';
