import { describe, expect, it } from "vitest";
import type { Stop } from "@/lib/engine";
import { MUMBAI_MANIFEST } from "@/lib/engine";
import { HAND_WRITTEN_IDS, anantaById, anantaRecords } from "@/components/ananta/records";
import { PRIOR_WEIGHTS } from "@/components/ananta/learning";
import {
  buildStops,
  clockLabel,
  contextFromInput,
  defaultTestInput,
  makeTravelOptions,
  objectiveFast,
  objectiveNaive,
  runPipeline,
  wilsonLowerBound,
} from "@/components/ananta/pipeline";

/**
 * One runnable check for the arithmetic the traveller screens depend on.
 *
 * The drift assertion is the important one: the composed objective and the
 * independent re-derivation must agree to 1e-6, because a drift that big means
 * the number shown on the card and the number the validator checked are two
 * different numbers.
 */

const weights = PRIOR_WEIGHTS;

function stopsFor(ids: string[]) {
  const ctx = contextFromInput(defaultTestInput({ availableMinutes: 600, budgetInr: 9000 }), MUMBAI_MANIFEST);
  const options = makeTravelOptions(ctx, anantaRecords);
  return { ctx, stops: buildStops(ids, ctx, options) };
}

describe("objective agreement", () => {
  it("agrees between the composed and the independent re-derivation", () => {
    const { ctx, stops } = stopsFor(["marine-drive-sunset-walk", "girgaon-chowpatty-snack-trail"]);
    const fast = objectiveFast(stops, ctx, weights);
    const naive = objectiveNaive(stops, ctx, weights);
    expect(Math.abs(fast.value - naive.value)).toBeLessThanOrEqual(1e-6);
  });

  it("agrees for a single stop", () => {
    const { ctx, stops } = stopsFor(["powai-lakeside-loop"]);
    expect(Math.abs(objectiveFast(stops, ctx, weights).value - objectiveNaive(stops, ctx, weights).value)).toBeLessThanOrEqual(1e-6);
  });

  it("agrees for a three stop plan", () => {
    const { ctx, stops } = stopsFor([
      "marine-drive-sunset-walk",
      "shivaji-park-heritage-loop",
      "vashi-mini-seashore-walk",
    ]);
    expect(Math.abs(objectiveFast(stops, ctx, weights).value - objectiveNaive(stops, ctx, weights).value)).toBeLessThanOrEqual(1e-6);
  });

  it("agrees for an empty plan", () => {
    const { ctx, stops } = stopsFor([]);
    expect(objectiveFast(stops, ctx, weights).value).toBe(0);
  });
});

describe("clock", () => {
  it("formats minutes past midnight as a real clock", () => {
    expect(clockLabel(0)).toBe("12:00 AM");
    expect(clockLabel(9 * 60 + 5)).toBe("9:05 AM");
    expect(clockLabel(12 * 60)).toBe("12:00 PM");
    expect(clockLabel(13 * 60 + 15)).toBe("1:15 PM");
    expect(clockLabel(24 * 60 + 30)).toBe("12:30 AM");
  });
});

describe("wilson lower bound", () => {
  it("is zero with no reviews, because zero reviews is not a bad rating", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
    expect(wilsonLowerBound(30, 0)).toBe(0);
  });

  it("is lower than the raw proportion and rises with sample size", () => {
    const small = wilsonLowerBound(8, 10);
    const large = wilsonLowerBound(800, 1000);
    expect(small).toBeLessThan(0.8);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThan(0.8);
  });

  it("is zero for a record with no review count, which is every record today", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
    for (const record of anantaRecords.slice(0, 20)) {
      expect(record.reviewCount).toBeNull();
      expect(record.ratingSum).toBeNull();
    }
  });
});

describe("pipeline order", () => {
  it("retrieves, then gates, then ranks, and reports each count", () => {
    const run = runPipeline(defaultTestInput({ query: "food", availableMinutes: 300, budgetInr: 2000 }), weights);
    expect(run.consideredCount).toBe(anantaRecords.length);
    expect(run.retrievalCount).toBeLessThanOrEqual(120);
    expect(run.retrievalCount).toBeGreaterThan(0);
    expect(run.gated.passed.length + run.gated.rejected.length).toBe(run.retrievalCount);
    // Nothing reaches the ranked list without passing the gate first.
    const passed = new Set(run.gated.passed.map((record) => record.id));
    for (const row of run.ranked) expect(passed.has(row.record.id)).toBe(true);
  });

  it("never ranks a record it refused", () => {
    const run = runPipeline(defaultTestInput({ availableMinutes: 240, budgetInr: 300 }), weights);
    const refused = new Set(run.gated.rejected.map((row) => row.record.id));
    for (const row of run.ranked) expect(refused.has(row.record.id)).toBe(false);
  });

  it("refuses everything above the budget with a real number in the sentence", () => {
    const run = runPipeline(defaultTestInput({ availableMinutes: 600, budgetInr: 100 }), weights);
    for (const row of run.gated.rejected) {
      const money = row.rejections.filter((item) => item.code === "over_budget" && item.blocking);
      if (money.length) {
        expect(money[0].shortfall).toBeGreaterThan(0);
        expect(money[0].sentence).toMatch(/\d/);
        expect(money[0].causedByConfidence).toBeTruthy();
      }
    }
  });

  it("marks unverified hours as advisory, never blocking", () => {
    const run = runPipeline(defaultTestInput({ availableMinutes: 600, budgetInr: 9000 }), weights);
    for (const row of run.gated.stream) {
      for (const item of row.rejections) {
        if (item.code === "hours_unverified") expect(item.blocking).toBe(false);
      }
    }
  });
});

describe("provenance honesty", () => {
  it("never calls a hash-derived price curated", () => {
    // `lib/data/factory.ts` picks every generated price and duration with
    // `hash(id)`, so every non-hand-written record must say so.
    const generated = anantaRecords.filter((record) => !HAND_WRITTEN_IDS.has(record.id));
    expect(generated.length).toBeGreaterThan(1000);
    for (const record of generated) {
      expect(record.provenance.price).toBe("inferred");
      expect(record.confidence.price).toBe("estimate");
      const source = record.sources.price;
      expect(source).toBeDefined();
      expect(source?.score).toBeLessThan(0.5);
      expect(source?.note).toMatch(/estimate/i);
    }
  });

  it("marks the hand-written seed as curated, and only the hand-written seed", () => {
    const curated = anantaRecords.filter((record) => record.provenance.price === "curated");
    expect(curated.length).toBe(HAND_WRITTEN_IDS.size);
    for (const record of curated) expect(HAND_WRITTEN_IDS.has(record.id)).toBe(true);
  });

  it("never links to example.com", () => {
    for (const record of anantaRecords) {
      for (const source of Object.values(record.sources)) {
        if (source.sourceUrl) expect(source.sourceUrl).not.toContain("example.com");
      }
    }
  });

  it("gives every field a provenance and a confidence", () => {
    const fields = Object.keys(anantaRecords[0].provenance);
    for (const record of anantaRecords.slice(0, 50)) {
      for (const field of fields) {
        expect(record.provenance[field as keyof typeof record.provenance]).toBeTruthy();
        expect(record.confidence[field as keyof typeof record.confidence]).toBeTruthy();
        expect(record.sources[field as keyof typeof record.sources]).toBeTruthy();
      }
    }
  });
});

describe("stop arithmetic", () => {
  it("sums arriveBy in order and never goes backwards", () => {
    const { stops } = stopsFor(["vashi-mini-seashore-walk", "powai-lakeside-loop", "marine-drive-sunset-walk"]);
    let previous = 0;
    for (const stop of stops) {
      expect(stop.arriveBy).toBeGreaterThan(previous - 1);
      previous = stop.arriveBy;
    }
  });

  it("adds the buffer once per stop", () => {
    const { stops } = stopsFor(["marine-drive-sunset-walk", "powai-lakeside-loop"]);
    const total = stops.reduce((sum, stop) => sum + stop.bufferMinutes, 0);
    expect(total).toBe(stops.length * 15);
  });
});

describe("anantaById", () => {
  it("resolves every record in the catalogue", () => {
    for (const record of anantaRecords) expect(anantaById[record.id]).toBe(record);
  });
});

export type { Stop };
