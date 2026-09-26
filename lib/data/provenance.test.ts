import { describe, expect, it } from "vitest";
import {
  buildProvenance,
  PROVENANCE_BY_BASIS,
  PROVENANCED_FIELDS,
  resolveProvenance,
  type Basis,
} from "@/lib/data/ananta/provenance";
import { parseDurationMinutes, parsePriceInr, haversineKm, estimateTravelMinutes, inferIndoor } from "@/lib/data/ananta/adapter";
import { experienceSeed } from "@/lib/seed";
import { enrich } from "@/lib/data/ananta/records";
import { curatedRecordIds } from "@/lib/data/ananta/curated";

/**
 * The rules, pinned to exact values. A provenance rule that drifts silently is
 * worse than no provenance rule, because the UI will then confidently display
 * an estimate as a fact.
 */

describe("provenance rules", () => {
  it("maps every basis to exactly one provenance and confidence", () => {
    expect(PROVENANCE_BY_BASIS.curated_verified).toEqual({ provenance: "curated", confidence: "verified" });
    expect(PROVENANCE_BY_BASIS.curated_community).toEqual({ provenance: "curated", confidence: "community" });
    expect(PROVENANCE_BY_BASIS.provider_submitted).toEqual({ provenance: "provider", confidence: "community" });
    expect(PROVENANCE_BY_BASIS.osm_match).toEqual({ provenance: "osm", confidence: "verified" });
    expect(PROVENANCE_BY_BASIS.geometry_derived).toEqual({ provenance: "derived", confidence: "estimate" });
    expect(PROVENANCE_BY_BASIS.hash_inferred).toEqual({ provenance: "inferred", confidence: "estimate" });
    expect(PROVENANCE_BY_BASIS.absent).toEqual({ provenance: "inferred", confidence: "unverified" });
  });

  it("never calls a hash a curated fact", () => {
    // The single rule that decides whether this dataset is honest.
    const hash = resolveProvenance("price", "hash_inferred");
    expect(hash.provenance).not.toBe("curated");
    expect(hash.provenance).toBe("inferred");
    expect(hash.confidence).toBe("estimate");
  });

  it("refuses to call anything but name, category and coordinates an OSM fact", () => {
    for (const field of PROVENANCED_FIELDS) {
      if (field === "name" || field === "category" || field === "coordinates") {
        expect(resolveProvenance(field, "osm_match").provenance, field).toBe("osm");
        continue;
      }
      // OSM does not carry a price, a duration, or a step-free entrance. A match
      // on an OSM element proves nothing about them, so the call must be a bug.
      expect(() => resolveProvenance(field, "osm_match"), field).toThrow(/OpenStreetMap fact/);
    }
  });

  it("requires a basis for all nineteen fields and refuses to build without one", () => {
    expect(PROVENANCED_FIELDS).toHaveLength(19);
    const complete = Object.fromEntries(PROVENANCED_FIELDS.map((f) => [f, "absent"])) as Record<
      (typeof PROVENANCED_FIELDS)[number],
      Basis
    >;
    const { provenance, confidence } = buildProvenance(complete);
    for (const field of PROVENANCED_FIELDS) {
      expect(provenance[field], field).toBe("inferred");
      expect(confidence[field], field).toBe("unverified");
    }
    // A missing field must fail loudly rather than becoming an undefined entry.
    const partial = { ...complete } as Record<string, Basis>;
    delete partial.price;
    expect(() => buildProvenance(partial as Record<(typeof PROVENANCED_FIELDS)[number], Basis>)).toThrow();
  });
});

describe("v1 string parsing", () => {
  it("reads minutes and hours out of the frozen duration strings", () => {
    expect(parseDurationMinutes("45 min")).toBe(45);
    expect(parseDurationMinutes("90 min")).toBe(90);
    expect(parseDurationMinutes("2 hours")).toBe(120);
    expect(parseDurationMinutes("2.5 hours")).toBe(150);
    expect(parseDurationMinutes("Overnight")).toBe(1440);
    expect(parseDurationMinutes("2 nights")).toBe(2880);
    expect(parseDurationMinutes("a while")).toBeNull();
  });

  it("reads rupees out of the frozen price strings and treats free as zero", () => {
    expect(parsePriceInr("₹700")).toBe(700);
    expect(parsePriceInr("From ₹300")).toBe(300);
    expect(parsePriceInr("₹50 entry")).toBe(50);
    expect(parsePriceInr("Free")).toBe(0);
    expect(parsePriceInr("Free entry")).toBe(0);
    expect(parsePriceInr("₹1,500")).toBe(1500);
    expect(parsePriceInr("ask")).toBeNull();
  });

  it("measures real distance, not a hash", () => {
    // CSMT to Gateway of India is about 1.6 km as the crow flies.
    const km = haversineKm([72.8331, 18.9317], [72.8229, 18.9220]);
    expect(km).toBeGreaterThan(1.3);
    expect(km).toBeLessThan(1.9);
    expect(haversineKm([72.8331, 18.9317], [72.8331, 18.9317])).toBe(0);
  });

  it("never reports a zero minute leg, because a free leg is not a leg", () => {
    expect(estimateTravelMinutes([72.8331, 18.9317], [72.8331, 18.9317], "walk")).toBe(1);
    expect(estimateTravelMinutes([72.8331, 18.9317], [73.0679, 19.0469], "auto")).toBeGreaterThan(30);
  });

  it("infers indoor from the record's own words", () => {
    expect(inferIndoor("Kanheri Caves trek inside SGNP", "Nature")).toBe("outdoor");
    expect(inferIndoor("RBI Monetary Museum", "Culture")).toBe("indoor");
    expect(inferIndoor("Fort Bakery Lanes", "Food")).toBe("mixed");
  });
});

describe("enrich is deterministic", () => {
  it("produces deep-equal output for the same input and the same now", () => {
    for (const base of experienceSeed.slice(0, 6)) {
      const a = enrich(base, "2026-09-20");
      const b = enrich(base, "2026-09-20");
      expect(b).toEqual(a);
    }
  });

  it("moves exactly one field when now moves, and that field is the timestamp", () => {
    const base = experienceSeed[0];
    const january = enrich(base, "2026-01-01");
    const september = enrich(base, "2026-09-20");
    expect(january.availability.updatedAt).toBe("2026-01-01");
    expect(september.availability.updatedAt).toBe("2026-09-20");
    const { availability: _jan, ...januaryRest } = january;
    const { availability: _sep, ...septemberRest } = september;
    expect(septemberRest).toEqual(januaryRest);
  });

  it("reads no clock of its own", () => {
    // A read of Date.now() would break the snapshot reproducibility that the
    // drift test and the geocode workflow both depend on.
    const before = enrich(experienceSeed[3], "2026-09-20");
    const original = Date.now;
    let called = 0;
    Date.now = () => { called += 1; return original(); };
    try {
      enrich(experienceSeed[3], "2026-09-20");
    } finally {
      Date.now = original;
    }
    expect(called).toBe(0);
    expect(enrich(experienceSeed[3], "2026-09-20")).toEqual(before);
  });
});

describe("curated record ids", () => {
  it("covers real hand-authored facts, not the whole dataset", () => {
    expect(curatedRecordIds.size).toBeGreaterThan(80);
  });
});
