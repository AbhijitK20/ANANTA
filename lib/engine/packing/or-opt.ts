import { DEFAULT_MAX_SWEEPS, type Cost } from "./two-opt";

/**
 * Or-opt: relocate a run of 1 to 3 stops somewhere else, in either orientation.
 * This is the move 2-opt structurally cannot make. Reversal keeps every stop on
 * the same side of every other, so a stop stranded across the river stays
 * stranded. Relocating a run of one is the only way to pull it back.
 */

export const MAX_SEGMENT = 3;

function relocate(order: string[], start: number, length: number, reversed: boolean, at: number): string[] {
  const segment = order.slice(start, start + length);
  const rest = [...order.slice(0, start), ...order.slice(start + length)];
  const oriented = reversed ? [...segment].reverse() : segment;
  const target = at > start ? at - length : at;
  return [...rest.slice(0, target), ...oriented, ...rest.slice(target)];
}

export function orOpt(order: string[], improve: Cost, maxSweeps = DEFAULT_MAX_SWEEPS): string[] {
  let best = [...order];
  let bestCost = improve(best);
  for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
    let improved = false;
    for (let length = 1; length <= MAX_SEGMENT && length < best.length; length += 1) {
      for (let start = 0; start + length <= best.length; start += 1) {
        for (const reversed of [false, true]) {
          for (let at = 0; at <= best.length; at += 1) {
            if (at >= start && at <= start + length) continue;
            const next = relocate(best, start, length, reversed, at);
            const cost = improve(next);
            if (cost < bestCost) {
              best = next;
              bestCost = cost;
              improved = true;
            }
          }
        }
      }
    }
    if (!improved) return best;
  }
  return best;
}

/** One random Or-opt move, drawn from a seeded rng. The LAHC neighbourhood. */
export function randomRelocation(order: string[], rng: () => number): string[] {
  if (order.length < 2) return [...order];
  const length = 1 + Math.floor(rng() * Math.min(MAX_SEGMENT, order.length - 1));
  const start = Math.floor(rng() * (order.length - length + 1));
  const reversed = rng() < 0.5;
  const span = order.length - length + 1;
  const at = Math.floor(rng() * (span + 1));
  if (at >= start && at <= start + length) return [...order];
  return relocate(order, start, length, reversed, at);
}

/**
 * One random exchange of two stops. Not an Or-opt move: relocation changes how far
 * you walk, a swap changes what you see, and the two fail in different places. A
 * pair of stops in the same corner can be swapped for a better pair across town
 * without either of them moving, and no amount of relocation finds that.
 */
export function randomSwap(order: string[], rng: () => number): string[] {
  if (order.length < 2) return [...order];
  const next = [...order];
  const a = Math.floor(rng() * next.length);
  const b = Math.floor(rng() * (next.length - 1));
  const at = b >= a ? b + 1 : b;
  const carried = next[a];
  next[a] = next[at];
  next[at] = carried;
  return next;
}

/** Every Or-opt neighbour, for callers that want to enumerate rather than sample. */
export function relocationNeighbours(order: string[]): string[][] {
  const moves: string[][] = [];
  for (let length = 1; length <= MAX_SEGMENT && length < order.length; length += 1) {
    for (let start = 0; start + length <= order.length; start += 1) {
      for (const reversed of [false, true]) {
        for (let at = 0; at <= order.length; at += 1) {
          if (at >= start && at <= start + length) continue;
          moves.push(relocate(order, start, length, reversed, at));
        }
      }
    }
  }
  return moves;
}
