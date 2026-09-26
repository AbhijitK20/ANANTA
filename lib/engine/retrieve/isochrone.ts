/**
 * Travel-time prefilter.
 *
 * Everything here is an estimate and every return value says which kind. The UI
 * is required to print "straight-line estimate" for `basis === "haversine"`
 * and a route claim only for `basis === "corridor"`, which is a real published
 * ferry crossing. `lib/location.ts` sets that precedent.
 *
 * No city constant appears in this file. Congestion multipliers, ferry
 * corridors and neighbourhood anchors are read from `CityManifest`.
 */

import type { CityManifest, ExperienceV2, TravelMode } from "@/lib/engine/contracts";

/** Mean Earth radius, metres. */
export const EARTH_RADIUS_M = 6371008.8;

/**
 * Straight-line speed per mode, km/h. This is mode physics, not city data, so
 * it lives here rather than in the manifest, which has no field for it. A taxi
 * covers ground faster than a metro does once you count the last mile, and a
 * ferry is slower again.
 *
 * These are planning numbers, not measured ones. `SESSION/BLOCKERS/2.md` asks
 * for a `speeds` field on `CityManifest`, which is where a measured value
 * belongs.
 */
export const MODE_SPEED_KMH: Record<TravelMode, number> = {
  walk: 4.8,
  auto: 24,
  taxi: 22,
  metro: 18,
  ferry: 11,
};

/**
 * Streets never match the crow line. 1.3 is the usual planning factor and the
 * same one `lib/location.ts` uses for its walk estimate.
 */
export const STREET_FACTOR = 1.3;

/** How far an origin may sit from a neighbourhood anchor and still be
 * considered to be in that neighbourhood. 2 km is roughly the radius a person
 * will accept being described as being "in" a neighbourhood. */
export const NEIGHBOURHOOD_SNAP_KM = 2;

export type TravelBasis = "haversine" | "corridor";

export interface TravelEstimate {
  /**
   * False only when no route can be stated at all, which in practice means the
   * coordinates are missing or are the null island placeholder. Such a record
   * must never be counted as reachable.
   */
  reachable: boolean;
  minutes: number;
  km: number;
  basis: TravelBasis;
}

/** A place we can measure travel to or from. */
export interface TravelPoint {
  coordinates: [number, number];
  /** Neighbourhood name. Present when known; used only to match a ferry corridor. */
  area?: string;
}

/** Great-circle distance in metres between two `[lng, lat]` pairs. */
export function haversineMetres(from: [number, number], to: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The congestion multiplier for a mode, defaulting to 1 when a manifest omits it. */
function congestion(manifest: CityManifest, mode: TravelMode): number {
  const value = manifest.congestion[mode];
  return typeof value === "number" && value > 0 ? value : 1;
}

function isMeasurable(point: TravelPoint): boolean {
  const [lng, lat] = point.coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  // Null island is what a failed geocode leaves behind. It is in the Atlantic
  // and a haversine from it is a real, useless number.
  return lng !== 0 || lat !== 0;
}

/**
 * Ferry corridors first. A water crossing has no road route, so a straight-line
 * model of it is structurally wrong, not merely imprecise: the pair looks two
 * kilometres apart on a map and takes forty minutes by road. When the two areas
 * match a published corridor, that published duration is the answer.
 */
function corridorMinutes(origin: TravelPoint, target: TravelPoint, manifest: CityManifest, mode: TravelMode): number | null {
  if (mode !== "ferry") return null;
  if (!origin.area || !target.area) return null;
  for (const corridor of manifest.ferryCorridors) {
    if (!corridor || typeof corridor.minutes !== "number") continue;
    const forward = corridor.from === origin.area && corridor.to === target.area;
    const backward = corridor.from === target.area && corridor.to === origin.area;
    if (forward || backward) return corridor.minutes;
  }
  return null;
}

/**
 * Travel time from one point to another under one mode.
 *
 * Haversine in metres, then the mode's straight-line speed, then the manifest's
 * congestion multiplier for that mode. A matched ferry corridor short-circuits
 * all of it and is labelled `corridor`.
 */
export function reachableFrom(
  origin: TravelPoint,
  target: TravelPoint,
  mode: TravelMode,
  manifest: CityManifest,
): TravelEstimate {
  if (!isMeasurable(origin) || !isMeasurable(target)) {
    return { reachable: false, minutes: Number.POSITIVE_INFINITY, km: Number.POSITIVE_INFINITY, basis: "haversine" };
  }
  const km = haversineMetres(origin.coordinates, target.coordinates) / 1000;
  const corridor = corridorMinutes(origin, target, manifest, mode);
  if (corridor !== null) return { reachable: true, minutes: corridor, km, basis: "corridor" };
  const speed = MODE_SPEED_KMH[mode] || MODE_SPEED_KMH.walk;
  const minutes = ((km * STREET_FACTOR) / speed) * 60 * congestion(manifest, mode);
  return { reachable: true, minutes, km, basis: "haversine" };
}

/**
 * Ids of the records reachable inside `minutes`, nearest first, ties broken on
 * id so the order never depends on input order.
 *
 * This is the prefilter that takes a thousand records down to about a hundred
 * before anything expensive runs. It is a hard filter: nothing outside the
 * budget is returned, whatever it scored on text.
 */
export function isochroneIds(
  origin: TravelPoint,
  minutes: number,
  mode: TravelMode,
  manifest: CityManifest,
  records: ExperienceV2[],
): string[] {
  const inside: { id: string; minutes: number }[] = [];
  for (const record of records) {
    const estimate = reachableFrom(origin, { coordinates: record.coordinates, area: record.area }, mode, manifest);
    if (estimate.reachable && estimate.minutes <= minutes) inside.push({ id: record.id, minutes: estimate.minutes });
  }
  return inside
    .sort((a, b) => a.minutes - b.minutes || a.id.localeCompare(b.id))
    .map((entry) => entry.id);
}

export interface NeighbourhoodMatch {
  name: string;
  km: number;
}

/**
 * The manifest neighbourhood closest to a point, or null when the nearest one
 * is further than `NEIGHBOURHOOD_SNAP_KM`.
 *
 * This exists for one reason: `RetrieveOptions.origin` is a coordinate pair with
 * no area, and a ferry corridor is keyed by area. Snapping the origin to a real
 * anchor is how a coordinate-only caller can still reach the water crossings,
 * which are the only routes where a straight-line model is fatally wrong.
 * It is used for corridor matching only, never to change a distance.
 */
export function nearestNeighbourhood(point: TravelPoint, manifest: CityManifest): NeighbourhoodMatch | null {
  if (!isMeasurable(point)) return null;
  let best: NeighbourhoodMatch | null = null;
  for (const anchor of manifest.neighbourhoods) {
    if (!anchor || !Array.isArray(anchor.coordinates)) continue;
    const km = haversineMetres(point.coordinates, anchor.coordinates) / 1000;
    if (best === null || km < best.km || (km === best.km && anchor.name < best.name)) {
      best = { name: anchor.name, km };
    }
  }
  if (best === null || best.km > NEIGHBOURHOOD_SNAP_KM) return null;
  return best;
}
