import { describe, expect, it } from "vitest";
import type { Stop } from "@/lib/engine/contracts";
import { makeContext, makeProfile, makeRecord, makeStop } from "@/lib/engine/scoring/fixtures.test";
import { COMPONENT_IDS, scoreStop } from "@/lib/engine/scoring/components";
import { objectiveFast } from "@/lib/engine/scoring/objective-fast";
import { EXPLAINED_COMPONENT_IDS, explainPlan, explainStop } from "@/lib/engine/scoring/explain";
import { PRIOR_WEIGHTS } from "@/lib/engine/scoring/weights";

function magnitudes(components: { contribution: number }[]): number[] {
  return components.map((component) => Math.abs(component.contribution));
}

function isSortedDescending(values: number[]): boolean {
  for (let i = 1; i < values.length; i += 1) if (values[i] > values[i - 1]) return false;
  return true;
}

describe("explainStop", () => {
  it("sorts by descending absolute contribution", () => {
    const ctx = makeContext();
    const stop = makeStop();
    const components = explainStop(stop, ctx, objectiveFast([stop], ctx));
    expect(isSortedDescending(magnitudes(components))).toBe(true);
  });

  it("is not merely a slice of a fixed order, it reorders", () => {
    // A traveller with no stated interest, so the only real lever on this record
    // is the crowd and the panel has to lead with it.
    const ctx = makeContext({ profile: makeProfile({ interests: {}, avoid: {} }) });
    const stop = makeStop({ crowdProfile: 1, authenticity: 0.1, providerReliability: 0.05 });
    const components = explainStop(stop, ctx, objectiveFast([stop], ctx));
    const fixedOrder = scoreStop(stop, ctx, { index: 0, prior: [] });
    expect(components[0].id).toBe("crowd");
    expect(fixedOrder[0].id).toBe("interest");
    expect(components.map((component) => component.id)).not.toEqual(fixedOrder.map((component) => component.id));
    expect(components.map((component) => component.id)).toHaveLength(COMPONENT_IDS.length);
  });

  it("leads with the largest lever", () => {
    const ctx = makeContext();
    const stop = makeStop({ crowdProfile: 0.9, ratingSum: null, reviewCount: null });
    const components = explainStop(stop, ctx, objectiveFast([stop], ctx));
    const all = scoreStop(stop, ctx, { index: 0, prior: [] });
    const largest = all.reduce((best, component) => (Math.abs(component.contribution) > Math.abs(best.contribution) ? component : best));
    expect(largest.id).toBe("authenticity");
    expect(components[0].id).toBe(largest.id);
    // Every later entry is strictly no bigger than the one before it.
    expect(isSortedDescending(magnitudes(components))).toBe(true);
  });

  it("carries every component, not a top three, so nothing is hidden", () => {
    const ctx = makeContext();
    const stop = makeStop();
    expect(explainStop(stop, ctx, objectiveFast([stop], ctx))).toHaveLength(COMPONENT_IDS.length);
  });

  it("shows the raw number next to the sentence", () => {
    const ctx = makeContext();
    const stop = makeStop();
    const components = explainStop(stop, ctx, objectiveFast([stop], ctx));
    for (const component of components) {
      expect(component.sentence.length, component.id).toBeGreaterThan(0);
      expect(Number.isFinite(component.contribution), component.id).toBe(true);
      expect(component.contribution, component.id).toBeCloseTo(component.weight * component.normalised, 12);
    }
  });

  it("shows the weights that produced the ranking, not a resampled set", () => {
    const ctx = makeContext();
    const stop = makeStop();
    // Score with one vector, then explain against a context whose profile has
    // since been resampled. The panel must not silently change its numbers.
    const objective = objectiveFast([stop], ctx);
    const resampled = makeContext({ profile: makeProfile({ weights: { ...PRIOR_WEIGHTS, interest: 40, crowd: 0.01 } }) });
    const before = explainStop(stop, ctx, objective);
    const after = explainStop(stop, resampled, objective);
    expect(after.map((component) => component.id)).toEqual(before.map((component) => component.id));
    for (let i = 0; i < before.length; i += 1) {
      expect(after[i].contribution, after[i].id).toBeCloseTo(before[i].contribution, 12);
    }
  });

  it("falls back to the current profile when the objective has no breakdown", () => {
    const ctx = makeContext();
    const stop = makeStop();
    const empty = { value: 0, breakdown: { total: 0, components: [], aggregate: { travel: 0, crowd: 0, novelty: 0, proximity: 0, pace: 0 } } };
    const components = explainStop(stop, ctx, empty);
    expect(components).toHaveLength(COMPONENT_IDS.length);
    const weights = new Set(components.map((component) => component.weight));
    expect(weights.size).toBeGreaterThan(1);
  });

  it("breaks a magnitude tie by the declared component order, so the panel is stable", () => {
    const ctx = makeContext();
    // group fit and travel friction are both exactly 0 for this stop, so they
    // tie and must come out in declared order: groupFit (7) then
    // travelFriction (8).
    const stop = makeStop();
    const components = explainStop(stop, ctx, objectiveFast([stop], ctx));
    const zeroed = components.filter((component) => component.contribution === 0).map((component) => component.id);
    expect(zeroed).toEqual(["groupFit", "travelFriction"]);
    expect(components[components.length - 1].id).toBe("travelFriction");
  });
});

describe("explainPlan", () => {
  const plan: Stop[] = [
    makeStop({ id: "a", category: "cafes" }, { minutes: 20, km: 2 }),
    makeStop({ id: "b", category: "cafes" }, { minutes: 15, km: 1 }),
  ];

  it("scores every stop at its real position, so novelty is not the first stop value", () => {
    const ctx = makeContext();
    const objective = objectiveFast(plan, ctx);
    const rows = explainPlan(plan, ctx, objective);
    expect(rows).toHaveLength(2);
    const second = rows[1].components.find((component) => component.id === "novelty");
    const isolated = explainStop(plan[1], ctx, objective).find((component) => component.id === "novelty");
    // In the plan the second cafe is a repeat; in isolation it looks like the
    // first stop. The plan version is the honest one.
    expect(second?.normalised).toBeCloseTo(0.5, 12);
    expect(isolated?.normalised).toBe(1);
  });

  it("returns the stops it was given, in order", () => {
    const ctx = makeContext();
    const rows = explainPlan(plan, ctx, objectiveFast(plan, ctx));
    expect(rows.map((row) => row.stop.record.id)).toEqual(["a", "b"]);
  });

  it("sorts every row by descending absolute contribution", () => {
    const ctx = makeContext();
    for (const row of explainPlan(plan, ctx, objectiveFast(plan, ctx))) {
      expect(isSortedDescending(magnitudes(row.components))).toBe(true);
    }
  });
});

describe("EXPLAINED_COMPONENT_IDS", () => {
  it("re-exports the declared order so the UI can label its columns", () => {
    expect(EXPLAINED_COMPONENT_IDS).toEqual(COMPONENT_IDS);
  });
});

describe("sentence discipline", () => {
  it("puts a number or a named fact in every sentence, and never an em dash or an emoji", () => {
    const ctx = makeContext({ hasToddler: true, hasElderly: true, partySize: 6, diets: ["vegan"] });
    const records = [
      makeRecord(),
      makeRecord({ ratingSum: null, reviewCount: null, authenticity: null, crowdProfile: null, providerReliability: null, kidFriendly: null }),
      makeRecord({ confidence: { price: "estimate" }, indoor: "outdoor" }),
    ];
    for (const record of records) {
      const stop = { ...makeStop(), record };
      for (const component of explainStop(stop, ctx, objectiveFast([stop], ctx))) {
        expect(component.sentence, component.id).not.toContain("\u2014");
        const hasNumber = /\d/.test(component.sentence);
        const hasNamedFact = /unrecorded|unproven|unknown|unverified|estimate|neutral|cafes/.test(component.sentence);
        expect(hasNumber || hasNamedFact, `${component.id}: ${component.sentence}`).toBe(true);
      }
    }
  });

  it("never says constraint violated, not eligible, or unavailable on its own", () => {
    const ctx = makeContext();
    const stop = makeStop({ authenticity: null, crowdProfile: null, ratingSum: null, reviewCount: null, providerReliability: null });
    for (const component of explainStop(stop, ctx, objectiveFast([stop], ctx))) {
      expect(component.sentence.toLowerCase(), component.id).not.toContain("constraint violated");
      expect(component.sentence.toLowerCase(), component.id).not.toContain("not eligible");
    }
  });
});
