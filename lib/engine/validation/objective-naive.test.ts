import { describe, expect, it } from "vitest";
import { objectiveNaive } from "./objective-naive";
import type {
  DiscoveryContext,
  ExperienceV2,
  Stop,
  Weights,
} from "@/lib/engine/contracts/types";

const ALL_DAY = [{ from: 0, to: 1440 }];

function rec(over: Partial<ExperienceV2> = {}): ExperienceV2 {
  return {
    id: "r",
    name: "Record",
    area: "Quarter",
    city: "Harbour City",
    zone: "Zone",
    station: "Station",
    category: "Culture",
    description: "",
    coordinates: [4, 52],
    travelMinutes: 10,
    durationMinutes: 60,
    priceInr: 0,
    pricePerPersonInr: 0,
    capacity: null,
    openingHours: {
      weekly: { 0: ALL_DAY, 1: ALL_DAY, 2: ALL_DAY, 3: ALL_DAY, 4: ALL_DAY, 5: ALL_DAY, 6: ALL_DAY },
      confidence: "verified",
    },
    availability: {
      leadTimeMinutes: 0,
      soldOutAt: null,
      remainingCapacity: null,
      bookingUrl: null,
      updatedAt: "2026-01-01T00:00:00Z",
    },
    access: {},
    diets: [],
    indoor: "indoor",
    kidFriendly: null,
    season: null,
    bestTimeOfDay: "any",
    ratingSum: null,
    reviewCount: null,
    authenticity: null,
    providerReliability: null,
    crowdProfile: null,
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

const WEIGHTS: Weights = {
  interest: 1,
  rating: 1,
  value: 1,
  authenticity: 1,
  weather: 1,
  crowd: 1,
  novelty: 1,
  groupFit: 1,
  travelFriction: 1,
  reliability: 1,
  travelPenalty: 0.5,
  pacePenalty: 0.25,
};

function ctx(over: Partial<DiscoveryContext> = {}): DiscoveryContext {
  const base: DiscoveryContext = {
    now: "2026-01-01T09:00:00",
    origin: { coordinates: [4, 52], label: "Start", area: "Quarter" },
    availableMinutes: 480,
    deadline: null,
    budgetInr: 6000,
    partySize: 1,
    hasToddler: false,
    hasElderly: false,
    raining: false,
    weatherSeverity: null,
    travelMode: "walk",
    pace: "normal",
    idealStops: 1,
    minStops: 1,
    accessNeeds: [],
    diets: [],
    query: "",
    profile: {
      id: "t",
      interests: { Culture: 0.5 },
      avoid: {},
      accessibility: [],
      diets: [],
      excludes: [],
      pins: [],
      weights: { ...WEIGHTS },
      bandit: { arms: [], observations: 0, updatedAt: "" },
    },
    city: {} as DiscoveryContext["city"],
    original: undefined as unknown as DiscoveryContext,
  };
  return { ...base, ...over };
}

const stop = (over: Partial<Stop> = {}): Stop => ({
  record: rec(),
  arriveBy: 540,
  travelMinutes: 0,
  travelKm: 0,
  visitMinutes: 60,
  bufferMinutes: 0,
  costInr: 0,
  ...over,
});

/**
 * The objective, re-read from `objective-spec.md` sections 3 to 6 into this
 * file, so the assertion is a second reading of the written spec rather than a
 * restatement of the implementation.
 *
 * Nothing here is imported from `./objective-naive` or `./components-naive`.
 * That includes the Wilson bound and the haversine: a shared helper is a shared
 * bug, and a test that imports the answer is not evidence of anything. The
 * haversine the naive path owns is for `validate`'s distance check only, so this
 * derivation does not have one at all: rule G-1 says `Stop.travelKm` is an
 * input and neither implementation recomputes it.
 */
function specClamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function specClamp11(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function specWilson(positive: number, total: number): number {
  if (total <= 0) return 0;
  const z = 1.96;
  const z2 = 3.8416;
  const p = positive / total;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / 4) / total);
  return (centre - margin) / denom;
}

const SPEC_WEATHER: Record<string, Record<ExperienceV2["indoor"], number>> = {
  clear: { indoor: 0.4, outdoor: 1, mixed: 0.7 },
  rain: { indoor: 1, outdoor: 0.2, mixed: 0.6 },
  heavy_rain: { indoor: 1, outdoor: -1, mixed: -0.4 },
  storm: { indoor: 0.8, outdoor: -1, mixed: -0.5 },
};

const SPEC_SLOTS = ["morning", "afternoon", "evening", "night"];

function specPeak(now: string, best: ExperienceV2["bestTimeOfDay"]): number {
  if (best === "any") return 1;
  const index = SPEC_SLOTS.indexOf(best);
  if (index < 0) return 1;
  const hours = Number(/T(\d{2})/.exec(now)?.[1] ?? Number.NaN);
  let slot = 3;
  if (hours >= 5 && hours < 12) slot = 0;
  else if (hours >= 12 && hours < 17) slot = 1;
  else if (hours >= 17 && hours < 21) slot = 2;
  return 1 - 0.6 * specClamp01(Math.abs(slot - index) / 3);
}

/** Section 2: push in index order, reduce after. Never fold into a running total. */
function specSum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

function specValue(stops: readonly Stop[], c: DiscoveryContext): number {
  const w = c.profile.weights;
  const n = stops.length;

  // Section 4: one utility per stop, written in the spec's term order.
  const stopValues: number[] = [];
  for (const s of stops) {
    const r = s.record;
    const interest = specClamp11(
      (specClamp01(c.profile.interests[r.category] ?? 0.5) - 0.5) * 2 -
        specClamp01(c.profile.avoid[r.category] ?? 0),
    );
    const rating =
      r.ratingSum === null || r.reviewCount === null || r.reviewCount <= 0
        ? 0
        : specWilson(r.ratingSum, r.reviewCount * 5);
    // The spec does not clamp the bound, and both implementations do, which
    // differs only at `ratingSum === 0`: the raw bound there is negative while
    // a lower bound in [0, 1] cannot be. No fixture here has a zero sum.
    const perHead = c.budgetInr / Math.max(1, c.partySize);
    const price = r.pricePerPersonInr;
    const value =
      price === null ? 0 : price <= 0 ? 1 : specClamp11(perHead / price / 4 * 2 - 1);
    const weather = c.weatherSeverity === null ? 0 : SPEC_WEATHER[c.weatherSeverity][r.indoor];
    let group = 0;
    if (c.hasToddler) {
      if (r.kidFriendly === true) group += 1;
      else if (r.kidFriendly === false) group -= 1;
      if (r.access.stroller_ok === true) group += 0.5;
      else if (r.access.stroller_ok === false) group -= 0.5;
    }
    if (c.hasElderly) {
      if (r.access.low_walking === true) group += 1;
      else if (r.access.low_walking === false) group -= 1;
    }
    if (c.partySize > 1 && r.capacity !== null) {
      group += r.capacity >= c.partySize ? 0.25 : -1;
    }
    stopValues.push(
      w.interest * interest +
        w.rating * rating +
        w.value * value +
        w.authenticity * specClamp01(r.authenticity ?? 0.5) +
        w.weather * weather +
        w.groupFit * specClamp11(group) +
        w.reliability * specClamp01(r.providerReliability ?? 0.5) +
        w.travelFriction * (1 / (1 + s.travelKm)),
    );
  }

  // Section 5. Rule G-3: a zero minute leg contributes zero whatever its km.
  const legs: number[] = [];
  for (const s of stops) {
    legs.push(s.travelMinutes === 0 ? 0 : s.travelMinutes * Math.pow(1 + s.travelKm / 8, 2));
  }
  const crowdParts: number[] = [];
  for (const s of stops) {
    crowdParts.push(
      specClamp01(s.record.crowdProfile ?? 0.5) * specPeak(c.now, s.record.bestTimeOfDay),
    );
  }
  let pairs = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (stops[i].record.category === stops[j].record.category) pairs += 0.5;
    }
  }
  const gap = Math.abs(n - c.idealStops);

  // Section 6: four penalties, pushed in this order, reduced, subtracted once.
  // Proximity is already inside `stopValues` by rule W-1 and is not a penalty.
  const penaltyTerms: number[] = [];
  penaltyTerms.push(w.travelPenalty * specSum(legs));
  penaltyTerms.push(w.crowd * (n === 0 ? 0 : specSum(crowdParts) / n));
  penaltyTerms.push(w.novelty * (pairs / Math.max(1, n - 1)));
  penaltyTerms.push(w.pacePenalty * ((gap * Math.sqrt(gap)) / Math.max(1, c.idealStops)));

  return specSum(stopValues) - specSum(penaltyTerms);
}

describe("objectiveNaive", () => {
  it("reproduces the written formula for a single stop to twelve digits", () => {
    const plan = [stop({ record: rec({ coordinates: [4.05, 52.02] }), travelKm: 2 })];
    const c = ctx();
    expect(objectiveNaive(plan, c).value).toBeCloseTo(specValue(plan, c), 12);
  });

  it("reproduces the written formula for a three stop plan to twelve digits", () => {
    const plan = [
      stop({ record: rec({ coordinates: [4.05, 52.02], category: "Culture" }), travelMinutes: 20, travelKm: 3 }),
      stop({ record: rec({ coordinates: [4.07, 52.04], category: "Food" }), travelMinutes: 15, travelKm: 2 }),
      stop({ record: rec({ coordinates: [4.01, 52.05], category: "Nature" }), travelMinutes: 25, travelKm: 4 }),
    ];
    const c = ctx({ idealStops: 3 });
    expect(objectiveNaive(plan, c).value).toBeCloseTo(specValue(plan, c), 12);
  });

  it("is deterministic, because a drifting objective cannot be compared", () => {
    const plan = [stop({ record: rec({ coordinates: [4.05, 52.02] }), travelMinutes: 20 })];
    const c = ctx();
    expect(objectiveNaive(plan, c).value).toBe(objectiveNaive(plan, c).value);
  });

  it("is never NaN, whatever the record is missing", () => {
    const bare = stop({
      record: rec({
        ratingSum: null,
        reviewCount: null,
        pricePerPersonInr: null,
        authenticity: null,
        providerReliability: null,
        crowdProfile: null,
      }),
    });
    const c = ctx({ weatherSeverity: "storm", partySize: 0, budgetInr: 0, idealStops: 0 });
    expect(Number.isNaN(objectiveNaive([bare], c).value)).toBe(false);
    expect(Number.isFinite(objectiveNaive([bare], c).value)).toBe(true);
  });

  it("handles an empty plan without dividing by zero", () => {
    const empty = objectiveNaive([], ctx());
    expect(Number.isFinite(empty.value)).toBe(true);
    expect(empty.breakdown.aggregate.travel).toBe(0);
    expect(empty.breakdown.aggregate.crowd).toBe(0);
    expect(empty.breakdown.aggregate.novelty).toBe(0);
  });

  it("penalises an empty plan for the pace it misses", () => {
    const c = ctx({ idealStops: 4 });
    const result = objectiveNaive([], c);
    expect(result.breakdown.aggregate.pace).toBeCloseTo(Math.pow(4, 1.5) / 4, 12);
    expect(result.value).toBeCloseTo(-0.25 * 2, 12);
  });
});

describe("the breakdown reconciles", () => {
  const plan = [
    stop({ record: rec({ coordinates: [4.05, 52.02] }), travelMinutes: 20 }),
    stop({ record: rec({ coordinates: [4.07, 52.04] }), travelMinutes: 15 }),
  ];
  const c = ctx({ idealStops: 3, weatherSeverity: "rain" });
  const result = objectiveNaive(plan, c);

  it("sums its component rows to the scalar once the per stop proximity term is added back", () => {
    let sum = 0;
    for (const item of result.breakdown.components) sum += item.contribution;
    // Rule W-1 puts proximity in the per stop utility, but proximity has no
    // `ComponentId` of its own, so no row carries it: the rows are short of the
    // value by exactly w.travelFriction * mean(proximity) * stopCount. Asserted
    // as an identity rather than as a fudged constant, so a future change to
    // either side of it fails here instead of quietly reconciling.
    const perStopProximity =
      c.profile.weights.travelFriction * result.breakdown.aggregate.proximity * plan.length;
    expect(perStopProximity).not.toBe(0);
    expect(sum + perStopProximity).toBeCloseTo(result.value, 12);
  });

  it("reports the same number in the breakdown total and on the objective", () => {
    expect(result.breakdown.total).toBe(result.value);
  });

  it("has one row per component id, with no repeats", () => {
    const ids = result.breakdown.components.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(10);
  });

  it("keeps the travel penalty negative, as a penalty rather than a flipped sign", () => {
    const travelRow = result.breakdown.components.find((i) => i.id === "travelFriction");
    expect(travelRow?.contribution).toBeLessThan(0);
    expect(travelRow?.sentence).toContain("quadratic travel cost");
  });

  it("says the weather is unknown rather than fine when it is unknown", () => {
    const unknown = objectiveNaive(plan, ctx({ weatherSeverity: null }));
    const row = unknown.breakdown.components.find((i) => i.id === "weather");
    expect(row?.contribution).toBe(0);
    expect(row?.sentence).toContain("unknown");
  });

  it("gives every row a sentence carrying a number or a named fact", () => {
    for (const item of result.breakdown.components) {
      expect(item.sentence.length).toBeGreaterThan(10);
      expect(/\d/.test(item.sentence) || /no stops|unknown/.test(item.sentence)).toBe(true);
      expect(item.sentence).not.toContain("\u2014");
    }
  });
});

describe("aggregate penalties", () => {
  it("is maximal for a plan where every stop shares one category", () => {
    const same = [
      stop({ record: rec({ id: "a", category: "Culture", coordinates: [4.01, 52.01] }) }),
      stop({ record: rec({ id: "b", category: "Culture", coordinates: [4.02, 52.02] }) }),
      stop({ record: rec({ id: "c", category: "Culture", coordinates: [4.03, 52.03] }) }),
    ];
    // Interest is neutral here, so the category is the only thing that varies.
    const flat = ctx({ idealStops: 3 });
    flat.profile.interests = {};
    const mixed = [
      stop({ record: rec({ id: "a", category: "Culture", coordinates: [4.01, 52.01] }) }),
      stop({ record: rec({ id: "b", category: "Food", coordinates: [4.02, 52.02] }) }),
      stop({ record: rec({ id: "c", category: "Nature", coordinates: [4.03, 52.03] }) }),
    ];
    expect(objectiveNaive(same, flat).breakdown.aggregate.novelty).toBeCloseTo(0.75, 12);
    expect(objectiveNaive(mixed, flat).breakdown.aggregate.novelty).toBe(0);
    expect(objectiveNaive(same, flat).value).toBeLessThan(
      objectiveNaive(mixed, flat).value,
    );
  });

  it("is maximal for a plan where every stop wants the same time of day", () => {
    const allNight = ctx({ now: "2026-01-01T22:00:00" });
    const plan = [
      stop({ record: rec({ crowdProfile: 0.9, bestTimeOfDay: "night", coordinates: [4.01, 52.01] }) }),
      stop({ record: rec({ crowdProfile: 0.9, bestTimeOfDay: "night", coordinates: [4.02, 52.02] }) }),
    ];
    // Every stop is at its own peak, so the crowd load is the raw mean of 0.9.
    expect(objectiveNaive(plan, allNight).breakdown.aggregate.crowd).toBeCloseTo(0.9, 12);
  });

  it("grows superlinearly with the distance of a leg", () => {
    const near = objectiveNaive(
      [stop({ record: rec({ coordinates: [4.001, 52.001] }), travelMinutes: 10, travelKm: 1 })],
      ctx(),
    );
    const far = objectiveNaive(
      [stop({ record: rec({ coordinates: [4.001, 52.001] }), travelMinutes: 10, travelKm: 20 })],
      ctx(),
    );
    const nearTravel = near.breakdown.aggregate.travel;
    const farTravel = far.breakdown.aggregate.travel;
    // 10 * (1 + 1/8)^2 = 12.65625 and 10 * (1 + 20/8)^2 = 122.5, so the leg is
    // 9.679 times the cost. The same coordinates, deliberately: the objective
    // reads the kilometres it was handed, not the ones it could recompute.
    expect(farTravel / nearTravel).toBeCloseTo(9.679012346, 8);
    expect(farTravel / nearTravel).toBeGreaterThan(4);
  });

  it("reads Stop.travelKm as an input and never recomputes it, by rule G-1", () => {
    // Same record, same coordinates, same everything except the kilometres on
    // the Stop. If the objective were recomputing a haversine these two plans
    // would score identically, and OSRM road kilometres would be silently
    // thrown away.
    const record = rec({ coordinates: [4.05, 52.02] });
    const fourKm = [stop({ record, travelMinutes: 20, travelKm: 4 })];
    const fortyKm = [stop({ record, travelMinutes: 20, travelKm: 40 })];
    const c = ctx();
    expect(objectiveNaive(fourKm, c).value).toBeCloseTo(specValue(fourKm, c), 12);
    expect(objectiveNaive(fortyKm, c).value).toBeCloseTo(specValue(fortyKm, c), 12);
    expect(objectiveNaive(fortyKm, c).value).toBeLessThan(objectiveNaive(fourKm, c).value);
  });

  it("charges a zero minute leg nothing at all, by rule G-3", () => {
    // The origin leg is the one leg where travelMinutes and travelKm can
    // disagree, and the frozen Stop comment says travel is 0 for the first
    // stop. G-3 makes both readings produce the same total.
    const record = rec({ coordinates: [4.05, 52.02] });
    const c = ctx();
    const noMinutes = [stop({ record, travelMinutes: 0, travelKm: 12 })];
    const someMinutes = [stop({ record, travelMinutes: 7, travelKm: 12 })];
    expect(objectiveNaive(noMinutes, c).breakdown.aggregate.travel).toBe(0);
    expect(objectiveNaive(noMinutes, c).value).toBeCloseTo(specValue(noMinutes, c), 12);
    expect(objectiveNaive(someMinutes, c).breakdown.aggregate.travel).toBeGreaterThan(0);
  });
});

describe("rule W-1: the per stop proximity term is weighted by w.travelFriction", () => {
  const withTravelFriction = (travelFriction: number): DiscoveryContext => {
    const c = ctx();
    c.profile.weights = { ...WEIGHTS, travelFriction };
    return c;
  };
  /** 3 km out is 1 / (1 + 3) = 0.25 of the way to the origin. */
  const plan = [stop({ record: rec({ coordinates: [4.05, 52.02] }), travelKm: 3 })];
  const at = (travelFriction: number) => objectiveNaive(plan, withTravelFriction(travelFriction)).value;

  it("scales the term linearly by the weight and nothing else", () => {
    expect(at(1) - at(0)).toBeCloseTo(0.25, 12);
    expect(at(4) - at(0)).toBeCloseTo(1, 12);
  });

  it("has no fallback constant, so a weight of zero is a real zero", () => {
    // The deleted `proximityWeight` read a `proximity` key that `Weights` has
    // never had and fell back to 0.15 for every profile ever written. Under
    // that reading at(0) and at(0.15) were the same number, because the weight
    // was never read at all.
    expect(at(0.15) - at(0)).toBeCloseTo(0.0375, 12);
  });

  it("still reports proximity as a diagnostic at any weight, including zero", () => {
    // Section 5: it is reported, and it is not subtracted a second time.
    expect(objectiveNaive(plan, withTravelFriction(0)).breakdown.aggregate.proximity).toBeCloseTo(
      0.25,
      12,
    );
  });
});
