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
    // Pinned against clampWeights(PRIOR_WEIGHTS), the cold start, which divides
    // the ten raw weights by their 6.15 sum. The default record is a 0.6 stated
    // interest, a 0.739 Wilson bound over 60 reviews, a 200 INR price against a
    // 1000 INR budget for one person, indoor in clear weather, and at the origin.
    // crowd and novelty are carried for the panel but are aggregate only, so
    // objectiveFast does not add them to the utility sum.
    const components = scoreStop(makeStop(), makeContext(), START);
    expect(byId(components, "interest").contribution).toBeCloseTo(0.03252032520325203, 12);
    expect(byId(components, "rating").contribution).toBeCloseTo(0.06611556579122596, 12);
    expect(byId(components, "value").contribution).toBeCloseTo(0.0975609756097561, 12);
    expect(byId(components, "authenticity").contribution).toBeCloseTo(0.10243902439024391, 12);
    expect(byId(components, "weather").contribution).toBeCloseTo(0.032520325203252036, 12);
    expect(byId(components, "crowd").contribution).toBeCloseTo(-0.039024390243902446, 12);
    expect(byId(components, "novelty").contribution).toBeCloseTo(0.07317073170731708, 12);
    expect(byId(components, "groupFit").contribution).toBe(0);
    expect(byId(components, "travelFriction").contribution).toBeCloseTo(0.11382113821138212, 12);
    expect(byId(components, "reliability").contribution).toBeCloseTo(0.032520325203252036, 12);
  });
});

describe("interest", () => {
  it("rescales the stated weight for the record's own category onto minus 1 to 1", () => {
    // cafes 0.6 of a total profile weight of 1.0, so (0.6 - 0.5) * 2.
    const components = scoreStop(makeStop({ category: "cafes" }), makeContext(), START);
    expect(byId(components, "interest").normalised).toBeCloseTo(0.2, 12);
  });

  it("puts a strong interest at 1 and a mid interest at the midpoint", () => {
    const ctx = makeContext();
    const strong = makeContext({ profile: makeProfile({ interests: { cafes: 1 } }) });
    const half = makeContext({ profile: makeProfile({ interests: { cafes: 0.75 } }) });
    expect(byId(scoreStop(makeStop(), strong, START), "interest").normalised).toBeCloseTo(1, 12);
    expect(byId(scoreStop(makeStop(), half, START), "interest").normalised).toBeCloseTo(0.5, 12);
    expect(byId(scoreStop(makeStop(), ctx, START), "interest").normalised).toBeCloseTo(0.2, 12);
  });

  it("matches the category without regard to case, so a capitalised taxonomy still scores", () => {
    const ctx = makeContext();
    const profile = makeProfile({ interests: { Culture: 0.9, Food: 0.7 } });
    const scoped = { ...ctx, profile };
    expect(byId(scoreStop(makeStop({ category: "Culture" }), scoped, START), "interest").normalised).toBeCloseTo(0.8, 12);
    expect(byId(scoreStop(makeStop({ category: "culture" }), scoped, START), "interest").normalised).toBeCloseTo(0.8, 12);
    expect(byId(scoreStop(makeStop({ category: "CULTURE" }), scoped, START), "interest").normalised).toBeCloseTo(0.8, 12);
  });

  // KNOWN PRODUCTION BUG. objective-spec.md section 4 says an unlisted category is
  // `interests[category] ?? 0.5` and scores 0, "not disliked, not wanted".
  // components.ts now returns `undefined` for a missing key, so the `?? 0.5`
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
    // (0.6 - 0.5) * 2 - 0.3.
    expect(byId(components, "interest").normalised).toBeCloseTo(-0.1, 12);
  });

  it("counts minus 1 when the profile expresses no interests at all", () => {
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
  it("scores 0 when the price is half the per person budget, the midpoint of the range", () => {
    const ctx = makeContext({ budgetInr: 1000, partySize: 1 });
    const components = scoreStop(makeStop({ pricePerPersonInr: 500 }), ctx, START);
    expect(byId(components, "value").normalised).toBeCloseTo(0, 12);
  });

  it("scores 1 when the price is a quarter of the per person budget", () => {
    const ctx = makeContext({ budgetInr: 1000, partySize: 1 });
    const components = scoreStop(makeStop({ pricePerPersonInr: 250 }), ctx, START);
    expect(byId(components, "value").normalised).toBeCloseTo(1, 12);
  });

  it("divides the budget across the party before comparing per person prices", () => {
    const ctx = makeContext({ budgetInr: 1000, partySize: 4 });
    // 250 per person, and the price is 250 each, so the ratio is 1 and the score
    // is 1 / 4 * 2 - 1.
    const same = scoreStop(makeStop({ pricePerPersonInr: 250 }), ctx, START);
    expect(byId(same, "value").normalised).toBeCloseTo(-0.5, 12);
    // Half the per person budget stays the midpoint whatever the party size.
    const half = scoreStop(makeStop({ pricePerPersonInr: 125 }), ctx, START);
    expect(byId(half, "value").normalised).toBeCloseTo(0, 12);
  });

  it("counts a genuinely free place as the best value there is", () => {
    const ctx = makeContext({ budgetInr: 1000, partySize: 1 });
    const components = scoreStop(makeStop({ pricePerPersonInr: 0 }), ctx, START);
    const value = byId(components, "value");
    expect(value.normalised).toBe(1);
    expect(value.sentence).toContain("free");
  });

  it("scores 0 when the per person price is unknown, claiming nothing either way", () => {
    const components = scoreStop(makeStop({ pricePerPersonInr: null }), makeContext(), START);
    const value = byId(components, "value");
    expect(value.normalised).toBe(0);
    expect(value.sentence).toContain("No per person price");
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

  it("clamps to minus 1 and 1 at the ends of the range rather than going unbounded", () => {
    const broke = makeContext({ budgetInr: 10, partySize: 1 });
    // 10 of a 1000 budget against a 500 price is a ratio of 0.02, so 0.02 / 4 * 2 - 1.
    expect(byId(scoreStop(makeStop({ pricePerPersonInr: 500 }), broke, START), "value").normalised).toBeCloseTo(-0.99, 12);
    const rich = makeContext({ budgetInr: 100000, partySize: 1 });
    expect(byId(scoreStop(makeStop({ pricePerPersonInr: 200 }), rich, START), "value").normalised).toBe(1);
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
  it("scores 0 when the weather is unknown, because a neutral score would be a claim", () => {
    const components = scoreStop(makeStop(), makeContext({ weatherSeverity: null }), START);
    const weather = byId(components, "weather");
    expect(weather.normalised).toBe(0);
    expect(weather.contribution).toBe(0);
    expect(weather.sentence).toContain("Weather is unknown");
  });

  it("rewards outdoor in clear weather and indoor in rain", () => {
    const clear = makeContext({ weatherSeverity: "clear" });
    expect(byId(scoreStop(makeStop({ indoor: "outdoor" }), clear, START), "weather").normalised).toBe(1);
    expect(byId(scoreStop(makeStop({ indoor: "indoor" }), clear, START), "weather").normalised).toBe(0.4);
    const rain = makeContext({ weatherSeverity: "rain" });
    expect(byId(scoreStop(makeStop({ indoor: "indoor" }), rain, START), "weather").normalised).toBe(1);
    expect(byId(scoreStop(makeStop({ indoor: "outdoor" }), rain, START), "weather").normalised).toBe(0.2);
  });

  it("copies the spec table verbatim, so an outdoor place takes the full penalty in a storm", () => {
    const table = {
      clear: { indoor: 0.4, outdoor: 1, mixed: 0.7 },
      rain: { indoor: 1, outdoor: 0.2, mixed: 0.6 },
      heavy_rain: { indoor: 1, outdoor: -1, mixed: -0.4 },
      storm: { indoor: 0.8, outdoor: -1, mixed: -0.5 },
    };
    for (const severity of ["clear", "rain", "heavy_rain", "storm"] as const) {
      for (const indoor of ["indoor", "outdoor", "mixed"] as const) {
        const ctx = makeContext({ weatherSeverity: severity });
        const normalised = byId(scoreStop(makeStop({ indoor }), ctx, START), "weather").normalised;
        expect(normalised, `${severity} ${indoor}`).toBe(table[severity][indoor]);
      }
    }
  });

  it("punishes outdoor harder the worse the weather, down to a full minus 1", () => {
    const outdoor = (severity: "clear" | "rain" | "heavy_rain" | "storm") =>
      byId(scoreStop(makeStop({ indoor: "outdoor" }), makeContext({ weatherSeverity: severity }), START), "weather").normalised;
    expect(outdoor("rain")).toBeLessThan(outdoor("clear"));
    expect(outdoor("heavy_rain")).toBeLessThan(outdoor("rain"));
    expect(outdoor("storm")).toBe(-1);
    // A storm and heavy rain both bottom an outdoor record out, so neither is
    // worse than the other.
    expect(outdoor("storm")).toBe(outdoor("heavy_rain"));
  });

  it("says the weather and the place type in the sentence", () => {
    const components = scoreStop(makeStop({ indoor: "mixed" }), makeContext({ weatherSeverity: "heavy_rain" }), START);
    expect(byId(components, "weather").sentence).toBe("Heavy rain weather, mixed place, weather fit -0.40.");
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
    // Stroller access is unrecorded in both, so the only signal is kid
    // friendliness: plus 1 and minus 1, symmetric and unclamped.
    const good = byId(scoreStop(makeStop({ kidFriendly: true, access: {} }), ctx, START), "groupFit");
    const bad = byId(scoreStop(makeStop({ kidFriendly: false, access: {} }), ctx, START), "groupFit");
    expect(good.normalised).toBe(1);
    expect(bad.normalised).toBe(-1);
  });

  it("reads stroller access separately, at half the weight of kid friendliness", () => {
    const ctx = makeContext({ hasToddler: true });
    const yes = byId(scoreStop(makeStop({ kidFriendly: null, access: { stroller_ok: true } }), ctx, START), "groupFit");
    const no = byId(scoreStop(makeStop({ kidFriendly: null, access: { stroller_ok: false } }), ctx, START), "groupFit");
    expect(yes.normalised).toBe(0.5);
    expect(no.normalised).toBe(-0.5);
  });

  it("skips the toddler signal, without pushing either way, when kid friendliness is unknown", () => {
    const ctx = makeContext({ hasToddler: true });
    const unknown = byId(scoreStop(makeStop({ kidFriendly: null, access: {} }), ctx, START), "groupFit");
    expect(unknown.normalised).toBe(0);
    expect(unknown.sentence).toContain("unrecorded");
  });

  it("rewards a low walking record for an elderly traveller and penalises one that is not", () => {
    const ctx = makeContext({ hasElderly: true });
    const easy = byId(scoreStop(makeStop({ access: { low_walking: true } }), ctx, START), "groupFit");
    const hard = byId(scoreStop(makeStop({ access: { low_walking: false } }), ctx, START), "groupFit");
    expect(easy.normalised).toBe(1);
    expect(hard.normalised).toBe(-1);
    // A null fact never scores against the group, only a recorded false does.
    const unknown = byId(scoreStop(makeStop({ access: {} }), ctx, START), "groupFit");
    expect(unknown.normalised).toBe(0);
  });

  it("rewards seats for the party and penalises a room too small, and says nothing about an unknown capacity", () => {
    const ctx = makeContext({ partySize: 4 });
    const roomy = byId(scoreStop(makeStop({ capacity: 20 }), ctx, START), "groupFit");
    const cramped = byId(scoreStop(makeStop({ capacity: 2 }), ctx, START), "groupFit");
    const unknown = byId(scoreStop(makeStop({ capacity: null }), ctx, START), "groupFit");
    expect(roomy.normalised).toBe(0.25);
    expect(cramped.normalised).toBe(-1);
    expect(unknown.normalised).toBe(0);
  });

  it("ignores diet entirely, because the gate has already applied it", () => {
    const ctx = makeContext({ diets: ["vegan", "nut_free"] });
    const all = byId(scoreStop(makeStop({ diets: ["vegan", "nut_free"] }), ctx, START), "groupFit");
    const none = byId(scoreStop(makeStop({ diets: ["halal"] }), ctx, START), "groupFit");
    // Diet is a hard gate, so a record that fails it never reaches the objective
    // and scoring it here as well would charge twice for one fact.
    expect(all.normalised).toBe(0);
    expect(none.normalised).toBe(0);
  });
});

describe("travelFriction", () => {
  it("is 1 at zero distance, and does not special case the first stop", () => {
    const components = scoreStop(makeStop({}, { minutes: 0, km: 0 }), makeContext(), START);
    const friction = byId(components, "travelFriction");
    expect(friction.normalised).toBe(1);
    expect(friction.sentence).toContain("0 km away");
  });

  it("is 1 over 1 plus the kilometres, and is positive signed", () => {
    const ctx = makeContext({ availableMinutes: 300 });
    const components = scoreStop(makeStop({}, { minutes: 25, km: 3 }), ctx, { index: 1, prior: [makeStop()] });
    const friction = byId(components, "travelFriction");
    expect(friction.normalised).toBeCloseTo(0.25, 12);
    // Positive: distance is charged once already, quadratically, by
    // superlinearTravel, so a long journey to a good place is not a bad journey.
    expect(friction.contribution).toBeGreaterThan(0);
  });

  it("reads how far, not how slow, so the same kilometres cost the same either way", () => {
    const ctx = makeContext();
    const at = (minutes: number) =>
      byId(scoreStop(makeStop({}, { minutes, km: 3 }), ctx, { index: 1, prior: [makeStop()] }), "travelFriction").normalised;
    expect(at(25)).toBe(at(90));
  });

  it("decays with distance and never reaches zero", () => {
    const ctx = makeContext();
    const at = (km: number) => byId(scoreStop(makeStop({}, { minutes: 10, km }), ctx, { index: 1, prior: [makeStop()] }), "travelFriction").normalised;
    expect(at(0)).toBe(1);
    expect(at(1)).toBeCloseTo(0.5, 12);
    expect(at(9)).toBeCloseTo(0.1, 12);
    expect(at(1000)).toBeGreaterThan(0);
  });

  it("does not read the available window at all, so a zero window cannot divide by zero", () => {
    const stop = makeStop({}, { minutes: 30, km: 4 });
    const zeroWindow = byId(scoreStop(stop, makeContext({ availableMinutes: 0 }), { index: 1, prior: [makeStop()] }), "travelFriction");
    const wideWindow = byId(scoreStop(stop, makeContext({ availableMinutes: 600 }), { index: 1, prior: [makeStop()] }), "travelFriction");
    expect(zeroWindow.normalised).toBe(wideWindow.normalised);
    expect(zeroWindow.normalised).toBeCloseTo(0.2, 12);
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

  it("is 1.0 at the record's best time and 0.4 at the opposite end of the day", () => {
    expect(peakHourFactor("2026-01-15T09:30:00.000Z", "morning")).toBe(1);
    // Night is the farthest slot from morning on a linear scale, three away, so
    // t is 1 and the factor bottoms out at 0.4.
    expect(peakHourFactor("2026-01-15T02:00:00.000Z", "morning")).toBeCloseTo(0.4, 12);
    expect(peakHourFactor("2026-01-15T19:00:00.000Z", "evening")).toBe(1);
    // Linear, not circular: 0.8 one slot away, 0.6 two slots away.
    expect(peakHourFactor("2026-01-15T14:00:00.000Z", "evening")).toBeCloseTo(0.8, 12);
    expect(peakHourFactor("2026-01-15T09:30:00.000Z", "evening")).toBeCloseTo(0.6, 12);
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
    // The ten raw weights sum to 6.15, so a hidden clamp to a partition would
    // divide every one of these by 6.15 and break both assertions below.
    expect(byId(components, "interest").weight).toBe(1);
    expect(byId(components, "interest").contribution).toBeCloseTo(0.2, 12);
    expect(byId(components, "authenticity").weight).toBe(0.7);
    expect(byId(components, "authenticity").contribution).toBeCloseTo(0.63, 12);
    expect(byId(components, "reliability").weight).toBe(0.25);
  });
});
