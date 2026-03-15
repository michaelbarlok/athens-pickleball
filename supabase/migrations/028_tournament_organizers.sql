-- ============================================================
-- Migration 028: Tournament Co-Organizers
-- Adds a tournament_organizers table so tournament creators can
-- designate co-organizers who share full management permissions.
-- ============================================================

CREATE TABLE tournament_organizers (
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tournament_id, profile_id)
);

ALTER TABLE tournament_organizers ENABLE ROW LEVEL SECURITY;

-- Anyone can see who the organizers are
CREATE POLICY "View tournament organizers"
  ON tournament_organizers FOR SELECT USING (true);

-- Creator or site admin can manage organizers
CREATE POLICY "Manage tournament organizers"
  ON tournament_organizers FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id
      AND t.created_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- Update existing RLS policies to include co-organizers
-- ============================================================

-- Helper: check if current user is an organizer of a given tournament
-- (creator, co-organizer, or site admin)
CREATE OR REPLACE FUNCTION is_tournament_organizer(t_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
    AND (
      p.role = 'admin'
      OR EXISTS (SELECT 1 FROM tournaments t WHERE t.id = t_id AND t.created_by = p.id)
      OR EXISTS (SELECT 1 FROM tournament_organizers o WHERE o.tournament_id = t_id AND o.profile_id = p.id)
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- tournaments: update policy
DROP POLICY IF EXISTS "Update tournaments" ON tournaments;
CREATE POLICY "Update tournaments"
  ON tournaments FOR UPDATE USING (is_tournament_organizer(id));

-- tournaments: delete policy
DROP POLICY IF EXISTS "Delete tournaments" ON tournaments;
CREATE POLICY "Delete tournaments"
  ON tournaments FOR DELETE USING (is_tournament_organizer(id));

-- tournaments: view drafts by co-organizers too
DROP POLICY IF EXISTS "View tournaments" ON tournaments;
CREATE POLICY "View tournaments"
  ON tournaments FOR SELECT USING (
    status != 'draft'
    OR is_tournament_organizer(id)
  );

-- tournament_registrations: update
DROP POLICY IF EXISTS "Update registrations" ON tournament_registrations;
CREATE POLICY "Update registrations"
  ON tournament_registrations FOR UPDATE USING (
    player_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_tournament_organizer(tournament_id)
  );

-- tournament_registrations: delete
DROP POLICY IF EXISTS "Delete registrations" ON tournament_registrations;
CREATE POLICY "Delete registrations"
  ON tournament_registrations FOR DELETE USING (
    is_tournament_organizer(tournament_id)
  );

-- tournament_matches: manage
DROP POLICY IF EXISTS "Manage matches" ON tournament_matches;
CREATE POLICY "Manage matches"
  ON tournament_matches FOR ALL USING (
    is_tournament_organizer(tournament_id)
  );
