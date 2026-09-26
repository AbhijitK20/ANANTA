import { describe, expect, it } from "vitest";
import type { Rejection } from "@/lib/engine/contracts";
import { feasible, feasibilityMeter } from "./feasibility";
import { DEFAULT_BUFFER_MINUTES, budgetMinutes, localClock, normaliseWindow, travelMinutesFor } from "./checks/time";
import { duplicateRadiusKm } from "./checks/plan-state";
import { hardAccessNeeds } from "./checks/access";
import { sortRejections } from "./gate";
import { TEST_MINUTES, TEST_NOW, makeContext, makeRecord, makeStop, testManifest } from "./checks/fixtures";

/**
 * The shared numbers. If the buffer, the budget, the clock or the travel
 * multiplier disagree between two files, the UI and the gate will show
 * different totals for the same plan, so each one is pinned to the digit here.
 */

describe("the local clock", () => {
  it("reads the weekday, the minute of the day and the month of an injected instant", () => {
    expect(localClock(TEST_NOW, "UTC")).toEqual({ weekday: 6, minutes: TEST_MINUTES, month: 7 });
  });

  it("honours a non-whole-hour zone rather than assuming the host's clock", () => {
    // +05:45, chosen because a 45-minute offset cannot come from rounding.
    expect(localClock(TEST_NOW, "Asia/Kathmandu")).toEqual({ weekday: 6, minutes: 915, month: 7 });
  });

  it("reads midnight as minute zero", () => {
    expect(localClock("2026-07-04T00:00:00.000Z", "UTC").minutes).toBe(0);
  });

  it("degrades to a safe clock rather than throwing on a malformed instant", () => {
    expect(localClock("not-a-date", "UTC")).toEqual({ weekday: 0, minutes: 0, month: 1 });
  });
});

describe("the visit window", () => {
  it("leaves an ordinary window alone", () => {
    expect(normaliseWindow(590, 650)).toEqual({ startMin: 590, endMin: 650, dayShift: 0 });
  });

  it("unwraps a window the caller already wrapped past midnight", () => {
    expect(normaliseWindow(1410, 30)).toEqual({ startMin: 1410, endMin: 1470, dayShift: 0 });
  });

  it("shifts a window that began before local midnight onto the previous day", () => {
    expect(normaliseWindow(-30, 30)).toEqual({ startMin: 1410, endMin: 1470, dayShift: -1 });
  });

  it("treats a malformed window as empty rather than inventing hours", () => {
    expect(normaliseWindow(Number.NaN, 10)).toEqual({ startMin: 0, endMin: 0, dayShift: 0 });
  });
});

describe("the minute budget", () => {
  it("is the stated availability when there is no deadline", () => {
    expect(budgetMinutes(makeContext({ availableMinutes: 240 }))).toBe(240);
  });

  it("is the smaller of the availability and the time to the deadline", () => {
    const ctx = makeContext({ availableMinutes: 600, deadline: "2026-07-04T10:00:00.000Z" });
    expect(budgetMinutes(ctx)).toBe(30);
  });

  it("never goes negative and never trusts an unparseable deadline", () => {
    expect(budgetMinutes(makeContext({ availableMinutes: 600, deadline: "2026-07-04T08:00:00.000Z" }))).toBe(0);
    expect(budgetMinutes(makeContext({ availableMinutes: 45, deadline: "soon" }))).toBe(45);
  });
});

describe("travel time", () => {
  it("applies the manifest congestion for the traveller's mode exactly once", () => {
    const record = makeRecord({ travelMinutes: 100 });
    expect(travelMinutesFor(record, makeContext({ travelMode: "auto" }))).toBe(100);
    expect(travelMinutesFor(record, makeContext({ travelMode: "taxi" }))).toBe(120);
    expect(travelMinutesFor(record, makeContext({ travelMode: "walk" }))).toBe(130);
    expect(travelMinutesFor(record, makeContext({ travelMode: "ferry" }))).toBe(140);
  });

  it("passes an unusable leg through as NaN, so the gate reports no route", () => {
    expect(travelMinutesFor(makeRecord({ travelMinutes: Number.NaN }), makeContext())).toBeNaN();
  });

  it("floors a negative leg at zero, which is a neighbour rather than a route", () => {
    expect(travelMinutesFor(makeRecord({ travelMinutes: -5 }), makeContext())).toBe(0);
  });
});

describe("the feasibility meter", () => {
  const stops = [
    makeStop({ visitMinutes: 60, travelMinutes: 20 }),
    makeStop({ visitMinutes: 45, travelMinutes: 10 }),
    makeStop({ visitMinutes: 30, travelMinutes: 0 }),
  ];

  it("adds activity and travel, and holds back the buffer once per plan", () => {
    expect(feasibilityMeter(stops, makeContext({ availableMinutes: 240 }))).toEqual({
      activityMin: 135,
      travelMin: 30,
      bufferMin: DEFAULT_BUFFER_MINUTES,
      usedMin: 180,
      remainingMin: 60,
      overflow: 0,
    });
  });

  it("reports what is left and what spills, and never both as a positive number", () => {
    const tight = feasibilityMeter(stops, makeContext({ availableMinutes: 120 }));
    expect(tight.usedMin).toBe(180);
    expect(tight.remainingMin).toBe(0);
    expect(tight.overflow).toBe(60);

    const roomy = feasibilityMeter(stops, makeContext({ availableMinutes: 1000 }));
    expect(roomy.remainingMin).toBe(820);
    expect(roomy.overflow).toBe(0);
  });

  it("charges no buffer for an empty plan, matching how the gate reads it", () => {
    expect(feasibilityMeter([], makeContext())).toEqual({
      activityMin: 0,
      travelMin: 0,
      bufferMin: 0,
      usedMin: 0,
      remainingMin: 240,
      overflow: 0,
    });
  });

  it("measures against the deadline when that is the tighter bound", () => {
    const ctx = makeContext({ availableMinutes: 600, deadline: "2026-07-04T10:00:00.000Z" });
    const meter = feasibilityMeter(stops, ctx);
    expect(meter.usedMin).toBe(180);
    expect(meter.overflow).toBe(150);
  });
});

describe("the one-shot gate", () => {
  it("runs the same checks with the default window, without the caller wiring anything", () => {
    const result = feasible([makeRecord({ id: "a" }), makeRecord({ id: "b", travelMinutes: 400 })], makeContext());
    expect(result.passed.map((r) => r.id)).toEqual(["a"]);
    expect(result.rejected.map((r) => r.record.id)).toEqual(["b"]);
    expect(result.stream).toHaveLength(1);
  });
});

describe("rejection ordering", () => {
  const make = (code: Rejection["code"], shortfall: number | null, blocking: boolean): Rejection => ({
    code,
    sentence: `${code}.`,
    shortfall,
    unit: shortfall === null ? "none" : "minutes",
    blocking,
    causedBy: "curated",
    causedByConfidence: "verified",
  });

  it("puts blocking first, then the biggest miss, then the code", () => {
    const sorted = sortRejections([
      make("closed_now", null, false),
      make("over_budget", 300, true),
      make("too_far", 85, true),
      make("sold_out", null, true),
      make("capacity_exceeded", 300, true),
    ]);
    expect(sorted.map((r) => r.code)).toEqual([
      "capacity_exceeded",
      "over_budget",
      "too_far",
      "sold_out",
      "closed_now",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const input = [make("sold_out", null, true), make("too_far", 85, true)];
    sortRejections(input);
    expect(input.map((r) => r.code)).toEqual(["sold_out", "too_far"]);
  });
});

describe("manifest fallbacks", () => {
  it("uses a half-kilometre duplicate radius until the manifest carries one", () => {
    expect(duplicateRadiusKm(testManifest())).toBe(0.5);
    const declared = { ...testManifest(), duplicateRadiusKm: 1.25 } as ReturnType<typeof testManifest>;
    expect(duplicateRadiusKm(declared)).toBe(1.25);
  });

  it("treats a nonsense radius as unset rather than duplicating nothing", () => {
    const declared = { ...testManifest(), duplicateRadiusKm: -1 } as ReturnType<typeof testManifest>;
    expect(duplicateRadiusKm(declared)).toBe(0.5);
  });

  it("has no hard access needs until the traveller says which", () => {
    expect(hardAccessNeeds(makeContext()).size).toBe(0);
  });
});
