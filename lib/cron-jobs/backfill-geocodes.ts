/**
 * Backfill latitude/longitude on shootout_groups and tournaments
 * whenever a row has location data (city/state, or for tournaments
 * the venue location field as a fallback) but no coordinates.
 *
 * Runs as part of the consolidated 5-minute tick. New rows enter
 * the nearby-search index within 5 minutes of being created or
 * having their city/state edited — fast enough that organizers
 * don't notice, slow enough that we never block a write on an
 * external HTTP call.
 *
 * Geocoding hits free public APIs (US Census + Nominatim fallback)
 * with a 30-day cache, so even if the same city shows up across
 * dozens of groups it's one upstream request total.
 *
 * To keep external API load reasonable each tick, we cap the per-
 * run batch at 25 rows of each type. The job is idempotent — rows
 * that fail to geocode (typo, ambiguous, venue-only string) stay
 * NULL and can be retried next tick.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { geocodeLocation } from "@/lib/geocode";

const BATCH_PER_RUN = 25;

export async function runBackfillGeocodes(): Promise<{
  groupsGeocoded: number;
  tournamentsGeocoded: number;
}> {
  const supabase = await createServiceClient();

  let groupsGeocoded = 0;
  let tournamentsGeocoded = 0;

  // Groups — only ones with city/state but no lat/lon. Active or
  // not; geocoding an inactive row costs nothing and lets it appear
  // immediately if it's reactivated.
  const { data: groups } = await supabase
    .from("shootout_groups")
    .select("id, city, state")
    .is("latitude", null)
    .not("city", "is", null)
    .not("state", "is", null)
    .limit(BATCH_PER_RUN);

  for (const g of groups ?? []) {
    const query = `${g.city}, ${g.state}`;
    const result = await geocodeLocation(query);
    if (!result) continue;
    await supabase
      .from("shootout_groups")
      .update({ latitude: result.lat, longitude: result.lon })
      .eq("id", g.id);
    groupsGeocoded++;
  }

  // Tournaments — prefer city/state when set, fall back to the
  // venue location field. Venue names usually fail to resolve but
  // it's the only signal we have for legacy rows that pre-date the
  // city/state columns.
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, city, state, location")
    .is("latitude", null)
    .neq("status", "cancelled")
    .limit(BATCH_PER_RUN);

  for (const t of tournaments ?? []) {
    const query =
      t.city && t.state
        ? `${t.city}, ${t.state}`
        : t.location?.trim()
        ? t.location.trim()
        : null;
    if (!query) continue;
    const result = await geocodeLocation(query);
    if (!result) continue;
    await supabase
      .from("tournaments")
      .update({ latitude: result.lat, longitude: result.lon })
      .eq("id", t.id);
    tournamentsGeocoded++;
  }

  return { groupsGeocoded, tournamentsGeocoded };
}
