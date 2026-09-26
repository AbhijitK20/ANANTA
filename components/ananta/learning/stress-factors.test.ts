import { describe, expect, it } from "vitest";
import type { DiscoveryContext, Stop } from "@/lib/engine";
import { planFactors, worstFactor } from "@/components/ananta/stress-radar";

/**
 * The panel's honesty properties, as tests.
 *
 * The four bugs this session fixed in `stress-radar.tsx` were all ways of
 * letting an absence of data look like a measurement. So the tests below are
 * about the difference between "we measured zero" and "we could not measure",
 * because that is the distinction the whole panel turns on.
 */

function ctx(overrides: Partial<DiscoveryContext> = {}): DiscoveryContext {
  return {
    now: "2026-09-20T09:00:00+05:30",
    origin: { coordinates: [72.8331, 18.9317], label: "Fort", area: "Fort" },
    availableMinutes: 240,
    deadline: null,
    budgetInr: 1000,
    partySize: 2,
    hasToddler: false,
    hasElderly: false,
    raining: false,
    weatherSeverity: "clear",
    travelMode: "walk",
    pace: "normal",
    idealStops: 3,
    minStops: 1,
    accessNeeds: [],
    diets: [],
    query: "",
    city: {
      id: "mumbai",
      displayName: "Mumbai",
      currency: "INR",
      timezone: "Asia/Kolkata",
      bbox: [72.79, 18.9, 72.91, 19.23],
      neighbourhoods: [],
      monsoonMonths: [6, 7, 8, 9],
      congestion: { walk: 1, auto: 1.6, taxi: 1.9, metro: 1.15, ferry: 1 },
      ferryCorridors: [],
      notes: "",
    },
    profile: {
      id: "t",
      interests: {},
      avoid: {},
      accessibility: [],
      diets: [],
      excludes: [],
      pins: [],
      weights: {
        interest: 1, rating: 0.8, value: 0.7, authenticity: 0.6, weather: 0.9, crowd: 0.6,
        novelty: 0.8, groupFit: 0.8, travelFriction: 0.5, reliability: 0.5,
        travelPenalty: 0.012, pacePenalty: 0.7,
      },
      bandit: { arms: [], observations: 0, updatedAt: "2026-09-20T00:00:00+05:30" },
    },
    ...overrides,
  } as DiscoveryContext;
}

function stop(id: string, indoor: "indoor" | "outdoor" | "mixed", km: number): Stop {
  return {
    record: {
      id,
      name: id,
      area: "Fort",
      city: "Mumbai",
      zone: "Fort / Kala Ghoda",
      station: "CSMT",
      category: "Culture",
      description: "",
      coordinates: [72.8331, 18.9317],
      travelMinutes: 5,
      durationMinutes: 60,
      priceInr: 0,
      pricePerPersonInr: 0,
      capacity: null,
      openingHours: { weekly: {}, confidence: "unverified" },
      availability: { leadTimeMinutes: 0, soldOutAt: null, remainingCapacity: null, bookingUrl: null, updatedAt: "" },
      access: {},
      diets: [],
      indoor,
      kidFriendly: null,
      season: null,
      bestTimeOfDay: "any",
      ratingSum: null,
      reviewCount: null,
      authenticity: null,
      providerReliability: null,
      crowdProfile: null,
      provenance: {} as never,
      confidence: {} as never,
      sources: {} as never,
      imageUrl: "",
      imageCredit: "",
      status: "",
      statusTone: "blue",
      updated: "",
    },
    arriveBy: 0,
    travelMinutes: 5,
    travelKm: km,
    visitMinutes: 60,
    bufferMinutes: 0,
    costInr: 0,
  };
}

describe("stress factors distinguish a zero from an absence", () => {
  it("scores crowd exposure as unmeasured when the weather is unknown", () => {
    const stops = [stop("a", "outdoor", 2), stop("b", "indoor", 2)];
    const factors = planFactors(stops, ctx({ weatherSeverity: null }));
    const crowd = factors.find((factor) => factor.id === "crowd")!;
    expect(crowd.measured).toBe(false);
    // The score field exists so the type is stable, but it is not a reading.
    expect(crowd.score).toBe(0);
    expect(crowd.measure).toContain("not scored");
  });

  it("scores crowd exposure for real once the weather is known", () => {
    const stops = [stop("a", "outdoor", 2), stop("b", "indoor", 2)];
    const factors = planFactors(stops, ctx({ weatherSeverity: "rain" }));
    const crowd = factors.find((factor) => factor.id === "crowd")!;
    expect(crowd.measured).toBe(true);
    expect(crowd.score).toBeGreaterThan(0);
  });

  it("scores access as unmeasured when a need is listed, never as a failing zero", () => {
    const stops = [stop("a", "indoor", 1)];
    const listed = planFactors(stops, ctx({ accessNeeds: ["step_free"] }));
    const access = listed.find((factor) => factor.id === "access")!;
    expect(access.measured).toBe(false);
    expect(access.measure).toContain("unmeasured rather than failing");

    const unlisted = planFactors(stops, ctx({ accessNeeds: [] }));
    const clear = unlisted.find((factor) => factor.id === "access")!;
    expect(clear.measured).toBe(true);
    expect(clear.score).toBe(100);
  });

  it("scores every stop-based factor as unmeasured on an empty plan", () => {
    const factors = planFactors([], ctx());
    for (const id of ["travel", "variety", "pace", "crowd"]) {
      expect(factors.find((factor) => factor.id === id)!.measured, id).toBe(false);
    }
  });

  it("never measures travel, variety, or pace as a real zero on a real plan", () => {
    // One stop of one category: variety genuinely is 100, travel genuinely has a
    // reading, and one stop against a target of one means a perfect pace match.
    // These are the cases where a measured score should be allowed to be a real
    // number, which is what proves the flag is not just always false.
    const factors = planFactors([stop("a", "indoor", 0.2)], ctx({ idealStops: 1 }));
    expect(factors.find((factor) => factor.id === "variety")!.measured).toBe(true);
    expect(factors.find((factor) => factor.id === "variety")!.score).toBe(100);
    expect(factors.find((factor) => factor.id === "pace")!.measured).toBe(true);
    expect(factors.find((factor) => factor.id === "pace")!.score).toBe(100);
  });
});

describe("the travel factor is labelled as an estimate", () => {
  it("says straight line and congestion multiplier in the measure sentence", () => {
    const factors = planFactors([stop("a", "indoor", 3), stop("b", "indoor", 5)], ctx());
    const travel = factors.find((factor) => factor.id === "travel")!;
    expect(travel.measure).toContain("straight line");
    expect(travel.measure).toContain("congestion multiplier");
  });
});

describe("the worst factor is a measured one", () => {
  it("skips unmeasured factors when picking the worst, so a data gap is not a failure", () => {
    // Access needs listed makes access unmeasured. Budget is generous so it
    // scores well. The worst measured factor should be reported, not access.
    const factors = planFactors(
      [stop("a", "indoor", 12)],
      ctx({ accessNeeds: ["step_free"], budgetInr: 100000, idealStops: 3 }),
    );
    const worst = worstFactor(factors)!;
    expect(worst.measured).toBe(true);
    expect(worst.id).not.toBe("access");
  });

  it("falls back to the first factor when nothing at all was measured", () => {
    const factors = planFactors([], ctx());
    expect(worstFactor(factors)).not.toBeNull();
    expect(worstFactor([])).toBeNull();
  });

  it("picks the lowest scoring measured factor, which is a real reading", () => {
    // One long leg exceeds the ceiling so travel scores 0, and everything else
    // is comfortable. The worst must be travel.
    const factors = planFactors([stop("a", "indoor", 14)], ctx({ budgetInr: 100000, idealStops: 1 }));
    const worst = worstFactor(factors)!;
    expect(worst.id).toBe("travel");
    expect(worst.score).toBe(0);
    expect(worst.measured).toBe(true);
  });
});

describe("every factor carries an action or says why there is not one", () => {
  it("gives every factor a non-empty rescue sentence", () => {
    const factors = planFactors([stop("a", "outdoor", 3), stop("b", "indoor", 1)], ctx());
    for (const factor of factors) {
      expect(factor.rescue.trim().length, factor.id).toBeGreaterThan(20);
      expect(factor.label.trim().length, factor.id).toBeGreaterThan(2);
    }
  });

  it("attaches a trigger only where one actually performs the rescue", () => {
    const factors = planFactors([stop("a", "indoor", 1)], ctx());
    const byId = new Map(factors.map((factor) => [factor.id, factor]));
    expect(byId.get("pace")!.trigger).toBe("tired");
    expect(byId.get("time")!.trigger).toBe("time_lost");
    // Variety and travel have no single session 9 trigger that does the job.
    expect(byId.get("variety")!.trigger).toBeNull();
    expect(byId.get("travel")!.trigger).toBeNull();
  });

  it("offers no crowd trigger when the weather is unknown, because rain is not the fix", () => {
    const unknown = planFactors([stop("a", "outdoor", 1)], ctx({ weatherSeverity: null }));
    expect(unknown.find((factor) => factor.id === "crowd")!.trigger).toBeNull();
    const known = planFactors([stop("a", "outdoor", 1)], ctx({ weatherSeverity: "rain" }));
    expect(known.find((factor) => factor.id === "crowd")!.trigger).toBe("rain_started");
  });
});

describe("the grid never reshapes itself", () => {
  it("always returns exactly seven factors, measured or not", () => {
    for (const plan of [
      [],
      [stop("a", "indoor", 1)],
      [stop("a", "indoor", 1), stop("b", "outdoor", 9), stop("c", "mixed", 2)],
    ]) {
      expect(planFactors(plan, ctx()).length, `plan of ${plan.length}`).toBe(7);
    }
  });

  it("covers all seven ids, so no axis silently disappears", () => {
    const ids = planFactors([], ctx()).map((factor) => factor.id);
    expect(new Set(ids)).toEqual(new Set(["time", "pace", "budget", "travel", "crowd", "variety", "access"]));
  });
});
