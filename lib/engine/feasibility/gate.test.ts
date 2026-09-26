import { describe, expect, it } from "vitest";
import type { DiscoveryContext, ExperienceV2 } from "@/lib/engine/contracts";
import { dominantRejection, gate, runChecks } from "./gate";
import { defaultWindowFor, normaliseWindow, travelMinutesFor } from "./checks/time";
import { codes, makeContext, makePosition, makeProfile, makeRecord } from "./checks/fixtures";

/**
 * The behaviours the gate exists for, each one a bug the legacy gate had or a
 * requirement the masterplan states out loud.
 */

const windowFor = (ctx: DiscoveryContext) => defaultWindowFor(ctx);

function only(record: Partial<ExperienceV2>, ctx: DiscoveryContext) {
  return gate([makeRecord(record)], ctx, { windowFor: windowFor(ctx) });
}

/** The rejections a record carries even when nothing blocking came of them. */
function reasonsFor(record: Partial<ExperienceV2>, ctx: DiscoveryContext) {
  const built = makeRecord(record);
  return runChecks(built, ctx, makePosition({
    travelMinutes: travelMinutesFor(built, ctx),
    window: { startMin: 590, endMin: 590 + built.durationMinutes },
    weekday: 6,
    month: 7,
  }));
}

function allRejections(result: ReturnType<typeof gate>) {
  return result.rejected.flatMap((entry) => entry.rejections);
}

describe("weather is a fact about the place, not about a badge", () => {
  it("does not weather reject an indoor record whose status was only awaiting a check", () => {
    // The exact shape the legacy suite locked in: an indoor record carrying the
    // amber presentation token for a reason that has nothing to do with rain.
    const record = makeRecord({
      id: "fort-history-walk",
      name: "Fort History Walk",
      indoor: "indoor",
      status: "Awaiting operator check",
      statusTone: "amber",
    });
    const ctx = makeContext({ weatherSeverity: "rain" });
    const result = only(record, ctx);

    expect(result.passed).toHaveLength(1);
    expect(codes(allRejections(result))).not.toContain("weather_unsafe");
  });

  it("fails an outdoor birdwatching point out of season, and only for that in clear weather", () => {
    const record = makeRecord({
      id: "birdwatching-point",
      indoor: "outdoor",
      season: { months: [11, 12, 1, 2], note: "Migratory season, November to February." },
    });
    const outOfSeason = gate([record], makeContext({ weatherSeverity: "clear" }), {
      windowFor: windowFor(makeContext()),
    });
    const produced = codes(allRejections(outOfSeason));
    expect(produced).toContain("seasonal_mismatch");
    expect(produced).not.toContain("weather_unsafe");

    const season = allRejections(outOfSeason).find((r) => r.code === "seasonal_mismatch");
    expect(season?.sentence).toContain("Migratory season");
  });

  it("rejects the same point for weather in rain, and says nothing about season in November", () => {
    const record = makeRecord({
      id: "birdwatching-point",
      indoor: "outdoor",
      season: { months: [11, 12, 1, 2], note: "Migratory season, November to February." },
    });
    const november = makeContext({ weatherSeverity: "rain", now: "2026-11-14T09:30:00.000Z" });
    const result = gate([record], november, { windowFor: windowFor(november) });
    const produced = codes(allRejections(result));

    expect(produced).toContain("weather_unsafe");
    expect(produced).not.toContain("seasonal_mismatch");
  });

  it("treats unknown weather as unknown, not as rain", () => {
    const record = makeRecord({ id: "outdoor-gallery", indoor: "outdoor" });
    const ctx = makeContext({ weatherSeverity: null, raining: false });
    const result = only(record, ctx);

    expect(result.passed).toHaveLength(1);
    expect(codes(allRejections(result))).toEqual([]);
  });

  it("rejects every outdoor severity but leaves mixed venues alone", () => {
    for (const severity of ["rain", "heavy_rain", "storm"] as const) {
      const outdoor = gate([makeRecord({ id: "o", indoor: "outdoor" })], makeContext({ weatherSeverity: severity }), {
        windowFor: windowFor(makeContext()),
      });
      expect(codes(allRejections(outdoor)), severity).toContain("weather_unsafe");

      const mixed = gate([makeRecord({ id: "m", indoor: "mixed" })], makeContext({ weatherSeverity: severity }), {
        windowFor: windowFor(makeContext()),
      });
      expect(codes(allRejections(mixed)), severity).not.toContain("weather_unsafe");
    }
  });
});

describe("abstaining is an outcome, not a pass and not a fail", () => {
  it("reports an unknown capacity without claiming the record fits or does not", () => {
    const record = { id: "unknown-seats", capacity: null };
    const ctx = makeContext({ partySize: 4 });
    const [rejection] = reasonsFor(record, ctx);

    expect(rejection.code).toBe("unverified_required_fact");
    expect(rejection.blocking).toBe(false);
    expect(rejection.shortfall).toBeNull();
    expect(rejection.unit).toBe("none");
    expect(rejection.sentence).toContain("capacity");
    // Nothing was proven false, so the record stays in the pool carrying the doubt.
    expect(only(record, ctx).passed).toHaveLength(1);
  });

  it("makes an unknown access fact binding only when the traveller called it non-negotiable", () => {
    const record = { id: "unknown-step-free", access: {} };
    const soft = reasonsFor(record, makeContext({ accessNeeds: ["step_free"] }));
    expect(soft[0].blocking).toBe(false);
    expect(only(record, makeContext({ accessNeeds: ["step_free"] })).passed).toHaveLength(1);

    const hardCtx = makeContext({ accessNeeds: ["step_free"] });
    hardCtx.profile = makeProfile({ hardAccessNeeds: ["step_free"] } as never);
    expect(reasonsFor(record, hardCtx)[0].blocking).toBe(true);
    expect(only(record, hardCtx).passed).toHaveLength(0);
  });

  it("abstains on an unverified price rather than guessing either way", () => {
    const record = makeRecord({ id: "unpriced", priceInr: 900, pricePerPersonInr: null });
    record.confidence = { ...record.confidence, price: "unverified" };
    const ctx = makeContext({ budgetInr: 100 });

    // 900 x 2 would be 800 over budget if we trusted the number.
    expect(codes(allRejections(only(record, ctx)))).toEqual([]);
    expect(only(record, ctx).passed).toHaveLength(1);
    expect(reasonsFor(record, ctx).map((r) => r.code)).toEqual(["unverified_required_fact"]);
  });

  it("abstains on diets only when nobody has verified any, and rejects when they have", () => {
    const silent = makeRecord({ id: "silent-kitchen", diets: [] });
    silent.confidence = { ...silent.confidence, diet: "community" };
    expect(reasonsFor(silent, makeContext({ diets: ["vegan"] })).map((r) => r.code)).toEqual([
      "unverified_required_fact",
    ]);

    const verified = makeRecord({ id: "verified-kitchen", diets: [] });
    expect(codes(allRejections(only(verified, makeContext({ diets: ["vegan"] }))))).toEqual(["diet_mismatch"]);
  });
});

describe("the buffer is counted exactly once", () => {
  const record = makeRecord({ id: "exact-fit", travelMinutes: 30, durationMinutes: 45 });

  it("passes when travel plus duration plus the buffer lands on the limit", () => {
    // 30 + 45 + 15 = 90.
    const result = gate([record], makeContext({ availableMinutes: 90 }), { windowFor: windowFor(makeContext()) });
    expect(result.passed).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it("is one minute short at 89, and says so", () => {
    const ctx = makeContext({ availableMinutes: 89 });
    const result = gate([record], ctx, { windowFor: windowFor(ctx) });
    const [rejection] = result.rejected[0].rejections;
    expect(rejection.code).toBe("duration_exceeds_budget");
    expect(rejection.shortfall).toBe(1);
    expect(rejection.unit).toBe("minutes");
  });

  it("uses the deadline when it is the tighter bound", () => {
    const ctx = makeContext({ availableMinutes: 600, deadline: "2026-07-04T10:00:00.000Z" });
    const result = gate([record], ctx, { windowFor: windowFor(ctx) });
    // now is 09:30, so 30 minutes of budget remain and the record needs 90.
    const [rejection] = result.rejected[0].rejections;
    expect(rejection.shortfall).toBe(60);
  });
});

describe("a record that fails more than one thing says so", () => {
  const record = makeRecord({ id: "too-long-and-dear", travelMinutes: 10, durationMinutes: 240 });

  it("returns every rejection, blocking first, with the binding one identifiable", () => {
    const ctx = makeContext({ availableMinutes: 240, budgetInr: 500 });
    const result = gate([record], ctx, { windowFor: windowFor(ctx) });
    const rejections = result.rejected[0].rejections;

    expect(codes(rejections)).toEqual(["over_budget", "duration_exceeds_budget"]);
    expect(rejections.every((r) => r.blocking)).toBe(true);
    // 300 rupees short beats 25 minutes short because the sort is by shortfall.
    expect(rejections[0].shortfall).toBe(300);
    expect(rejections[1].shortfall).toBe(25);
  });

  it("leads with the single constraint that killed it", () => {
    const ctx = makeContext({ availableMinutes: 240, budgetInr: 500 });
    const rejections = gate([record], ctx, { windowFor: windowFor(ctx) }).rejected[0].rejections;
    expect(dominantRejection(rejections)?.code).toBe("over_budget");
    expect(dominantRejection(rejections)?.sentence).toContain("300 rupees short");
  });

  it("answers null when nothing blocking fired, rather than guessing", () => {
    expect(dominantRejection([])).toBeNull();
    // An abstention is a real answer about the data, but it is not a verdict on
    // the record, so it never leads a provider feed.
    const advisory = reasonsFor({ capacity: null }, makeContext({ partySize: 4 }));
    expect(advisory).toHaveLength(1);
    expect(dominantRejection(advisory)).toBeNull();
    expect(allRejections(only(makeRecord(), makeContext()))).toEqual([]);
  });

  it("counts frequency before magnitude, then magnitude, then code", () => {
    // Two ordinary money misses outrank one enormous one, because the provider
    // asked which constraint kept killing requests, not by how much.
    const ctx = makeContext({ budgetInr: 500 });
    const pool = gate(
      [
        makeRecord({ id: "dear-a", priceInr: 400 }),
        makeRecord({ id: "dear-b", priceInr: 400, coordinates: [10.1, 20] }),
        makeRecord({ id: "dearest", priceInr: 0, pricePerPersonInr: 5000, coordinates: [10.2, 20] }),
      ],
      ctx,
      { windowFor: windowFor(ctx) },
    ).stream.flatMap((entry) => entry.rejections);

    expect(codes(pool).filter((code) => code === "over_budget")).toHaveLength(2);
    expect(codes(pool).filter((code) => code === "over_budget_per_person")).toHaveLength(1);
    expect(dominantRejection(pool)?.code).toBe("over_budget");
  });
});

describe("a visit window that crosses midnight", () => {
  const lateOpen = {
    weekly: { 6: [{ from: 1380, to: 1560 }], 0: [{ from: 1380, to: 1560 }] } as Record<number, { from: number; to: number }[]>,
    confidence: "verified" as const,
  };

  it("treats a window that starts before local midnight as yesterday's", () => {
    expect(normaliseWindow(-30, 30)).toEqual({ startMin: 1410, endMin: 1470, dayShift: -1 });
    expect(normaliseWindow(1410, 1230)).toEqual({ startMin: 1410, endMin: 2670, dayShift: 0 });
  });

  it("accepts a visit that runs from 23:30 to 01:00 at a place open until 02:00", () => {
    const record = makeRecord({ id: "late-venue", openingHours: lateOpen, durationMinutes: 90 });
    const result = gate([record], makeContext(), { windowFor: () => ({ startMin: 1410, endMin: 1500 }) });
    expect(result.passed).toHaveLength(1);
  });

  it("measures the part of the visit that falls after closing", () => {
    const record = makeRecord({ id: "late-venue", openingHours: lateOpen, durationMinutes: 180 });
    const result = gate([record], makeContext(), { windowFor: () => ({ startMin: 1380, endMin: 1620 }) });
    const rejection = result.rejected[0].rejections.find((r) => r.code === "closed_during_window");
    expect(rejection?.shortfall).toBe(60);
  });

  it("rolls the weekday back one day for a window that began yesterday", () => {
    const record = makeRecord({ id: "late-venue", openingHours: lateOpen, durationMinutes: 60 });
    // 23:30 Saturday to 00:30 Sunday, expressed as minutes from Saturday midnight.
    const result = gate([record], makeContext(), { windowFor: () => ({ startMin: 1410, endMin: 1470 }) });
    expect(result.passed).toHaveLength(1);
  });
});

describe("plan state is distance and intent, not string matching", () => {
  it("calls a record a duplicate on proximity, not on a similar name", () => {
    const near = makeRecord({ id: "same-gate-other-name", name: "Something Else Entirely" });
    const result = gate([near], makeContext(), {
      windowFor: windowFor(makeContext()),
      plannedStops: [{ id: "fort-history-walk", coordinates: [10.004, 20] }],
    });
    const rejection = result.rejected[0].rejections.find((r) => r.code === "duplicate");
    expect(rejection).toBeDefined();
    expect(rejection?.unit).toBe("metres");
    expect(rejection?.shortfall).toBeGreaterThan(0);
    expect(rejection?.shortfall).toBeLessThanOrEqual(500);
  });

  it("leaves a genuinely different place alone", () => {
    const far = makeRecord({ id: "across-town", coordinates: [10.5, 20.4] });
    const result = gate([far], makeContext(), {
      windowFor: windowFor(makeContext()),
      plannedStops: [{ id: "fort-history-walk", coordinates: [10, 20] }],
    });
    expect(codes(allRejections(result))).not.toContain("duplicate");
  });

  it("does not call a rejected neighbour a duplicate of another rejected neighbour", () => {
    const records = [
      makeRecord({ id: "a", travelMinutes: 300, coordinates: [10, 20] }),
      makeRecord({ id: "b", travelMinutes: 300, coordinates: [10.001, 20] }),
    ];
    const result = gate(records, makeContext(), { windowFor: windowFor(makeContext()) });
    expect(result.passed).toHaveLength(0);
    for (const entry of result.rejected) expect(codes(entry.rejections)).not.toContain("duplicate");
  });

  it("honours the traveller's own excludes and pins", () => {
    const excluded = makeContext();
    excluded.profile = makeProfile({ excludes: ["record-1"] });
    expect(codes(allRejections(only(makeRecord(), excluded)))).toEqual(["excluded_by_traveller"]);

    const pinned = makeContext();
    pinned.profile = makeProfile({ pins: ["record-1"] });
    expect(codes(allRejections(only(makeRecord(), pinned)))).toEqual(["already_planned"]);
  });
});

describe("the rejection stream is complete, because the provider feed is built on it", () => {
  it("carries every rejection of every rejected record, with nothing sampled away", () => {
    const records = [
      makeRecord({ id: "far", travelMinutes: 300 }),
      makeRecord({ id: "dear", priceInr: 9000, pricePerPersonInr: 9000 }),
      makeRecord({ id: "closed", openingHours: { weekly: {}, confidence: "verified" } }),
      makeRecord({ id: "unverified-hours", openingHours: { weekly: {}, confidence: "unverified" } }),
      makeRecord({ id: "fine", priceInr: 50 }),
      makeRecord({ id: "small", capacity: 1 }),
    ];
    const ctx = makeContext({ partySize: 6, budgetInr: 1000 });
    const result = gate(records, ctx, { windowFor: windowFor(ctx) });

    const rejectedCount = result.rejected.reduce((sum, entry) => sum + entry.rejections.length, 0);
    const streamCount = result.stream.reduce((sum, entry) => sum + entry.rejections.length, 0);

    expect(result.passed.map((r) => r.id)).toEqual(["fine"]);
    expect(result.rejected).toHaveLength(5);
    expect(streamCount).toBe(rejectedCount);
    expect(result.stream).toHaveLength(result.rejected.length);
    expect(result.stream.map((entry) => entry.id)).toEqual(result.rejected.map((entry) => entry.record.id));
    // The advisory abstention rides along with the blocking one, not instead of it.
    expect(codes(result.stream.find((entry) => entry.id === "unverified-hours")?.rejections ?? [])).toContain(
      "hours_unverified",
    );
  });

  it("is empty when nothing was rejected", () => {
    const result = only(makeRecord(), makeContext());
    expect(result.stream).toEqual([]);
    expect(dominantRejection(result.stream.flatMap((entry) => entry.rejections))).toBeNull();
  });
});
