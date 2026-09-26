import { buildRadiusGraph, type RadiusGraph } from "./graph";

/**
 * Maximum clique enumeration. Bron-Kerbosch with pivoting on `P \ N(u)`, the
 * standard `extend` / `explore` / `unassign` triple, so the recursion prunes
 * entire branches instead of walking every subset.
 *
 * Determinism beats optimality here: the whole eval report hangs off this output,
 * so the enumeration order is fixed by sorting, never by insertion.
 */

export interface Cluster {
  ids: string[];
  diameterKm: number;
}

/** Largest pairwise distance inside `ids`. A 40 km clique is a continent. */
export function cliqueDiameter(km: (aId: string, bId: string) => number, ids: string[]): number {
  let worst = 0;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const value = km(ids[i], ids[j]);
      if (value > worst) worst = value;
    }
  }
  return worst;
}

/** Keep the clique only if its diameter, the largest pairwise distance, fits. */
export function diameterBounded(
  clique: string[],
  km: (aId: string, bId: string) => number,
  maxDiameterKm: number,
): boolean {
  return cliqueDiameter(km, clique) <= maxDiameterKm;
}

/**
 * Every maximal clique, sorted by size descending then lexicographically. The
 * first entry is a maximum clique.
 */
export function bronKerbosch(graph: RadiusGraph): string[][] {
  const adjacent: Record<string, Set<string>> = {};
  for (const id of graph.ids) adjacent[id] = new Set(graph.neighbours[id] ?? []);
  const cliques: string[][] = [];

  const pickPivot = (p: string[], x: string[]): string => {
    const pool = [...p, ...x];
    let best = pool[0];
    let bestAdjacent = -1;
    for (const candidate of pool) {
      let count = 0;
      for (const id of p) if (adjacent[candidate].has(id)) count += 1;
      if (count > bestAdjacent) {
        best = candidate;
        bestAdjacent = count;
      }
    }
    return best;
  };

  const extend = (current: string[], p: string[], x: string[]): void => {
    if (p.length === 0 && x.length === 0) {
      cliques.push([...current].sort());
      return;
    }
    const pivotNeighbours = adjacent[pickPivot(p, x)];
    let remaining = p;
    let excluded = x;
    for (const id of p.filter((other) => !pivotNeighbours.has(other))) {
      extend(
        current.concat(id),
        remaining.filter((other) => adjacent[id].has(other)),
        excluded.filter((other) => adjacent[id].has(other)),
      );
      remaining = remaining.filter((other) => other !== id);
      excluded = excluded.concat(id);
    }
  };

  extend([], [...graph.ids], []);
  return cliques.sort((a, b) => b.length - a.length || compareIds(a, b));
}

function compareIds(a: string[], b: string[]): number {
  const shorter = Math.min(a.length, b.length);
  for (let i = 0; i < shorter; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
}

/**
 * Peel diameter-bounded cliques largest first. Every candidate lands in exactly
 * one cluster, and whatever is left over becomes a singleton. Nothing is ever
 * dropped: losing a candidate here would lose it from the plan with no rejection
 * sentence to show for it, which is the failure the feasibility gate exists to
 * prevent in the first place.
 */
export function clusterCandidates(
  ids: string[],
  km: (aId: string, bId: string) => number,
  radiusKm: number,
  maxDiameterKm: number,
  maxClusters: number,
): Cluster[] {
  const graph = buildRadiusGraph(ids, km, radiusKm);
  const assigned = new Set<string>();
  const clusters: Cluster[] = [];
  const limit = Math.max(1, Math.floor(maxClusters));

  for (const clique of bronKerbosch(graph)) {
    if (clusters.length >= limit) break;
    if (clique.some((id) => assigned.has(id))) continue;
    if (!diameterBounded(clique, km, maxDiameterKm)) continue;
    for (const id of clique) assigned.add(id);
    clusters.push({ ids: clique, diameterKm: cliqueDiameter(km, clique) });
  }

  for (const id of ids) {
    if (assigned.has(id)) continue;
    assigned.add(id);
    clusters.push({ ids: [id], diameterKm: 0 });
  }
  return clusters;
}
