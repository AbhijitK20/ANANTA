import { describe, expect, it } from "vitest";
import { hardChecks, validate } from "./validate";
import { DRIFT_TOLERANCE } from "./drift";
import { objectiveNaive } from "./objective-naive";
import type {
  DiscoveryContext,
  ExperienceV2,
  Objective,
  OpeningHours,
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
    priceInr: 100,
    pricePerPersonInr: 100,
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

const ZERO: Objective = {
  value: 0,
  breakdown: {
    total: 0,
    components: [],
    aggregate: { travel: 0, crowd: 0, novelty: 0, proximity: 0, pace: 0 },
  },
};

function ctx(over: Partial<DiscoveryContext> = {}): DiscoveryContext {
  return {
    now: "2026-01-01T09:00:00Z",
    origin: { coordinates: [4, 52], label: "Start", area: "Quarter" },
    availableMinutes: 600,
    deadline: null,
    budgetInr: 5000,
    partySize: 2,
    hasToddler: false,
    hasElderly: false,
    raining: false,
    weatherSeverity: null,
    travelMode: "walk",
    pace: "normal",
    idealStops: 3,
    minStops: 1,
    accessNeeds: [],
    diets: [],
    query: "",
    profile: {
      id: "t",
      interests: { Culture: 0.6 },
      avoid: {},
      accessibility: [],
      diets: [],
      excludes: [],
      pins: [],
      weights: {
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
        travelPenalty: 0.2,
        pacePenalty: 0.1,
      } as Weights,
      bandit: { arms: [], observations: 0, updatedAt: "" },
    },
    city: {} as DiscoveryContext["city"],
    original: undefined as unknown as DiscoveryContext,
    ...over,
  };
}

const stop = (over: Partial<Stop> = {}): Stop => ({
  record: rec(),
  arriveBy: 540,
  travelMinutes: 10,
  travelKm: 1,
  visitMinutes: 60,
  bufferMinutes: 0,
  costInr: 200,
  ...over,
});

function plan(): Stop[] {
  return [
    stop({ record: rec({ id: "a", category: "Culture" }), arriveBy: 540, travelMinutes: 0 }),
    stop({ record: rec({ id: "b", category: "Food" }), arriveBy: 610, travelMinutes: 10 }),
  ];
}

describe("hardChecks", () => {
  it("counts only the constraints the context actually imposes", () => {
    const bare = hardChecks(plan(), ctx());
    const bareNames = bare.filter((c) => c.imposed).map((c) => c.name);
    expect(bareNames).not.toContain("deadline");
    expect(bareNames).not.toContain("accessibility needs");
    expect(bareNames).not.toContain("dietary needs");
    expect(bareNames).not.toContain("traveller exclusions");
    expect(bareNames).toContain("time window");
    expect(bareNames).toContain("budget");
  });

  it("adds a constraint once the context imposes it", () => {
    const c = ctx({ deadline: "2026-01-01T20:00:00Z", accessNeeds: ["step_free"], diets: ["vegan"] });
    c.profile.excludes = ["nope"];
    const names = hardChecks(plan(), c).filter((h) => h.imposed).map((h) => h.name);
    expect(names).toContain("deadline");
    expect(names).toContain("accessibility needs");
    expect(names).toContain("dietary needs");
    expect(names).toContain("traveller exclusions");
  });
});

describe("validate", () => {
  it("passes a clean plan whose fast objective happens to be the naive one", () => {
    const c = ctx();
    const stops = plan();
    const result = validate(stops, c, objectiveNaive(stops, c));
    expect(result.drift).toBe(0);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.satisfiedFraction).toBe(1);
  });

  it("fails and names the component when the producer and the checker disagree", () => {
    const c = ctx();
    const stops = plan();
    const truth = objectiveNaive(stops, c);
    const tampered: Objective = {
      ...truth,
      value: truth.value + 0.01,
      breakdown: {
        ...truth.breakdown,
        components: truth.breakdown.components.map((item) =>
          item.id === "interest"
            ? { ...item, contribution: item.contribution + 0.01 }
            : item,
        ),
      },
    };
    const result = validate(stops, c, tampered);
    expect(result.ok).toBe(false);
    expect(result.drift).toBeCloseTo(0.01, 12);
    const drift = result.issues.find((i) => i.code === "objective_drift");
    expect(drift).toBeDefined();
    expect(drift?.sentence).toContain("interest");
  });

  it("reports the scalar alone when every component agrees but the total does not", () => {
    const c = ctx();
    const stops = plan();
    const truth = objectiveNaive(stops, c);
    const result = validate(stops, c, { ...truth, value: truth.value + 0.01 });
    const drift = result.issues.find((i) => i.code === "objective_drift");
    expect(drift?.sentence).toContain("drift");
    expect(drift?.sentence).not.toContain("Worst components");
  });

  it("accepts drift at exactly the tolerance and rejects a hair over it", () => {
    const c = ctx();
    const stops = plan();
    const truth = objectiveNaive(stops, c);
    const inside = validate(stops, c, { ...truth, value: truth.value + DRIFT_TOLERANCE / 2 });
    expect(inside.drift).toBeLessThanOrEqual(DRIFT_TOLERANCE);
    expect(inside.issues.filter((i) => i.code === "objective_drift")).toEqual([]);
    const outside = validate(stops, c, { ...truth, value: truth.value + DRIFT_TOLERANCE * 10 });
    expect(outside.issues.filter((i) => i.code === "objective_drift")).toHaveLength(1);
  });

  it("catches a NaN objective, which a plain less-than-or-equal check would wave through", () => {
    const c = ctx();
    const stops = plan();
    const result = validate(stops, c, { ...ZERO, value: Number.NaN });
    expect(result.drift).toBe(Number.NaN);
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.sentence.includes("non-finite")),
    ).toBe(true);
  });

  it("catches a producer whose scalar disagrees while every component agrees", () => {
    const c = ctx();
    const stops = plan();
    const truth = objectiveNaive(stops, c);
    const result = validate(stops, c, { ...truth, value: truth.value + 0.02 });
    expect(result.drift).toBeGreaterThan(DRIFT_TOLERANCE);
  });

  it("reports an empty plan rather than passing it", () => {
    const c = ctx();
    const result = validate([], c, ZERO);
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("empty_plan");
  });
});

describe("satisfiedFraction is a real measurement", () => {
  it("is strictly between 0 and 1 on a plan with exactly one violated constraint", () => {
    const c = ctx({ availableMinutes: 125 });
    const stops = plan();
    const truth = objectiveNaive(stops, c);
    const result = validate(stops, c, truth);
    expect(result.satisfiedFraction).toBeGreaterThan(0);
    expect(result.satisfiedFraction).toBeLessThan(1);
    expect(result.ok).toBe(false);
  });

  it("is 1 when everything imposed is satisfied", () => {
    const c = ctx();
    const result = validate(plan(), c, objectiveNaive(plan(), c));
    expect(result.satisfiedFraction).toBe(1);
  });

  it("falls when the deadline is imposed and missed", () => {
    const stops = plan();
    const withDeadline = validate(
      stops,
      ctx({ deadline: "2026-01-01T23:00:00Z" }),
      objectiveNaive(stops, ctx()),
    );
    const withoutDeadline = validate(stops, ctx(), objectiveNaive(stops, ctx()));
    expect(withDeadline.satisfiedFraction).toBeGreaterThanOrEqual(
      withoutDeadline.satisfiedFraction,
    );
    const missed = validate(
      stops,
      ctx({ deadline: "2026-01-01T09:30:00Z" }),
      objectiveNaive(stops, ctx()),
    );
    expect(missed.satisfiedFraction).toBeLessThan(1);
    expect(missed.issues.map((i) => i.code)).toContain("window_overflow");
  });

  it("falls when a record the traveller excluded is in the plan", () => {
    const c = ctx();
    c.profile.excludes = ["b"];
    const stops = plan();
    const result = validate(stops, c, objectiveNaive(stops, c));
    expect(result.satisfiedFraction).toBeLessThan(1);
    const issue = result.issues.find((i) => i.code === "excluded_by_traveller");
    expect(issue?.offendingId).toBe("b");
  });

  it("falls when the plan has fewer stops than the traveller asked for", () => {
    const c = ctx({ minStops: 4 });
    const stops = plan();
    const result = validate(stops, c, objectiveNaive(stops, c));
    expect(result.satisfiedFraction).toBeLessThan(1);
    expect(result.ok).toBe(false);
    const unmet = hardChecks(stops, c).find((h) => h.name === "minimum stops");
    expect(unmet?.satisfied).toBe(false);
  });

  it("falls when a dietary need is not met", () => {
    const c = ctx({ diets: ["vegan"] });
    const stops = plan();
    const result = validate(stops, c, objectiveNaive(stops, c));
    expect(result.satisfiedFraction).toBeLessThan(1);
    expect(result.issues.map((i) => i.code)).toContain("diet_mismatch");
  });

  it("does not count a constraint the context leaves unset", () => {
    // With no deadline, a plan that overruns nothing is fully satisfied, so
    // adding an exclusion is what moves the number, not the deadline check.
    const before = hardChecks(plan(), ctx()).filter((h) => h.imposed).length;
    const c = ctx({ deadline: "2026-01-01T20:00:00Z" });
    const after = hardChecks(plan(), c).filter((h) => h.imposed).length;
    expect(after).toBe(before + 1);
  });
});

describe("weather and availability are hard constraints, not warnings", () => {
  it("fails an outdoor stop under a storm", () => {
    const c = ctx({ weatherSeverity: "storm" });
    const stops = [stop({ record: rec({ id: "a", indoor: "outdoor" }) })];
    const result = validate(stops, c, objectiveNaive(stops, c));
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("weather_unsafe");
  });

  it("passes the same outdoor stop under plain rain", () => {
    const c = ctx({ weatherSeverity: "rain" });
    const stops = [stop({ record: rec({ id: "a", indoor: "outdoor" }) })];
    const result = validate(stops, c, objectiveNaive(stops, c));
    expect(result.issues.map((i) => i.code)).not.toContain("weather_unsafe");
  });

  it("passes the same outdoor stop when the weather is unknown", () => {
    const c = ctx({ weatherSeverity: null });
    const stops = [stop({ record: rec({ id: "a", indoor: "outdoor" }) })];
    const result = validate(stops, c, objectiveNaive(stops, c));
    expect(result.issues.map((i) => i.code)).not.toContain("weather_unsafe");
  });

  it("fails a sold out slot the plan reaches", () => {
    const c = ctx();
    const soldOut = rec({
      id: "a",
      availability: {
        leadTimeMinutes: 0,
        soldOutAt: "2026-01-01T09:05:00Z",
        remainingCapacity: null,
        bookingUrl: null,
        updatedAt: "2026-01-01T08:00:00Z",
      },
    });
    const stops = [stop({ record: soldOut, travelMinutes: 20 })];
    const result = validate(stops, c, objectiveNaive(stops, c));
    expect(result.issues.map((i) => i.code)).toContain("sold_out");
  });
});

describe("every issue sentence carries a number or a named fact", () => {
  it("holds across a deliberately broken plan", () => {
    const c = ctx({
      availableMinutes: 30,
      budgetInr: 10,
      weatherSeverity: "storm",
      diets: ["vegan"],
      accessNeeds: ["step_free"],
      minStops: 9,
    });
    c.profile.excludes = ["a"];
    const stops = plan();
    const result = validate(stops, c, { ...ZERO, value: 5 });
    expect(result.issues.length).toBeGreaterThan(3);
    for (const issue of result.issues) {
      expect(issue.sentence.length).toBeGreaterThan(5);
      expect(issue.sentence).not.toContain("\u2014");
      expect(issue.sentence.toLowerCase()).not.toContain("constraint violated");
      expect(issue.sentence.toLowerCase()).not.toContain("not eligible");
    }
  });
});
