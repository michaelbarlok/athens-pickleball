/**
 * Geocoding helper used by:
 *   - the weather chip (already cached in weather_geocode_cache)
 *   - the nearby-search backfill job that populates lat/lon on
 *     groups and tournaments
 *
 * Tries the US Census Bureau onelineaddress endpoint first
 * (preferred for street addresses) and falls back to OpenStreetMap's
 * Nominatim for city/state-only inputs Census can't resolve.
 * Both APIs are free, key-less, and rate-limited; the 30-day cache
 * eats the long tail.
 */
import { createServiceClient } from "@/lib/supabase/server";

const USER_AGENT = "TriStarPickleball/1.0 (info@tristarpickleball.com)";
const GEOCODE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function geocodeLocation(
  location: string
): Promise<{ lat: number; lon: number } | null> {
  const trimmed = location.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  const service = await createServiceClient();

  const { data: cached } = await service
    .from("weather_geocode_cache")
    .select("lat, lon, fetched_at")
    .eq("location_key", key)
    .maybeSingle();

  if (
    cached &&
    Date.now() - new Date(cached.fetched_at).getTime() < GEOCODE_TTL_MS
  ) {
    return { lat: Number(cached.lat), lon: Number(cached.lon) };
  }

  let lat: number | null = null;
  let lon: number | null = null;
  let resolvedName: string | null = null;

  // Census Bureau — best for full street addresses
  try {
    const url = new URL(
      "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
    );
    url.searchParams.set("address", trimmed);
    url.searchParams.set("benchmark", "Public_AR_Current");
    url.searchParams.set("format", "json");
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const match = data?.result?.addressMatches?.[0];
      if (match) {
        const cy = Number(match.coordinates?.y);
        const cx = Number(match.coordinates?.x);
        if (Number.isFinite(cy) && Number.isFinite(cx)) {
          lat = cy;
          lon = cx;
          resolvedName = match.matchedAddress ?? null;
        }
      }
    }
  } catch {
    /* fall through to Nominatim */
  }

  // Nominatim (OpenStreetMap) — handles city/state and venue names
  if (lat === null || lon === null) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", trimmed);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "us");
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const match = Array.isArray(data) ? data[0] : null;
        if (match) {
          const ny = Number(match.lat);
          const nx = Number(match.lon);
          if (Number.isFinite(ny) && Number.isFinite(nx)) {
            lat = ny;
            lon = nx;
            resolvedName = (match.display_name as string | undefined) ?? null;
          }
        }
      }
    } catch {
      /* return null */
    }
  }

  if (lat === null || lon === null) return null;

  await service.from("weather_geocode_cache").upsert({
    location_key: key,
    lat,
    lon,
    resolved_name: resolvedName,
    fetched_at: new Date().toISOString(),
  });

  return { lat, lon };
}
