import type { DiscoveryContext, ExperienceV2 } from "@/lib/engine/contracts";
import type { PackOptions } from "./pack";

/**
 * Geometry layer. Pure projection and matrix arithmetic. No clock, no fetch, no
 * routing call. Asserted by `distance.test.ts`, which reads this file's source.
 *
 * Two distance notions live in this stage and they are deliberately different:
 *
 * 1. `buildDistanceMatrix` is straight-line Web-Mercator geometry. It answers
 *    "are these places in one neighbourhood" for the cluster graph.
 * 2. `Stop.travelKm` comes from `PackOptions.matrix`, the injected route table.
 *    It answers "what does it actually cost to get there". The objective
 *    contract forbids re-deriving a leg from coordinates, and so does this.
 */

const EARTH_RADIUS_M = 6378137;
const DEG_TO_RAD = Math.PI / 180;

/** Web-Mercator to metres, shifted so the reference latitude sits at y = 0. */
export function projectMetres(coordinates: [number, number], referenceLat: number): [number, number] {
  const x = coordinates[0] * DEG_TO_RAD * EARTH_RADIUS_M;
  const y = EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + coordinates[1] * DEG_TO_RAD / 2));
  const yReference = EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + referenceLat * DEG_TO_RAD / 2));
  return [x, y - yReference];
}

/** Great-circle distance in km. Independent of the Mercator projection on purpose. */
export function haversineKm(from: [number, number], to: [number, number]): number {
  const dLat = (to[1] - from[1]) * DEG_TO_RAD;
  const dLng = (to[0] - from[0]) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(from[1] * DEG_TO_RAD) * Math.cos(to[1] * DEG_TO_RAD) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a))) / 1000;
}

/** Centre latitude of the manifest bbox, the projection's reference. */
export function referenceLatitude(ctx: DiscoveryContext): number {
  const [, south, , north] = ctx.city.bbox;
  return (south + north) / 2;
}

/** Corner to corner span of the manifest bbox, in km. */
export function bboxDiagonalKm(bbox: [number, number, number, number]): number {
  return haversineKm([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
}

export interface DistanceMatrix {
  ids: string[];
  /** id to row index. */
  index: Record<string, number>;
  /** Row-major n x n squared metres. Diagonal is 0. */
  metresSquared: number[];
  referenceLat: number;
}

/** O(n^2) squared-euclidean table in projected metres. 25 ids is 625 cells. */
export function buildDistanceMatrix(records: ExperienceV2[], referenceLat: number): DistanceMatrix {
  const ids = records.map((record) => record.id);
  const projected = records.map((record) => projectMetres(record.coordinates, referenceLat));
  const index: Record<string, number> = {};
  ids.forEach((id, row) => {
    index[id] = row;
  });
  const metresSquared: number[] = new Array(ids.length * ids.length).fill(0);
  for (let row = 0; row < projected.length; row += 1) {
    for (let column = row + 1; column < projected.length; column += 1) {
      const dx = projected[row][0] - projected[column][0];
      const dy = projected[row][1] - projected[column][1];
      const squared = dx * dx + dy * dy;
      metresSquared[row * ids.length + column] = squared;
      metresSquared[column * ids.length + row] = squared;
    }
  }
  return { ids, index, metresSquared, referenceLat };
}

/** Straight-line km between two ids already in the matrix. */
export function matrixKm(matrix: DistanceMatrix, aId: string, bId: string): number {
  const row = matrix.index[aId];
  const column = matrix.index[bId];
  if (row === undefined || column === undefined) {
    throw new Error(`distance: id not in matrix, "${row === undefined ? aId : bId}"`);
  }
  return Math.sqrt(matrix.metresSquared[row * matrix.ids.length + column]) / 1000;
}

/** Adapter for the callback shape the graph and clique stages take. */
export function matrixLookup(matrix: DistanceMatrix): (aId: string, bId: string) => number {
  return (aId, bId) => matrixKm(matrix, aId, bId);
}

/** Largest pairwise distance inside `ids`, in km. The clique diameter. */
export function matrixDiameterKm(matrix: DistanceMatrix, ids: string[]): number {
  let worst = 0;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const km = matrixKm(matrix, ids[i], ids[j]);
      if (km > worst) worst = km;
    }
  }
  return worst;
}

/**
 * Leg cost of a visit order, in whatever unit `km` returns, including the leg
 * out from the origin. The single cost function the local search minimises.
 */
export function tourCost(order: string[], km: (aId: string, bId: string) => number, originKm?: (id: string) => number): number {
  if (order.length === 0) return 0;
  let total = originKm ? originKm(order[0]) : 0;
  for (let i = 1; i < order.length; i += 1) total += km(order[i - 1], order[i]);
  return total;
}

export interface TourLeg {
  /** `null` for the first leg, which leaves the origin. */
  fromId: string | null;
  toId: string;
  minutes: number;
  km: number;
  mode: string;
}

/**
 * Every leg of a visit order, read only from the injected matrix. Never fetches,
 * never derives a leg from coordinates. This is what makes the stage testable and
 * what keeps the engine pure.
 */
export function tourLegs(order: string[], ctx: DiscoveryContext, options: PackOptions): TourLeg[] {
  const legs: TourLeg[] = [];
  for (let i = 0; i < order.length; i += 1) {
    const leg = i === 0 ? options.originMinutes(order[i]) : options.matrix(order[i - 1], order[i]);
    legs.push({ fromId: i === 0 ? null : order[i - 1], toId: order[i], minutes: leg.minutes, km: leg.km, mode: ctx.travelMode });
  }
  return legs;
}
