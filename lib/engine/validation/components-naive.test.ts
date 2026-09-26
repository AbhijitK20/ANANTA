import { describe, expect, it } from "vitest";
import {
  authenticityScore,
  clamp01,
  clampSigned,
  crowdLoad,
  groupScore,
  interestScore,
  mean,
  paceDeviation,
  peakHourFactor,
  proximityDecay,
  ratingScore,
  redundancyPenalty,
  reliabilityScore,
  slotOfDay,
  superlinearTravel,
  valueScore,
  weatherScore,
  wilsonLowerBound,
} from "./components-naive";
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
    coordinates: [0, 0],
    travelMinutes: 0,
    durationMinutes: 60,
    priceInr: 0,
    pricePerPersonInr: 0,
    capacity: null,
    openingHours: {
      weekly: {},
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
    now: "2026-01-01T09:00:00",
    origin: { coordinates: [0, 0], label: "Start", area: "Quarter" },
    availableMinutes: 240,
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

const asStop = (record: ExperienceV2, over: Partial<Stop> = {}): Stop => ({
  record,
  arriveBy: 540,
  travelMinutes: 0,
  travelKm: 0,
  visitMinutes: 60,
  bufferMinutes: 0,
  costInr: 0,
  ...over,
});

describe("clamping", () => {
  it("clamps01 to the unit interval and leaves the interior alone", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
    expect(clamp01(7)).toBe(1);
  });

  it("clampsSigned to minus one through one", () => {
    expect(clampSigned(-2)).toBe(-1);
    expect(clampSigned(-0.5)).toBe(-0.5);
    expect(clampSigned(2)).toBe(1);
  });
});

describe("wilsonLowerBound", () => {
  it("returns 0 when there are no observations rather than dividing by zero", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
    expect(wilsonLowerBound(5, 0)).toBe(0);
  });

  it("sits below the raw proportion, which is the whole point of a lower bound", () => {
    const bound = wilsonLowerBound(58, 62);
    expect(bound).toBeLessThan(58 / 62);
    expect(bound).toBeGreaterThan(0.8);
  });

  it("matches a hand derivation of the closed form to twelve digits", () => {
    // p = 58/62, z = 1.96, bound = (p + z^2/2n - z*sqrt((p(1-p) + z^2/4n)/n)) / (1 + z^2/n)
    const z = 1.96;
    const p = 58 / 62;
    const n = 62;
    const expected =
      (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) /
      (1 + (z * z) / n);
    expect(wilsonLowerBound(58, 62)).toBeCloseTo(expected, 12);
  });

  it("penalises a small sample far more than a large one at the same proportion", () => {
    const smallGap = 6 / 7 - wilsonLowerBound(6, 7);
    const largeGap = 600 / 700 - wilsonLowerBound(600, 700);
    expect(smallGap).toBeGreaterThan(largeGap);
    expect(largeGap).toBeLessThan(0.03);
  });
});

describe("ratingScore", () => {
  it("is 0 when the record has no reviews, as the spec requires", () => {
    expect(ratingScore(rec())).toBe(0);
    expect(ratingScore(rec({ ratingSum: null, reviewCount: 40 }))).toBe(0);
    expect(ratingScore(rec({ ratingSum: 200, reviewCount: null }))).toBe(0);
  });

  it("is 0 when the review count is zero", () => {
    expect(ratingScore(rec({ ratingSum: 0, reviewCount: 0 }))).toBe(0);
  });

  it("lifts the bound onto minus one through one, and never reaches either end", () => {
    // A perfect score is still pulled below 1 by the bound, which is the
    // entire reason a lower bound is used instead of the mean. 62 reviews all
    // awarded five stars is ratingSum 310, because the scale is five points.
    const perfect = ratingScore(rec({ ratingSum: 310, reviewCount: 62 }));
    expect(perfect).toBeLessThan(1);
    expect(perfect).toBeGreaterThan(0.85);
    const worst = ratingScore(rec({ ratingSum: 62, reviewCount: 62 }));
    expect(worst).toBe(-1);
  });

  it("reads a five star sum over a five star trial count, not over the review count", () => {
    // 46 stars out of 50 possible is a 4.6 average. Reading 46 over 10 makes
    // the proportion exceed 1 and returns NaN, which is the failure this
    // normalisation exists to prevent.
    const record = rec({ ratingSum: 46, reviewCount: 10 });
    expect(Number.isNaN(ratingScore(record))).toBe(false);
    expect(ratingScore(record)).toBeCloseTo((0.828 * 5 - 3) / 2, 1);
  });
});

describe("interestScore", () => {
  it("is neutral for a category the profile never mentions", () => {
    expect(interestScore(rec({ category: "Food" }), ctx())).toBe(0);
  });

  it("is the stated interest minus the stated avoidance", () => {
    const c = ctx();
    c.profile.interests = { Food: 0.8, Culture: 0.4 };
    c.profile.avoid = { Food: 0.3 };
    expect(interestScore(rec({ category: "Food" }), c)).toBeCloseTo(0.5, 12);
    expect(interestScore(rec({ category: "Culture" }), c)).toBeCloseTo(0.4, 12);
  });

  it("clamps to minus one through one", () => {
    const c = ctx();
    c.profile.interests = { Culture: 3 };
    expect(interestScore(rec(), c)).toBe(1);
  });
});

describe("valueScore", () => {
  it("is 0 when the price is unknown, as the spec requires", () => {
    expect(valueScore(rec({ pricePerPersonInr: null }), ctx({ budgetInr: 2000 }))).toBe(0);
  });

  it("is plus one when it is free and minus one when it eats the head budget", () => {
    const c = ctx({ budgetInr: 2000, partySize: 2 });
    expect(valueScore(rec({ pricePerPersonInr: 0 }), c)).toBe(1);
    expect(valueScore(rec({ pricePerPersonInr: 1000 }), c)).toBeCloseTo(-1, 12);
  });

  it("is 0 at half the head budget", () => {
    const c = ctx({ budgetInr: 2000, partySize: 2 });
    expect(valueScore(rec({ pricePerPersonInr: 500 }), c)).toBeCloseTo(0, 12);
  });

  it("does not divide by zero for a party of 0", () => {
    expect(Number.isNaN(valueScore(rec({ pricePerPersonInr: 100 }), ctx({ partySize: 0 })))).toBe(
      false,
    );
  });
});

describe("weatherScore", () => {
  const base = rec();

  it("is 0 when the weather is unknown, because unknown is not clear", () => {
    expect(weatherScore(base, ctx({ weatherSeverity: null }))).toBe(0);
  });

  it("prefers indoor to outdoor once it rains, and never below zero", () => {
    const c = ctx({ weatherSeverity: "rain" });
    expect(weatherScore(rec({ indoor: "indoor" }), c)).toBe(1);
    expect(weatherScore(rec({ indoor: "mixed" }), c)).toBeLessThan(1);
    expect(weatherScore(rec({ indoor: "outdoor" }), c)).toBeLessThan(0.5);
    const storm = ctx({ weatherSeverity: "storm" });
    expect(weatherScore(rec({ indoor: "outdoor" }), storm)).toBe(0);
    expect(weatherScore(rec({ indoor: "indoor" }), storm)).toBe(1);
  });

  it("is strictly ordered indoor, mixed, outdoor for every severity", () => {
    for (const severity of ["clear", "rain", "heavy_rain", "storm"] as const) {
      const c = ctx({ weatherSeverity: severity });
      const inside = weatherScore(rec({ indoor: "indoor" }), c);
      const mixed = weatherScore(rec({ indoor: "mixed" }), c);
      const outside = weatherScore(rec({ indoor: "outdoor" }), c);
      expect(inside).toBeGreaterThan(mixed);
      expect(mixed).toBeGreaterThan(outside);
    }
  });
});

describe("groupScore", () => {
  it("starts positive when the party imposes nothing", () => {
    expect(groupScore(rec(), ctx())).toBe(0.25);
  });

  it("charges half a point per unmet access need", () => {
    const c = ctx({ accessNeeds: ["step_free"] });
    expect(groupScore(rec({ access: { step_free: false } }), c)).toBeCloseTo(-0.25, 12);
    expect(groupScore(rec({ access: { step_free: true } }), c)).toBe(0.25);
  });

  it("charges for a diet the record does not list", () => {
    const c = ctx({ diets: ["vegan"] });
    expect(groupScore(rec({ diets: [] }), c)).toBeCloseTo(-0.15, 12);
    expect(groupScore(rec({ diets: ["vegan"] }), c)).toBe(0.25);
  });

  it("charges a full point when the party is larger than capacity", () => {
    expect(groupScore(rec({ capacity: 3 }), ctx({ partySize: 5 }))).toBeCloseTo(-0.75, 12);
  });

  it("charges a full point for a non kid friendly record when a toddler is present", () => {
    const c = ctx({ hasToddler: true });
    expect(groupScore(rec({ kidFriendly: false }), c)).toBeCloseTo(-0.75, 12);
    expect(groupScore(rec({ kidFriendly: true }), c)).toBe(0.25);
    expect(groupScore(rec({ kidFriendly: null }), c)).toBe(0.25);
  });

  it("clamps to minus one through one", () => {
    const c = ctx({ diets: ["vegan", "jain", "halal", "nut_free", "vegetarian"] });
    expect(groupScore(rec({ diets: [] }), c)).toBe(-1);
  });
});

describe("nil fallbacks", () => {
  it("defaults authenticity to the midpoint, not to zero", () => {
    expect(authenticityScore(rec({ authenticity: null }))).toBe(0.5);
    expect(authenticityScore(rec({ authenticity: 0.9 }))).toBe(0.9);
  });

  it("defaults provider reliability to the midpoint, not to zero", () => {
    expect(reliabilityScore(rec({ providerReliability: null }))).toBe(0.5);
    expect(reliabilityScore(rec({ providerReliability: 0.1 }))).toBe(0.1);
  });
});

describe("slotOfDay", () => {
  it("reads the hour out of the ISO text, so the host timezone cannot matter", () => {
    expect(slotOfDay("2026-01-01T00:00:00")).toBe(0);
    expect(slotOfDay("2026-01-01T11:59:00")).toBe(0);
    expect(slotOfDay("2026-01-01T12:00:00")).toBe(1);
    expect(slotOfDay("2026-01-01T16:59:00")).toBe(1);
    expect(slotOfDay("2026-01-01T17:00:00")).toBe(2);
    expect(slotOfDay("2026-01-01T20:59:00")).toBe(2);
    expect(slotOfDay("2026-01-01T21:00:00")).toBe(3);
    expect(slotOfDay("2026-01-01T23:30:00")).toBe(3);
  });

  it("falls back to the morning slot for a string with no time part", () => {
    expect(slotOfDay("2026-01-01")).toBe(0);
  });
});

describe("peakHourFactor", () => {
  const at = (hour: number) => `2026-01-01T${String(hour).padStart(2, "0")}:00:00`;

  it("is 1 when the plan runs at the record's best time", () => {
    expect(peakHourFactor(at(9), "morning")).toBe(1);
    expect(peakHourFactor(at(15), "afternoon")).toBe(1);
    expect(peakHourFactor(at(19), "evening")).toBe(1);
    expect(peakHourFactor(at(22), "night")).toBe(1);
  });

  it("is 0.4 at the opposite end of the cycle", () => {
    expect(peakHourFactor(at(19), "morning")).toBeCloseTo(0.4, 12);
    expect(peakHourFactor(at(9), "evening")).toBeCloseTo(0.4, 12);
    expect(peakHourFactor(at(15), "night")).toBeCloseTo(0.4, 12);
    expect(peakHourFactor(at(22), "afternoon")).toBeCloseTo(0.4, 12);
  });

  it("is 0.7 one step away, in either direction", () => {
    expect(peakHourFactor(at(15), "morning")).toBeCloseTo(0.7, 12);
    expect(peakHourFactor(at(9), "afternoon")).toBeCloseTo(0.7, 12);
    expect(peakHourFactor(at(19), "night")).toBeCloseTo(0.7, 12);
    expect(peakHourFactor(at(22), "evening")).toBeCloseTo(0.7, 12);
    expect(peakHourFactor(at(22), "morning")).toBeCloseTo(0.7, 12);
  });

  it("never penalises a record that has no preference", () => {
    for (const hour of [0, 6, 12, 18, 23]) {
      expect(peakHourFactor(at(hour), "any")).toBe(1);
    }
  });
});

describe("proximityDecay", () => {
  it("is 1 at the origin and shrinks strictly with distance", () => {
    expect(proximityDecay(0)).toBe(1);
    expect(proximityDecay(1)).toBe(0.5);
    expect(proximityDecay(3)).toBe(0.25);
    expect(proximityDecay(9)).toBeCloseTo(0.1, 12);
  });

  it("stays strictly above zero, so a distant stop is never a negative", () => {
    expect(proximityDecay(1000)).toBeGreaterThan(0);
  });
});

describe("superlinearTravel", () => {
  it("is the sum of minutes times the square of one plus km over 8", () => {
    const stops = [
      asStop(rec(), { travelMinutes: 20 }),
      asStop(rec(), { travelMinutes: 15 }),
      asStop(rec(), { travelMinutes: 0 }),
    ];
    const expected =
      20 * Math.pow(1 + 1 / 8, 2) + 15 * Math.pow(1 + 2 / 8, 2) + 0 * Math.pow(1 + 3 / 8, 2);
    expect(superlinearTravel(stops, [1, 2, 3])).toBeCloseTo(expected, 12);
  });

  it("makes the sixth kilometre hurt more than the first", () => {
    const near = superlinearTravel([asStop(rec(), { travelMinutes: 10 })], [1]);
    const far = superlinearTravel([asStop(rec(), { travelMinutes: 10 })], [6]);
    expect(far - near).toBeCloseTo(10 * (Math.pow(1.75, 2) - Math.pow(1.125, 2)), 12);
    expect(far).toBeGreaterThan(near);
  });

  it("is 0 for an empty plan", () => {
    expect(superlinearTravel([], [])).toBe(0);
  });
});

describe("crowdLoad", () => {
  it("is 0 for an empty plan", () => {
    expect(crowdLoad([], ctx())).toBe(0);
  });

  it("is the mean of the crowd profile times the peak hour factor", () => {
    const morning = ctx({ now: "2026-01-01T09:00:00" });
    const stops = [
      asStop(rec({ crowdProfile: 0.8, bestTimeOfDay: "morning" })),
      asStop(rec({ crowdProfile: 0.4, bestTimeOfDay: "night" })),
    ];
    expect(crowdLoad(stops, morning)).toBeCloseTo(
      (0.8 * 1 + 0.4 * peakHourFactor(morning.now, "night")) / 2,
      12,
    );
    expect(crowdLoad(stops, morning)).toBeCloseTo(0.54, 12);
  });

  it("defaults an unknown crowd profile to the midpoint", () => {
    const c = ctx({ now: "2026-01-01T09:00:00" });
    expect(crowdLoad([asStop(rec({ bestTimeOfDay: "morning" }))], c)).toBeCloseTo(0.5, 12);
  });
});

describe("redundancyPenalty", () => {
  const culture = rec({ id: "a", category: "Culture" });
  const food = rec({ id: "b", category: "Food" });

  it("is 0 for a single stop, since there are no pairs", () => {
    expect(redundancyPenalty([asStop(culture)])).toBe(0);
  });

  it("is 0 for two stops of different categories", () => {
    expect(redundancyPenalty([asStop(culture), asStop(food)])).toBe(0);
  });

  it("is 0.5 for two stops of the same category", () => {
    expect(redundancyPenalty([asStop(culture), asStop(culture)])).toBe(0.5);
  });

  it("is maximal for a plan where every stop shares one category", () => {
    const stops = [
      asStop(culture),
      asStop(rec({ id: "c", category: "Culture" })),
      asStop(rec({ id: "d", category: "Culture" })),
    ];
    // 3 equal pairs at 0.5 is 1.5, divided by (3 - 1) is 0.75.
    expect(redundancyPenalty(stops)).toBeCloseTo(0.75, 12);
  });

  it("counts unordered pairs once, not twice", () => {
    const stops = [asStop(culture), asStop(food), asStop(rec({ id: "c", category: "Food" }))];
    // one equal pair out of (3 - 1) is 0.25
    expect(redundancyPenalty(stops)).toBeCloseTo(0.25, 12);
  });
});

describe("paceDeviation", () => {
  it("is 0 when the plan matches the ideal", () => {
    expect(paceDeviation(3, ctx({ idealStops: 3 }))).toBe(0);
  });

  it("is the gap to the power one and a half over the ideal, in both directions", () => {
    const c = ctx({ idealStops: 4 });
    expect(paceDeviation(2, c)).toBeCloseTo(Math.pow(2, 1.5) / 4, 12);
    expect(paceDeviation(6, c)).toBeCloseTo(Math.pow(2, 1.5) / 4, 12);
  });

  it("does not divide by zero when the ideal is 0", () => {
    expect(paceDeviation(2, ctx({ idealStops: 0 }))).toBeCloseTo(Math.pow(2, 1.5), 12);
  });
});

describe("proximityWeight", () => {
  it("falls back to the documented constant when Weights has no proximity key", () => {
    expect(proximityWeight({} as Weights)).toBe(PROXIMITY_WEIGHT_FALLBACK);
  });

  it("prefers a proximity key the moment one exists, so both derivations agree", () => {
    const withKey = { proximity: 0.42 } as unknown as Weights;
    expect(proximityWeight(withKey)).toBe(0.42);
  });

  it("ignores a non-finite proximity key rather than poisoning the objective", () => {
    const bad = { proximity: Number.NaN } as unknown as Weights;
    expect(proximityWeight(bad)).toBe(PROXIMITY_WEIGHT_FALLBACK);
  });
});

describe("mean", () => {
  it("is 0 for an empty list, not NaN", () => {
    expect(mean([])).toBe(0);
  });

  it("sums in index order", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});
