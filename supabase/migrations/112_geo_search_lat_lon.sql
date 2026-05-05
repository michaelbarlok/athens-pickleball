-- ============================================================
-- Migration 112: Lat/lon on groups and tournaments for nearby search
--
-- Adds geocoded coordinates so the new "Find near me" search flow
-- can do distance-based queries via SQL Haversine. A B-tree index
-- on (latitude, longitude) lets the query do a fast bounding-box
-- prefilter before the per-row distance refinement.
--
-- Tournaments also get city + state columns (groups already had
-- them via migration 027) so that geocoding has a reliable input
-- — venue names like "Ingleside Pickleball Courts" don't always
-- resolve through the public geocoders we use.
--
-- Coordinates are populated asynchronously by the
-- /api/cron/backfill-geocodes job. A row missing lat/lon simply
-- won't appear in nearby results until the job has filled them in.
-- ============================================================

ALTER TABLE shootout_groups
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS shootout_groups_latlon_idx
  ON shootout_groups (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS tournaments_latlon_idx
  ON tournaments (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

NOTIFY pgrst, 'reload schema';
