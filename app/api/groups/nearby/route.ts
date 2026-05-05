export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { bboxFromRadius, haversineMi } from "@/lib/distance";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_RADIUS_MI = 30;
const MAX_RADIUS_MI = 200;

/**
 * GET /api/groups/nearby?lat=&lon=&radius_miles=
 *
 * Returns publicly-discoverable, active groups within the given
 * radius, sorted by distance ascending. Each row includes a
 * `distance_mi` field.
 *
 * Strategy:
 *   1. Query the DB with a bounding-box filter on (latitude,
 *      longitude). The partial B-tree index from migration 112
 *      makes this an index scan even on a large catalogue.
 *   2. Refine in JS with a Haversine pass to drop the ~21% of
 *      bbox-matched rows that fall outside the actual circle.
 *   3. Sort by distance and return.
 *
 * No auth required — the data is the same publicly-discoverable
 * subset shown on /groups, just narrowed by location.
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
    .from("shootout_groups")
    .select("id, name, slug, group_type, ladder_type, city, state, latitude, longitude, is_active, visibility")
    .eq("is_active", true)
    .eq("visibility", "public")
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
    .map((g) => ({
      ...g,
      distance_mi: haversineMi(lat, lon, Number(g.latitude), Number(g.longitude)),
    }))
    .filter((g) => g.distance_mi <= radius)
    .sort((a, b) => a.distance_mi - b.distance_mi);

  return NextResponse.json({
    groups: refined,
    count: refined.length,
    radius_miles: radius,
  });
}
