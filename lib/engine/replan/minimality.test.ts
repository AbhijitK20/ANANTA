import { describe, expect, it } from "vitest";
import type { Objective, Stop } from "@/lib/engine/contracts";
import { objectiveFast } from "@/lib/engine/scoring";
import { validate } from "@/lib/engine/validation";
import { MAX_EXTRA_REMOVALS, minimalSwapSet, planId, walkLadder } from "./minimality";
import type { RelaxFn } from "./minimality";
import { countSubstitutions } from "./swap";
import { makeContext, makeDeps, makePlan, makeRecord, resetRecords, soldOut, driftProbe, UPSTREAM_AGREES } from "./fixtures.test";

/**
 * A ladder that declines every relaxation. The minimality search is about
 * finding the smallest fix, and letting another stage rescue an infeasible
 * attempt first would hide whether the search did its job. The real ladder runs
 * by default and is exercised through `applyTrigger` in replan.test.ts.
 */
const decline: RelaxFn = () => null;

const feasible = (stops: readonly Stop[], ctx: ReturnType<typeof makeContext>, fast: Objective): boolean =>
  validate([...stops], ctx, fast).ok;

/**
 * Everything below asserts on `validate`, so it asserts on the two objective
 * implementations agreeing. When they disagree, `validate` rejects every plan
 * and "the smallest fix" has no meaning. The one always-on test above names the
 * defect with its exact numbers instead of letting a dozen suites fail vaguely.
 */
describe.skipIf(!UPSTREAM_AGREES)("minimalSwapSet", () => {
  it("stops at one swap when one swap is enough", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 700 });
    const b = makeRecord({ id: "b", name: "Market B", priceInr: 700 });
    const c = makeRecord({ id: "c", name: "Garden C", priceInr: 0, category: "Garden" });
    const d = makeRecord({ id: "d", name: "Trail D", priceInr: 0, category: "Trail" });
    const all = [a, b, c, d];

    const ctx = makeContext({ partySize: 1, budgetInr: 1000, availableMinutes: 600, idealStops: 4 });
    const plan = makePlan(ctx, all, ["a", "b"]);
    const result = minimalSwapSet(plan, ctx, [c, d], makeDeps(all), decline);

    // 1 attempt at size 0, 2 at size 1, and size 1 is the first that validates.
    expect(result.attempts).toBe(3);
    expect(result.size).toBe(1);
    expect(result.forced).toEqual([]);
    expect(countSubstitutions(result.swaps)).toBe(1);
    expect(countSubstitutions(result.swaps)).not.toBe(2);
    expect(["a", "b"]).toContain(result.swaps.find((s) => s.removedId !== null)?.removedId);
    expect(result.swaps.every((s) => s.reason.length > 20 && /\d/.test(s.reason))).toBe(true);
    expect(feasible(result.plan.stops, ctx, result.plan.objective)).toBe(true);
  });

  it("stops at two swaps when one cannot fit, and never looks at three", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 700, category: "Gallery" });
    const b = makeRecord({ id: "b", name: "Market B", priceInr: 700, category: "Market" });
    const c = makeRecord({ id: "c", name: "Garden C", priceInr: 700, category: "Garden" });
    const d = makeRecord({ id: "d", name: "Trail D", priceInr: 0, category: "Trail" });
    const e = makeRecord({ id: "e", name: "Cafe E", priceInr: 0, category: "Cafe" });
    const all = [a, b, c, d, e];

    const ctx = makeContext({ partySize: 1, budgetInr: 1000, availableMinutes: 600, idealStops: 5 });
    const plan = makePlan(ctx, all, ["a", "b", "c"]);
    const result = minimalSwapSet(plan, ctx, [d, e], makeDeps(all), decline);

    // 1 at size 0, 3 at size 1, 3 at size 2. Size 2 is the first that validates.
    expect(MAX_EXTRA_REMOVALS).toBe(2);
    expect(result.attempts).toBe(7);
    expect(result.size).toBe(2);
    expect(countSubstitutions(result.swaps)).toBe(2);
    expect(countSubstitutions(result.swaps)).not.toBe(3);
    expect(feasible(result.plan.stops, ctx, result.plan.objective)).toBe(true);
  });

  it("fixes two simultaneous closures as one plan, not two independent swaps", () => {
    resetRecords();
    const soldOne = makeRecord({ id: "s1", name: "Sold One", priceInr: 500, availability: soldOut() });
    const soldTwo = makeRecord({ id: "s2", name: "Sold Two", priceInr: 500, availability: soldOut() });
    const kept = makeRecord({ id: "k", name: "Kept Stop", priceInr: 0, category: "Garden" });
    const only = makeRecord({ id: "r", name: "Only Replacement", priceInr: 0, category: "Trail" });
    const dear = makeRecord({ id: "q", name: "Dear Replacement", priceInr: 900, category: "Cafe" });
    const all = [soldOne, soldTwo, kept, only, dear];

    // One free replacement, and one that does not fit. Solved one at a time,
    // both closures reach for the same record and the pair is never checked.
    const ctx = makeContext({ partySize: 1, budgetInr: 1000, availableMinutes: 600, idealStops: 3 });
    const plan = makePlan(ctx, all, ["s1", "s2", "k"]);
    const result = minimalSwapSet(plan, ctx, [only, dear], makeDeps(all), decline);

    // Both failures are recognised together, before any search starts.
    expect([...result.forced].sort()).toEqual(["s1", "s2"]);

    const ids = result.plan.stops.map((stop) => stop.record.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("s1");
    expect(ids).not.toContain("s2");
    expect(ids).toContain("k");
    expect(
      result.swaps
        .filter((s) => s.removedId !== null)
        .map((s) => s.removedId)
        .sort(),
    ).toEqual(["s1", "s2"]);
    // The plan that comes back is one that has been through validation.
    expect(feasible(result.plan.stops, ctx, result.plan.objective)).toBe(true);
  });

  it("says so in plain language instead of throwing when nothing fits", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 400 });
    const b = makeRecord({ id: "b", name: "Market B", priceInr: 400 });
    const all = [a, b];

    // A budget nothing can be bought inside, and nothing in the catalogue.
    const ctx = makeContext({ partySize: 1, budgetInr: 0, availableMinutes: 600, idealStops: 2 });
    const plan = makePlan(ctx, all, ["a", "b"]);

    const result = minimalSwapSet(plan, ctx, [], makeDeps(all), decline);

    expect(result.plan.stops).toEqual([]);
    expect(countSubstitutions(result.swaps)).toBe(2);
    expect(result.rungs.length).toBeGreaterThan(0);
    for (const swap of result.swaps) {
      expect(swap.reason).toMatch(/\d/);
      expect(swap.reason.length).toBeGreaterThan(20);
      expect(swap.reason).not.toContain("\u2014");
    }
    expect(result.note.length).toBeGreaterThan(20);
  });
});

describe("the check this stage stands on", () => {
  it("has the two objective implementations agreeing to 1e-6", () => {
    const probe = driftProbe();
    expect(
      probe.drift,
      `objectiveFast is ${probe.fast} and objectiveNaive is ${probe.naive}, so validate() rejects every plan. Sessions 4 and 6 own both files.`,
    ).toBeLessThanOrEqual(1e-6);
  });
});

describe.skipIf(!UPSTREAM_AGREES)("walkLadder", () => {
  it("walks to single_best when a plan has to be cut down", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 400 });
    const b = makeRecord({ id: "b", name: "Market B", priceInr: 400 });
    const all = [a, b];
    const ctx = makeContext({ partySize: 1, budgetInr: 500, availableMinutes: 600, idealStops: 2 });
    const plan = makePlan(ctx, all, ["a", "b"]);

    expect(feasible(plan.stops, ctx, plan.objective)).toBe(false);

    const walked = walkLadder(plan.stops, ctx, decline);
    expect(walked.rungs).toEqual(["strict", "single_best"]);
    expect(walked.rungs[walked.rungs.length - 1]).toBe("single_best");
    expect(walked.stops.length).toBe(1);
    expect(walked.ok).toBe(true);
    expect(walked.note).toContain("single best stop");
    // The objective handed to `validate` has to be the one derived from these
    // stops. `plan.objective` is the two stop plan's, and `validate` reads its
    // argument for the drift figure, so pairing it with a one stop plan asks
    // whether 7.098 and 3.620 are the same number and gets a truthful no.
    expect(feasible(walked.stops, ctx, objectiveFast(walked.stops, ctx))).toBe(true);
    expect(feasible(walked.stops, ctx, plan.objective)).toBe(false);
  });

  it("keeps the stops that still fit when a shrunken window busts the whole plan", () => {
    // A 228 minute plan against a 190 minute window. `checkTime` holds one
    // record's own leg plus its visit plus the buffer against all 190 minutes,
    // so every stop is individually "over budget" and the forced pass used to
    // take all three. The plan's own first two stops fit in 152 minutes and
    // validate, so the smallest fix is one removal, not a full repack.
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 0, category: "Gallery", travelMinutes: 100 });
    const b = makeRecord({ id: "b", name: "Market B", priceInr: 0, category: "Market", travelMinutes: 100 });
    const c = makeRecord({ id: "c", name: "Garden C", priceInr: 0, category: "Garden", travelMinutes: 100 });
    const d = makeRecord({ id: "d", name: "Trail D", priceInr: 0, category: "Trail", travelMinutes: 100 });
    const all = [a, b, c, d];

    const wide = makeContext({ partySize: 1, budgetInr: 1000, availableMinutes: 600, idealStops: 3, minStops: 1 });
    const plan = makePlan(wide, all, ["a", "b", "c"]);
    const narrow = makeContext({ partySize: 1, budgetInr: 1000, availableMinutes: 190, idealStops: 3, minStops: 1 });
    expect(feasible(plan.stops, wide, plan.objective)).toBe(true);
    expect(feasible(plan.stops, narrow, objectiveFast(plan.stops, narrow))).toBe(false);

    const result = minimalSwapSet(plan, narrow, [d], makeDeps(all), decline);

    // No single stop is impossible, so nothing is forced and the size ladder
    // does the work the stage exists to do. Before the fix the forced pass took
    // all three and offered the unrelated stop `d` with a size of 0.
    expect(result.forced).toEqual([]);
    expect(result.size).toBe(1);
    const ids = result.plan.stops.map((stop) => stop.record.id);
    expect(ids).toEqual(["a", "b"]);
    expect(ids).not.toContain("d");
    expect(result.note).toContain("0 stops the new limits rule out and 1 swap on top");
    expect(feasible(result.plan.stops, narrow, result.plan.objective)).toBe(true);
  });

  it("stops at strict when the plan is already valid", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 100 });
    const ctx = makeContext({ partySize: 1, budgetInr: 1000, availableMinutes: 600, idealStops: 1 });
    const plan = makePlan(ctx, [a], ["a"]);
    const walked = walkLadder(plan.stops, ctx, decline);
    expect(walked.rungs).toEqual(["strict"]);
    expect(walked.ok).toBe(true);
  });

  it("records the rungs session 6 walks, in order", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 400 });
    const b = makeRecord({ id: "b", name: "Market B", priceInr: 400 });
    const all = [a, b];
    const ctx = makeContext({ partySize: 1, budgetInr: 700, availableMinutes: 600, idealStops: 2 });
    const plan = makePlan(ctx, all, ["a", "b"]);
    expect(feasible(plan.stops, ctx, plan.objective)).toBe(false);

    const oneStep: RelaxFn = (stops) => ({
      stops: [stops[0]],
      rung: "dropped_minimum",
      note: "Minimum stops dropped to 1.",
    });
    const walked = walkLadder(plan.stops, ctx, oneStep);
    expect(walked.rungs).toEqual(["strict", "dropped_minimum"]);
    expect(walked.stops).toHaveLength(1);
    expect(walked.ok).toBe(true);
    expect(walked.note).toBe("Minimum stops dropped to 1.");
  });
});

describe("planId", () => {
  it("is a function of the context and the stop order, and nothing else", () => {
    resetRecords();
    const a = makeRecord({ id: "a" });
    const b = makeRecord({ id: "b" });
    const ctx = makeContext();
    const first = makePlan(ctx, [a, b], ["a", "b"]);
    const second = makePlan(ctx, [a, b], ["a", "b"]);
    const flipped = makePlan(ctx, [a, b], ["b", "a"]);

    expect(planId(ctx, first.stops)).toBe(planId(ctx, second.stops));
    expect(planId(ctx, first.stops)).not.toBe(planId(ctx, flipped.stops));
    expect(planId(ctx, first.stops)).toMatch(/^plan-[0-9a-f]{8}$/);
    expect(planId(ctx, first.stops)).not.toBe(planId(makeContext({ partySize: 1, budgetInr: 2000 }), first.stops));
  });
});
