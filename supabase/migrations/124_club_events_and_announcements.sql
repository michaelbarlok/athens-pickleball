-- Club events + RSVPs + announcements.
--
-- Two new content types live under a club:
--
--   1. Club events — one-off socials, cookouts, opening day, clinic,
--      annual meeting. NOT sheets (no ladder mechanics, no auto-post,
--      no session). NOT tournaments (no bracket, no register API).
--      Just "is this happening? RSVP yes/no/maybe and (optionally)
--      bring guests." Future: optional fee gated by Stripe.
--
--   2. Club announcements — broadcast to every club member via the
--      existing notifyMany pipeline (push + email). Mirrors the
--      group_announcements shape so the UX feels familiar.
--
-- Additivity guarantee: this migration creates three new tables and
-- their RLS policies. No existing row in any table is updated,
-- deleted, or has its shape changed. Standalone groups, sheets,
-- tournaments, sessions, rankings — every existing surface keeps
-- working unchanged. Deleting a club CASCADEs through these new
-- tables but stops at the club boundary; nothing inside an attached
-- group is touched.

-- ────────────────────────────────────────────────────────────
-- 1. club_events
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  -- Wall-clock interpretation — store the actual instant in
  -- event_at (TIMESTAMPTZ) and the IANA zone the admin used when
  -- typing the time in `timezone`. Display surfaces convert via
  -- formatDateInZone/formatTimeInZone, the same way sheets do.
  event_at     TIMESTAMPTZ NOT NULL,
  end_at       TIMESTAMPTZ NULL,
  timezone     TEXT NOT NULL DEFAULT 'America/New_York',
  location     TEXT,
  -- Optional cap on the number of YES RSVPs. Null = uncapped (the
  -- common case for a social). Once cap is set, the form refuses
  -- additional yeses but still lets members RSVP maybe / no.
  capacity     INT NULL CHECK (capacity IS NULL OR capacity > 0),
  -- Lets the YES form ask "how many guests?" — useful for cookouts
  -- where members bring spouses / kids. Counts against capacity.
  allow_guests BOOLEAN NOT NULL DEFAULT false,
  -- Stripe stub for the future paid-events flow. Today the column
  -- exists so we don't have to migrate again later; nothing in the
  -- app reads it yet.
  fee_cents    INT NULL CHECK (fee_cents IS NULL OR fee_cents >= 0),
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  cancellation_message TEXT,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS club_events_club_idx
  ON club_events (club_id, event_at DESC);
CREATE INDEX IF NOT EXISTS club_events_upcoming_idx
  ON club_events (event_at)
  WHERE is_cancelled = false;

-- ────────────────────────────────────────────────────────────
-- 2. club_event_rsvps
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_event_rsvps (
  event_id      UUID NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'yes'
                CHECK (status IN ('yes', 'no', 'maybe')),
  guest_count   INT NOT NULL DEFAULT 0 CHECK (guest_count >= 0),
  note          TEXT,
  responded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS club_event_rsvps_profile_idx
  ON club_event_rsvps (profile_id);
CREATE INDEX IF NOT EXISTS club_event_rsvps_status_idx
  ON club_event_rsvps (event_id, status);

-- ────────────────────────────────────────────────────────────
-- 3. club_announcements
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  sent_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS club_announcements_club_idx
  ON club_announcements (club_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 4. updated_at triggers
-- ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS club_events_set_updated_at_trg ON club_events;
CREATE TRIGGER club_events_set_updated_at_trg
BEFORE UPDATE ON club_events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 5. RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE club_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_announcements ENABLE ROW LEVEL SECURITY;

-- Events visible to anyone who can read the parent club. Same
-- "public club readable to all, private club to members" model
-- the clubs table itself enforces — no need to re-evaluate
-- privacy here, just pass through.
DROP POLICY IF EXISTS "Read club events" ON club_events;
CREATE POLICY "Read club events"
  ON club_events FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clubs c WHERE c.id = club_events.club_id
    )
  );

-- Writes via server-side service client only (the API routes use
-- getClubManager for the auth gate). Keep a permissive policy
-- here so site admins can repair through the SQL editor if needed.
DROP POLICY IF EXISTS "Site admins manage club events" ON club_events;
CREATE POLICY "Site admins manage club events"
  ON club_events FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RSVPs readable by anyone (mirrors group_memberships convention
-- to avoid recursion with the clubs read policy and to keep the
-- "who's coming" list visible to other members for planning).
DROP POLICY IF EXISTS "Read club event RSVPs" ON club_event_rsvps;
CREATE POLICY "Read club event RSVPs"
  ON club_event_rsvps FOR SELECT USING (true);

DROP POLICY IF EXISTS "Site admins manage RSVPs" ON club_event_rsvps;
CREATE POLICY "Site admins manage RSVPs"
  ON club_event_rsvps FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Read club announcements" ON club_announcements;
CREATE POLICY "Read club announcements"
  ON club_announcements FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clubs c WHERE c.id = club_announcements.club_id
    )
  );

DROP POLICY IF EXISTS "Site admins manage announcements" ON club_announcements;
CREATE POLICY "Site admins manage announcements"
  ON club_announcements FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

NOTIFY pgrst, 'reload schema';
