import { describe, expect, it } from "vitest";
import { MUMBAI_MANIFEST, type DiscoveryContext } from "@/lib/engine";
import { buildContext, applyNamedTrigger, diffAgainstOriginal, countSubstitutions, planMinutes } from "@/components/ananta/replan/engine";
import { intentDrift, preservedIntent, soldOutStops, availabilityState } from "@/components/ananta/replan/intent";
import { TRIGGER_CONTROLS, TRIGGER_ORDER } from "@/components/ananta/replan/triggers";
import { replanWith } from "@/components/ananta/replan/replan-with";
import { solveStages } from "@/components/ananta/replan/states-core";
import { makePlan, makeStops } from "./fixtures";
describe("the sold-out state is a fact with a timestamp, taken from the record", () => {
  it("finds the sold-out stop and nothing else", () => {
    const stops = makeStops().map((s) =>
      s.record.id === "girgaon-chowpatty-snack-trail"
        ? { ...s, record: { ...s.record, availability: { ...s.record.availability, soldOutAt: "2026-09-26T11:30:00+05:30" } } }
        : s,
    );
    const states = soldOutStops(stops);
    expect(states).toHaveLength(1);
    expect(states[0].name).toBe("Girgaon Chowpatty Snack Trail");
    expect(states[0].soldOutLabel).toBe("26/09 11:30 AM");
    expect(states[0].isSoldOut).toBe(true);
  });

  it("reads a record with no sold-out slot as not sold out, booking link unknown", () => {
    const state = availabilityState(makeStops()[0]);
    expect(state.isSoldOut).toBe(false);
    expect(state.soldOutLabel).toBeNull();
    expect(state.bookingUrl).toBeNull();
  });
});

describe("solving names the stage and a count, never a bare spinner", () => {
  it("carries a count per stage once run", () => {
    const stages = solveStages({ retrieved: 120, considered: 1090, passed: 23, refused: 97, packed: 3, drift: 0 });
    expect(stages.map((stage) => stage.label)).toEqual(["Retrieve", "Gate", "Score", "Pack", "Validate", "Relax"]);
    expect(stages[0].detail).toBe("120 of 1090 records reached the gate");
    expect(stages[1].detail).toBe("23 passed, 97 refused with a stated reason");
    expect(stages[3].detail).toBe("3 stops in the packed order");
    expect(stages[4].detail).toBe("objective re-derived independently, drift 0.0e+0");
  });

  it("says not-run-yet rather than inventing a number", () => {
    const pending = solveStages({ retrieved: null, considered: null, passed: null, refused: null, packed: null, drift: null });
    expect(pending.every((stage) => stage.detail === "not run yet")).toBe(true);
    expect(pending.every((stage) => stage.done === false)).toBe(true);
  });
});

/**
 * The intent-preservation test. The brief calls this the most important thing to
 * verify, so it is an assertion rather than a demo step.
 *
 * The claim under test: a trigger changes the world, never the traveller. Fire
 * all six and assert that nothing a trigger did reaches `ctx.original` or the
 * traveller's stated preferences. If that ever breaks, the product is quietly
 * rewriting what somebody asked for, which is the failure the masterplan names.
 */

const WEIGHTS = {
  interest: 1, rating: 0.8, value: 0.7, authenticity: 0.6, weather: 0.9, crowd: 0.6,
  novelty: 0.8, groupFit: 0.8, travelFriction: 0.5, reliability: 0.5,
  travelPenalty: 0.012, pacePenalty: 0.7,
};

const BASE = {
  now: "2026-09-26T10:00:00+05:30",
  origin: { coordinates: [72.82339, 18.93367] as [number, number], label: "Marine Drive promenade", area: "Churchgate" },
  availableMinutes: 240,
  deadline: "2026-09-26T14:00:00+05:30",
  budgetInr: 1500,
  partySize: 2,
  hasToddler: true,
  hasElderly: false,
  raining: false,
  weatherSeverity: null,
  travelMode: "walk" as const,
  pace: "normal" as const,
  idealStops: 3,
  minStops: 1,
  accessNeeds: [] as DiscoveryContext["accessNeeds"],
  diets: ["vegetarian"] as DiscoveryContext["diets"],
  query: "culture and food",
  profile: {
    id: "demo-traveller",
    interests: { culture: 0.8, food: 0.6 },
    avoid: { shopping: 0.9 },
    accessibility: [] as DiscoveryContext["profile"]["accessibility"],
    diets: ["vegetarian"] as DiscoveryContext["profile"]["diets"],
    excludes: ["a-record-they-hated"],
    pins: [] as string[],
    weights: WEIGHTS,
    bandit: { arms: [], observations: 0, updatedAt: "2026-09-26T10:00:00+05:30" },
  },
  city: MUMBAI_MANIFEST,
};

const ctx = buildContext(BASE, MUMBAI_MANIFEST);
const anonymous = buildContext({ ...BASE, query: "", profile: { ...BASE.profile, interests: {} } }, MUMBAI_MANIFEST);

describe("every trigger preserves the traveller's stated intent", () => {
  it("covers all six, and every control names what it will simulate", () => {
    expect(TRIGGER_ORDER).toEqual([
      "rain_started", "time_lost", "sold_out", "budget_dropped", "needs_restroom", "tired",
    ]);
    for (const control of TRIGGER_CONTROLS) {
      expect(control.simulates.length).toBeGreaterThan(40);
      expect(control.event.length).toBeGreaterThan(0);
      expect(control.label.length).toBeGreaterThan(0);
    }
  });

  it("never lets a trigger's effect reach what the traveller said they wanted", () => {
    expect(Object.isFrozen(ctx.original)).toBe(true);
    for (const id of TRIGGER_ORDER) {
      const after = applyNamedTrigger(ctx, id);
      expect(after.original).toBe(ctx.original);
      // Stated preferences are byte identical before and after.
      expect(after.profile.avoid).toEqual(ctx.profile.avoid);
      expect(after.profile.interests).toEqual(ctx.profile.interests);
      expect(after.profile.excludes).toEqual(ctx.profile.excludes);
      expect(after.query).toBe(ctx.query);
      expect(after.diets).toEqual(ctx.diets);
      // At least one real limit moved, or the assertions above prove nothing.
      // `sold_out` is the exception by design: the engine puts that fact on the
      // record, not on the context, and its own test asserts the same thing.
      const moved =
        after.availableMinutes !== ctx.original.availableMinutes ||
        after.budgetInr !== ctx.original.budgetInr ||
        after.idealStops !== ctx.original.idealStops ||
        after.raining !== ctx.original.raining ||
        after.accessNeeds.length !== ctx.original.accessNeeds.length;
      expect({ id, moved }).toEqual({ id, moved: id !== "sold_out" });
    }
  });

  it("does not turn rain into a dislike of rain", () => {
    const after = applyNamedTrigger(ctx, "rain_started");
    expect(after.raining).toBe(true);
    expect(after.weatherSeverity).toBe("rain");
    // The traveller did not decide anything. `lib/engine/replan/context.test.ts`
    // makes this assertion at the engine; the proposal panel reads these same
    // fields, so it is restated at the view boundary.
    expect(after.profile.avoid).toEqual({ shopping: 0.9 });
    expect(Object.keys(after.profile.avoid)).not.toContain("rain");
  });

  it("keeps one baseline through three chained triggers", () => {
    const first = applyNamedTrigger(ctx, "time_lost");
    const second = applyNamedTrigger(first, "tired");
    const third = applyNamedTrigger(second, "budget_dropped");
    expect([first, second, third].map((step) => step.original)).toEqual([ctx.original, ctx.original, ctx.original]);
    expect(third.original.availableMinutes).toBe(240);
    expect(third.original.budgetInr).toBe(1500);
    expect(third.original.idealStops).toBe(3);
  });

  it("takes minutes off the window and pulls the return time in by the same amount", () => {
    const after = applyNamedTrigger(ctx, "time_lost", { minutesLost: 90 });
    expect(after.availableMinutes).toBe(150);
    // Same instant, minus 90 minutes, from the engine's own pull-in helper.
    expect(Date.parse(after.deadline ?? "")).toBe(Date.parse(ctx.deadline ?? "") - 90 * 60_000);
  });

  it("adds the restroom need without touching the stated preference lists", () => {
    const after = applyNamedTrigger(ctx, "needs_restroom");
    expect(after.accessNeeds).toEqual(["accessible_restroom"]);
    expect(after.profile.accessibility).toEqual([]);
    expect(after.profile.avoid).toEqual({ shopping: 0.9 });
  });

  it("treats sold_out as a record fact, so the context half is empty", () => {
    const after = applyNamedTrigger(ctx, "sold_out", { recordId: "x", soldOutAt: "2026-09-26T11:00:00+05:30" });
    expect(after).toEqual({ ...ctx, original: ctx.original });
  });
});describe("the preserved intent panel reads the baseline, not the mutation", () => {
  it("names the goal back from the frozen original", () => {
    const intent = preservedIntent(applyNamedTrigger(ctx, "time_lost"));
    expect(intent.headline).toBe("Preserving your original goal: CULTURE + FOOD");
    expect(intent.unnamedInterest).toBe(false);
    const labels = intent.facets.map((facet) => facet.label);
    expect(labels).toEqual(expect.arrayContaining(["Asked for", "Avoiding", "Window", "Budget", "Who is coming", "Diet", "Stop count"]));
    // The window facet reads the baseline 240, not the mutated 150.
    expect(intent.facets.find((facet) => facet.label === "Window")?.value).toContain("240 minutes");
  });

  it("says plainly when the traveller named no interest at all", () => {
    const intent = preservedIntent(anonymous);
    expect(intent.unnamedInterest).toBe(true);
    expect(intent.headline).toMatch(/did not name an interest/);
  });
});

describe("a proposal reports its real swap count", () => {
  it("reports zero swaps when nothing moved", () => {
    const plan = makePlan();
    expect(diffAgainstOriginal(plan, plan, ctx)).toEqual([]);
    expect(countSubstitutions([])).toBe(0);
  });

  it("counts one substitution for one removal and one addition", () => {
    const before = makePlan(makeStops().slice(0, 2));
    const after = makePlan([makeStops()[0], makeStops()[2]]);
    const swaps = diffAgainstOriginal(before, after, ctx);
    expect(swaps.length).toBeGreaterThan(0);
    expect(countSubstitutions(swaps)).toBe(1);
  });

  it("flags the substitution the masterplan warns about: a category went away", () => {
    const stops = makeStops();
    const drift = intentDrift(makePlan(stops), makePlan([stops[0]]));
    expect(drift.lostCategories).toContain(stops[1].record.category);
    expect(drift.stopped).toBe(3);
    expect(drift.added).toBe(1);
  });

  it("reports no drift when every category survives", () => {
    const stops = makeStops();
    // All three categories survive; only the order changed. That is the case
    // where the panel says "nothing you were going for has been replaced".
    const kept = [stops[2], stops[0], stops[1]];
    expect(intentDrift(makePlan(stops), makePlan(kept)).lostCategories).toEqual([]);
  });

  it("sums plan minutes in index order", () => {
    const stops = makeStops();
    const manual = stops.reduce((sum, s) => sum + s.travelMinutes + s.visitMinutes + s.bufferMinutes, 0);
    expect(planMinutes(stops)).toBe(manual);
  });
});

describe("replanWith is a proposal, never a mutation", () => {  it("returns a new plan and leaves the input plan untouched", () => {
    const before = makePlan();
    const length = before.stops.length;
    const result = replanWith(before, "tired", ctx, (next) => ({
      ...before,
      stops: before.stops.slice(0, 1),
      createdFrom: next,
    }));
    expect(before.stops).toHaveLength(length);
    expect(result.plan).not.toBe(before);
    expect(result.diffedAgainst).toBe("original");
  });

  it("measures the second replan against the original, not against the first result", () => {
    const first = replanWith(makePlan(), "time_lost", ctx, (next) => ({ ...makePlan(), createdFrom: next }));
    const second = replanWith(first.plan, "tired", first.plan.createdFrom, (next) => ({
      ...first.plan,
      stops: first.plan.stops.slice(0, 1),
      createdFrom: next,
    }));
    expect(second.diffedAgainst).toBe("original");
    expect(second.plan.createdFrom.original).toBe(ctx.original);
  });
});
