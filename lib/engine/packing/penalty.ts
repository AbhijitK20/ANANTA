/**
 * Adaptive penalties, the "A" in LAHC. Every ordered pair the search has already
 * used gets a penalty that grows on reuse, so the search is pushed off plateaus
 * it has already walked. Decay is what lets it come back.
 *
 * ponytail: a plain object keyed by `from\0to`, no trie, no heap. A 4 stop tour
 * has 4 ordered pairs, so the whole table is 4 keys.
 */

const SEPARATOR = "\u0000";

export interface PenaltyOptions {
  /** How much one reuse adds. */
  step?: number;
  /** Ceiling, so a long run cannot make one pair unaffordable. */
  ceiling?: number;
}

export class PenaltyTable {
  private readonly step: number;
  private readonly ceiling: number;
  private table: Record<string, number> = {};

  constructor(options: PenaltyOptions = {}) {
    this.step = options.step ?? 0.5;
    this.ceiling = options.ceiling ?? 12;
  }

  private static key(fromId: string, toId: string): string {
    return `${fromId}${SEPARATOR}${toId}`;
  }

  /** Every ordered pair in `order`, charged once. Repeats cost more each time. */
  record(order: string[]): void {
    for (let i = 1; i < order.length; i += 1) {
      const key = PenaltyTable.key(order[i - 1], order[i]);
      this.table[key] = Math.min(this.ceiling, (this.table[key] ?? 0) + this.step);
    }
  }

  penaltyFor(fromId: string, toId: string): number {
    return this.table[PenaltyTable.key(fromId, toId)] ?? 0;
  }

  /** Total penalty along `order`, accumulated in index order. */
  penaltyOf(order: string[]): number {
    let total = 0;
    for (let i = 1; i < order.length; i += 1) total += this.penaltyFor(order[i - 1], order[i]);
    return total;
  }

  /** `base` plus the accumulated penalty. What LAHC actually minimises. */
  adjust(order: string[], base: number): number {
    return base + this.penaltyOf(order);
  }

  /** Scale every penalty down. Strictly decreases each one, which is the point. */
  decay(rate: number): void {
    for (const key of Object.keys(this.table)) this.table[key] = this.table[key] * rate;
  }

  reset(): void {
    this.table = {};
  }

  /** Sorted so the debug view and the tests see a stable order. */
  entries(): [string, number][] {
    return Object.keys(this.table)
      .sort()
      .map((key) => [key, this.table[key]] as [string, number]);
  }

  /** Sum in sorted key order, so the value never depends on insertion order. */
  total(): number {
    return this.entries().reduce((sum, [, value]) => sum + value, 0);
  }
}
