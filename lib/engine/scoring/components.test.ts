import { describe, expect, it } from "vitest";
import type { ComponentId, ScoreComponent, Stop } from "@/lib/engine/contracts";
import { makeContext, makeProfile, makeRecord, makeStop } from "@/lib/engine/scoring/fixtures.test";
import {
  COMPONENT_IDS,
  COMPONENTS,
  localMinutesOfDay,
  peakHourFactor,
  scoreStop,
} from "@/lib/engine/scoring/components";
import { WEIGHT_COMPONENT_KEYS } from "@/lib/engine/scoring/weights";

interface StopPosition {
  index: number;
  prior: Stop[];
}

const START: StopPosition = { index: 0, prior: [] };

function byId(components: readonly ScoreComponent[], id: ComponentId): ScoreComponent {
  const found = components.find((component) => component.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe("COMPONENT_IDS", () => {
  it("lists the ten components in the frozen ComponentId order", () => {
    expect(COMPONENT_IDS).toEqual([
      "interest",
      "rating",
      "value",
      "authenticity",
      "weather",
      "crowd",
      "novelty",
      "groupFit",
      "travelFriction",
      "reliability",
    ]);
  });

  it("agrees with the weight vector so the two lists cannot drift", () => {
    expect(WEIGHT_COMPONENT_KEYS).toEqual([...COMPONENT_IDS]);
  });

  it("has a scoring function for every id", () => {
    for (const id of COMPONENT_IDS) expect(COMPONENTS[id], id).toBeTypeOf("function");
  });
});

describe("scoreStop", () => {
  it("returns one component per id, in order, each with a weight, a contribution and a sentence", () => {
    const components = scoreStop(makeStop(), makeContext(), START);
    expect(components).toHaveLength(COMPONENT_IDS.length);
    expect(components.map((component) => component.id)).toEqual([...COMPONENT_IDS]);
    for (const component of components) {
      expect(component.sentence.length, component.id).toBeGreaterThan(0);
      expect(component.weight, component.id).toBeTypeOf("number");
      expect(component.contribution, component.id).toBeCloseTo(component.weight * component.normalised, 12);
    }
  });

  it("holds every normalised value inside the declared minus 1 to 1 range", () => {
    const ctx = makeContext();
    const stops = [
      makeStop({ crowdProfile: 1, authenticity: 1 }, { minutes: 900, km: 40 }),
      makeStop({ crowdProfile: 0, authenticity: 0 }, { minutes: 0, km: 0 }),
      makeStop({ crowdProfile: null, authenticity: null, ratingSum: null, reviewCount: null }),
    ];
    for (const stop of stops) {
      for (const component of scoreStop(stop, ctx, { index: 1, prior: [stops[0]] })) {
        expect(component.normalised, component.id).toBeGreaterThanOrEqual(-1);
        expect(component.normalised, component.id).toBeLessThanOrEqual(1);
      }
    }
  });

  it("puts an exact value on the contribution of every component", () => {
    // Pinned against clampWeights(PRIOR_WEIGHTS), the cold start.
    const components = scoreStop(makeStop(), makeContext(), START);
    expect(byId(components, "interest").contribution).toBeCloseTo(0.09756097560975609, 12);
    expect(byId(components, "rating").contribution).toBeCloseTo(0.06611556579122595, 12);
    expect(byId(components, "value").contribution).toBeCloseTo(0.07804878048780486, 12);
    expect(byId(components, "authenticity").contribution).toBeCloseTo(0.10243902439024388, 12);
    expect(byId(components, "weather").contribution).toBeCloseTo(0.04065040650406504, 12);
    expect(byId(components, "crowd").contribution).toBeCloseTo(-0.03902439024390243, 12);
    expect(byId(components, "novelty").contribution).toBeCloseTo(0.07317073170731707, 12);
    expect(byId(components, "groupFit").contribution).toBe(0);
    expect(byId(components, "travelFriction").contribution).toBe(0);
    expect(byId(components, "reliability").contribution).toBeCloseTo(0.032520325203252036, 12);
  });
});

describe("interest", () => {
  it("reads the stated weight for the record's own category", () => {
    // cafes 0.6 of a total profile weight of 1.0.
    const components = scoreStop(makeStop({ category: "cafes" }), makeContext(), START);
    expect(byId(components, "interest").normalised).toBeCloseTo(0.6, 12);
  });

  it("matches the category without regard to case, so a capitalised taxonomy still scores", () => {
    const ctx = makeContext();
    const profile = makeProfile({ interests: { Culture: 0.9, Food: 0.7 } });
    const scoped = { ...ctx, profile };
    expect(byId(scoreStop(makeStop({ category: "Culture" }), scoped, START), "interest").normalised).toBeCloseTo(0.9, 12);
    expect(byId(scoreStop(makeStop({ category: "culture" }), scoped, START), "interest").normalised).toBeCloseTo(0.9, 12);
    expect(byId(scoreStop(makeStop({ category: "CULTURE" }), scoped, START), "interest").normalised).toBeCloseTo(0.9, 12);
  });

  it("does not split a multi word category into parts", () => {
    const ctx = makeContext();
    const profile = makeProfile({ interests: { galleries: 0.5, art: 0.5 } });
    const scoped = { ...ctx, profile };
    // Neither part is the category, so nothing matches.
    expect(byId(scoreStop(makeStop({ category: "Art Galleries" }), scoped, START), "interest").normalised).toBe(0);
  });

  it("subtracts anything on the avoid list", () => {
    const ctx = makeContext();
    const profile = makeProfile({ interests: { cafes: 0.6, galleries: 0.4 }, avoid: { cafes: 0.3 } });
    const components = scoreStop(makeStop({ category: "cafes" }), { ...ctx, profile }, START);
    expect(byId(components, "interest").normalised).toBeCloseTo(0.3, 12);
  });

  it("counts 0 when the profile expresses no interests at all", () => {
    const ctx = makeContext();
    const profile = makeProfile({ interests: {}, avoid: { cafes: 1 } });
    const components = scoreStop(makeStop(), { ...ctx, profile }, START);
    const interest = byId(components, "interest");
    expect(interest.normalised).toBe(-1);
    expect(interest.sentence).toContain("avoid list");
  });

  it("says so when nothing matched, rather than emitting an empty reason", () => {
    const components = scoreStop(makeStop({ category: "museums" }), makeContext(), START);
    const interest = byId(components, "interest");
    expect(interest.normalised).toBe(0);
    expect(interest.sentence).toContain("museums");
  });
});

describe("rating", () => {
  it("uses the Wilson lower bound, which is below the mean, and says the mean too", () => {
    const components = scoreStop(makeStop({ ratingSum: 258, reviewCount: 60 }), makeContext(), START);
    const rating = byId(components, "rating");
    expect(rating.normalised).toBeLessThan(258 / 60 / 5);
    expect(rating.sentence).toContain("Wilson lower bound");
    expect(rating.sentence).toContain("60 reviews");
    expect(rating.sentence).toContain("mean 4.30");
  });

  it("counts 0 for a record with no reviews, never a neutral prior", () => {
    for (const record of [{ ratingSum: null, reviewCount: null }, { ratingSum: 258, reviewCount: 0 }]) {
      const components = scoreStop(makeStop(record), makeContext(), START);
      const rating = byId(components, "rating");
      expect(rating.normalised).toBe(0);
      expect(rating.contribution).toBe(0);
      expect(rating.sentence).toContain("No reviews");
    }
  });
});

describe("value", () => {
  it("scores one minus the party cost over the budget", () => {
    const ctx = makeContext({ budgetInr: 1000, partySize: 1 });
    const components = scoreStop(makeStop({ priceInr: 200 }), ctx, START);
    expect(byId(components, "value").normalised).toBeCloseTo(0.8, 12);
  });

  it("charges the price for the whole party, not for one person", () => {
    const ctx = makeContext({ budgetInr: 1000, partySize: 4 });
    const components = scoreStop(makeStop({ priceInr: 200 }), ctx, START);
    // 800 of a 1000 budget.
    expect(byId(components, "value").normalised).toBeCloseTo(0.2, 12);
  });

  it("scores 0 when the price is an estimate, so a guessed price cannot buy rank", () => {
    const record = makeRecord({ priceInr: 10, confidence: { price: "estimate" } });
    const components = scoreStop({ ...makeStop(), record }, makeContext(), START);
    const value = byId(components, "value");
    expect(value.normalised).toBe(0);
    expect(value.contribution).toBe(0);
    expect(value.sentence).toContain("estimate");
    expect(value.sentence).toContain("10 INR");
  });

  it("scores 0 when the price is unverified, and when it has no confidence at all", () => {
    const unverified = makeRecord({ priceInr: 10, confidence: { price: "unverified" } });
    const missing = makeRecord({ priceInr: 10, confidence: {} });
    for (const record of [unverified, missing]) {
      const components = scoreStop({ ...makeStop(), record }, makeContext(), START);
      const value = byId(components, "value");
      expect(value.normalised, record.confidence.price ?? "missing").toBe(0);
      expect(value.sentence).toContain("cannot buy rank");
    }
  });

  it("floors at 0 and caps at 1 rather than going negative or unbounded", () => {
    const broke = makeContext({ budgetInr: 10, partySize: 1 });
    expect(byId(scoreStop(makeStop({ priceInr: 500 }), broke, START), "value").normalised).toBe(0);
    const rich = makeContext({ budgetInr: 1000, partySize: 1 });
    expect(byId(scoreStop(makeStop({ priceInr: 0 }), rich, START), "value").normalised).toBe(1);
  });
});

describe("authenticity", () => {
  it("uses the hand set value", () => {
    expect(byId(scoreStop(makeStop({ authenticity: 0.9 }), makeContext(), START), "authenticity").normalised).toBe(0.9);
  });

  it("counts a neutral 0.5 and says it is unrecorded when it is null", () => {
    const components = scoreStop(makeStop({ authenticity: null }), makeContext(), START);
    const authenticity = byId(components, "authenticity");
    expect(authenticity.normalised).toBe(0.5);
    expect(authenticity.sentence).toContain("unrecorded");
  });
});

describe("weather", () => {
  it("scores a neutral 0.5 when the weather is unknown, not 0 and not 1", () => {
    const components = scoreStop(makeStop(), makeContext({ weatherSeverity: null }), START);
    const weather = byId(components, "weather");
    expect(weather.normalised).toBe(0.5);
    expect(weather.contribution).toBeCloseTo(0.04065040650406504, 12);
    expect(weather.sentence).toContain("Weather is unknown");
  });

  it("rewards outdoor in clear weather and indoor in rain", () => {
    const clear = makeContext({ weatherSeverity: "clear" });
    expect(byId(scoreStop(makeStop({ indoor: "outdoor" }), clear, START), "weather").normalised).toBe(1);
    expect(byId(scoreStop(makeStop({ indoor: "indoor" }), clear, START), "weather").normalised).toBe(0.5);
    const rain = makeContext({ weatherSeverity: "rain" });
    expect(byId(scoreStop(makeStop({ indoor: "indoor" }), rain, START), "weather").normalised).toBe(1);
    expect(byId(scoreStop(makeStop({ indoor: "outdoor" }), rain, START), "weather").normalised).toBe(0);
  });

  it("punishes outdoor harder the worse the weather and never below 0", () => {
    for (const severity of ["clear", "rain", "heavy_rain", "storm"] as const) {
      const normalised = byId(
        scoreStop(makeStop({ indoor: "outdoor" }), makeContext({ weatherSeverity: severity }), START),
        "weather",
      ).normalised;
      expect(normalised, severity).toBeGreaterThanOrEqual(0);
      expect(normalised, severity).toBeLessThanOrEqual(1);
    }
    const outdoorInStorm = byId(scoreStop(makeStop({ indoor: "outdoor" }), makeContext({ weatherSeverity: "storm" }), START), "weather");
    const outdoorInRain = byId(scoreStop(makeStop({ indoor: "outdoor" }), makeContext({ weatherSeverity: "rain" }), START), "weather");
    expect(outdoorInStorm.normalised).toBeLessThanOrEqual(outdoorInRain.normalised);
  });

  it("says the weather and the place type in the sentence", () => {
    const components = scoreStop(makeStop({ indoor: "mixed" }), makeContext({ weatherSeverity: "heavy_rain" }), START);
    expect(byId(components, "weather").sentence).toBe("Heavy rain weather, mixed place, weather fit 0.40.");
  });
});

describe("crowd", () => {
  it("is negative signed, because a crowded place is a penalty", () => {
    const components = scoreStop(makeStop({ crowdProfile: 0.4 }), makeContext(), START);
    const crowd = byId(components, "crowd");
    expect(crowd.normalised).toBe(-0.4);
    expect(crowd.contribution).toBeLessThan(0);
  });

  it("costs a neutral 0.5 and says it is unrecorded when it is null", () => {
    const components = scoreStop(makeStop({ crowdProfile: null }), makeContext(), START);
    const crowd = byId(components, "crowd");
    expect(crowd.normalised).toBe(-0.5);
    expect(crowd.sentence).toContain("unrecorded");
  });

  it("is worst at full crowd and best at empty", () => {
    const ctx = makeContext();
    expect(byId(scoreStop(makeStop({ crowdProfile: 1 }), ctx, START), "crowd").normalised).toBe(-1);
    expect(byId(scoreStop(makeStop({ crowdProfile: 0 }), ctx, START), "crowd").normalised).toBe(0);
  });
});

describe("novelty", () => {
  it("is 1 for the first stop, because nothing repeats it", () => {
    const components = scoreStop(makeStop(), makeContext(), START);
    expect(byId(components, "novelty").normalised).toBe(1);
  });

  it("falls as the plan accumulates the same category", () => {
    const first = makeStop({ category: "cafes" });
    const second = makeStop({ category: "cafes" });
    const third = makeStop({ category: "cafes" });
    const other = makeStop({ category: "galleries" });
    const ctx = makeContext();
    const onePrior = byId(scoreStop(second, ctx, { index: 1, prior: [first] }), "novelty");
    const twoPrior = byId(scoreStop(third, ctx, { index: 2, prior: [first, second] }), "novelty");
    const distinct = byId(scoreStop(other, ctx, { index: 2, prior: [first, second] }), "novelty");
    // One repeat among two prior stops, divided by max(1, n-1) = 1.
    expect(onePrior.normalised).toBeCloseTo(0.5, 12);
    // Two repeats among two prior stops is the worst case, 1 - 0.5*2/1.
    expect(twoPrior.normalised).toBe(0);
    // A different category is not a repeat at all.
    expect(distinct.normalised).toBe(1);
    expect(onePrior.normalised).toBeLessThan(1);
  });
});

describe("groupFit", () => {
  it("is neutral when the group profile says nothing either way", () => {
    const components = scoreStop(makeStop(), makeContext(), START);
    const groupFit = byId(components, "groupFit");
    expect(groupFit.normalised).toBe(0);
    expect(groupFit.sentence).toContain("points either way");
  });

  it("rewards a kid friendly place for a toddler and penalises one that is not", () => {
    const ctx = makeContext({ hasToddler: true });
    const good = byId(scoreStop(makeStop({ kidFriendly: true }), ctx, START), "groupFit");
    const bad = byId(scoreStop(makeStop({ kidFriendly: false }), ctx, START), "groupFit");
    expect(good.normalised).toBeGreaterThan(0);
    expect(bad.normalised).toBeLessThan(0);
    expect(Math.abs(good.normalised)).toBe(Math.abs(bad.normalised));
  });

  it("skips the toddler signal, without pushing either way, when kid friendliness is unknown", () => {
    const ctx = makeContext({ hasToddler: true });
    const unknown = byId(scoreStop(makeStop({ kidFriendly: null }), ctx, START), "groupFit");
    expect(unknown.normalised).toBe(0);
    expect(unknown.sentence).toContain("unrecorded");
  });

  it("rewards seating for an elderly traveller and penalises being outdoors", () => {
    const ctx = makeContext({ hasElderly: true });
    const seated = byId(scoreStop(makeStop({ indoor: "indoor", access: { seating_available: true } }), ctx, START), "groupFit");
    const outdoors = byId(scoreStop(makeStop({ indoor: "outdoor", access: { seating_available: false } }), ctx, START), "groupFit");
    expect(seated.normalised).toBeGreaterThan(0);
    expect(outdoors.normalised).toBeLessThan(0);
  });

  it("rewards covering the dietary needs and penalises covering none", () => {
    const ctx = makeContext({ diets: ["vegan", "nut_free"] });
    const all = byId(scoreStop(makeStop({ diets: ["vegan", "nut_free"] }), ctx, START), "groupFit");
    const none = byId(scoreStop(makeStop({ diets: ["halal"] }), ctx, START), "groupFit");
    expect(all.normalised).toBeGreaterThan(0);
    expect(none.normalised).toBeLessThan(0);
  });
});

describe("travelFriction", () => {
  it("is 0 for the first stop, which has no leg", () => {
    const components = scoreStop(makeStop({}, { minutes: 0 }), makeContext(), START);
    const friction = byId(components, "travelFriction");
    expect(friction.normalised).toBe(0);
    expect(friction.sentence).toContain("first stop");
  });

  it("is the share of the window the leg eats, and is negative signed", () => {
    const ctx = makeContext({ availableMinutes: 300 });
    const components = scoreStop(makeStop({}, { minutes: 25 }), ctx, { index: 1, prior: [makeStop()] });
    const friction = byId(components, "travelFriction");
    expect(friction.normalised).toBeCloseTo(-25 / 300, 12);
    expect(friction.contribution).toBeLessThan(0);
  });

  it("is worse for the same leg when the window is smaller", () => {
    const wide = makeContext({ availableMinutes: 600 });
    const narrow = makeContext({ availableMinutes: 120 });
    const stop = makeStop({}, { minutes: 30 });
    const inWide = byId(scoreStop(stop, wide, { index: 1, prior: [makeStop()] }), "travelFriction").normalised;
    const inNarrow = byId(scoreStop(stop, narrow, { index: 1, prior: [makeStop()] }), "travelFriction").normalised;
    expect(inNarrow).toBeLessThan(inWide);
  });

  it("saturates at minus 1 and never divides by a zero window", () => {
    const tiny = makeContext({ availableMinutes: 0 });
    const friction = byId(scoreStop(makeStop({}, { minutes: 30 }), tiny, { index: 1, prior: [makeStop()] }), "travelFriction");
    expect(friction.normalised).toBe(-1);
  });
});

describe("reliability", () => {
  it("uses the interaction stream value", () => {
    expect(byId(scoreStop(makeStop({ providerReliability: 0.8 }), makeContext(), START), "reliability").normalised).toBe(0.8);
  });

  it("counts a neutral 0.5 and says it is unproven when it is null", () => {
    const reliability = byId(scoreStop(makeStop({ providerReliability: null }), makeContext(), START), "reliability");
    expect(reliability.normalised).toBe(0.5);
    expect(reliability.sentence).toContain("unproven");
  });
});

describe("peakHourFactor and localMinutesOfDay", () => {
  it("reads minutes from local midnight out of the ISO string, with no clock", () => {
    expect(localMinutesOfDay("2026-01-15T09:30:00.000Z")).toBe(570);
    expect(localMinutesOfDay("2026-01-15T00:00:00.000Z")).toBe(0);
    expect(localMinutesOfDay("2026-01-15T23:59:00.000Z")).toBe(1439);
  });

  it("falls back to 0 for an unparseable time rather than NaN", () => {
    expect(localMinutesOfDay("not a date")).toBe(0);
    expect(localMinutesOfDay("")).toBe(0);
  });

  it("is 1.0 at the record's best time and 0.4 at the opposite end", () => {
    expect(peakHourFactor("2026-01-15T09:30:00.000Z", "morning")).toBe(1);
    expect(peakHourFactor("2026-01-15T19:00:00.000Z", "morning")).toBe(0.4);
    expect(peakHourFactor("2026-01-15T19:00:00.000Z", "evening")).toBe(1);
    expect(peakHourFactor("2026-01-15T14:00:00.000Z", "evening")).toBe(0.7);
  });

  it("is 1 for any time of day, because a record with no preference has no opposite", () => {
    expect(peakHourFactor("2026-01-15T23:00:00.000Z", "any")).toBe(1);
    expect(peakHourFactor("2026-01-15T09:30:00.000Z", "any")).toBe(1);
  });
});

describe("purity of the component layer", () => {
  it("produces the same numbers on a second identical call", () => {
    const ctx = makeContext();
    const stop = makeStop();
    const first = scoreStop(stop, ctx, START);
    const second = scoreStop(stop, ctx, START);
    expect(second).toEqual(first);
  });

  it("reads the weight straight off the profile, because the contract states W.c_i * U_i", () => {
    const stop = makeStop();
    const raw = {
      interest: 1, rating: 0.55, value: 0.6, authenticity: 0.7, weather: 0.5,
      crowd: 0.6, novelty: 0.45, groupFit: 0.8, travelFriction: 0.7, reliability: 0.25,
      travelPenalty: 0.004, pacePenalty: 0.35,
    };
    const components = scoreStop(stop, makeContext({ profile: makeProfile({ weights: raw }) }), START);
    expect(byId(components, "interest").weight).toBe(1);
    expect(byId(components, "interest").contribution).toBeCloseTo(0.6, 12);
    expect(byId(components, "reliability").weight).toBe(0.25);
  });
});
