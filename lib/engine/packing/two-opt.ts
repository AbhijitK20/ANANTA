/**
 * 2-opt: reverse one segment, accept only on a strict decrease, sweep until a
 * clean sweep or the cap. Reversal preserves the set of stops, so it never
 * changes which places are in the plan, only the order they are reached in.
 *
 * ponytail: exact full recompute per neighbour instead of a cached delta matrix.
 * At 2 to 4 stops the matrix costs more to build than it saves. Upgrade path if
 * the pool ever reaches 60: cache `d[i][j]` and accept on O(1) delta.
 */
export const DEFAULT_MAX_SWEEPS = 64;

export type Cost = (order: string[]) => number;

export function twoOpt(order: string[], improve: Cost, maxSweeps = DEFAULT_MAX_SWEEPS): string[] {
  let best = [...order];
  let bestCost = improve(best);
  for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
    let improved = false;
    for (let i = 1; i < best.length - 1; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const next = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const cost = improve(next);
        if (cost < bestCost) {
          best = next;
          bestCost = cost;
          improved = true;
        }
      }
    }
    if (!improved) return best;
  }
  return best;
}
