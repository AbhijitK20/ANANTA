import { describe, expect, it } from "vitest";
import { makeContext, makeOptions, makeRecords } from "./fixtures.test";
import { buildDistanceMatrix, matrixLookup, tourCost } from "./distance";
import { insertCandidates, nearestInsertion, nearestNeighbourTour } from "./insertion";
import { twoOpt } from "./two-opt";
import { MAX_SEGMENT, orOpt, randomRelocation, relocationNeighbours } from "./or-opt";

/** A symmetric line of points 1, 2, 3, 4 km apart, so the optimum is a sorted order. */
const line = (n: number) => Array.from({ length: n }, (_, index) => `p${index}`);
const lineKm = (a: string, b: string) => Math.abs(Number(a.slice(1)) - Number(b.slice(1)));
const lineCost = (order: string[]) => tourCost(order, lineKm);

/** A ring: going round beats crossing, so 2-opt has real work to do. */
const ring = (n: number) => Array.from({ length: n }, (_, index) => `q${index}`);
function ringKm(a: string, b: string) {
  const size = 8;
  const delta = Math.abs(Number(a.slice(1)) - Number(b.slice(1)));
  return Math.min(delta, size - delta);
}

describe("nearestInsertion", () => {
  it("puts the first candidate at index 0 with no cost", () => {
    expect(nearestInsertion([], "p0", lineKm)).toEqual({ order: ["p0"], index: 0, addedKm: 0 });
  });

  it("charges the origin leg when a candidate is inserted at the front", () => {
    const origin = () => 50;
    const insertion = nearestInsertion(["p1", "p2"], "p0", lineKm, origin);
    expect(insertion.order).toEqual(["p0", "p1", "p2"]);
    expect(insertion.index).toBe(0);
    // before: 50 + 1 = 51. after: 50 + 1 + 1 = 52. The origin leg does not change,
    // but the extra hop does, and the delta has to say so.
    expect(insertion.addedKm).toBe(1);
  });

  it("finds the cheapest seam and reports the exact delta", () => {
    // Line 0 to 8, insert 5. at 0: 5+8=13. at 1: 5+3=8. at 2: 8+3=11. Best is 8 at index 1.
    const insertion = nearestInsertion(["p0", "p8"], "p5", lineKm);
    expect(insertion.index).toBe(1);
    expect(insertion.order).toEqual(["p0", "p5", "p8"]);
    expect(insertion.addedKm).toBe(0);
  });

  it("charges a real delta when the candidate cannot sit on the line", () => {
    // Line 0 to 4, insert 5. at 0: 5+4=9. at 1: 5+1=6. at 2: 4+1=5. Best is 5 at index 2.
    const insertion = nearestInsertion(["p0", "p4"], "p5", lineKm);
    expect(insertion.index).toBe(2);
    expect(insertion.order).toEqual(["p0", "p4", "p5"]);
    expect(insertion.addedKm).toBe(1);
  });

  it("breaks an exact tie by the lowest index", () => {
    expect(nearestInsertion(["p0", "p2"], "p1", lineKm).index).toBe(1);
    expect(nearestInsertion(["p0", "p1"], "p2", lineKm).index).toBe(2);
  });
});

describe("nearestNeighbourTour", () => {
  it("walks to the closest unvisited stop each step, ties by input order", () => {
    expect(nearestNeighbourTour("p3", ["p3", "p5", "p1", "p0"], lineKm)).toEqual(["p3", "p5", "p1", "p0"]);
  });

  it("returns the seed alone when there is nowhere else to go", () => {
    expect(nearestNeighbourTour("p0", ["p0"], lineKm)).toEqual(["p0"]);
    expect(nearestNeighbourTour("p0", [], lineKm)).toEqual(["p0"]);
  });

  it("visits every member exactly once", () => {
    const members = line(9);
    const tour = nearestNeighbourTour(members[0], members, lineKm);
    expect([...tour].sort()).toEqual([...members].sort());
  });
});

describe("insertCandidates", () => {
  it("grows the tour to the limit and no further", () => {
    const grown = insertCandidates(["p0"], line(6), lineKm, 3);
    expect(grown).toHaveLength(3);
    expect(new Set(grown).size).toBe(3);
  });

  it("stops at the pool size when the limit is larger", () => {
    expect(insertCandidates(["p0"], ["p0", "p1"], lineKm, 9)).toHaveLength(2);
  });

  it("never adds a stop that is already in the tour", () => {
    const grown = insertCandidates(["p2", "p3"], line(5), lineKm, 4);
    expect(new Set(grown).size).toBe(grown.length);
  });
});

describe("twoOpt", () => {
  it("undoes a crossed tour on a ring", () => {
    const order = ["q0", "q2", "q4", "q6", "q1", "q3", "q5", "q7"];
    const cost = (candidate: string[]) => tourCost(candidate, ringKm);
    expect(cost(order)).toBe(15);
    const improved = twoOpt(order, cost);
    expect(cost(improved)).toBe(7);
    expect([...improved].sort()).toEqual([...order].sort());
  });

  it("is idempotent: a second run changes nothing", () => {
    const order = ring(8).reverse();
    const once = twoOpt(order, (candidate) => tourCost(candidate, ringKm));
    const twice = twoOpt(once, (candidate) => tourCost(candidate, ringKm));
    expect(twice).toEqual(once);
  });

  it("is idempotent from a scrambled start too", () => {
    const order = ["q0", "q4", "q1", "q6", "q2", "q7", "q3", "q5"];
    const once = twoOpt(order, (candidate) => tourCost(candidate, ringKm));
    expect(twoOpt(once, (candidate) => tourCost(candidate, ringKm))).toEqual(once);
  });

  it("never makes the tour worse and terminates on a line", () => {
    const order = ["p9", "p0", "p7", "p2", "p5", "p4", "p1", "p8", "p3", "p6"];
    const improved = twoOpt(order, lineCost);
    expect(lineCost(improved)).toBeLessThanOrEqual(lineCost(order));
    expect(twoOpt(improved, lineCost)).toEqual(improved);
  });

  it("leaves tours of one and two stops alone", () => {
    expect(twoOpt(["p0"], lineCost)).toEqual(["p0"]);
    expect(twoOpt(["p1", "p0"], lineCost)).toEqual(["p1", "p0"]);
  });

  it("respects the sweep cap instead of spinning", () => {
    const order = ring(8);
    expect(twoOpt(order, (candidate) => tourCost(candidate, ringKm), 1)).toHaveLength(8);
  });
});

describe("orOpt", () => {
  it("pulls a stranded stop back across the gap", () => {
    const order = ["a", "b", "z", "c", "d"];
    const distance = (first: string, second: string) => {
      const place: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, z: 40 };
      return Math.abs(place[first] - place[second]);
    };
    const cost = (candidate: string[]) => tourCost(candidate, distance);
    const improved = orOpt(order, cost);
    expect(cost(improved)).toBeLessThan(cost(order));
    expect([...improved].sort()).toEqual([...order].sort());
  });

  it("is idempotent: a second run changes nothing", () => {
    const order = ["a", "b", "z", "c", "d"];
    const distance = (first: string, second: string) => {
      const place: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, z: 40 };
      return Math.abs(place[first] - place[second]);
    };
    const cost = (candidate: string[]) => tourCost(candidate, distance);
    const once = orOpt(order, cost);
    expect(orOpt(once, cost)).toEqual(once);
  });

  it("is idempotent on a ring", () => {
    const order = ring(8).reverse();
    const cost = (candidate: string[]) => tourCost(candidate, ringKm);
    const once = orOpt(order, cost);
    expect(orOpt(once, cost)).toEqual(once);
  });

  it("handles the degenerate tours without throwing", () => {
    expect(orOpt([], lineCost)).toEqual([]);
    expect(orOpt(["p0"], lineCost)).toEqual(["p0"]);
    expect(orOpt(["p1", "p0"], lineCost)).toEqual(["p1", "p0"]);
  });
});

describe("orOpt neighbourhood", () => {
  it("covers segments of 1 to 3 in both orientations, out of the segment", () => {
    const order = ["p0", "p1", "p2", "p3"];
    const moves = relocationNeighbours(order);
    expect(MAX_SEGMENT).toBe(3);
    for (const move of moves) {
      expect([...move].sort()).toEqual([...order].sort());
    }
    // For a segment of length L in a tour of 4 there are 5 - L landing slots
    // outside the segment: 4 starts x 2 orientations x 3, 3 x 2 x 2, 2 x 2 x 1.
    expect(moves.length).toBe(4 * 2 * 3 + 3 * 2 * 2 + 2 * 2 * 1);
  });

  it("samples from the same neighbourhood and never mutates the input", () => {
    const order = ["p0", "p1", "p2", "p3", "p4"];
    const moves = relocationNeighbours(order);
    const sampled = new Set<string>();
    for (let seed = 1; seed <= 200; seed += 1) {
      let state = seed;
      const rng = () => {
        state = (state * 16807) % 2147483647;
        return (state - 1) / 2147483646;
      };
      const next = randomRelocation(order, rng);
      expect([...next].sort()).toEqual([...order].sort());
      sampled.add(next.join("|"));
      expect(order).toEqual(["p0", "p1", "p2", "p3", "p4"]);
    }
    expect(sampled.size).toBeGreaterThan(3);
    expect(moves.length).toBeGreaterThan(sampled.size);
  });

  it("returns the order unchanged when there is nothing to relocate", () => {
    expect(randomRelocation(["p0"], () => 0.5)).toEqual(["p0"]);
    expect(randomRelocation([], () => 0.5)).toEqual([]);
  });
});

describe("local search on a real option set", () => {
  it("reduces the injected tour cost", () => {
    const ctx = makeContext();
    const records = makeRecords();
    const options = makeOptions(records, ctx);
    const cost = (order: string[]) => tourCost(order, (a, b) => options.matrix(a, b).km, (id) => options.originMinutes(id).km);
    const start = records.map((record) => record.id);
    const improved = orOpt(twoOpt(start, cost), cost);
    expect(cost(improved)).toBeLessThan(cost(start));
    expect([...improved].sort()).toEqual([...start].sort());
    expect(orOpt(twoOpt(improved, cost), cost)).toEqual(improved);
  });
});
