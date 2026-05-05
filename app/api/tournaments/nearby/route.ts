export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { bboxFromRadius, haversineMi } from "@/lib/distance";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_RADIUS_MI = 30;
const MAX_RADIUS_MI = 200;

/**
 * GET /api/tournaments/nearby?lat=&lon=&radius_miles=
 *
 * Returns non-hidden, non-cancelled tournaments within the given
 * radius, sorted by distance ascending. Past tournaments are
 * excluded — the listing UI cares about what you can register
 * for or attend, not history.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const requested = Number(sp.get("radius_miles") ?? DEFAULT_RADIUS_MI);
  const radius = Math.min(
    MAX_RADIUS_MI,
    Math.max(1, Number.isFinite(requested) ? requested : DEFAULT_RADIUS_MI)
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "lat and lon query params are required" },
      { status: 400 }
    );
  }

  const { latDelta, lonDelta } = bboxFromRadius(lat, radius);
  const supabase = await createServiceClient();

  const { data: rows, error } = await supabase
    .from("tournaments")
    .select(
      "id, title, format, type, divisions, status, start_date, start_time, location, city, state, latitude, longitude, player_cap, max_teams_per_division, is_hidden, logo_url"
    )
    .eq("is_hidden", false)
    .not("status", "in", "(completed,cancelled)")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .gte("latitude", lat - latDelta)
    .lte("latitude", lat + latDelta)
    .gte("longitude", lon - lonDelta)
    .lte("longitude", lon + lonDelta);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const refined = (rows ?? [])
    .map((t) => ({
      ...t,
      distance_mi: haversineMi(lat, lon, Number(t.latitude), Number(t.longitude)),
    }))
    .filter((t) => t.distance_mi <= radius)
    .sort((a, b) => a.distance_mi - b.distance_mi);

  return NextResponse.json({
    tournaments: refined,
    count: refined.length,
    radius_miles: radius,
  });
}
