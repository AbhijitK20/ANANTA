import type { DiscoveryContext, TravelMode } from "@/lib/engine/contracts";

/**
 * The cluster radius is a property of the traveller and the city manifest, never a
 * constant. `CityManifest` carries the congestion multiplier, `ctx.availableMinutes`
 * carries the window, so the two together say how far a person can actually get.
 */

/** Rough door-to-door speeds in km/h, used only to size a search radius. */
const MODE_SPEED_KMH: Record<TravelMode, number> = {
  walk: 4.5,
  auto: 18,
  taxi: 20,
  metro: 16,
  ferry: 14,
};

const MIN_RADIUS_KM = 0.8;
const MAX_RADIUS_KM = 6;

export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * Half the one-way reach inside the available window, at the manifest's
 * congestion multiplier. Half, because a cluster you can cross in the whole
 * window is a scatter, not a neighbourhood.
 */
export function clusterRadiusKm(ctx: DiscoveryContext): number {
  const hours = Math.max(0, ctx.availableMinutes) / 60;
  const reach = hours * MODE_SPEED_KMH[ctx.travelMode] * ctx.city.congestion[ctx.travelMode];
  return clamp(Math.round(reach * 100) / 100 / 2, MIN_RADIUS_KM, MAX_RADIUS_KM);
}

export interface RadiusGraph {
  ids: string[];
  /** Sorted adjacency, undirected. Every node lists every neighbour. */
  neighbours: Record<string, string[]>;
  radiusKm: number;
}

/** Undirected adjacency where the pair is within `radiusKm`. Sorted for determinism. */
export function buildRadiusGraph(
  ids: string[],
  km: (aId: string, bId: string) => number,
  radiusKm: number,
): RadiusGraph {
  const neighbours: Record<string, string[]> = {};
  for (const id of ids) neighbours[id] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      if (km(ids[i], ids[j]) <= radiusKm) {
        neighbours[ids[i]].push(ids[j]);
        neighbours[ids[j]].push(ids[i]);
      }
    }
  }
  for (const id of ids) neighbours[id].sort();
  return { ids: [...ids], neighbours, radiusKm };
}
