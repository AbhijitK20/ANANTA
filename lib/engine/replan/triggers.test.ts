import { describe, expect, it } from "vitest";
import { NOW, makeContext, makeRecord, resetRecords } from "./fixtures.test";
import { TRIGGERS, applyNamedTrigger, markSoldOut } from "./triggers";
import type { TriggerId } from "@/lib/engine/contracts";

const ALL: TriggerId[] = [
  "rain_started",
  "time_lost",
  "sold_out",
  "budget_dropped",
  "needs_restroom",
  "tired",
];

const fire = (id: TriggerId, ctx = makeContext(), args = {}) =>
  applyNamedTrigger(ctx, id, args);

describe("trigger table", () => {
  it("covers exactly the six triggers the contracts freeze", () => {
    expect(Object.keys(TRIGGERS).sort()).toEqual([...ALL].sort());
    for (const id of ALL) {
      expect(TRIGGERS[id].id).toBe(id);
      expect(TRIGGERS[id].label.length).toBeGreaterThan(3);
      expect(TRIGGERS[id].event.length).toBeGreaterThan(3);
    }
  });
});

describe("every trigger", () => {
  it("leaves the frozen original untouched, by reference and by value", () => {
    const ctx = makeContext();
    const baseline = ctx.original;
    const before = { ...baseline };
    for (const id of ALL) {
      const next = fire(id, ctx);
      expect(next.original).toBe(baseline);
      expect({ ...next.original }).toEqual(before);
      expect(next).not.toBe(ctx);
    }
    expect(baseline.availableMinutes).toBe(240);
    expect(baseline.budgetInr).toBe(1000);
    expect(baseline.idealStops).toBe(3);
    expect(baseline.pace).toBe("normal");
    expect(baseline.accessNeeds).toEqual([]);
    expect(baseline.raining).toBe(false);
  });

  it("is chainable, so three triggers in a row still diff against one baseline", () => {
    const ctx = makeContext();
    const one = fire("rain_started", ctx);
    const two = fire("time_lost", one);
    const three = fire("tired", two);
    expect(three.original).toBe(ctx.original);
    expect(three.raining).toBe(true);
    expect(three.availableMinutes).toBe(150);
    expect(three.idealStops).toBe(2);
    expect(ctx.raining).toBe(false);
    expect(ctx.availableMinutes).toBe(240);
  });
});

describe("rain_started", () => {
  it("turns the weather on without touching what the traveller said", () => {
    const ctx = makeContext();
    const next = fire("rain_started", ctx);

    expect(next.raining).toBe(true);
    expect(next.weatherSeverity).toBe("rain");
    expect(next.profile.avoid).toEqual({});
    expect(next.profile.accessibility).toEqual([]);
    expect(next.query).toBe(ctx.query);
    expect(next.original.raining).toBe(false);
  });

  it("never escalates a storm down to rain", () => {
    const storm = makeContext({ weatherSeverity: "storm", raining: true });
    expect(fire("rain_started", storm).weatherSeverity).toBe("storm");
    const heavy = makeContext({ weatherSeverity: "heavy_rain" });
    expect(fire("rain_started", heavy).weatherSeverity).toBe("heavy_rain");
    expect(fire("rain_started", makeContext({ weatherSeverity: "clear" })).weatherSeverity).toBe("rain");
  });
});

describe("time_lost", () => {
  it("takes 90 minutes off the window and pulls the deadline in by the same", () => {
    const ctx = makeContext({ deadline: "2026-09-26T18:00:00.000Z" });
    const next = fire("time_lost", ctx);

    expect(next.availableMinutes).toBe(150);
    expect(next.deadline).toBe("2026-09-26T16:30:00.000Z");
    expect(next.original.availableMinutes).toBe(240);
    expect(next.original.deadline).toBe("2026-09-26T18:00:00.000Z");
  });

  it("never pulls the deadline before now", () => {
    const ctx = makeContext({ deadline: "2026-09-26T09:45:00.000Z" });
    expect(fire("time_lost", ctx).deadline).toBe(NOW);
  });

  it("leaves an absent deadline absent and accepts an explicit amount", () => {
    expect(fire("time_lost", makeContext()).deadline).toBeNull();
    expect(fire("time_lost", makeContext(), { minutesLost: 30 }).availableMinutes).toBe(210);
    expect(fire("time_lost", makeContext(), { minutesLost: 999 }).availableMinutes).toBe(0);
  });
});

describe("sold_out", () => {
  it("changes the world, not the intent, and moves the fact onto the record", () => {
    resetRecords();
    const first = makeRecord({ id: "a" });
    const second = makeRecord({ id: "b" });
    const ctx = makeContext();
    const next = fire("sold_out", ctx, { recordId: "a" });

    expect(next.original).toBe(ctx.original);
    expect(next.availableMinutes).toBe(ctx.availableMinutes);
    expect(next.budgetInr).toBe(ctx.budgetInr);

    const marked = markSoldOut([first, second], "a", "2026-09-26T11:00:00.000Z");
    expect(marked[0].availability.soldOutAt).toBe("2026-09-26T11:00:00.000Z");
    expect(marked[1].availability.soldOutAt).toBeNull();
    expect(first.availability.soldOutAt).toBeNull();
    expect(marked[0]).not.toBe(first);
    expect(marked[1]).toBe(second);
  });
});

describe("budget_dropped", () => {
  it("halves the budget by default and takes an explicit figure", () => {
    expect(fire("budget_dropped", makeContext({ budgetInr: 2000 })).budgetInr).toBe(1000);
    expect(fire("budget_dropped", makeContext({ budgetInr: 2001 })).budgetInr).toBe(1000);
    expect(fire("budget_dropped", makeContext(), { budgetInr: 350 }).budgetInr).toBe(350);
    expect(fire("budget_dropped", makeContext(), { budgetInr: 0 }).budgetInr).toBe(0);
    expect(fire("budget_dropped", makeContext()).original.budgetInr).toBe(1000);
  });
});

describe("needs_restroom", () => {
  it("appends the need once and never twice", () => {
    const once = fire("needs_restroom");
    expect(once.accessNeeds).toEqual(["accessible_restroom"]);

    const twice = fire("needs_restroom", once);
    expect(twice.accessNeeds).toEqual(["accessible_restroom"]);

    const mixed = fire("needs_restroom", makeContext({ accessNeeds: ["step_free", "quiet_space"] }));
    expect(mixed.accessNeeds).toEqual(["step_free", "quiet_space", "accessible_restroom"]);
    expect(mixed.original.accessNeeds).toEqual(["step_free", "quiet_space"]);
  });
});

describe("tired", () => {
  it("softens the pace and drops exactly one stop", () => {
    const next = fire("tired", makeContext({ idealStops: 4, minStops: 1 }));
    expect(next.pace).toBe("relaxed");
    expect(next.idealStops).toBe(3);
  });

  it("floors at minStops", () => {
    expect(fire("tired", makeContext({ idealStops: 2, minStops: 2 })).idealStops).toBe(2);
    expect(fire("tired", makeContext({ idealStops: 1, minStops: 1 })).idealStops).toBe(1);
    expect(fire("tired", makeContext({ idealStops: 3, minStops: 2 })).idealStops).toBe(2);
  });
});
