import { describe, expect, it } from "vitest";
import { lcg, lahc } from "./lahc";

/**
 * A multimodal 1-D landscape with three features, in this order along x:
 *
 * - x 0 to 18: a flat ridge at -10, so every step on it is exactly equal.
 * - x 8: a shallow basin at -13, which is a dead end.
 * - x 19 to 30: a descent to a deep basin at -60, past a small ridge at x 9.
 *
 * Two basins at two depths, separated by a ridge, behind a flat top. That is the
 * shape a real objective has when one stop is nearly as good as another and a
 * different pairing is much better.
 */
function multimodal(x: number): number {
  if (x === 8) return -13;
  if (x <= 18) return -10;
  if (x <= 22) return -10 - (x - 18) * 2;
  if (x <= 28) return -18 - (x - 22) * 6;
  return -60 + (x - 28) * 2;
}

/** Local step of 1 to 3, clamped to the domain. No teleports, so no free lunch. */
function walk(current: number, rng: () => number): number {
  const size = 1 + Math.floor(rng() * 3);
  const next = current + (rng() < 0.5 ? -size : size);
  return next < 0 ? 0 : next > 40 ? 40 : next;
}

/** Plain hill climbing: accepts a move only on a strict decrease. */
function hillClimb(initial: number, iterations: number, seed: number): number {
  const rng = lcg(seed);
  let current = initial;
  let currentCost = multimodal(current);
  for (let i = 0; i < iterations; i += 1) {
    const candidate = walk(current, rng);
    const cost = multimodal(candidate);
    if (cost < currentCost) {
      current = candidate;
      currentCost = cost;
    }
  }
  return currentCost;
}

describe("lcg", () => {
  it("is reproducible and stays inside the unit interval", () => {
    const first = Array.from({ length: 8 }, lcg(1026));
    expect(Array.from({ length: 8 }, lcg(1026))).toEqual(first);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("gives different streams for different seeds", () => {
    expect(Array.from({ length: 4 }, lcg(1))).not.toEqual(Array.from({ length: 4 }, lcg(2)));
  });

  it("survives a zero or negative seed", () => {
    expect(Array.from({ length: 4 }, lcg(0))).not.toEqual(Array.from({ length: 4 }, lcg(0)).map(() => 0));
    expect(lcg(-5)()).toBeGreaterThanOrEqual(0);
  });
});

describe("lahc", () => {
  it("escapes a multimodal cost function that plain hill climbing cannot leave", () => {
    // Every neighbour of x = 0 on the flat ridge costs exactly -10, so a strict
    // hill climber is frozen there for 100,000 steps, for any seed.
    for (const seed of [1, 7, 99, 1026, 2026, 4242]) {
      expect(hillClimb(0, 100000, seed)).toBe(-10);
    }
    // LAHC judges a candidate against a solution from historyLength iterations ago,
    // not against the current one, so equal-cost steps are accepted and the ridge
    // is walked instead of blocking.
    for (const seed of [1, 7, 99, 1026, 2026, 4242]) {
      const search = lahc({ initial: 0, sample: walk, cost: multimodal, iterations: 400, historyLength: 6, seed });
      expect(search.bestFitness).toBe(-58);
      expect(search.bestFitness).toBeLessThan(hillClimb(0, 400, seed));
      expect(search.accepted).toBeGreaterThan(0);
    }
  });

  it("falls back to the shallow basin when the history is one step long", () => {
    // historyLength 1 is plain hill climbing with extra steps, so it takes the
    // -13 dead end at x = 8 and stops. This is the whole reason the knob exists.
    const search = lahc({ initial: 0, sample: walk, cost: multimodal, iterations: 400, historyLength: 1, seed: 1 });
    expect(search.bestFitness).toBe(-13);
  });

  it("two seeded runs give identical results", () => {
    const options = { initial: 0, sample: walk, cost: multimodal, iterations: 400, historyLength: 6, seed: 1026 };
    expect(lahc(options)).toEqual(lahc(options));
    const withOne = { ...options, historyLength: 1, seed: 77 };
    expect(lahc(withOne)).toEqual(lahc(withOne));
  });

  it("counts exactly one evaluation per sample plus the initial", () => {
    const search = lahc({ initial: 0, sample: walk, cost: multimodal, iterations: 50, historyLength: 4, seed: 3 });
    expect(search.evaluated).toBe(1 + 50 * 4);
    expect(search.accepted).toBeLessThanOrEqual(search.evaluated - 1);
    expect(search.history).toHaveLength(4);
  });

  it("tracks best on the fitness function when it differs from the cost", () => {
    // Cost is penalised, fitness is the plan. The reported best must be the best
    // plan, not the least-repeated one.
    const search = lahc({
      initial: 0,
      sample: walk,
      cost: (x) => multimodal(x) + (x === 8 ? 50 : 0),
      fitness: multimodal,
      iterations: 400,
      historyLength: 6,
      seed: 1,
    });
    expect(search.bestFitness).toBe(-58);
    expect(search.best).toBe(29);
  });

  it("does nothing when the sampler returns the current solution", () => {
    const search = lahc({ initial: 0, sample: () => 0, cost: multimodal, iterations: 20, historyLength: 3, seed: 9 });
    expect(search.best).toBe(0);
    expect(search.bestFitness).toBe(-10);
    expect(search.improvements).toBe(0);
  });

  it("runs no iterations and still reports the initial", () => {
    const search = lahc({ initial: 8, sample: walk, cost: multimodal, iterations: 0, historyLength: 3, seed: 9 });
    expect(search.best).toBe(8);
    expect(search.bestFitness).toBe(-13);
    expect(search.evaluated).toBe(1);
  });

  it("accepts a custom acceptance rule", () => {
    const search = lahc({
      initial: 0,
      sample: walk,
      cost: multimodal,
      accept: (candidateCost, referenceCost) => candidateCost < referenceCost,
      iterations: 400,
      historyLength: 6,
      seed: 1,
    });
    expect(search.bestFitness).toBeLessThanOrEqual(-10);
  });
});
