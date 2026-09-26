import { describe, expect, it } from "vitest";
import { objectiveFast } from "@/lib/engine/scoring";
import { DRIFT_TOLERANCE, compareDrift, describeDrift, withinTolerance } from "./drift";
import { objectiveNaive } from "./objective-naive";
import { validate } from "./validate";
import type {
  ComponentId,
  DiscoveryContext,
  ExperienceV2,
  OpeningHours,
  Stop,
  TravellerProfile,
  Weights,
} from "@/lib/engine/contracts/types";

/**
 * The test this whole repository rests on.
 *
 * `objectiveFast` reads a precomputed distance matrix. `objectiveNaive`
 * recomputes every distance from raw coordinates with its own haversine. They
 * are two derivations of the same written specification, and this file asserts
 * they agree to 1e-6.
 *
 * A local copy of the fast path would make every assertion here pass while
 * proving nothing, so none exists in this directory and `independence.test.ts`
 * enforces that.
 *
 * ── status: the agreement bound is NOT met ────────────────────────────────
 * The "the credibility anchor" block below is red. The two derivations disagree
 * on seven of the ten components, not on floating point noise, because section 3
 * of `SESSION/00-CONTRACTS.md` names the components without giving their closed
 * form and two people read it two ways. The divergence is itemised in
 * `SESSION/BLOCKERS/6.md` with a proposed arbitration for each.
 *
 * Everything else in this file is green and is worth keeping green: it proves
 * the fixture bites, that both sides are sensitive to every input, that a
 * mutation introduces no *new* divergence, and that a corrupted objective is
 * caught. Those properties hold now and must keep holding after the
 * arbitration, which is exactly what makes them useful as a regression net.
 */

const ALL_DAY: OpeningHours["weekly"] = {
  0: [{ from: 0, to: 1440 }],
  1: [{ from: 0, to: 1440 }],
  2: [{ from: 0, to: 1440 }],
  3: [{ from: 0, to: 1440 }],
  4: [{ from: 0, to: 1440 }],
  5: [{ from: 0, to: 1440 }],
  6: [{ from: 0, to: 1440 }],
};

const EARTH_RADIUS_KM = 6371.0088;
const DEG = Math.PI / 180;

/**
 * The test's own haversine, written from the formula. It has to agree with
 * `distance-naive.ts` and with the km the fast path is handed, which is the
 * point: three independent statements of the same distance.
 */
function haversineKm(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const latA = a[1] * DEG;
  const latB = b[1] * DEG;
  const dLat = (b[1] - a[1]) * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function makeRecord(id: string, over: Partial<ExperienceV2> = {}): ExperienceV2 {
  return {
    id,
    name: `Place ${id}`,
    area: "Quarter",
    city: "Harbour City",
    zone: "Zone",
    station: "Station",
    category: "Culture",
    description: "",
    coordinates: [4, 52],
    travelMinutes: 10,
    durationMinutes: 60,
    priceInr: 400,
    pricePerPersonInr: 400,
    capacity: 20,
    openingHours: { weekly: ALL_DAY, confidence: "verified" },
    availability: {
      leadTimeMinutes: 0,
      soldOutAt: null,
      remainingCapacity: null,
      bookingUrl: null,
      updatedAt: "2026-01-01T00:00:00Z",
    },
    access: { step_free: true },
    diets: ["vegetarian"],
    indoor: "indoor",
    kidFriendly: true,
    season: null,
    bestTimeOfDay: "morning",
    ratingSum: 46,
    reviewCount: 10,
    authenticity: 0.7,
    providerReliability: 0.6,
    crowdProfile: 0.5,
    provenance: {} as ExperienceV2["provenance"],
    confidence: { price: "verified" },
    sources: {},
    imageUrl: "",
    imageCredit: "",
    status: "",
    statusTone: "blue",
    updated: "",
    ...over,
  };
}

/** Twelve records across three categories, on a real coordinate grid. */
function catalogue(): ExperienceV2[] {
  const spots: [number, number][] = [
    [4.0, 52.0],
    [4.01, 52.004],
    [4.02, 52.008],
    [4.03, 52.012],
    [4.04, 52.001],
    [4.05, 52.005],
    [4.06, 52.009],
    [4.07, 52.013],
    [4.015, 52.02],
    [4.025, 52.024],
    [4.035, 52.028],
    [4.045, 52.032],
  ];
  const categories = ["Culture", "Food", "Nature"];
  return spots.map((coordinates, index) =>
    makeRecord(`r${index + 1}`, {
      category: categories[index % 3],
      coordinates,
      travelMinutes: 8 + index * 2,
      durationMinutes: 45 + (index % 4) * 15,
      priceInr: 200 + index * 50,
      pricePerPersonInr: 200 + index * 50,
      ratingSum: 30 + index,
      reviewCount: 8 + index,
      authenticity: 0.3 + index * 0.05,
      bestTimeOfDay: (["morning", "afternoon", "evening", "night"] as const)[index % 4],
      indoor: index % 5 === 0 ? "outdoor" : "indoor",
    }),
  );
}

const ORIGIN: [number, number] = [3.995, 51.997];

const WEIGHTS: Weights = {
  interest: 1,
  rating: 0.55,
  value: 0.6,
  authenticity: 0.7,
  weather: 0.5,
  crowd: 0.6,
  novelty: 0.45,
  groupFit: 0.5,
  travelFriction: 0.5,
  reliability: 0.4,
  travelPenalty: 0.3,
  pacePenalty: 0.25,
} as Weights;

function makeContext(over: Partial<DiscoveryContext> = {}): DiscoveryContext {
  const profile: TravellerProfile = {
    id: "traveller",
    interests: { Culture: 0.9, Food: 0.7, Nature: 0.4 },
    avoid: { Shopping: 0.5 },
    accessibility: [],
    diets: [],
    excludes: [],
    pins: [],
    weights: { ...WEIGHTS },
    bandit: { arms: [], observations: 0, updatedAt: "2026-01-01T00:00:00Z" },
  };
  const base: DiscoveryContext = {
    now: "2026-01-01T09:00:00Z",
    origin: { coordinates: ORIGIN, label: "Start", area: "Quarter" },
    availableMinutes: 600,
    deadline: null,
    budgetInr: 6000,
    partySize: 3,
    hasToddler: false,
    hasElderly: false,
    raining: false,
    weatherSeverity: "rain",
    travelMode: "auto",
    pace: "normal",
    idealStops: 4,
    minStops: 2,
    accessNeeds: [],
    diets: [],
    query: "",
    profile,
    city: {} as DiscoveryContext["city"],
    original: undefined as unknown as DiscoveryContext,
  };
  return { ...base, ...over };
}

/**
 * Build stops whose `travelKm` is the haversine distance the fast path is
 * handed, and whose times chain. A `Stop` whose km disagrees with its
 * coordinates is not a plan, it is a rounding error waiting to be reported as
 * objective drift, so the fixture never does that.
 */
function buildStops(
  records: readonly ExperienceV2[],
  ctx: DiscoveryContext,
  startAt = 540,
): Stop[] {
  const stops: Stop[] = [];
  let previous = ctx.origin.coordinates;
  let clock = startAt;
  for (const record of records) {
    const km = haversineKm(previous, record.coordinates);
    const travelMinutes = Math.round(km * 3.2);
    stops.push({
      record,
      arriveBy: clock + travelMinutes,
      travelMinutes,
      travelKm: km,
      visitMinutes: record.durationMinutes,
      bufferMinutes: 10,
      costInr: record.priceInr * ctx.partySize,
    });
    clock += travelMinutes + record.durationMinutes + 10;
    previous = record.coordinates;
  }
  return stops;
}

function pair(records: readonly ExperienceV2[], ctx: DiscoveryContext) {
  const stops = buildStops(records, ctx);
  return { stops, fast: objectiveFast(stops, ctx), naive: objectiveNaive(stops, ctx) };
}

/** Component ids whose contributions differ by more than the tolerance. */
function diverging(records: readonly ExperienceV2[], ctx: DiscoveryContext): ComponentId[] {
  const comparison = compareDrift(objectiveFast(buildStops(records, ctx), ctx), objectiveNaive(buildStops(records, ctx), ctx));
  return comparison.perComponent
    .filter((row) => row.id !== "aggregate" && Math.abs(row.delta) > DRIFT_TOLERANCE)
    .map((row) => row.id as ComponentId)
    .sort();
}

describe("the fixture is sound", () => {
  const records = catalogue();
  const ctx = makeContext();

  it("has twelve records across three categories", () => {
    expect(records).toHaveLength(12);
    expect(new Set(records.map((r) => r.category)).size).toBe(3);
  });

  it("gives every stop a travel distance that matches its coordinates", () => {
    for (const stop of buildStops(records, ctx)) {
      expect(Number.isFinite(stop.travelKm)).toBe(true);
      expect(stop.travelKm).toBeGreaterThan(0);
    }
  });

  it("produces finite, non-zero, deterministic objectives on both sides", () => {
    const first = pair(records.slice(0, 4), ctx);
    const second = pair(records.slice(0, 4), ctx);
    expect(Number.isFinite(first.fast.value)).toBe(true);
    expect(Number.isFinite(first.naive.value)).toBe(true);
    expect(first.fast.value).not.toBe(0);
    expect(first.naive.value).not.toBe(0);
    expect(first.fast.value).toBe(second.fast.value);
    expect(first.naive.value).toBe(second.naive.value);
  });

  it("never returns NaN from either side, on any prefix of the catalogue", () => {
    for (let n = 0; n <= records.length; n += 1) {
      const result = pair(records.slice(0, n), ctx);
      expect(Number.isNaN(result.fast.value), `fast at ${n} stops`).toBe(false);
      expect(Number.isNaN(result.naive.value), `naive at ${n} stops`).toBe(false);
    }
  });

  it("never returns NaN when every optional fact is missing", () => {
    const bare = records.slice(0, 4).map((record) =>
      makeRecord(record.id, {
        ...record,
        ratingSum: null,
        reviewCount: null,
        pricePerPersonInr: null,
        authenticity: null,
        providerReliability: null,
        crowdProfile: null,
        capacity: null,
        kidFriendly: null,
      }),
    );
    const result = pair(bare, ctx);
    expect(Number.isFinite(result.fast.value)).toBe(true);
    expect(Number.isFinite(result.naive.value)).toBe(true);
  });

  it("never returns NaN at a zero budget, a zero window or a party of zero", () => {
    const degenerate = makeContext({ budgetInr: 0, availableMinutes: 0, partySize: 0, idealStops: 0 });
    const result = pair(records.slice(0, 2), degenerate);
    expect(Number.isFinite(result.fast.value)).toBe(true);
    expect(Number.isFinite(result.naive.value)).toBe(true);
  });

  it("reads a five star rating sum over a five star trial count on both sides", () => {
    // The single most likely silent NaN in this engine: 46 stars out of 50
    // possible, misread as 46 positives out of 10 trials.
    const rated = records.slice(0, 4).map((record) =>
      makeRecord(record.id, { ...record, ratingSum: 46, reviewCount: 10 }),
    );
    for (const result of [pair(rated, ctx)]) {
      expect(Number.isNaN(result.fast.value)).toBe(false);
      expect(Number.isNaN(result.naive.value)).toBe(false);
    }
  });
});

describe("the drift machinery works", () => {
  const records = catalogue();
  const ctx = makeContext();
  const stops = buildStops(records.slice(0, 4), ctx);

  it("catches a deliberately corrupted naive objective and names the component", () => {
    const fast = objectiveFast(stops, ctx);
    const truth = objectiveNaive(stops, ctx);
    // Corrupt the component that is already the largest divergence, so the
    // failure message leads with the culprit rather than truncating it away.
    // `delta` is fast minus naive, so pushing naive up by 1e-3 pushes the row's
    // delta down by 1e-3.
    const worstBefore = compareDrift(fast, truth).perComponent
      .filter((row) => row.id !== "aggregate")
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    const target = worstBefore.id;
    const corrupt = {
      ...truth,
      value: truth.value + 1e-3,
      breakdown: {
        ...truth.breakdown,
        components: truth.breakdown.components.map((item) =>
          item.id === target ? { ...item, contribution: item.contribution + 1e-3 } : item,
        ),
      },
    };
    const honest = compareDrift(fast, truth);
    const comparison = compareDrift(fast, corrupt);
    const named = comparison.perComponent.find((row) => row.id === target);
    const before = honest.perComponent.find((row) => row.id === target);
    expect(named).toBeDefined();
    expect(before).toBeDefined();
    expect(named!.delta - before!.delta).toBeCloseTo(-1e-3, 12);
    expect(named!.naive - before!.naive).toBeCloseTo(1e-3, 12);
    expect(describeDrift(comparison)).toContain(target);
  });

  it("sees a real difference rather than a coincidence of rounding", () => {
    const moved = records.map((record, index) =>
      index === 2 ? makeRecord(record.id, { ...record, coordinates: [4.09, 52.06] }) : record,
    );
    const before = objectiveNaive(buildStops(records.slice(0, 4), ctx), ctx).value;
    const after = objectiveNaive(buildStops(moved.slice(0, 4), ctx), ctx).value;
    expect(after).not.toBe(before);
  });

  it("routes the drift figure through validate as an issue", () => {
    const truth = objectiveFast(stops, ctx);
    const result = validate(stops, ctx, { ...truth, value: truth.value + 0.05 });
    expect(result.ok).toBe(false);
    const issue = result.issues.find((i) => i.code === "objective_drift");
    expect(issue).toBeDefined();
    expect(issue?.sentence).toMatch(/drift/);
  });

  it("keeps the reported drift stable for a stable input", () => {
    const a = compareDrift(objectiveFast(stops, ctx), objectiveNaive(stops, ctx));
    const b = compareDrift(objectiveFast(stops, ctx), objectiveNaive(stops, ctx));
    expect(a.drift).toBe(b.drift);
  });
});

/**
 * Every mutation below asserts two things, and the second is the one that
 * matters: the mutation must move *both* derivations, and it must not introduce
 * a component divergence that the unmutated baseline did not already have. If a
 * change makes the two sides agree about something new, that is a real signal.
 */
describe("mutations: both sides see them, and no new divergence appears", () => {
  const records = catalogue();
  const baseline = makeContext();
  const BASELINE_DIVERGENT = diverging(records.slice(0, 4), baseline);

  function mutation(
    label: string,
    mutate: (source: ExperienceV2[]) => ExperienceV2[],
    context: DiscoveryContext = baseline,
  ) {
    const changed = mutate(records);
    const before = pair(records.slice(0, 4), context);
    const after = pair(changed.slice(0, 4), context);
    expect(after.fast.value, `${label}: fast must move`).not.toBe(before.fast.value);
    expect(after.naive.value, `${label}: naive must move`).not.toBe(before.naive.value);
    const newly = diverging(changed.slice(0, 4), context).filter(
      (id) => BASELINE_DIVERGENT.indexOf(id) === -1,
    );
    expect(newly, `${label}: introduced a new divergence`).toEqual([]);
  }

  it("baseline divergence is recorded so the mutations below mean something", () => {
    expect(BASELINE_DIVERGENT.length).toBeGreaterThan(0);
  });

  it("sees a raised price", () => {
    mutation("price", (source) =>
      source.map((r) => (r.id === "r2" ? makeRecord(r.id, { ...r, priceInr: 5000, pricePerPersonInr: 5000 }) : r)),
    );
  });

  it("sees a lengthened visit in the naive path, which scores the schedule", () => {
    // The objective is over scores, not over the clock: `visitMinutes` reaches
    // no component, so changing it moves the naive total by exactly nothing.
    // That is a true statement about a score, and asserting otherwise would be
    // asserting a schedule requirement the engine does not have.
    const longer = records.map((r) =>
      r.id === "r3" ? makeRecord(r.id, { ...r, durationMinutes: 240 }) : r,
    );
    const before = pair(records.slice(0, 4), baseline);
    const after = pair(longer.slice(0, 4), baseline);
    expect(after.fast.value).toBe(before.fast.value);
    expect(after.naive.value).toBe(before.naive.value);
  });

  it("sees a changed travel leg, which is the one time input the score does read", () => {
    mutation("travel leg", (source) =>
      source.map((r) => makeRecord(r.id, { ...r, travelMinutes: 90, coordinates: [4.08, 52.04] })),
    );
  });

  it("sees a moved coordinate", () => {
    mutation("coordinate", (source) =>
      source.map((r) => (r.id === "r4" ? makeRecord(r.id, { ...r, coordinates: [4.2, 52.2] }) : r)),
    );
  });

  it("sees a different party size", () => {
    const before = pair(records.slice(0, 4), makeContext({ partySize: 1 }));
    const after = pair(records.slice(0, 4), makeContext({ partySize: 9 }));
    expect(after.fast.value).not.toBe(before.fast.value);
    expect(after.naive.value).not.toBe(before.naive.value);
  });

  it("sees a different ideal stop count", () => {
    const tight = makeContext({ idealStops: 1 });
    const loose = makeContext({ idealStops: 9 });
    const before = pair(records.slice(0, 4), tight);
    const after = pair(records.slice(0, 4), loose);
    expect(after.fast.value).not.toBe(before.fast.value);
    expect(after.naive.value).not.toBe(before.naive.value);
  });

  it("sees a different weight", () => {
    const ctx = makeContext();
    const before = pair(records.slice(0, 4), ctx);
    ctx.profile.weights = { ...WEIGHTS, authenticity: 3 } as Weights;
    const after = pair(records.slice(0, 4), ctx);
    expect(after.fast.value).not.toBe(before.fast.value);
    expect(after.naive.value).not.toBe(before.naive.value);
  });

  it("sees every weather severity, including unknown", () => {
    const clear = pair(records.slice(0, 4), makeContext({ weatherSeverity: "clear" }));
    const unknown = pair(records.slice(0, 4), makeContext({ weatherSeverity: null }));
    expect(clear.fast.value).not.toBe(unknown.fast.value);
    expect(clear.naive.value).not.toBe(unknown.naive.value);
  });
});

describe("edge cases that break naive implementations", () => {
  const records = catalogue();

  it("handles a single stop plan and an empty plan", () => {
    for (const n of [0, 1]) {
      const result = pair(records.slice(0, n), makeContext({ idealStops: 1 }));
      expect(Number.isFinite(result.fast.value)).toBe(true);
      expect(Number.isFinite(result.naive.value)).toBe(true);
    }
  });

  it("handles a party of 1", () => {
    const solo = makeContext({ partySize: 1, budgetInr: 3000 });
    const result = pair(records.slice(0, 4), solo);
    expect(Number.isFinite(result.fast.value)).toBe(true);
    expect(Number.isFinite(result.naive.value)).toBe(true);
  });

  it("handles an ideal of 0 and an ideal of 1 without dividing by zero", () => {
    for (const idealStops of [0, 1]) {
      const result = pair(records.slice(0, 3), makeContext({ idealStops }));
      expect(Number.isFinite(result.fast.value)).toBe(true);
      expect(Number.isFinite(result.naive.value)).toBe(true);
    }
  });

  it("handles a plan where every stop is one category, so redundancy is maximal", () => {
    const allNature = [0, 3, 6, 9].map((index) =>
      makeRecord(`nature-${index}`, { ...records[index], id: `nature-${index}`, category: "Nature" }),
    );
    const ctx = makeContext({ idealStops: 4 });
    const stops = buildStops(allNature, ctx);
    // Four stops in one category is all six unordered pairs, so
    // 6 * 0.5 over (4 - 1) is the maximum the term can reach.
    expect(objectiveNaive(stops, ctx).breakdown.aggregate.novelty).toBeCloseTo(1, 12);
    expect(Number.isFinite(objectiveFast(stops, ctx).value)).toBe(true);
  });

  it("handles a plan where every stop wants the same time of day", () => {
    const allNight = records.slice(0, 5).map((record) =>
      makeRecord(record.id, { ...record, bestTimeOfDay: "night", crowdProfile: 0.9 }),
    );
    for (const now of ["2026-01-01T09:00:00Z", "2026-01-01T22:00:00Z"]) {
      const result = pair(allNight, makeContext({ now }));
      expect(Number.isFinite(result.fast.value)).toBe(true);
      expect(Number.isFinite(result.naive.value)).toBe(true);
    }
  });

  it("handles a plan that fills the window exactly, with no epsilon", () => {
    const ctx = makeContext();
    let exact = 0;
    for (const stop of buildStops(records.slice(0, 3), ctx)) {
      exact += stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes;
    }
    const stops = buildStops(records.slice(0, 3), ctx);
    const tight = makeContext({ availableMinutes: exact });
    expect(objectiveNaive(stops, tight).value).toBe(objectiveNaive(stops, ctx).value);
  });

  it("handles stops visited in reverse order", () => {
    const result = pair(records.slice(0, 5).reverse(), makeContext());
    expect(Number.isFinite(result.fast.value)).toBe(true);
    expect(Number.isFinite(result.naive.value)).toBe(true);
  });

  it("handles a start time late enough to wrap past midnight", () => {
    const result = pair(records.slice(0, 4), makeContext({ now: "2026-01-01T21:30:00Z" }));
    expect(Number.isFinite(result.fast.value)).toBe(true);
    expect(Number.isFinite(result.naive.value)).toBe(true);
  });
});

/**
 * The credibility anchor. Blocked: the two derivations disagree on seven of the
 * ten components because section 3 names them without a closed form. The
 * per-component deltas are itemised in SESSION/BLOCKERS/6.md.
 */
describe("the credibility anchor", () => {
  const records = catalogue();
  const ctx = makeContext();

  it("agrees to 1e-6 on a four stop plan", () => {
    const stops = buildStops(records.slice(0, 4), ctx);
    const comparison = compareDrift(objectiveFast(stops, ctx), objectiveNaive(stops, ctx));
    expect(comparison.drift, describeDrift(comparison)).toBeLessThanOrEqual(DRIFT_TOLERANCE);
  });

  it("agrees on every prefix of the catalogue, from empty to all twelve", () => {
    for (let n = 0; n <= records.length; n += 1) {
      const stops = buildStops(records.slice(0, n), ctx);
      const comparison = compareDrift(objectiveFast(stops, ctx), objectiveNaive(stops, ctx));
      expect(comparison.drift, `${n} stops: ${describeDrift(comparison)}`).toBeLessThanOrEqual(
        DRIFT_TOLERANCE,
      );
    }
  });

  it("agrees on every window of three consecutive stops", () => {
    for (let start = 0; start + 3 <= records.length; start += 1) {
      const stops = buildStops(records.slice(start, start + 3), ctx);
      const comparison = compareDrift(objectiveFast(stops, ctx), objectiveNaive(stops, ctx));
      expect(
        comparison.drift,
        `window at ${start}: ${describeDrift(comparison)}`,
      ).toBeLessThanOrEqual(DRIFT_TOLERANCE);
    }
  });

  it("agrees when the stops are visited in reverse order", () => {
    const stops = buildStops(records.slice(0, 5).reverse(), ctx);
    const comparison = compareDrift(objectiveFast(stops, ctx), objectiveNaive(stops, ctx));
    expect(comparison.drift, describeDrift(comparison)).toBeLessThanOrEqual(DRIFT_TOLERANCE);
  });
});
