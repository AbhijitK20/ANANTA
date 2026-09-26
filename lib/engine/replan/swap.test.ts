import { describe, expect, it } from "vitest";
import type { Plan, RejectionCode, Stop } from "@/lib/engine/contracts";
import { REJECTION_CODES, rejectionSentence } from "@/lib/engine/contracts";
import { objectiveFast } from "@/lib/engine/scoring";
import { cloneForMutation } from "./context";
import { constraintLead, countSubstitutions, diffAgainstOriginal, planMinutes } from "./swap";
import { makeContext, makePlan, makeRecord, resetRecords, soldOut } from "./fixtures.test";

const stopTotal = (stop: Stop): number => stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes;

const value = (stops: readonly Stop[], ctx: ReturnType<typeof makeContext>): number =>
  objectiveFast([...stops], ctx).value;

const BANNED = ["constraint violated", "not eligible", "unavailable"];

describe("constraintLead", () => {
  it("is the code table's own sentence, with the full stop removed", () => {
    for (const code of Object.keys(REJECTION_CODES) as RejectionCode[]) {
      const lead = constraintLead(code);
      expect(lead.endsWith(".")).toBe(false);
      expect(rejectionSentence(code)).toBe(`${lead}.`);
    }
  });

  it("never carries an em dash or a banned phrase", () => {
    for (const code of Object.keys(REJECTION_CODES) as RejectionCode[]) {
      const lead = constraintLead(code);
      expect(lead.toLowerCase()).not.toContain("\u2014");
      expect(lead.length).toBeGreaterThan(8);
      for (const phrase of BANNED) expect(lead.toLowerCase()).not.toContain(phrase);
    }
  });
});

describe("diffAgainstOriginal", () => {
  it("returns nothing when nothing moved", () => {
    resetRecords();
    const a = makeRecord({ id: "a" });
    const b = makeRecord({ id: "b" });
    const ctx = makeContext();
    const plan = makePlan(ctx, [a, b], ["a", "b"]);
    expect(diffAgainstOriginal(plan, plan, ctx)).toEqual([]);
  });

  it("writes one swap per removed id and per added id, with the other side null", () => {
    resetRecords();
    const all = ["a", "b", "c", "d"].map((id) => makeRecord({ id }));
    const ctx = makeContext();

    const swaps = diffAgainstOriginal(
      makePlan(ctx, all, ["a", "b", "c"]),
      makePlan(ctx, all, ["a", "d"]),
      ctx,
    );
    expect(swaps).toHaveLength(3);
    expect(swaps.filter((s) => s.removedId !== null).map((s) => s.removedId).sort()).toEqual(["b", "c"]);
    expect(swaps.filter((s) => s.addedId !== null).map((s) => s.addedId)).toEqual(["d"]);
    expect(swaps.every((s) => (s.removedId === null) !== (s.addedId === null))).toBe(true);
    expect(countSubstitutions(swaps)).toBe(2);

    const pure = diffAgainstOriginal(
      makePlan(ctx, all, ["a", "b", "c"]),
      makePlan(ctx, all, ["a", "d", "b"]),
      ctx,
    );
    expect(pure.filter((s) => s.removedId !== null).map((s) => s.removedId)).toEqual(["c"]);
    expect(pure.filter((s) => s.addedId !== null).map((s) => s.addedId)).toEqual(["d"]);
    expect(countSubstitutions(pure)).toBe(1);
  });

  it("reports each id's own minutes, so the deltas sum to the plan level change", () => {
    resetRecords();
    const all = ["a", "b", "c", "d", "e", "f"].map((id) => makeRecord({ id }));
    const ctx = makeContext();
    // Dropping the tail leaves every kept stop's own leg untouched, so the
    // per id deltas have to add up to the difference between the two plans.
    const before = makePlan(ctx, all, ["a", "b", "e", "c", "f"]);
    const after = makePlan(ctx, all, ["a", "b", "e"]);

    const swaps = diffAgainstOriginal(before, after, ctx);
    const totals = new Map(before.stops.map((stop) => [stop.record.id, stopTotal(stop)]));

    expect(swaps).toHaveLength(2);
    for (const swap of swaps) {
      expect(swap.removedId).not.toBeNull();
      expect(swap.minutesDelta).toBe(-(totals.get(swap.removedId as string) as number));
      expect(swap.minutesDelta).toBeLessThan(0);
    }

    const summed = swaps.reduce((acc, swap) => acc + swap.minutesDelta, 0);
    expect(summed).toBe(planMinutes(after.stops) - planMinutes(before.stops));
    expect(summed).toBe(-158);
    // Which one leads is decided by the objective, not by the plan, so compare
    // the set and let the ordering test below pin the order.
    expect([...swaps.map((s) => s.minutesDelta)].sort((x, y) => x - y)).toEqual([-80, -78]);
  });

  it("carries a real objective delta, computed as the marginal of that one id", () => {
    resetRecords();
    const all = ["a", "b", "c"].map((id) => makeRecord({ id }));
    const ctx = makeContext();
    const before = makePlan(ctx, all, ["a", "b"]);
    const after = makePlan(ctx, all, ["a", "c"]);

    const swaps = diffAgainstOriginal(before, after, ctx);
    const removal = swaps.find((s) => s.removedId === "b");
    const addition = swaps.find((s) => s.addedId === "c");

    // The removal is measured against the plan with the old stop put back.
    const withB = [after.stops[0], before.stops[1], after.stops[1]];
    expect(removal?.scoreDelta).toBe(
      Math.round((value(after.stops, ctx) - value(withB, ctx)) * 1e6) / 1e6,
    );
    // The addition is measured against the plan without it.
    expect(addition?.scoreDelta).toBe(
      Math.round((value(after.stops, ctx) - value(after.stops.slice(0, 1), ctx)) * 1e6) / 1e6,
    );
    expect(Math.abs(addition?.scoreDelta ?? 0)).toBeGreaterThan(0);
    expect(addition?.scoreDelta).not.toBe(removal?.scoreDelta);
  });

  it("sorts by consequence, biggest first", () => {
    resetRecords();
    const all = ["a", "b", "c", "d", "e"].map((id) => makeRecord({ id }));
    const ctx = makeContext();
    const swaps = diffAgainstOriginal(
      makePlan(ctx, all, ["a", "b", "c", "d", "e"]),
      makePlan(ctx, all, ["a", "e"]),
      ctx,
    );
    const magnitudes = swaps.map((swap) => Math.abs(swap.scoreDelta));
    expect(magnitudes).toEqual([...magnitudes].sort((x, y) => y - x));
  });

  it("names the constraint that forced the change, from the code table", () => {
    resetRecords();
    const sold = makeRecord({ id: "sold", name: "Sold Out Gallery", availability: soldOut() });
    const open = makeRecord({ id: "open", name: "Open Market" });
    const ctx = makeContext();
    const before = makePlan(ctx, [sold, open], ["sold", "open"]);
    const after = makePlan(ctx, [sold, open], ["open"]);

    const removal = diffAgainstOriginal(before, after, ctx).find((s) => s.removedId === "sold");
    expect(removal?.reason.startsWith(`${constraintLead("sold_out")}.`)).toBe(true);
    expect(removal?.reason).toContain("Sold Out Gallery");
    expect(removal?.reason).toMatch(/\d/);
  });

  it("pairs an addition with a removal and says what the swap cost", () => {
    resetRecords();
    const gone = makeRecord({ id: "gone", name: "Old Gallery", category: "Gallery" });
    const kept = makeRecord({ id: "kept", name: "Kept Market", category: "Market" });
    const extra = makeRecord({ id: "extra", name: "New Gallery", category: "Gallery" });
    const all = [gone, kept, extra];
    const ctx = makeContext();
    const before = makePlan(ctx, all, ["gone", "kept"]);
    const after = makePlan(ctx, all, ["kept", "extra"]);

    const addition = diffAgainstOriginal(before, after, ctx).find((s) => s.addedId === "extra");
    expect(addition?.reason).toContain("Swapped Old Gallery for New Gallery at stop 2.");
    expect(addition?.reason).toContain("km from the previous stop");
    expect(addition?.reason).toContain("the focus stays on Gallery");
    expect(addition?.minutesDelta).toBeGreaterThan(0);
  });

  it("diffs against the context it is handed, not the intermediate plan", () => {
    resetRecords();
    const all = ["a", "b", "c", "d"].map((id) => makeRecord({ id }));
    const ctx0 = makeContext();
    const first = makePlan(ctx0, all, ["a", "b", "c", "d"]);
    // A real chain of mutations, so the baseline really is the first context.
    const ctx1 = cloneForMutation(ctx0, { availableMinutes: 150, budgetInr: 900 });
    const second = makePlan(ctx1, all, ["a", "b"]);
    const ctx2 = cloneForMutation(ctx1, { pace: "relaxed" });
    const third = makePlan(ctx2, all, ["a", "c"]);

    const swaps = diffAgainstOriginal(second, third, ctx2);

    // The ids that moved are the ones the intermediate plan did not share.
    expect(swaps.map((s) => s.removedId ?? s.addedId).sort()).toEqual(["b", "c"]);

    // The minutes describe the second step, never the first step or the whole drift.
    const summed = swaps.reduce((acc, swap) => acc + swap.minutesDelta, 0);
    expect(summed).toBe(planMinutes(third.stops) - planMinutes(second.stops));
    expect(summed).not.toBe(planMinutes(third.stops) - planMinutes(first.stops));
    expect(summed).not.toBe(planMinutes(second.stops) - planMinutes(first.stops));

    // And the baseline the traveller chose is still exactly what it was.
    expect(ctx2.original).toBe(ctx0.original);
    expect(ctx2.original.availableMinutes).toBe(240);
    expect(ctx2.original.budgetInr).toBe(1000);
    expect(ctx2.original.pace).toBe("normal");
    expect(ctx2.availableMinutes).toBe(150);
  });

  it("never leaves a reason without a number in it", () => {
    resetRecords();
    const all = ["a", "b", "c", "d", "e"].map((id) => makeRecord({ id }));
    const ctx = makeContext();
    const cases: [Plan, Plan][] = [
      [makePlan(ctx, all, ["a", "b", "c"]), makePlan(ctx, all, ["a", "b"])],
      [makePlan(ctx, all, ["a", "b", "c"]), makePlan(ctx, all, ["a", "b", "c", "d"])],
      [makePlan(ctx, all, ["a", "b", "c"]), makePlan(ctx, all, ["d", "e"])],
      [makePlan(ctx, all, ["a", "b", "c"]), makePlan(ctx, all, ["a", "b", "c"])],
    ];
    for (const [before, after] of cases) {
      for (const swap of diffAgainstOriginal(before, after, ctx)) {
        expect(swap.reason.length).toBeGreaterThan(20);
        expect(swap.reason).toMatch(/\d/);
        expect(swap.reason).not.toContain("\u2014");
        for (const phrase of BANNED) expect(swap.reason.toLowerCase()).not.toContain(phrase);
      }
    }
  });
});

describe("countSubstitutions", () => {
  it("counts removals, and ignores a pure addition", () => {
    const base = { reason: "x", scoreDelta: 0, minutesDelta: 0 };
    expect(
      countSubstitutions([
        { ...base, removedId: "a", addedId: null },
        { ...base, removedId: "b", addedId: null },
        { ...base, removedId: null, addedId: "c" },
      ]),
    ).toBe(2);
    expect(countSubstitutions([])).toBe(0);
  });
});

describe("planMinutes", () => {
  it("sums travel, visit and buffer in index order", () => {
    resetRecords();
    const all = ["a", "b"].map((id) => makeRecord({ id }));
    const plan = makePlan(makeContext(), all, ["a", "b"]);
    expect(planMinutes(plan.stops)).toBe(plan.stops.reduce((acc, stop) => acc + stopTotal(stop), 0));
    expect(planMinutes([])).toBe(0);
  });
});
