import { describe, expect, it } from "vitest";
import { checkBudget, checkCapacity, checkLeadTime, partyCostInr, planCostInr } from "./budget";
import type {
  DiscoveryContext,
  ExperienceV2,
  Stop,
  Weights,
} from "@/lib/engine/contracts/types";

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
    priceInr: 500,
    pricePerPersonInr: 500,
    capacity: null,
    openingHours: { weekly: {}, confidence: "verified" },
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
    availableMinutes: 480,
    deadline: null,
    budgetInr: 2000,
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
      interests: {},
      avoid: {},
      accessibility: [],
      diets: [],
      excludes: [],
      pins: [],
      weights: {} as Weights,
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
  costInr: 1000,
  ...over,
});

describe("partyCostInr", () => {
  it("multiplies the numeric field, never a parsed string", () => {
    expect(partyCostInr(300, 4)).toBe(1200);
  });

  it("treats a party of 0 as a party of 1 rather than pricing everything free", () => {
    expect(partyCostInr(300, 0)).toBe(300);
  });

  it("is 0 for something genuinely free", () => {
    expect(partyCostInr(0, 7)).toBe(0);
  });
});

describe("planCostInr", () => {
  it("adds the per-stop party costs in plan order", () => {
    const plan = [
      stop({ record: rec({ id: "a", priceInr: 100 }) }),
      stop({ record: rec({ id: "b", priceInr: 250 }) }),
    ];
    expect(planCostInr(plan, 2)).toBe(700);
  });

  it("is 0 for an empty plan", () => {
    expect(planCostInr([], 4)).toBe(0);
  });

  it("ignores the costInr the caller already put on the stop", () => {
    // The stop carries a cost, but the budget is re-derived from the record so
    // a stale or forged figure cannot buy its way past the check.
    const plan = [stop({ record: rec({ priceInr: 100 }), costInr: 999999 })];
    expect(planCostInr(plan, 2)).toBe(200);
  });
});

describe("checkBudget", () => {
  it("passes when the plan exactly equals the budget", () => {
    const plan = [stop({ record: rec({ priceInr: 1000 }) })];
    expect(checkBudget(plan, ctx({ budgetInr: 2000, partySize: 2 }))).toEqual([]);
  });

  it("fails one rupee over and names the cost, the budget and the per-head figure", () => {
    const plan = [stop({ record: rec({ priceInr: 1001 }) })];
    const issues = checkBudget(plan, ctx({ budgetInr: 2000, partySize: 2 }));
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("over_budget");
    expect(issues[0].sentence).toContain("2002 INR");
    expect(issues[0].sentence).toContain("2 INR over");
    expect(issues[0].sentence).toContain("1001 INR per head");
  });

  it("scales with the party size, because the price is per party", () => {
    const plan = [stop({ record: rec({ priceInr: 400 }) })];
    expect(checkBudget(plan, ctx({ budgetInr: 2000, partySize: 2 }))).toEqual([]);
    const bigger = checkBudget(plan, ctx({ budgetInr: 2000, partySize: 6 }));
    expect(bigger).toHaveLength(1);
    expect(bigger[0].sentence).toContain("2400 INR");
  });

  it("never contains an em dash or a banned phrase", () => {
    const issues = checkBudget([stop()], ctx({ budgetInr: 1 }));
    for (const issue of issues) {
      expect(issue.sentence).not.toContain("\u2014");
      expect(issue.sentence).not.toContain("constraint violated");
      expect(issue.sentence).not.toContain("not eligible");
    }
  });
});

describe("checkCapacity", () => {
  it("passes when capacity exactly equals the party size", () => {
    expect(checkCapacity([stop({ record: rec({ capacity: 4 }) })], ctx({ partySize: 4 }))).toEqual([]);
  });

  it("fails one seat short and names the gap", () => {
    const issues = checkCapacity(
      [stop({ record: rec({ capacity: 3 }) })],
      ctx({ partySize: 4 }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("capacity_exceeded");
    expect(issues[0].sentence).toContain("3 at a time");
    expect(issues[0].sentence).toContain("1 over");
  });

  it("passes an unknown capacity, because unknown is not zero", () => {
    expect(checkCapacity([stop({ record: rec({ capacity: null }) })], ctx({ partySize: 9 }))).toEqual([]);
  });
});

describe("checkLeadTime", () => {
  const withLead = (minutes: number, travelMinutes = 10) =>
    stop({
      travelMinutes,
      record: rec({
        availability: {
          leadTimeMinutes: minutes,
          soldOutAt: null,
          remainingCapacity: null,
          bookingUrl: null,
          updatedAt: "2026-01-01T00:00:00Z",
        },
      }),
    });

  it("passes when the plan reaches the stop with more than enough notice", () => {
    expect(checkLeadTime([withLead(30, 45)])).toEqual([]);
  });

  it("fails when the plan arrives before the provider will confirm", () => {
    const issues = checkLeadTime([withLead(60, 10)]);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("lead_time_too_short");
    expect(issues[0].sentence).toContain("60 min of notice");
    expect(issues[0].sentence).toContain("10 min");
  });

  it("measures notice to the arrival, travel to the stop included", () => {
    expect(checkLeadTime([withLead(200, 10)])[0].sentence).toContain("10 min");
    expect(checkLeadTime([withLead(200, 40)])[0].sentence).toContain("40 min");
  });

  it("measures a later stop from the whole prefix that precedes it", () => {
    const plan = [
      withLead(0, 10),
      { ...withLead(0, 40), arriveBy: 700 },
    ];
    const before = checkLeadTime(plan.slice(0, 1));
    const both = checkLeadTime(plan);
    expect(both).toHaveLength(0);
    // Stop 0 needs 40 min and is reached at 10, so trimming it makes it fail.
    const trimmed = [withLead(40, 10), { ...withLead(0, 40), arriveBy: 700 }];
    expect(checkLeadTime(trimmed)).toHaveLength(1);
    expect(before).toEqual([]);
  });
});
