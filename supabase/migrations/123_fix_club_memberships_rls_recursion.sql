-- Break the infinite recursion between clubs and club_memberships
-- RLS policies introduced in migration 122.
--
-- The original `Read club memberships` policy gated visibility on
-- whether the viewer was a member of the (possibly private) club —
-- which required reading clubs — whose own SELECT policy referenced
-- club_memberships back. Postgres aborts these queries with 42P17.
-- Symptom: creating a club succeeded server-side, but the redirect
-- to /clubs/[slug] 404'd because the page's SELECT against `clubs`
-- bubbled the recursion error and the maybeSingle came back null.
--
-- Fix: mirror the long-standing group_memberships convention —
-- anyone can SELECT membership rows. Privacy stays enforced at the
-- clubs table itself (the existence of a membership row is moot for
-- an outsider; they still can't read the private club it points
-- to). Sensitive operations (writes, member removal) continue to
-- flow through API routes with explicit auth checks.

DROP POLICY IF EXISTS "Read club memberships" ON club_memberships;
CREATE POLICY "Read club memberships"
  ON club_memberships FOR SELECT USING (true);

NOTIFY pgrst, 'reload schema';
