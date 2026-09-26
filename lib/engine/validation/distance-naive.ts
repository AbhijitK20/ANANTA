import type { ExperienceV2, Stop } from "@/lib/engine/contracts/types";

/**
 * Distances for the naive path, written from the haversine formula.
 *
 * This duplicates whatever the routing matrix in `packing/` does. That is the
 * point. The fast objective reads kilometres out of a precomputed matrix; this
 * file recomputes them from raw coordinates. Two derivations that share an
 * intermediate are one derivation, and the 1e-6 drift bound would then be
 * measuring nothing.
 */

/** IUGG mean earth radius, kilometres. */
const EARTH_RADIUS_KM = 6371.0088;
const DEG_TO_RAD = Math.PI / 180;

/** Great-circle distance in kilometres. Coordinates are `[lon, lat]`. */
export function haversineKm(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const latA = a[1] * DEG_TO_RAD;
  const latB = b[1] * DEG_TO_RAD;
  const deltaLat = (b[1] - a[1]) * DEG_TO_RAD;
  const deltaLon = (b[0] - a[0]) * DEG_TO_RAD;
  const halfChord =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(halfChord)));
}

/**
 * Great-circle distance per stop, in stop order. Stop 0 is measured from
 * `origin`, every later stop from the stop before it.
 */
export function legDistancesKm(
  stops: readonly Stop[],
  origin: readonly [number, number],
): number[] {
  const distances: number[] = [];
  let previous: readonly [number, number] = origin;
  for (const stop of stops) {
    const here: [number, number] = [
      stop.record.coordinates[0],
      stop.record.coordinates[1],
    ];
    distances.push(haversineKm(previous, here));
    previous = here;
  }
  return distances;
}

/** Direct distance from the origin, used by the ladder's refill step. */
export function distanceFromOriginKm(
  record: ExperienceV2,
  origin: readonly [number, number],
): number {
  return haversineKm(origin, [record.coordinates[0], record.coordinates[1]]);
}
