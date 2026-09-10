export type UserLocation = {
  /** Demo identity of the fixed traveler position. */
  label: string;
  area: string;
  city: "Mumbai" | "Navi Mumbai";
  coordinates: [number, number];
  station: string;
  /** Shown in the UI so nobody mistakes the static point for live geolocation. */
  note: string;
};

/**
 * Static demo traveler position for the prototype: a point on the Marine Drive
 * promenade near the Churchgate end, snapped to the actual OSM walkway so the
 * demo pin sits on the seafront path rather than in the water. Geolocation is
 * deliberately not used; every screen labels this as a fixed demo position.
 * Swap this one record to move the demo persona.
 */
export const demoUserLocation: UserLocation = {
  label: "Marine Drive promenade",
  area: "Churchgate",
  city: "Mumbai",
  coordinates: [72.82339, 18.93367],
  station: "Churchgate",
  note: "Fixed demo location",
};

/** Great-circle distance in kilometers between two [lng, lat] pairs. */
export function haversineKm(from: [number, number], to: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Round-trip walking estimate: five minutes per kilometer, at least one minute. */
export function walkMinutesFor(km: number): number {
  return Math.max(1, Math.round(km * 5));
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** Full names for station codes so out-of-town readers are not decoding abbreviations. */
const STATION_EXPANSIONS: Record<string, string> = {
  CSMT: "CSMT (Chhatrapati Shivaji Terminus)",
  CST: "CST (Chhatrapati Shivaji Terminus)",
  KYN: "KYN (Kalyan Junction)",
  VSH: "VSH (Vashi)",
  "Andheri West": "Andheri West metro",
};

export function stationLabel(station: string): string {
  return STATION_EXPANSIONS[station] ?? station;
}

/** Distance from the static demo position to an experience. */
export function distanceFromUser(coordinates: [number, number]): number {
  return haversineKm(demoUserLocation.coordinates, coordinates);
}

/**
 * Straight-line distance plus a street-factor allowance, expressed as walking
 * minutes. Grid streets never match the crow line; 1.3 is the usual planning
 * factor. This is an estimate label, never a route claim.
 */
export function estimateFromUser(coordinates: [number, number]) {
  const km = distanceFromUser(coordinates);
  return { km, walkMinutes: walkMinutesFor(km * 1.3) };
}

export type DistanceEstimate = {
  id: string;
  km: number;
  walkMinutes: number;
  label: string;
};

export function estimateAllFromUser(experiences: { id: string; coordinates: [number, number] }[]): Record<string, DistanceEstimate> {
  return Object.fromEntries(
    experiences.map((experience) => {
      const { km, walkMinutes } = estimateFromUser(experience.coordinates);
      return [experience.id, { id: experience.id, km, walkMinutes, label: `${formatDistance(km)} · about ${walkMinutes} min walk` }];
    }),
  );
}

/**
 * Soft proximity score for the recommendation engine: nearest options gain up
 * to 3 points, anything beyond 20 km gains nothing. Deterministic.
 */
export function proximityBonus(km: number): number {
  if (km <= 2) return 3;
  if (km <= 5) return 2;
  if (km <= 10) return 1;
  return 0;
}

/** Bucket label for nearby-grouping UI, keyed by walking time. */
export function bandFor(walkMinutes: number): "Walkable" | "Short ride" | "Across town" {
  if (walkMinutes <= 25) return "Walkable";
  if (walkMinutes <= 60) return "Short ride";
  return "Across town";
}
