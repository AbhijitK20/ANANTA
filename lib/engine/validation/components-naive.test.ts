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
    // 58 of 62 is a raw proportion of 0.935. The bound is 0.673, not 0.935 and
    // not anything near it: a proportion from 62 observations is a weaker claim
    // than the proportion suggests, and the gap is the price of the uncertainty.
    const bound = wilsonLowerBound(58, 62);
    expect(bound).toBeLessThan(58 / 62);
    expect(bound).toBeCloseTo(0.673258543, 9);
  });

  it("matches a hand derivation of the closed form to twelve digits", () => {
    // p = 58/62, z = 1.96, z2 = 3.8416, and the spec's corrected form:
    //   bound = (p + z2/2n - z*sqrt((p(1-p) + z2/4)/n)) / (1 + z2/n)
    // The `z2 / 4` inside the root is the whole correction and it does NOT get a
    // second division by n. Dividing it by n as well gives z2 / (4n^2) inside
    // the root, which is not the Wilson bound; the spec corrected that and this
    // derivation is the corrected one, written independently of the code.
    const z = 1.96;
    const z2 = 3.8416;
    const p = 58 / 62;
    const n = 62;
    const expected =
      (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / 4) / n)) / (1 + z2 / n);
    expect(wilsonLowerBound(58, 62)).toBeCloseTo(expected, 12);
  });

  it("penalises a small sample far more than a large one at the same proportion", () => {
    // Seven observations at 0.857 give a bound of 0.233, a gap of 0.624. Seven
    // hundred at the same proportion give 0.779, a gap of 0.079. The gap is
    // still positive at n = 700, which is the property that makes the bound a
    // bound rather than the mean with extra steps.
    const smallGap = 6 / 7 - wilsonLowerBound(6, 7);
    const largeGap = 600 / 700 - wilsonLowerBound(600, 700);
    expect(smallGap).toBeGreaterThan(largeGap);
    expect(largeGap).toBeCloseTo(0.078617297, 9);
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

  it("returns the raw bound unrescaled, so the one end is 0.886 and not 1", () => {
    // The spec dropped the old `(bound * 5 - 3) / 2` lift onto [-1, 1] and says
    // the result is already in [0, 1], so nothing is rescaled. 62 reviews all
    // awarded five stars is ratingSum 310, because the scale is five points.
    const perfect = ratingScore(rec({ ratingSum: 310, reviewCount: 62 }));
    expect(perfect).toBeCloseTo(0.88612098, 8);
    expect(perfect).toBeLessThan(1);
    // 62 stars out of 310 possible is a raw proportion of 0.2, and the bound is
    // 0.087. It is not -1: the lift is gone, so a mediocre record is poor, not
    // a rejected one.
    const mediocre = ratingScore(rec({ ratingSum: 62, reviewCount: 62 }));
    expect(mediocre).toBeCloseTo(0.087282897, 9);
    expect(mediocre).toBeLessThan(0.2);
    expect(mediocre).toBeGreaterThan(0);
  });

  it("reads a five star sum over a five star trial count, not over the review count", () => {
    // 46 stars out of 50 possible is a 4.6 average. Reading 46 over 10 makes the
    // proportion exceed 1 and returns 0.422, a different number for the same
    // record. The normalisation exists so the two can never be confused.
    const record = rec({ ratingSum: 46, reviewCount: 10 });
    expect(Number.isNaN(ratingScore(record))).toBe(false);
    expect(ratingScore(record)).toBeCloseTo(0.628284977, 9);
    expect(ratingScore(record)).not.toBeCloseTo(0.422400378, 6);
  });
});

describe("interestScore", () => {
  it("is neutral for a category the profile never mentions", () => {
    expect(interestScore(rec({ category: "Food" }), ctx())).toBe(0);
  });

  it("rescales the stated interest around the midpoint, then subtracts the veto", () => {
    // base 0.8 lifts to (0.8 - 0.5) * 2 = 0.6, and a 0.3 veto takes it to 0.3.
    // base 0.4 is a negative interest, not a mild positive one: -0.2.
    const c = ctx();
    c.profile.interests = { Food: 0.8, Culture: 0.4 };
    c.profile.avoid = { Food: 0.3 };
    expect(interestScore(rec({ category: "Food" }), c)).toBeCloseTo(0.3, 12);
    expect(interestScore(rec({ category: "Culture" }), c)).toBeCloseTo(-0.2, 12);
  });

  it("reaches both ends only from a full interest or a full veto", () => {
    // The spec's own two worked examples: a strong interest scores 1, a strong
    // veto with no interest scores -1.
    const wanted = ctx();
    wanted.profile.interests = { Culture: 1 };
    expect(interestScore(rec(), wanted)).toBe(1);
    const vetoed = ctx();
    vetoed.profile.avoid = { Culture: 1 };
    expect(interestScore(rec(), vetoed)).toBe(-1);
  });

  it("clamps to minus one through one", () => {
    const c = ctx();
    c.profile.interests = { Culture: 3 };
    expect(interestScore(rec(), c)).toBe(1);
  });
});

describe("valueScore", () => {
  /**
   * A record the price confidence gate will let through. Without this every
   * assertion below would pass for the wrong reason: `confidence.price` missing
   * reads as `unverified`, and an unverified price scores 0 whatever it says.
   */
  const priced = (pricePerPersonInr: number) =>
    rec({ pricePerPersonInr, confidence: { price: "verified" } });

  it("is 0 when the price is unknown, as the spec requires", () => {
    expect(valueScore(rec({ pricePerPersonInr: null }), ctx({ budgetInr: 2000 }))).toBe(0);
  });

  it("is 0 for a price that is an estimate or unverified, whatever it says", () => {
    // A price nobody sourced cannot buy rank. This gate is not in
    // `objective-spec.md` section 4, which is a divergence to report, but it is
    // the same gate in both implementations so it cannot cause drift.
    const c = ctx({ budgetInr: 2000, partySize: 2 });
    expect(valueScore(rec({ pricePerPersonInr: 100, confidence: { price: "estimate" } }), c)).toBe(0);
    expect(valueScore(rec({ pricePerPersonInr: 100, confidence: { price: "unverified" } }), c)).toBe(0);
  });

  it("is plus one when it is free and minus a half when it costs the whole head budget", () => {
    // 2000 INR over a party of 2 is 1000 per head. Free is 1. At 1000 each the
    // ratio is 1, and the spec puts the zero point at a ratio of 2, so this is
    // 1/4*2-1 = -0.5 rather than -1.
    const c = ctx({ budgetInr: 2000, partySize: 2 });
    expect(valueScore(priced(0), c)).toBe(1);
    expect(valueScore(priced(1000), c)).toBeCloseTo(-0.5, 12);
  });

  it("is 0 at half the head budget, which is the point a traveller can check", () => {
    const c = ctx({ budgetInr: 2000, partySize: 2 });
    expect(valueScore(priced(500), c)).toBeCloseTo(0, 12);
  });

  it("saturates at one rather than running away on something cheap", () => {
    const c = ctx({ budgetInr: 2000, partySize: 2 });
    expect(valueScore(priced(1), c)).toBe(1);
  });

  it("does not divide by zero for a party of 0", () => {
    expect(Number.isNaN(valueScore(priced(100), ctx({ partySize: 0 })))).toBe(false);
    // max(1, 0) is 1, so the whole 2000 is treated as a per head budget.
    expect(valueScore(priced(100), ctx({ partySize: 0 }))).toBe(1);
  });
});

describe("weatherScore", () => {
  const base = rec();

  it("is 0 when the weather is unknown, because unknown is not clear", () => {
    expect(weatherScore(base, ctx({ weatherSeverity: null }))).toBe(0);
  });

  it("copies the spec table, in both directions, including the negatives", () => {
    // "Copy the table. Do not derive it." Clear weather is the only severity
    // that prefers the outdoors, and heavy rain and a storm are the only ones
    // that score an outdoor record below zero, which the old clamped-at-zero
    // reading hid.
    const table: Record<string, Record<string, number>> = {
      clear: { indoor: 0.4, outdoor: 1, mixed: 0.7 },
      rain: { indoor: 1, outdoor: 0.2, mixed: 0.6 },
      heavy_rain: { indoor: 1, outdoor: -1, mixed: -0.4 },
      storm: { indoor: 0.8, outdoor: -1, mixed: -0.5 },
    };
    for (const [severity, row] of Object.entries(table)) {
      const c = ctx({ weatherSeverity: severity as "clear" });
      expect(weatherScore(rec({ indoor: "indoor" }), c)).toBeCloseTo(row.indoor, 12);
      expect(weatherScore(rec({ indoor: "outdoor" }), c)).toBeCloseTo(row.outdoor, 12);
      expect(weatherScore(rec({ indoor: "mixed" }), c)).toBeCloseTo(row.mixed, 12);
    }
  });

  it("prefers indoor to outdoor under rain, and indoor to mixed under a storm", () => {
    const c = ctx({ weatherSeverity: "rain" });
    expect(weatherScore(rec({ indoor: "indoor" }), c)).toBe(1);
    expect(weatherScore(rec({ indoor: "mixed" }), c)).toBe(0.6);
    expect(weatherScore(rec({ indoor: "outdoor" }), c)).toBe(0.2);
    const storm = ctx({ weatherSeverity: "storm" });
    expect(weatherScore(rec({ indoor: "outdoor" }), storm)).toBe(-1);
    expect(weatherScore(rec({ indoor: "indoor" }), storm)).toBe(0.8);
    expect(weatherScore(rec({ indoor: "mixed" }), storm)).toBe(-0.5);
  });
});

describe("groupScore", () => {
  it("is 0 when the party imposes nothing, because nothing recorded is not a yes", () => {
    // The spec's governing sentence: a null fact never scores against the
    // group, only a recorded false does. The old reading started from a 0.25
    // baseline, so a record nobody checked scored slightly positive.
    expect(groupScore(rec(), ctx())).toBe(0);
    expect(groupScore(rec(), ctx({ partySize: 1 }))).toBe(0);
  });

  it("reads kidFriendly and stroller_ok when a toddler is present", () => {
    const c = ctx({ hasToddler: true });
    expect(groupScore(rec({ kidFriendly: true }), c)).toBe(1);
    expect(groupScore(rec({ kidFriendly: false }), c)).toBe(-1);
    expect(groupScore(rec({ kidFriendly: null }), c)).toBe(0);
    expect(groupScore(rec({ access: { stroller_ok: true } }), c)).toBe(0.5);
    expect(groupScore(rec({ access: { stroller_ok: false } }), c)).toBe(-0.5);
    expect(groupScore(rec({ access: {} }), c)).toBe(0);
  });

  it("reads low_walking when an elderly traveller is present", () => {
    const c = ctx({ hasElderly: true });
    expect(groupScore(rec({ access: { low_walking: true } }), c)).toBe(1);
    expect(groupScore(rec({ access: { low_walking: false } }), c)).toBe(-1);
    expect(groupScore(rec({ access: {} }), c)).toBe(0);
  });

  it("ignores ctx.accessNeeds and ctx.diets entirely", () => {
    // Both loops are gone from the spec's clause tree. An unlisted diet is not
    // a refusal, so it cannot cost a record anything.
    const c = ctx({ accessNeeds: ["step_free"], diets: ["vegan", "jain", "halal"] });
    expect(groupScore(rec({ access: { step_free: false }, diets: [] }), c)).toBe(0);
  });

  it("charges a full point when the party is larger than a recorded capacity", () => {
    expect(groupScore(rec({ capacity: 3 }), ctx({ partySize: 5 }))).toBe(-1);
    // Enough room is a quarter point, not a full one: capacity is a minor fact.
    expect(groupScore(rec({ capacity: 5 }), ctx({ partySize: 5 }))).toBeCloseTo(0.25, 12);
    // A party of one is not a group, and an unknown capacity is not a refusal.
    expect(groupScore(rec({ capacity: 3 }), ctx({ partySize: 1 }))).toBe(0);
    expect(groupScore(rec({ capacity: null }), ctx({ partySize: 5 }))).toBe(0);
  });

  it("clamps to minus one through one at both ends", () => {
    const crowded = ctx({ hasToddler: true, partySize: 5 });
    const bad = rec({ kidFriendly: false, access: { stroller_ok: false }, capacity: 3 });
    // -1 kid, -0.5 stroller, -1 capacity is -2.5 before the clamp.
    expect(groupScore(bad, crowded)).toBe(-1);
    const good = ctx({ hasToddler: true, hasElderly: true, partySize: 2 });
    const kind = rec({ kidFriendly: true, access: { stroller_ok: true, low_walking: true }, capacity: 9 });
    // 1 + 0.5 + 1 + 0.25 is 2.75 before the clamp.
    expect(groupScore(kind, good)).toBe(1);
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
    // The four buckets are 5..11, 12..16, 17..20 and everything else. The old
    // reading was a single `hour < 12` test, which put 02:00 in the morning
    // bucket; 00:00 to 04:59 is the night bucket and is the busiest.
    expect(slotOfDay("2026-01-01T05:00:00")).toBe(0);
    expect(slotOfDay("2026-01-01T11:59:00")).toBe(0);
    expect(slotOfDay("2026-01-01T12:00:00")).toBe(1);
    expect(slotOfDay("2026-01-01T16:59:00")).toBe(1);
    expect(slotOfDay("2026-01-01T17:00:00")).toBe(2);
    expect(slotOfDay("2026-01-01T20:59:00")).toBe(2);
    expect(slotOfDay("2026-01-01T21:00:00")).toBe(3);
    expect(slotOfDay("2026-01-01T23:30:00")).toBe(3);
    expect(slotOfDay("2026-01-01T00:00:00")).toBe(3);
    expect(slotOfDay("2026-01-01T04:59:00")).toBe(3);
  });

  it("reads a string with no time part as hour zero, which is the night slot", () => {
    // Not "morning", as the old reading claimed. The spec does not say what a
    // malformed ctx.now should be; hour 0 is the defensible reading and it is
    // the pessimistic one, because night is the peak.
    expect(slotOfDay("2026-01-01")).toBe(3);
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

  it("decays linearly, 0.8 one slot away and 0.6 two slots away", () => {
    // t = |slot - index| / 3, so each slot step is worth 0.2 of the factor. The
    // old ring reached its floor at two steps and could not tell one step from
    // two, which is the whole reason the spec calls the decay linear.
    expect(peakHourFactor(at(15), "morning")).toBeCloseTo(0.8, 12);
    expect(peakHourFactor(at(9), "afternoon")).toBeCloseTo(0.8, 12);
    expect(peakHourFactor(at(19), "night")).toBeCloseTo(0.8, 12);
    expect(peakHourFactor(at(22), "evening")).toBeCloseTo(0.8, 12);
    expect(peakHourFactor(at(19), "morning")).toBeCloseTo(0.6, 12);
    expect(peakHourFactor(at(9), "evening")).toBeCloseTo(0.6, 12);
    expect(peakHourFactor(at(15), "night")).toBeCloseTo(0.6, 12);
    expect(peakHourFactor(at(22), "afternoon")).toBeCloseTo(0.6, 12);
  });

  it("is 0.4 only at the true far end, morning against night", () => {
    // On a four point ring the farthest point from morning is evening, so a
    // circular version could not reach 0.4 anywhere. Linear, only 0 and 3 are
    // three slots apart.
    expect(peakHourFactor(at(22), "morning")).toBeCloseTo(0.4, 12);
    expect(peakHourFactor(at(9), "night")).toBeCloseTo(0.4, 12);
    expect(peakHourFactor(at(3), "morning")).toBeCloseTo(0.4, 12);
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
    // 09:00 is the morning slot, and night is three slots away, so the second
    // stop is priced at the 0.4 floor: (0.8 + 0.16) / 2.
    expect(crowdLoad(stops, morning)).toBeCloseTo(0.48, 12);
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

describe("mean", () => {
  it("is 0 for an empty list, not NaN", () => {
    expect(mean([])).toBe(0);
  });

  it("sums in index order", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});
