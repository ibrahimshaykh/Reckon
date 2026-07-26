export type Coordinates = { latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371;

// Great-circle distance — deliberately not a routing API (no card on
// file). Good enough to compare "who has to travel further", not to
// generate turn-by-turn directions (that's Maps' job, via the deep link).
export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function totalTravelDistanceKm(
  destination: Coordinates,
  homes: Coordinates[],
): number {
  return homes.reduce((sum, home) => sum + haversineDistanceKm(home, destination), 0);
}

export function pickFairestMeetingPoint(
  options: { proposalId: string; location: Coordinates }[],
  homes: Coordinates[],
): { proposalId: string; totalDistanceKm: number } | null {
  if (options.length === 0 || homes.length === 0) return null;

  return options
    .map((o) => ({
      proposalId: o.proposalId,
      totalDistanceKm: totalTravelDistanceKm(o.location, homes),
    }))
    .sort((a, b) => a.totalDistanceKm - b.totalDistanceKm)[0];
}
