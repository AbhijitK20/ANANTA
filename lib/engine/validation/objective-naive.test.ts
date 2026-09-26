import { describe, expect, it } from "vitest";
import { objectiveNaive } from "./objective-naive";
import { haversineKm } from "./distance-naive";
import { wilsonLowerBound } from "./components-naive";
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
    confidence: {},
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

/** The scalar re-expressed straight from section 3, independently of the file. */
function specValue(stops: readonly Stop[], c: DiscoveryContext): number {
  const w = c.profile.weights;
  let previous = c.origin.coordinates;
  let utility = 0;
  const perStop: number[] = [];
  for (const s of stops) {
    const km = haversineKm(previous, [s.record.coordinates[0], s.record.coordinates[1]]);
    previous = [s.record.coordinates[0], s.record.coordinates[1]];
    const bound =
      s.record.reviewCount !== null && s.record.reviewCount > 0
        ? (wilsonLowerBound(s.record.ratingSum ?? 0, s.record.reviewCount) * 5 - 3) / 2
        : 0;
    perStop.push(
      w.interest * (c.profile.interests[s.record.category] ?? 0) +
        w.rating * bound +
        w.value * 1 +
        w.authenticity * 0.5 +
        w.weather * 0 +
        w.groupFit * 0.25 +
        w.reliability * 0.5 +
        0.15 * (1 / (1 + km)),
    );
  }
  for (const term of perStop) utility += term;

  let travel = 0;
  previous = c.origin.coordinates;
  for (const s of stops) {
    const km = haversineKm(previous, [s.record.coordinates[0], s.record.coordinates[1]]);
    previous = [s.record.coordinates[0], s.record.coordinates[1]];
    travel += s.travelMinutes * Math.pow(1 + km / 8, 2);
  }
  let crowdTotal = 0;
  for (const s of stops) crowdTotal += 0.5;
  const crowd = stops.length === 0 ? 0 : crowdTotal / stops.length;

  let pairs = 0;
  for (let i = 0; i < stops.length; i += 1) {
    for (let j = i + 1; j < stops.length; j += 1) {
      if (stops[i].record.category === stops[j].record.category) pairs += 0.5;
    }
  }
  const novelty = pairs / Math.max(1, stops.length - 1);
  const pace =
    Math.pow(Math.abs(stops.length - c.idealStops), 1.5) / Math.max(1, c.idealStops);

  return (
    utility - w.travelPenalty * travel - w.crowd * crowd - w.novelty * novelty - w.pacePenalty * pace
  );
}

describe("objectiveNaive", () => {
  it("reproduces the written formula for a single stop to twelve digits", () => {
    const plan = [stop({ record: rec({ coordinates: [4.05, 52.02] }) })];
    const c = ctx();
    expect(objectiveNaive(plan, c).value).toBeCloseTo(specValue(plan, c), 12);
  });

  it("reproduces the written formula for a three stop plan to twelve digits", () => {
    const plan = [
      stop({ record: rec({ coordinates: [4.05, 52.02], category: "Culture" }), travelMinutes: 20 }),
      stop({ record: rec({ coordinates: [4.07, 52.04], category: "Food" }), travelMinutes: 15 }),
      stop({ record: rec({ coordinates: [4.01, 52.05], category: "Nature" }), travelMinutes: 25 }),
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

  it("sums its component contributions to the scalar exactly", () => {
    let sum = 0;
    for (const item of result.breakdown.components) sum += item.contribution;
    expect(sum).toBeCloseTo(result.value, 12);
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
      [stop({ record: rec({ coordinates: [4.001, 52.001] }), travelMinutes: 10 })],
      ctx(),
    );
    const far = objectiveNaive(
      [stop({ record: rec({ coordinates: [4.1, 52.1] }), travelMinutes: 10 })],
      ctx(),
    );
    const nearTravel = near.breakdown.aggregate.travel;
    const farTravel = far.breakdown.aggregate.travel;
    expect(farTravel / nearTravel).toBeGreaterThan(4);
  });
});
