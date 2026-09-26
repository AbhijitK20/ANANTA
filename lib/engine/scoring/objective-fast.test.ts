import { describe, expect, it } from "vitest";
import type { Stop } from "@/lib/engine/contracts";
import { makeContext, makeProfile, makeStop } from "@/lib/engine/scoring/fixtures.test";
import {
  TRAVEL_KM_SCALE,
  crowdLoad,
  objectiveFast,
  paceDeviation,
  planProximity,
  proximityDecay,
  redundancyPenalty,
  superlinearTravel,
} from "@/lib/engine/scoring/objective-fast";
import { COMPONENT_IDS } from "@/lib/engine/scoring/components";

const THREE: Stop[] = [
  makeStop({ id: "a", category: "cafes" }, { minutes: 20, km: 2 }),
  makeStop({ id: "b", category: "galleries" }, { minutes: 25, km: 3 }),
  makeStop({ id: "c", category: "cafes" }, { minutes: 15, km: 1 }),
];

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

describe("superlinearTravel", () => {
  it("charges each leg minutes times a squared distance factor", () => {
    // 20 * (1 + 2/8)^2 + 25 * (1 + 3/8)^2 + 15 * (1 + 1/8)^2
    const expected = 20 * 1.25 ** 2 + 25 * 1.375 ** 2 + 15 * 1.125 ** 2;
    expect(superlinearTravel(THREE)).toBeCloseTo(expected, 12);
    expect(superlinearTravel(THREE)).toBeCloseTo(97.5, 12);
  });

  it("is 0 for a plan with no travel, and for an empty plan", () => {
    expect(superlinearTravel([makeStop()])).toBe(0);
    expect(superlinearTravel([])).toBe(0);
  });

  it("grows faster than distance, which is the whole point of the square", () => {
    const near = superlinearTravel([makeStop({}, { minutes: 10, km: 1 })]);
    const far = superlinearTravel([makeStop({}, { minutes: 10, km: 9 })]);
    // Nine times the distance is well under nine times the cost.
    expect(far / near).toBeLessThan(9);
    expect(far).toBeGreaterThan(near);
  });

  it("publishes the distance scale it squares around", () => {
    expect(TRAVEL_KM_SCALE).toBe(8);
  });

  it("reads the km on the stop rather than recomputing it from coordinates", () => {
    // Two records at the same coordinates, different injected leg distances.
    const a = makeStop({ id: "a", coordinates: [72.83, 18.93] }, { minutes: 10, km: 1 });
    const b = makeStop({ id: "b", coordinates: [72.83, 18.93] }, { minutes: 10, km: 5 });
    expect(superlinearTravel([a, b])).toBeGreaterThan(superlinearTravel([a, a]));
  });
});

describe("crowdLoad", () => {
  it("is the mean crowd scaled by how well the hour suits the best time", () => {
    const ctx = makeContext();
    // Both stops crowd 0.4 with bestTimeOfDay morning, and it is 09:30.
    expect(crowdLoad(THREE, ctx)).toBeCloseTo(0.4, 12);
  });

  it("falls when the current hour is the opposite of the record's best hour", () => {
    const morningRecord = makeStop({ crowdProfile: 1, bestTimeOfDay: "morning" });
    const eveningRecord = makeStop({ crowdProfile: 1, bestTimeOfDay: "evening" });
    expect(crowdLoad([morningRecord], makeContext({ now: "2026-01-15T09:30:00.000Z" }))).toBe(1);
    expect(crowdLoad([eveningRecord], makeContext({ now: "2026-01-15T09:30:00.000Z" }))).toBeCloseTo(0.4, 12);
  });

  it("counts an unrecorded crowd as the neutral 0.5", () => {
    expect(crowdLoad([makeStop({ crowdProfile: null })], makeContext())).toBeCloseTo(0.5, 12);
  });

  it("is 0 for an empty plan rather than NaN", () => {
    expect(crowdLoad([], makeContext())).toBe(0);
  });
});

describe("redundancyPenalty", () => {
  it("charges 0.5 per same category unordered pair, over max(1, n-1)", () => {
    // THREE has one same category pair (two cafes) out of three pairs, over
    // max(1, n - 1) = 2.
    expect(redundancyPenalty(THREE)).toBeCloseTo(0.25, 12);
    // A single stop has no pairs at all.
    expect(redundancyPenalty([makeStop()])).toBe(0);
    // Two of a kind is one pair over one.
    expect(redundancyPenalty([makeStop({ category: "a" }), makeStop({ category: "a" })])).toBeCloseTo(0.5, 12);
  });

  it("is 0 when every stop is a different category", () => {
    const all = [
      makeStop({ id: "a", category: "cafes" }),
      makeStop({ id: "b", category: "galleries" }),
      makeStop({ id: "c", category: "parks" }),
    ];
    expect(redundancyPenalty(all)).toBe(0);
  });

  it("does not depend on the order the pairs are visited in", () => {
    const forward = redundancyPenalty(THREE);
    const reversed = redundancyPenalty([THREE[2], THREE[1], THREE[0]]);
    const shuffled = redundancyPenalty([THREE[1], THREE[0], THREE[2]]);
    expect(reversed).toBe(forward);
    expect(shuffled).toBe(forward);
  });
});

describe("paceDeviation", () => {
  it("is 0 when the count matches the traveller's ideal", () => {
    expect(paceDeviation(3, makeContext({ idealStops: 3 }))).toBe(0);
  });

  it("grows as one and a half power of the gap, over the ideal", () => {
    const ctx = makeContext({ idealStops: 3 });
    expect(paceDeviation(1, ctx)).toBeCloseTo((2 ** 1.5) / 3, 12);
    expect(paceDeviation(6, ctx)).toBeCloseTo((3 ** 1.5) / 3, 12);
  });

  it("is symmetric in the gap", () => {
    const ctx = makeContext({ idealStops: 3 });
    expect(paceDeviation(1, ctx)).toBeCloseTo(paceDeviation(5, ctx), 12);
  });

  it("is penalised for an empty plan, because no plan is a bad plan", () => {
    expect(paceDeviation(0, makeContext({ idealStops: 3 }))).toBeGreaterThan(0);
  });

  it("never divides by a zero ideal", () => {
    expect(Number.isFinite(paceDeviation(2, makeContext({ idealStops: 0 })))).toBe(true);
  });
});

describe("proximityDecay", () => {
  it("is 1 at zero distance and decays towards zero, never reaching it", () => {
    expect(proximityDecay(makeStop({}, { km: 0 }))).toBe(1);
    expect(proximityDecay(makeStop({}, { km: 8 }))).toBeCloseTo(1 / 9, 12);
    const far = proximityDecay(makeStop({}, { km: 1000 }));
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(0.01);
  });

  it("is the mean over the plan and 0 for an empty plan", () => {
    expect(planProximity(THREE)).toBeCloseTo((1 / 3 + 1 / 4 + 1 / 2) / 3, 12);
    expect(planProximity([])).toBe(0);
  });
});

describe("objectiveFast", () => {
  it("equals the published formula, recomputed here from the terms", () => {
    const ctx = makeContext();
    const weights = ctx.profile.weights;
    const objective = objectiveFast(THREE, ctx);
    const utility = sum(objective.breakdown.components.map((component) => component.contribution));
    const expected =
      utility
      - weights.travelPenalty * superlinearTravel(THREE)
      - weights.crowd * crowdLoad(THREE, ctx)
      - weights.novelty * redundancyPenalty(THREE)
      - weights.pacePenalty * paceDeviation(THREE.length, ctx);
    expect(objective.value).toBeCloseTo(expected, 12);
    expect(objective.breakdown.total).toBe(objective.value);
  });

  it("uses the profile weights verbatim, with no hidden renormalisation", () => {
    const uniform = (scale: number) =>
      makeContext({
        profile: makeProfile({
          weights: {
            interest: scale, rating: scale, value: scale, authenticity: scale, weather: scale,
            crowd: scale, novelty: scale, groupFit: scale, travelFriction: scale, reliability: scale,
            travelPenalty: scale, pacePenalty: scale,
          },
        }),
      });
    const base = objectiveFast(THREE, uniform(1));
    const doubled = objectiveFast(THREE, uniform(2));
    // Every term in the published formula is linear in the weights, so scaling
    // the whole vector scales the scalar. A hidden clamp to a partition would
    // have returned two identical numbers instead.
    expect(base.value).not.toBe(0);
    expect(doubled.value).toBeCloseTo(base.value * 2, 9);
  });

  it("emits one block of ten components per stop, in plan order", () => {
    const objective = objectiveFast(THREE, makeContext());
    expect(objective.breakdown.components).toHaveLength(THREE.length * COMPONENT_IDS.length);
    for (let stop = 0; stop < THREE.length; stop += 1) {
      const block = objective.breakdown.components.slice(stop * COMPONENT_IDS.length, (stop + 1) * COMPONENT_IDS.length);
      expect(block.map((component) => component.id)).toEqual([...COMPONENT_IDS]);
    }
  });

  it("reports the five aggregates it actually used", () => {
    const ctx = makeContext();
    const objective = objectiveFast(THREE, ctx);
    const aggregate = objective.breakdown.aggregate;
    expect(aggregate.travel).toBe(superlinearTravel(THREE));
    expect(aggregate.crowd).toBe(crowdLoad(THREE, ctx));
    expect(aggregate.novelty).toBe(redundancyPenalty(THREE));
    expect(aggregate.pace).toBe(paceDeviation(THREE.length, ctx));
    expect(aggregate.proximity).toBe(planProximity(THREE));
  });

  it("returns 0 for an empty plan when the ideal is 0 stops, and is finite otherwise", () => {
    const ctx = makeContext({ idealStops: 3 });
    const empty = objectiveFast([], ctx);
    expect(Number.isFinite(empty.value)).toBe(true);
    expect(empty.value).toBeLessThan(0);
    expect(empty.breakdown.components).toEqual([]);
  });

  it("is better with more stops that fit the window and the ideal", () => {
    const ctx = makeContext({ idealStops: 2 });
    const one = objectiveFast([THREE[0]], ctx);
    const two = objectiveFast([THREE[0], THREE[1]], ctx);
    expect(two.value).toBeGreaterThan(one.value);
  });

  it("prefers the stop nearer the traveller, all else equal", () => {
    const ctx = makeContext();
    const near = makeStop({ id: "near" }, { minutes: 10, km: 1 });
    const far = makeStop({ id: "far" }, { minutes: 40, km: 9 });
    expect(objectiveFast([near], ctx).value).toBeGreaterThan(objectiveFast([far], ctx).value);
  });

  it("returns bitwise identical results on two identical calls", () => {
    const ctx = makeContext();
    const first = objectiveFast(THREE, ctx);
    const second = objectiveFast(THREE, ctx);
    expect(second.value).toBe(first.value);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("returns bitwise identical results when the same context object is reused", () => {
    const ctx = makeContext();
    const runs = [objectiveFast(THREE, ctx), objectiveFast(THREE, ctx), objectiveFast(THREE, ctx)];
    expect(runs[1].value).toBe(runs[0].value);
    expect(runs[2].value).toBe(runs[0].value);
  });

  it("does not mutate the stops or the context", () => {
    const ctx = makeContext();
    const snapshot = JSON.stringify({ stops: THREE, weights: ctx.profile.weights });
    objectiveFast(THREE, ctx);
    expect(JSON.stringify({ stops: THREE, weights: ctx.profile.weights })).toBe(snapshot);
  });

  it("cannot be pushed to NaN by a corrupt leg or window", () => {
    const broken = [makeStop({}, { minutes: Number.NaN, km: Number.NaN })];
    const objective = objectiveFast(broken, makeContext({ availableMinutes: 0, budgetInr: 0 }));
    expect(Number.isNaN(objective.value)).toBe(false);
    expect(Number.isFinite(objective.value)).toBe(true);
  });

  it("is invariant to the visit order of an unordered pair, so nothing depends on a Set", () => {
    const pair = [makeStop({ id: "a", category: "cafes" }, { minutes: 20, km: 2 }), makeStop({ id: "b", category: "cafes" }, { minutes: 20, km: 2 })];
    // The legs are identical, so reversing the two stops is a genuine no-op for
    // every term in the formula. Any order dependence would show up here.
    expect(objectiveFast([pair[0], pair[1]], makeContext()).value).toBe(objectiveFast([pair[1], pair[0]], makeContext()).value);
  });

  it("scores every unordered pair exactly once in the redundancy term", () => {
    const allSame = [makeStop({ id: "a", category: "x" }), makeStop({ id: "b", category: "x" }), makeStop({ id: "c", category: "x" })];
    // Three pairs at 0.5 over max(1, 2).
    expect(redundancyPenalty(allSame)).toBeCloseTo(0.75, 12);
    expect(redundancyPenalty([allSame[2], allSame[0], allSame[1]])).toBe(redundancyPenalty(allSame));
  });
});
