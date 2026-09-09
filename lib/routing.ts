/**
 * Real walking routes fetched from the open OSRM servers that run on
 * OpenStreetMap data. No key and no paid service. If routing is unreachable,
 * callers get an honest straight-line estimate instead of a fake street
 * route. Route data is (c) OpenStreetMap contributors.
 */

export type RouteStep = {
  instruction: string;
  streetName: string;
  distanceMeters: number;
  durationMinutes: number;
};

export type StreetRoute = {
  kind: "street" | "estimate";
  coordinates: [number, number][];
  distanceKm: number;
  durationMinutes: number;
  steps: RouteStep[];
  note: string;
};

const ROUTER_BASES = ["https://routing.openstreetmap.de", "https://router.project-osrm.org"];
const MAX_STEPS = 14;

/** Travel modes the demo compares, each with its real OSRM profile. */
export type TravelMode = "foot" | "bike" | "car";

export const TRAVEL_MODES: Array<{ id: TravelMode; label: string; hint: string }> = [
  { id: "foot", label: "Walk", hint: "Footpaths and promenades" },
  { id: "bike", label: "Cycle", hint: "Cycle-friendly streets" },
  { id: "car", label: "Drive", hint: "Road network" },
];

const PROFILE_BY_MODE: Record<TravelMode, string> = { foot: "foot", bike: "bike", car: "car" };

const MODE_FALLBACK_NOTE: Record<TravelMode, string> = {
  foot: "Live routing is unreachable right now, so this is a straight-line estimate, not a street route.",
  bike: "Live cycle routing is unreachable, so this is a straight-line estimate, not a street route.",
  car: "Live drive routing is unreachable, so this is a straight-line estimate, not a street route.",
};

/** Planning fallback speeds (km/h) per mode, used only when routers are down. */
const MODE_FALLBACK_KMH: Record<TravelMode, number> = { foot: 5, bike: 12, car: 22 };

/** Human instruction for one OSRM maneuver step. */
export function instructionFor(maneuver: { type: string; modifier?: string }): string {
  const { type, modifier } = maneuver;
  if (type === "depart") return "Start";
  if (type === "arrive") return "Arrive at your destination";
  if (type === "roundabout" || type === "rotary") return "Take the roundabout";
  if (type === "merge") return "Merge";
  if (type === "fork") return modifier?.includes("left") ? "Keep left" : "Keep right";
  if (type === "turn" || type === "continue" || type === "new name") {
    if (modifier === "left") return "Turn left";
    if (modifier === "right") return "Turn right";
    if (modifier === "slight left") return "Bear left";
    if (modifier === "slight right") return "Bear right";
    if (modifier === "sharp left") return "Turn sharp left";
    if (modifier === "sharp right") return "Turn sharp right";
    if (modifier === "uturn") return "Make a U-turn";
    return "Continue";
  }
  return "Continue";
}

/** Build display steps from an OSRM leg, capped to the most useful ones. */
export function stepsFromLeg(leg: { steps?: Array<{ maneuver: { type: string; modifier?: string }; name?: string; distance: number; duration: number }> }): RouteStep[] {
  const raw = leg.steps ?? [];
  const steps: RouteStep[] = raw.map((step) => ({
    instruction: instructionFor(step.maneuver),
    streetName: step.name ?? "",
    distanceMeters: Math.round(step.distance),
    durationMinutes: Math.max(1, Math.round(step.duration / 60)),
  }));
  if (steps.length <= MAX_STEPS) return steps;
  // Keep the departure, the arrival, and the longest intermediate moves in
  // their original walking order.
  const middle = steps
    .map((step, index) => ({ step, index }))
    .slice(1, -1)
    .sort((a, b) => b.step.distanceMeters - a.step.distanceMeters)
    .slice(0, MAX_STEPS - 2)
    .sort((a, b) => a.index - b.index)
    .map(({ step }) => step);
  return [steps[0], ...middle, steps[steps.length - 1]];
}

/** Position along a polyline at fraction t (0 to 1) by walking distance. */
export function positionAlongRoute(coordinates: [number, number][], t: number): [number, number] {
  if (coordinates.length === 0) return [0, 0];
  if (coordinates.length === 1) return coordinates[0];
  const clamped = Math.min(1, Math.max(0, t));
  const meters = (a: [number, number], b: [number, number]) => {
    const R = 6371000;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const x = dLng * Math.cos(toRad((a[1] + b[1]) / 2));
    return R * Math.sqrt(x * x + dLat * dLat);
  };
  let total = 0;
  const cumulative: number[] = [0];
  for (let i = 1; i < coordinates.length; i++) {
    total += meters(coordinates[i - 1], coordinates[i]);
    cumulative.push(total);
  }
  if (total === 0) return coordinates[coordinates.length - 1];
  const target = clamped * total;
  for (let i = 1; i < coordinates.length; i++) {
    if (cumulative[i] >= target) {
      const seg = cumulative[i] - cumulative[i - 1];
      const f = seg === 0 ? 0 : (target - cumulative[i - 1]) / seg;
      return [
        coordinates[i - 1][0] + (coordinates[i][0] - coordinates[i - 1][0]) * f,
        coordinates[i - 1][1] + (coordinates[i][1] - coordinates[i - 1][1]) * f,
      ];
    }
  }
  return coordinates[coordinates.length - 1];
}

export function routeCacheKey(from: [number, number], to: [number, number], mode: TravelMode = "foot"): string {
  const round = (v: number) => v.toFixed(4);
  return `ananta-route-${mode}-${round(from[0])},${round(from[1])}-${round(to[0])},${round(to[1])}`;
}

/**
 * Fetch a real walking route between two [lng, lat] points. Falls back to a
 * clearly-labeled straight-line estimate when every router fails. Results are
 * cached per origin-destination pair in sessionStorage for the session.
 */
export async function fetchStreetRoute(from: [number, number], to: [number, number], mode: TravelMode = "foot"): Promise<StreetRoute> {
  const cacheKey = routeCacheKey(from, to, mode);
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as StreetRoute;
  } catch {
    // Storage may be unavailable; routing proceeds without a cache.
  }

  const query = `${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=true`;
  for (const base of ROUTER_BASES) {
    try {
      const response = await fetch(`${base}/routed-${PROFILE_BY_MODE[mode]}/route/v1/${PROFILE_BY_MODE[mode]}/${query}`);
      if (!response.ok) continue;
      const data = (await response.json()) as {
        code: string;
        routes?: Array<{
          distance: number;
          duration: number;
          geometry: { coordinates: [number, number][] };
          legs?: Array<{ steps?: Array<{ maneuver: { type: string; modifier?: string }; name?: string; distance: number; duration: number }> }>;
        }>;
      };
      const route = data.routes?.[0];
      if (data.code !== "Ok" || !route) continue;
      const streetRoute: StreetRoute = {
        kind: "street",
        coordinates: route.geometry.coordinates,
        distanceKm: route.distance / 1000,
        durationMinutes: Math.max(1, Math.round(route.duration / 60)),
        steps: route.legs ? stepsFromLeg(route.legs[0]) : [],
        note: mode === "foot"
          ? "Walking route from OpenStreetMap data. Route data (c) OpenStreetMap contributors."
          : mode === "bike"
            ? "Cycle route from OpenStreetMap data; carry your own cycle. Route data (c) OpenStreetMap contributors."
            : "Drive route from OpenStreetMap data; it does not account for live traffic. Route data (c) OpenStreetMap contributors.",
      };
      try { sessionStorage.setItem(cacheKey, JSON.stringify(streetRoute)); } catch { /* cache is best effort */ }
      return streetRoute;
    } catch {
      // Try the next open router before falling back.
    }
  }

  const straightKm = haversineKmForFallback(from, to);
  const estimate: StreetRoute = {
    kind: "estimate",
    coordinates: [from, to],
    distanceKm: straightKm,
    durationMinutes: Math.max(1, Math.round((straightKm * 1.3 * 60) / MODE_FALLBACK_KMH[mode])),
    steps: [],
    note: MODE_FALLBACK_NOTE[mode],
  };
  try { sessionStorage.setItem(cacheKey, JSON.stringify(estimate)); } catch { /* cache is best effort */ }
  return estimate;
}

function haversineKmForFallback(from: [number, number], to: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(to[1] - from[1]);
  const dLng = toRad(to[0] - from[0]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from[1])) * Math.cos(toRad(to[1])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
