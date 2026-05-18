-- Pending club-attach requests for newly-created groups.
--
-- Today: when a user creates a group with a `?club=<id>` query param
-- but isn't a club admin, the create flow silently drops the attach
-- and creates the group standalone. That's safe but invisible — the
-- creator has no recourse and the club admins never see the request.
--
-- This migration adds an explicit request queue:
--
--   1. A signed-in user creates a group and picks a club they don't
--      manage. The group lands standalone (`shootout_groups.club_id`
--      stays NULL); a `pending` row in club_group_requests captures
--      the intent.
--   2. Club admins see a "Pending group requests" section on the
--      club manage page and click Approve / Reject.
--   3. Approval flips `shootout_groups.club_id` to the club id and
--      marks the request row `approved`. Rejection just marks the
--      row `rejected` and leaves the group standalone.
--
-- Additivity guarantee: no existing row in any table is touched.
-- New table only; standalone groups, clubbed groups, club admin
-- inheritance, every existing flow keeps working as-is.

CREATE TABLE IF NOT EXISTS club_group_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  group_id      UUID NOT NULL REFERENCES shootout_groups(id) ON DELETE CASCADE,
  requested_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Short message the requester can leave for the club admins ("We
  -- play Tuesdays at the same courts as your Monday group"). Optional.
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Only one pending or resolved row per (club, group). A rejected
  -- request blocks a re-request — the requester can ask the club
  -- admin to re-open it manually. Keeps the queue from being spammed
  -- by repeated submissions.
  UNIQUE (club_id, group_id)
);

CREATE INDEX IF NOT EXISTS club_group_requests_club_idx
  ON club_group_requests (club_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS club_group_requests_requester_idx
  ON club_group_requests (requested_by, created_at DESC);

ALTER TABLE club_group_requests ENABLE ROW LEVEL SECURITY;

-- Read policy: anyone who can see the club (public clubs are visible
-- to all; private clubs are visible to members + admins). Mutations
-- go through the API routes using the service client.
DROP POLICY IF EXISTS "Read club group requests" ON club_group_requests;
CREATE POLICY "Read club group requests"
  ON club_group_requests FOR SELECT USING (
    EXISTS (SELECT 1 FROM clubs c WHERE c.id = club_group_requests.club_id)
  );

DROP POLICY IF EXISTS "Site admins manage club group requests" ON club_group_requests;
CREATE POLICY "Site admins manage club group requests"
  ON club_group_requests FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

NOTIFY pgrst, 'reload schema';
