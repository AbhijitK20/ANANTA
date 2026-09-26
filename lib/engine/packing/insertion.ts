import { tourCost } from "./distance";

/**
 * Greedy construction. A tour starts at one stop and grows by cheapest
 * insertion, which is the first half of the local search. 2-opt and Or-opt then
 * try to undo the mistakes it makes.
 */

export interface Insertion {
  order: string[];
  index: number;
  addedKm: number;
}

/**
 * Cheapest position for `candidateId`, ties broken by lowest index. The delta is
 * computed against the real leg costs, including the origin leg, because an
 * insertion at position 0 also changes where the day starts.
 */
export function nearestInsertion(
  order: string[],
  candidateId: string,
  km: (aId: string, bId: string) => number,
  originKm?: (id: string) => number,
): Insertion {
  if (order.length === 0) return { order: [candidateId], index: 0, addedKm: originKm ? originKm(candidateId) : 0 };
  const before = tourCost(order, km, originKm);
  let bestIndex = 0;
  let bestOrder = [candidateId, ...order];
  let bestCost = Infinity;
  for (let index = 0; index <= order.length; index += 1) {
    const next = [...order.slice(0, index), candidateId, ...order.slice(index)];
    const cost = tourCost(next, km, originKm);
    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = index;
      bestOrder = next;
    }
  }
  return { order: bestOrder, index: bestIndex, addedKm: bestCost - before };
}

/** Nearest neighbour tour. The cheap start the insertion pass then improves. */
export function nearestNeighbourTour(firstId: string, candidates: string[], km: (aId: string, bId: string) => number): string[] {
  const remaining = candidates.filter((id) => id !== firstId);
  const order = [firstId];
  while (remaining.length) {
    const tail = order[order.length - 1];
    let bestAt = 0;
    let bestKm = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const leg = km(tail, remaining[i]);
      if (leg < bestKm) {
        bestKm = leg;
        bestAt = i;
      }
    }
    order.push(remaining.splice(bestAt, 1)[0]);
  }
  return order;
}

/** Cheapest-insertion construction, capped at `limit` stops. */
export function insertCandidates(
  seed: string[],
  candidates: string[],
  km: (aId: string, bId: string) => number,
  limit: number,
  originKm?: (id: string) => number,
): string[] {
  let order = [...seed];
  const pending = candidates.filter((id) => !order.includes(id));
  while (order.length < limit && pending.length) {
    let best: Insertion | null = null;
    for (const candidate of pending) {
      const insertion = nearestInsertion(order, candidate, km, originKm);
      if (!best || insertion.addedKm < best.addedKm) best = insertion;
    }
    if (!best) break;
    order = best.order;
    pending.splice(pending.indexOf(best.order[best.index]), 1);
  }
  return order;
}
