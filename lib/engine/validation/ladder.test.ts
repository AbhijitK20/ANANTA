import { describe, expect, it } from "vitest";
import { hardIssues, relax } from "./ladder";
import { validate } from "./validate";
import type {
  DiscoveryContext,
  ExperienceV2,
  OpeningHours,
  Stop,
  ValidationResult,
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
      interests: { Culture: 0.6, Food: 0.9, Nature: 0.3 },
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

/** A three stop plan whose stops follow one another, 540 onwards. */
function threeStopPlan(): Stop[] {
  return [
    stop({ record: rec({ id: "a", category: "Culture" }), arriveBy: 540, travelMinutes: 0 }),
    stop({ record: rec({ id: "b", category: "Food" }), arriveBy: 610, travelMinutes: 10 }),
    stop({ record: rec({ id: "c", category: "Nature" }), arriveBy: 680, travelMinutes: 10 }),
  ];
}

const nothingWrong: ValidationResult = {
  ok: true,
  drift: 0,
  issues: [],
  satisfiedFraction: 1,
};

const somethingWrong: ValidationResult = {
  ok: false,
  drift: 0,
  issues: [
    { code: "window_overflow", sentence: "over by 40 min", offendingId: null },
  ],
  satisfiedFraction: 0.5,
};

describe("hardIssues", () => {
  it("is empty for a plan that fits, is open and is inside the budget", () => {
    expect(hardIssues(threeStopPlan(), ctx())).toEqual([]);
  });

  it("reports the time overflow and the budget overflow together", () => {
    const c = ctx({ availableMinutes: 100, budgetInr: 10 });
    const codes = hardIssues(threeStopPlan(), c).map((issue) => issue.code);
    expect(codes).toContain("window_overflow");
    expect(codes).toContain("over_budget");
  });
});

describe("relax: rung strict", () => {
  it("returns the plan untouched when every check already passes", () => {
    const plan = threeStopPlan();
    const result = relax(plan, ctx(), somethingWrong);
    expect(result?.rung).toBe("strict");
    expect(result?.stops).toHaveLength(3);
    expect(result?.note).toContain("3 stops");
  });

  it("keeps the plan when it is given a clean bill of health to begin with", () => {
    const result = relax(threeStopPlan(), ctx(), nothingWrong);
    expect(result?.rung).toBe("strict");
    expect(result?.note).toContain("0 issues");
  });
});

describe("relax: rung dropped_minimum", () => {
  it("reduces to the largest feasible count below the minimum and names both numbers", () => {
    // The plan needs 200 min and only 60 are available, so nothing but the
    // first stop fits. minStops 2 leaves exactly one rung below it to try.
    const c = ctx({ minStops: 2, availableMinutes: 60 });
    const result = relax(threeStopPlan(), c, somethingWrong);
    expect(result?.rung).toBe("dropped_minimum");
    expect(result?.stops).toHaveLength(1);
    expect(result?.note).toBe("Relaxed: minimum 1 stop instead of 2.");
  });

  it("prefers the largest count that still fits", () => {
    // 130 min is exactly what the first two stops need.
    const c = ctx({ minStops: 3, availableMinutes: 130 });
    const result = relax(threeStopPlan(), c, somethingWrong);
    expect(result?.rung).toBe("dropped_minimum");
    expect(result?.stops).toHaveLength(2);
    expect(result?.note).toBe("Relaxed: minimum 2 stops instead of 3.");
  });

  it("never returns a plan that still fails a hard check", () => {
    const c = ctx({ minStops: 3, availableMinutes: 130 });
    const result = relax(threeStopPlan(), c, somethingWrong);
    expect(hardIssues(result!.stops, c)).toEqual([]);
  });
});

describe("relax: rung greedy_fill", () => {
  it("adds back from the shortlist and says how many it added and what it gave up", () => {
    // Every original stop takes 1 seat and the party is 2, so no prefix of the
    // plan is feasible and the core is empty. The shortlist is all that works.
    const plan = [
      stop({ record: rec({ id: "a", capacity: 1 }) }),
      stop({ record: rec({ id: "b", capacity: 1 }), arriveBy: 610 }),
      stop({ record: rec({ id: "c", capacity: 1 }), arriveBy: 680 }),
    ];
    const c = ctx({ minStops: 2, partySize: 2 });
    const pool = [
      rec({ id: "d", category: "Food", coordinates: [4.005, 52.005], travelMinutes: 12 }),
      rec({ id: "e", category: "Nature", coordinates: [4.01, 52.01], travelMinutes: 14 }),
    ];
    const result = relax(plan, c, somethingWrong, { pool });
    expect(result?.rung).toBe("greedy_fill");
    expect(result?.note).toContain("added back 2");
    expect(result?.note).toContain("gave up 3");
    expect(result?.stops.map((s) => s.record.id)).toEqual(["d", "e"]);
    expect(hardIssues(result!.stops, c)).toEqual([]);
  });

  it("keeps the feasible core and tops it up rather than starting over", () => {
    // The plan needs 200 min and 130 are available, so the last stop is cut.
    // A minimum of 1 leaves dropped_minimum nothing to try, and the surviving
    // core already clears it, so the rung is named rather than skipped.
    const c = ctx({ minStops: 1, availableMinutes: 130 });
    const result = relax(threeStopPlan(), c, somethingWrong, {
      pool: [rec({ id: "d", coordinates: [4.01, 52.01], travelMinutes: 12 })],
    });
    expect(result?.rung).toBe("greedy_fill");
    expect(result?.note).toContain("added 0");
    expect(result?.stops).toHaveLength(2);
    expect(hardIssues(result!.stops, c)).toEqual([]);
  });

  it("never offers a record the traveller excluded", () => {
    const c = ctx({ minStops: 2, availableMinutes: 400 });
    c.profile.excludes = ["d", "e"];
    const result = relax(threeStopPlan(), c, somethingWrong, {
      pool: [rec({ id: "d" }), rec({ id: "e" })],
    });
    for (const s of result!.stops) {
      expect(c.profile.excludes).not.toContain(s.record.id);
    }
  });

  it("reports a shortlist where nothing survived, rather than inventing a plan", () => {
    const c = ctx({ minStops: 1, partySize: 2 });
    const plan = [stop({ record: rec({ id: "a", capacity: 1 }) })];
    const result = relax(plan, c, somethingWrong, {
      pool: [rec({ id: "d", capacity: 1, coordinates: [4.01, 52.01] })],
    });
    expect(result).toBeNull();
  });

  it("names the candidates it refused alongside the ones it took", () => {
    const c = ctx({ minStops: 2, partySize: 2 });
    const plan = [
      stop({ record: rec({ id: "a", capacity: 1 }) }),
      stop({ record: rec({ id: "b", capacity: 1 }), arriveBy: 610 }),
    ];
    const result = relax(plan, c, somethingWrong, {
      pool: [
        rec({ id: "d", capacity: 1, coordinates: [4.01, 52.01] }),
        rec({ id: "e", category: "Food", coordinates: [4.005, 52.005], travelMinutes: 12 }),
      ],
    });
    expect(result?.rung).toBe("greedy_fill");
    expect(result?.note).toContain("added back 1");
    expect(result?.note).toContain("1 candidate from the shortlist failed every check");
  });
});

describe("relax: rung single_best", () => {
  it("reduces to one stop when nothing smaller is feasible and says so", () => {
    // minStops 1 leaves no rung below it, no pool leaves nothing to fill from,
    // and the plan needs 200 min where 85 are available, so only one stop fits.
    const c = ctx({ minStops: 1, availableMinutes: 85, budgetInr: 5000 });
    const result = relax(threeStopPlan(), c, somethingWrong);
    expect(result?.rung).toBe("single_best");
    expect(result?.stops).toHaveLength(1);
    expect(result?.note).toBe("Reduced to 1 stop, the best of 3 that passes every check.");
  });

  it("picks the stop that scores highest, not merely the first", () => {
    const c = ctx({ minStops: 1, availableMinutes: 85, budgetInr: 5000 });
    const plan = [
      stop({ record: rec({ id: "a", category: "Nature", coordinates: [4.2, 52.2] }), arriveBy: 540 }),
      stop({ record: rec({ id: "b", category: "Food", coordinates: [4.001, 52.001] }), arriveBy: 610, travelMinutes: 10 }),
    ];
    const result = relax(plan, c, somethingWrong);
    expect(result?.rung).toBe("single_best");
    expect(result?.stops[0].record.id).toBe("b");
  });
});

describe("relax: when no rung can help", () => {
  it("returns null rather than an invalid plan", () => {
    const impossible = ctx({ minStops: 1, availableMinutes: 5, budgetInr: 0 });
    expect(relax(threeStopPlan(), impossible, somethingWrong)).toBeNull();
  });

  it("returns null for an empty plan, which has nothing to relax", () => {
    expect(relax([], ctx(), somethingWrong)).toBeNull();
  });

  it("returns null when the budget cannot cover even one stop", () => {
    const c = ctx({ minStops: 1, budgetInr: 10, availableMinutes: 600 });
    expect(relax(threeStopPlan(), c, somethingWrong)).toBeNull();
  });
});

describe("every rung note names a number", () => {
  it("holds for all four rungs", () => {
    const noRoom = [stop({ record: rec({ id: "a", capacity: 1 }) }), stop({ record: rec({ id: "b", capacity: 1 }), arriveBy: 610 })];
    const cases = [
      relax(threeStopPlan(), ctx(), somethingWrong),
      relax(threeStopPlan(), ctx({ minStops: 3, availableMinutes: 130 }), somethingWrong),
      relax(noRoom, ctx({ minStops: 2, partySize: 2 }), somethingWrong, {
        pool: [rec({ id: "d", coordinates: [4.005, 52.005], travelMinutes: 12 })],
      }),
      relax(threeStopPlan(), ctx({ minStops: 1, availableMinutes: 85 }), somethingWrong),
    ];
    expect(cases.map((n) => n?.rung)).toEqual([
      "strict",
      "dropped_minimum",
      "greedy_fill",
      "single_best",
    ]);
    for (const note of cases) {
      expect(/\d/.test(note!.note)).toBe(true);
      expect(note!.note).not.toContain("\u2014");
    }
  });
});

describe("relax hands back something validate accepts", () => {
  it("produces a plan with no hard issues at every rung it reaches", () => {
    const cases = [
      ctx(),
      ctx({ minStops: 2, availableMinutes: 175 }),
      ctx({ minStops: 2, availableMinutes: 400 }),
      ctx({ minStops: 1, availableMinutes: 85 }),
    ];
    for (const c of cases) {
      const result = relax(threeStopPlan(), c, somethingWrong, {
        pool: [rec({ id: "d", coordinates: [4.01, 52.01] })],
      });
      expect(result).not.toBeNull();
      expect(hardIssues(result!.stops, c)).toEqual([]);
      const verdict = validate(result!.stops, c, { value: 0, breakdown: { total: 0, components: [], aggregate: { travel: 0, crowd: 0, novelty: 0, proximity: 0, pace: 0 } } });
      expect(verdict.issues.filter((i) => i.code !== "objective_drift")).toEqual([]);
    }
  });
});
