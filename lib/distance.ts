/**
 * Haversine distance in miles between two lat/lon points.
 * Used to refine the bounding-box prefilter we do in SQL.
 */
const EARTH_RADIUS_MI = 3959;

export function haversineMi(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MI * c;
}

/**
 * Convert a radius in miles to lat/lon degree deltas for a
 * bounding-box prefilter. Latitude is constant (~69 mi/deg);
 * longitude shrinks toward the poles by cos(lat). The bbox is
 * deliberately generous — we widen the lon delta with /max(0.1)
 * to avoid div-by-zero at the poles, which we'd never hit but
 * which makes the function safe to copy elsewhere.
 */
export function bboxFromRadius(
  lat: number,
  radiusMi: number
): { latDelta: number; lonDelta: number } {
  const latDelta = radiusMi / 69;
  const lonDelta =
    radiusMi / (69 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { latDelta, lonDelta };
}
