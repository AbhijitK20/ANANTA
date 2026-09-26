import { describe, expect, it } from "vitest";
import type { DiscoveryContext, Plan } from "@/lib/engine/contracts";
import { validate } from "@/lib/engine/validation";
import { deepFreeze } from "./context";
import { applyTrigger } from "./replan";
import { countSubstitutions } from "./swap";
import { applyNamedTrigger } from "./triggers";
import { makeContext, makePlan, makeRecord, resetRecords, UPSTREAM_AGREES } from "./fixtures.test";

const feasible = (plan: Plan, ctx: DiscoveryContext): boolean =>
  validate(plan.stops, ctx, plan.objective).ok;

describe.skipIf(!UPSTREAM_AGREES)("applyTrigger", () => {
  it("proposes a new plan and never touches the one it was given", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 300 });
    const b = makeRecord({ id: "b", name: "Market B", priceInr: 300, category: "Market" });
    const c = makeRecord({ id: "c", name: "Garden C", priceInr: 0, category: "Garden" });
    const all = [a, b, c];
    const ctx = makeContext({ partySize: 1, budgetInr: 1000, availableMinutes: 600, idealStops: 2 });
    const plan = deepFreeze(makePlan(ctx, all, ["a", "b"]));
    const snapshot = JSON.stringify(plan.stops.map((stop) => [stop.record.id, stop.arriveBy]));

    const result = applyTrigger(
      plan,
      "rain_started",
      ctx,
      (draft) => applyNamedTrigger(draft, "rain_started"),
      (next) => makePlan(next, all, ["a", "c"]),
    );

    expect(JSON.stringify(plan.stops.map((stop) => [stop.record.id, stop.arriveBy]))).toBe(snapshot);
    expect(result.plan).not.toBe(plan);
    expect(result.plan.stops.map((stop) => stop.record.id)).toEqual(["a", "c"]);
    expect(result.diffedAgainst).toBe("original");
    expect(countSubstitutions(result.swaps)).toBe(1);
    expect(result.swaps.find((s) => s.removedId === "b")?.addedId).toBeNull();
  });

  it("keeps the traveller's intent out of the weather change", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 300 });
    const b = makeRecord({ id: "b", name: "Market B", priceInr: 300, category: "Market" });
    const all = [a, b];
    const ctx = makeContext({ partySize: 1, budgetInr: 1000, availableMinutes: 600, idealStops: 2 });
    const plan = makePlan(ctx, all, ["a", "b"]);

    const result = applyTrigger(
      plan,
      "rain_started",
      ctx,
      (draft) => applyNamedTrigger(draft, "rain_started"),
      (next) => makePlan(next, all, ["a", "b"]),
    );

    expect(result.plan.createdFrom.raining).toBe(true);
    expect(result.plan.createdFrom.profile.avoid).toEqual({});
    expect(result.plan.createdFrom.original).toBe(ctx.original);
    expect(result.plan.createdFrom.original.raining).toBe(false);
    expect(result.plan.createdFrom.original.profile.avoid).toEqual({});
    expect(result.swaps).toEqual([]);
  });

  it("catches a deliberately infeasible proposal and walks the ladder instead", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 400 });
    const b = makeRecord({ id: "b", name: "Market B", priceInr: 400, category: "Market" });
    const c = makeRecord({ id: "c", name: "Garden C", priceInr: 400, category: "Garden" });
    const all = [a, b, c];
    const ctx = makeContext({ partySize: 1, budgetInr: 1000, availableMinutes: 600, idealStops: 3, minStops: 1 });
    const plan = makePlan(ctx, all, ["a"]);

    const broken = makePlan(makeContext({ partySize: 1, budgetInr: 1000, availableMinutes: 600 }), all, ["a", "b", "c"]);
    expect(feasible(broken, ctx)).toBe(false);

    const result = applyTrigger(
      plan,
      "budget_dropped",
      ctx,
      (draft) => applyNamedTrigger(draft, "budget_dropped", { budgetInr: 900 }),
      () => broken,
    );

    expect(result.rungs[0]).toBe("strict");
    expect(result.rungs.length).toBeGreaterThan(1);
    expect(result.plan.stops.length).toBeLessThan(3);
    expect(feasible(result.plan, result.plan.createdFrom)).toBe(true);
  });

  it("produces the same result twice, run for run", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 300 });
    const b = makeRecord({ id: "b", name: "Market B", priceInr: 300, category: "Market" });
    const c = makeRecord({ id: "c", name: "Garden C", priceInr: 0, category: "Garden" });
    const all = [a, b, c];
    const ctx = makeContext({ partySize: 1, budgetInr: 1000, availableMinutes: 600, idealStops: 2 });
    const plan = makePlan(ctx, all, ["a", "b"]);

    const run = () =>
      applyTrigger(
        plan,
        "tired",
        ctx,
        (draft) => applyNamedTrigger(draft, "tired"),
        (next) => makePlan(next, all, ["a", "c"]),
      );

    expect(run()).toEqual(run());
    expect(run().plan.id).toBe(run().plan.id);
    expect(run().rungs).toEqual(["strict"]);
  });

  it("refuses a transform that moves the baseline", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 300 });
    const all = [a];
    const ctx = makeContext();
    const plan = makePlan(ctx, all, ["a"]);

    expect(() =>
      applyTrigger(
        plan,
        "rain_started",
        ctx,
        (draft) => ({ ...draft, original: makeContext({ availableMinutes: 5 }) }),
        (next) => makePlan(next, all, ["a"]),
      ),
    ).toThrow(/original was replaced/);
  });

  it("refuses a transform that answers with a fresh context", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 300 });
    const all = [a];
    const ctx = makeContext();
    const plan = makePlan(ctx, all, ["a"]);

    expect(() =>
      applyTrigger(
        plan,
        "rain_started",
        ctx,
        () => makeContext(),
        (next) => makePlan(next, all, ["a"]),
      ),
    ).toThrow(/original was replaced/);
  });

  it("rejects a trigger nobody defined", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 300 });
    const all = [a];
    const ctx = makeContext();
    const plan = makePlan(ctx, all, ["a"]);

    expect(() =>
      applyTrigger(
        plan,
        "meteor_strike" as never,
        ctx,
        (draft) => draft,
        (next) => makePlan(next, all, ["a"]),
      ),
    ).toThrow(/unknown trigger/);
  });

  it("re-solves against the mutated context, not the one it started with", () => {
    resetRecords();
    const a = makeRecord({ id: "a", name: "Gallery A", priceInr: 300 });
    const all = [a];
    const ctx = makeContext({ partySize: 1, budgetInr: 1000, availableMinutes: 600, idealStops: 1 });
    const plan = makePlan(ctx, all, ["a"]);
    const seen: DiscoveryContext[] = [];

    const result = applyTrigger(
      plan,
      "time_lost",
      ctx,
      (draft) => applyNamedTrigger(draft, "time_lost"),
      (next) => {
        seen.push(next);
        return makePlan(next, all, ["a"]);
      },
    );

    expect(seen).toHaveLength(1);
    expect(seen[0].availableMinutes).toBe(510);
    expect(seen[0].original.availableMinutes).toBe(600);
    expect(result.plan.createdFrom).toBe(seen[0]);
  });
});
