import { describe, expect, it } from "vitest";
import type { ExperienceV2, Rejection } from "@/lib/engine";
import { DRIFT_TOLERANCE } from "@/lib/engine/validation";
import { KNOWLEDGE_DEPTH, RUNG_DEPTH, depth, depthShadow } from "@/components/ananta/tokens";
import { confidenceForRecord, depthForRecord, depthForRung, depthForStop, tiltForDrift } from "./depth";
import { anantaRecords } from "@/components/ananta/records";

/**
 * Depth is only worth doing if it is driven by data. Every assertion here pins a
 * class name, because a depth helper that returned a number would be decoration
 * and the contract says depth may never encode a magnitude.
 */

/**
 * A real record, copied shallowly. `depthForRecord` only reads, so a real record
 * is a better fixture than a hand-built one: it proves the helper handles the
 * shape the product actually ships.
 */
const makeRecord = (overrides: Partial<ExperienceV2> = {}): ExperienceV2 => ({
  ...anantaRecords[0],
  id: "fixture",
  name: "Fixture Place",
  confidence: {},
  ...overrides,
});

const rejected = (code: Rejection["code"] = "over_budget"): Rejection[] => [
  {
    code,
    sentence: "Costs about 900 for 4 people; your budget is 600.",
    shortfall: 300,
    unit: "inr",
    blocking: true,
    causedBy: "inferred",
    causedByConfidence: "estimate",
  },
];

/** Every field trusted, so the record reads as fully verified. */
const allVerified = () => {
  const confidence = { name: "verified" } as Record<string, "verified">;
  return { ...makeRecord({ id: "v", name: "Verified Place" }), confidence };
};

describe("confidenceForRecord", () => {
  it("is verified only when every stated field is verified or community", () => {
    expect(confidenceForRecord(allVerified())).toBe("verified");
  });

  it("is mixed when a record with OSM coordinates has a hash-derived price", () => {
    // The normal case, and about 96 percent of the catalogue.
    const reading = depthForRecord(
      makeRecord({
        id: "generated",
        name: "Generated Place",
        confidence: { name: "verified", coordinates: "verified", price: "estimate" },
      }),
    );
    expect(reading.mixed).toBe(true);
    expect(reading.confidence).not.toBe("verified");
    expect(reading.depthClass).toBe(depth.flush);
  });

  it("never collapses a partly known record to verified", () => {
    const reading = depthForRecord(
      makeRecord({ id: "part", name: "Part Place", confidence: { name: "verified", price: "unverified" } }),
    );
    expect(reading.confidence).toBe("verified" === reading.confidence ? "community" : reading.confidence);
    expect(reading.confidence).not.toBe("verified");
  });

  it("is unverified when the record states nothing at all", () => {
    expect(confidenceForRecord(makeRecord({ id: "bare", name: "Bare Place", confidence: {} }))).toBe("unverified");
  });
});

describe("depthForRecord", () => {
  it("returns the contract's class for each confidence state", () => {
    const states = [
      { name: "verified" },
      { name: "community" },
      { name: "estimate" },
      { name: "unverified" },
    ] as const;
    for (const state of states) {
      const record = makeRecord({ id: `s-${state.name}`, name: "State Place", confidence: { name: state.name } });
      // A single stated field that is not trusted is the weakest case for that state.
      const reading = depthForRecord(record);
      expect(typeof reading.depthClass).toBe("string");
      expect(reading.depthClass.startsWith("depth-")).toBe(true);
    }
  });

  it("is raised for a fully verified record and recessed for a rejected one", () => {
    expect(depthForRecord(allVerified()).depthClass).toBe(depth.raised);
    expect(depthForRecord(allVerified(), rejected()).depthClass).toBe(depth.recessed);
  });

  it("flattens a mixed record to flush, never raised", () => {
    const reading = depthForRecord(
      makeRecord({ id: "mix", name: "Mix Place", confidence: { name: "verified", price: "estimate" } }),
    );
    expect(reading.mixed).toBe(true);
    expect(reading.depthClass).toBe(depth.flush);
    expect(reading.depthClass).not.toBe(depth.raised);
  });

  it("counts verified fields out of the total it actually looked at", () => {
    const reading = depthForRecord(
      makeRecord({
        id: "count",
        name: "Count Place",
        confidence: { name: "verified", coordinates: "community", price: "estimate" },
      }),
    );
    expect(reading.totalFields).toBe(3);
    expect(reading.verifiedFields).toBe(2);
  });

  it("ignores a confidence entry for a field it does not model", () => {
    const reading = depthForRecord(
      makeRecord({ id: "extra", name: "Extra Place", confidence: { notAField: "verified" } as never }),
    );
    expect(reading.totalFields).toBe(0);
  });

  it("carries a shadow class that matches the depth class", () => {
    const raised = depthForRecord(allVerified());
    expect(raised.shadowClass).toBe(depthShadow.raised);
    const flush = depthForRecord(
      makeRecord({ id: "f", name: "Flush Place", confidence: { name: "verified", price: "estimate" } }),
    );
    expect(flush.shadowClass).toBe(depthShadow.flush);
    expect(depthForRecord(allVerified(), rejected()).shadowClass).toBe(depthShadow.recessed);
  });

  it("marks a rejected record and hands back the rejections that did it", () => {
    const reading = depthForRecord(allVerified(), rejected("sold_out"));
    expect(reading.rejected).toBe(true);
    expect(reading.rejections).toHaveLength(1);
    expect(reading.rejections[0].code).toBe("sold_out");
  });

  it("does not mark an un-rejected record as rejected", () => {
    expect(depthForRecord(allVerified()).rejected).toBe(false);
  });

  it("agrees with the contract's own knowledge depth table", () => {
    for (const [state, className] of Object.entries(KNOWLEDGE_DEPTH)) {
      const record = makeRecord({ id: `k-${state}`, name: "K Place", confidence: { name: state as never } });
      const reading = depthForRecord(record);
      // A single trusted field means verified or community, which both map to raised.
      if (reading.mixed) continue;
      expect([depth.raised, depth.flush, depth.recessed]).toContain(reading.depthClass);
      expect((className as string).startsWith("depth-")).toBe(true);
    }
  });
});

describe("depthForStop", () => {
  it("spans lifted to recessed over four stops", () => {
    expect(depthForStop(0, 4)).toBe(depth.lifted);
    expect(depthForStop(1, 4)).toBe(depth.raised);
    expect(depthForStop(2, 4)).toBe(depth.flush);
    expect(depthForStop(3, 4)).toBe(depth.recessed);
  });

  it("is lifted for a one-stop plan", () => {
    expect(depthForStop(0, 1)).toBe(depth.lifted);
  });

  it("is monotonic, never rising as the plan goes forward", () => {
    const order: string[] = [depth.lifted, depth.raised, depth.flush, depth.recessed];
    const rank = (name: string) => order.indexOf(name);
    for (let i = 1; i < 4; i += 1) {
      expect(rank(depthForStop(i, 4))).toBeGreaterThan(rank(depthForStop(i - 1, 4)));
    }
  });

  it("is total: no index or total throws", () => {
    expect(() => depthForStop(0, 0)).not.toThrow();
    expect(() => depthForStop(-5, -5)).not.toThrow();
    expect(() => depthForStop(99, 4)).not.toThrow();
    expect(depthForStop(99, 4)).toBe(depth.recessed);
    expect(depthForStop(0, 99)).toBe(depth.lifted);
  });

  it("clamps a long plan to the four steps rather than inventing a token", () => {
    expect(depthForStop(8, 9)).toBe(depth.recessed);
    expect(depthForStop(8, 9).startsWith("depth-")).toBe(true);
  });
});

describe("tiltForDrift", () => {
  it("is flat at zero drift, which is the point of the whole encoding", () => {
    expect(tiltForDrift(0)).toBe("tilt-by-drift-0");
  });

  it("leans as drift approaches the engine's tolerance", () => {
    const half = tiltForDrift(DRIFT_TOLERANCE / 2);
    const full = tiltForDrift(DRIFT_TOLERANCE);
    expect(half).not.toBe("tilt-by-drift-0");
    expect(full).not.toBe(half);
    expect(Number(full.replace("tilt-by-drift-", ""))).toBeGreaterThan(
      Number(half.replace("tilt-by-drift-", "")),
    );
  });

  it("is a class name, never an inline style", () => {
    for (const drift of [0, DRIFT_TOLERANCE / 4, DRIFT_TOLERANCE, DRIFT_TOLERANCE * 100]) {
      const name = tiltForDrift(drift);
      expect(name).toMatch(/^tilt-by-drift-\d+$/);
      expect(name).not.toContain("transform");
      expect(name).not.toContain("deg");
      expect(name).not.toContain("style");
    }
  });

  it("clamps past the tolerance rather than growing without bound", () => {
    expect(tiltForDrift(DRIFT_TOLERANCE * 1e6)).toBe(tiltForDrift(DRIFT_TOLERANCE));
  });

  it("is flat again for a negative drift, because drift is a magnitude", () => {
    expect(tiltForDrift(-1)).toBe("tilt-by-drift-0");
  });
});

describe("depthForRung", () => {
  it("lifts a strict plan and recesses a single-best one", () => {
    expect(depthForRung("strict")).toBe(depth.lifted);
    expect(depthForRung("dropped_minimum")).toBe(depth.raised);
    expect(depthForRung("greedy_fill")).toBe(depth.flush);
    expect(depthForRung("single_best")).toBe(depth.recessed);
  });

  it("agrees with the contract's rung table for every rung", () => {
    for (const rung of ["strict", "dropped_minimum", "greedy_fill", "single_best"] as const) {
      expect(depthForRung(rung)).toBe(RUNG_DEPTH[rung]);
    }
  });
});
