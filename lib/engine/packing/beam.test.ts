import { describe, expect, it } from "vitest";
import { beamSearch } from "./beam";

/**
 * The regression guard against reintroducing `C(60, k)`. `lib/plan.ts:88` walked
 * every combination of 60 records and evaluated each one, on the render path, on
 * every budget-slider keystroke. The bound asserted here is the structural
 * replacement: a beam of `width` partial solutions, each contributing at most `k`
 * children per layer, for `iterations` layers, with every node expanded once.
 *
 * The solution type is an ordered list of record ids, which is what packing
 * searches over.
 */

type Order = string[];

const POOL = Array.from({ length: 25 }, (_, index) => `c${String(index).padStart(2, "0")}`);
const tailOf = (order: Order) => Number(order[order.length - 1].slice(1));
const sumOf = (order: Order) => order.reduce((total, id) => total + Number(id.slice(1)), 0);

/** Append the first `take` unused pool ids, nearest to the tail first. */
function appendNearest(order: Order, take: number, window: number): Order[] {
  return POOL
    .filter((id) => !order.includes(id) && Math.abs(Number(id.slice(1)) - tailOf(order)) < window)
    .slice(0, take)
    .map((id) => [...order, id]);
}

describe("beamSearch", () => {
  it("keeps the width best partial solutions", () => {
    let scoreCalls = 0;
    const result = beamSearch<Order>({
      initial: POOL.slice(0, 8).map((id) => [id]),
      expand: (node) => POOL.filter((id) => !node.includes(id)).slice(0, 3).map((id) => [...node, id]),
      score: (node) => {
        scoreCalls += 1;
        return node.length;
      },
      width: 8,
      iterations: 3,
      childrenPerNode: 3,
    });
    expect(result.beam).toHaveLength(8);
    expect(result.scoreCalls).toBe(scoreCalls);
    expect(result.layers).toBe(3);
    for (const node of result.beam) {
      expect(new Set(node).size).toBe(node.length);
      expect(node).toHaveLength(4);
    }
  });

  it("never expands a node twice, so the score calls stay bounded", () => {
    const width = 8;
    const iterations = 4;
    const childrenPerNode = 5;
    let scoreCalls = 0;
    const result = beamSearch<Order>({
      initial: POOL.slice(0, width).map((id) => [id]),
      expand: (node) => POOL.filter((id) => !node.includes(id)).map((id) => [...node, id]),
      score: (node) => {
        scoreCalls += 1;
        return node.length * 10 - Number(node[node.length - 1].slice(1));
      },
      width,
      iterations,
      childrenPerNode,
    });
    // Hard structural bound, plus at most `width` for the seeds.
    expect(result.childEvals).toBeLessThanOrEqual(width * iterations * childrenPerNode);
    expect(result.scoreCalls).toBeLessThanOrEqual(width * iterations * childrenPerNode + width);
    expect(scoreCalls).toBe(result.scoreCalls);
  });

  it("stays under 50 ms on a 25 candidate instance", () => {
    const width = 8;
    const iterations = 4;
    const childrenPerNode = 5;
    let scoreCalls = 0;
    const started = process.hrtime.bigint();
    const result = beamSearch<Order>({
      initial: POOL.slice(0, width).map((id) => [id]),
      expand: (node) => appendNearest(node, 25, 4),
      score: (node) => {
        scoreCalls += 1;
        return sumOf(node) - node.length * 3;
      },
      width,
      iterations,
      childrenPerNode,
    });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    expect(elapsedMs).toBeLessThan(50);
    expect(scoreCalls).toBeLessThanOrEqual(width * iterations * childrenPerNode + width);
    expect(result.best).not.toBeNull();
    expect(result.best as Order).toHaveLength(5);
    expect(new Set(result.best as Order).size).toBe(5);
  });

  it("costs a tiny fraction of what enumeration would", () => {
    const choose = (n: number, k: number): number => {
      let out = 1;
      for (let i = 0; i < k; i += 1) out = (out * (n - i)) / (i + 1);
      return Math.round(out);
    };
    const result = beamSearch<Order>({
      initial: POOL.slice(0, 8).map((id) => [id]),
      expand: (node) => POOL.filter((id) => !node.includes(id)).map((id) => [...node, id]),
      score: (node) => node.length,
      width: 8,
      iterations: 4,
      childrenPerNode: 5,
    });
    // C(60, 5) is 5,461,512 arrays allocated by the old enumerator.
    expect(choose(60, 5)).toBe(5461512);
    expect(result.childEvals).toBeLessThan(choose(60, 5) / 1000);
  });

  it("returns the best of the final beam and keeps it reproducible", () => {
    const options = {
      initial: POOL.slice(0, 6).map((id) => [id]),
      expand: (node: Order) => POOL.filter((id) => !node.includes(id)).slice(0, 4).map((id) => [...node, id]),
      score: sumOf,
      width: 6,
      iterations: 3,
      childrenPerNode: 4,
    };
    const first = beamSearch<Order>(options);
    expect(beamSearch<Order>(options)).toEqual(first);
    expect(first.bestScore).toBe(Math.max(...first.beam.map(sumOf)));
  });

  it("grows one layer at a time until the pool is used up", () => {
    const result = beamSearch<Order>({
      initial: [["p0"], ["p1"]],
      expand: (node) => ["p0", "p1", "p2", "p3"].filter((id) => !node.includes(id)).map((id) => [...node, id]),
      score: (node) => node.length,
      width: 4,
      iterations: 9,
      childrenPerNode: 4,
    });
    // Three layers to go from 1 stop to 4, then nothing new to expand.
    expect(result.layers).toBe(3);
    expect(result.beam).toHaveLength(4);
    expect(result.best as Order).toHaveLength(4);
  });

  it("never runs more layers than the budget allows", () => {
    const result = beamSearch<Order>({
      initial: POOL.slice(0, 4).map((id) => [id]),
      expand: (node) => POOL.filter((id) => !node.includes(id)).map((id) => [...node, id]),
      score: sumOf,
      width: 4,
      iterations: 2,
      childrenPerNode: 3,
    });
    expect(result.layers).toBe(2);
    expect(result.childEvals).toBeLessThanOrEqual(4 * 2 * 3);
  });

  it("survives an empty seed and a pool it cannot grow into", () => {
    const empty = beamSearch<Order>({ initial: [], expand: () => [["a"]], score: () => 1, width: 4, iterations: 3, childrenPerNode: 2 });
    expect(empty.best).toBeNull();
    expect(empty.beam).toEqual([]);
    expect(empty.childEvals).toBe(0);

    const stuck = beamSearch<Order>({ initial: [["a"]], expand: () => [], score: () => 1, width: 4, iterations: 3, childrenPerNode: 2 });
    expect(stuck.best).toEqual(["a"]);
    expect(stuck.childEvals).toBe(0);
  });

  it("respects a zero iteration budget", () => {
    const result = beamSearch<Order>({
      initial: [["a"], ["b"]],
      // A child is a whole order, not a single id. With a zero budget this is never
      // called, which is exactly why the return type has to say so out loud.
      expand: (node) => [[...node, "c"]],
      score: (node) => node.length,
      width: 4,
      iterations: 0,
      childrenPerNode: 2,
    });
    expect(result.childEvals).toBe(0);
    expect(result.layers).toBe(0);
    expect(result.scoreCalls).toBe(2);
  });

  it("scores a node once even when the same order shows up again", () => {
    let scoreCalls = 0;
    const result = beamSearch<Order>({
      initial: [["a"]],
      expand: (node) => (node.length === 1 ? [["a", "b"]] : []),
      score: (node) => {
        scoreCalls += 1;
        return node.length;
      },
      width: 4,
      iterations: 3,
      childrenPerNode: 4,
    });
    expect(scoreCalls).toBe(2);
    expect(result.scoreCalls).toBe(2);
  });

  it("keeps every id distinct across a whole search", () => {
    const result = beamSearch<Order>({
      initial: POOL.slice(0, 8).map((id) => [id]),
      expand: (node) => appendNearest(node, 25, 5),
      score: sumOf,
      width: 8,
      iterations: 4,
      childrenPerNode: 5,
    });
    for (const node of result.beam) expect(new Set(node).size).toBe(node.length);
  });
});
