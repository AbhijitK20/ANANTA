import { describe, expect, it } from "vitest";

import { B, FIELD_WEIGHTS, K1, buildBM25, bm25Idf, type BM25Document } from "./bm25";
import { buildIndex } from "./index-builder";
import { tokenize } from "./tokenize";
import { makeRecord } from "./fixtures";

const TINY: BM25Document[] = [
  { id: "one", fields: { name: "alpha" } },
  { id: "two", fields: { name: "beta alpha" } },
];

describe("bm25Idf", () => {
  it("uses the smoothed form, pinned to the digit", () => {
    expect(bm25Idf(2, 2)).toBeCloseTo(0.1823215567939546, 12);
    expect(bm25Idf(1107, 1)).toBeCloseTo(6.604846759199065, 12);
    expect(bm25Idf(1107, 0)).toBeCloseTo(7.703459047867175, 12);
  });

  it("never goes negative for a term present in every document", () => {
    // The unsmoothed form at df = N is ln(0.5 / 1107.5) = -7.703, which would
    // silently demote the most common word in the corpus. This is the bug the
    // `1 +` exists to prevent, so it is pinned, not assumed.
    expect(Math.log((1107 - 1107 + 0.5) / (1107 + 0.5))).toBeCloseTo(-7.703007682479236, 12);
    expect(bm25Idf(1107, 1107)).toBeGreaterThan(0);
    expect(bm25Idf(1107, 1107)).toBeCloseTo(0.0004513653879384975, 12);
    expect(bm25Idf(1107, 1107)).toBeLessThan(0.001);
  });

  it("falls as a term gets more common", () => {
    expect(bm25Idf(1107, 1)).toBeGreaterThan(bm25Idf(1107, 500));
    expect(bm25Idf(1107, 500)).toBeGreaterThan(bm25Idf(1107, 1107));
  });
});

describe("buildBM25", () => {
  it("scores a two document corpus to the hand computed value", () => {
    // Hand computed, name field weight 4, N = 2, df = 2, k1 = 1.2, b = 0.75,
    // avgDocLength = 1.5:
    //   idf            = ln(1 + 0.5/2.5)                       = 0.1823215568
    //   norm(len = 1)  = 1 - 0.75 + 0.75 * 1/1.5               = 0.75
    //   score          = idf * (4 * 2.2) / (4 + 1.2 * 0.75)    = 0.3274346326
    const index = buildBM25(TINY);
    expect(index.docCount).toBe(2);
    expect(index.avgDocLength).toBe(1.5);
    expect(index.docLengths.get("one")).toBe(1);
    expect(index.docLengths.get("two")).toBe(2);
    expect(index.docFreqs.get("alpha")).toBe(2);
    expect(index.score(["alpha"], "one")).toBeCloseTo(0.32743463261, 11);
    expect(index.score(["alpha"], "two")).toBeCloseTo(0.29171449087, 11);
  });

  it("keeps the published Okapi constants", () => {
    expect(K1).toBe(1.2);
    expect(B).toBe(0.75);
  });

  it("returns zero for an unknown document, an empty query and an unknown term", () => {
    const index = buildBM25(TINY);
    expect(index.score(["alpha"], "missing")).toBe(0);
    expect(index.score([], "one")).toBe(0);
    expect(index.score(["nothing-here"], "one")).toBe(0);
  });

  it("does not count a repeated query term twice", () => {
    const index = buildBM25(TINY);
    expect(index.score(["alpha", "alpha", "alpha"], "one")).toBe(index.score(["alpha"], "one"));
  });

  it("is reproducible", () => {
    const first = buildBM25(TINY);
    const second = buildBM25(TINY);
    expect(second.docFreqs.get("alpha")).toBe(first.docFreqs.get("alpha"));
    expect(second.score(["alpha"], "two")).toBe(first.score(["alpha"], "two"));
  });

  it("handles an empty corpus without dividing by zero", () => {
    const index = buildBM25([]);
    expect(index.docCount).toBe(0);
    expect(index.avgDocLength).toBe(0);
    expect(index.score(["alpha"], "one")).toBe(0);
  });
});

describe("field weighting", () => {
  it("ranks the record named for the query above one that only mentions it", () => {
    // "Kharghar" is a real record name in the current catalogue, so the headline
    // case is asserted against the spelling the product actually ships.
    const index = buildIndex(
      [
        makeRecord({
          id: "kharghar-hills-view",
          name: "Kharghar Hills View",
          area: "Kharghar",
          category: "Nature",
          description: "A ridge viewpoint above the valley.",
        }),
        makeRecord({
          id: "riverside-lawns",
          name: "Riverside Picnic Lawns",
          area: "Riverside",
          category: "Recreation",
          description: "A wide lawn, a short walk from Kharghar.",
        }),
      ],
    );
    const tokens = tokenize("kharghar hills");
    expect(index.bm25.score(tokens, "kharghar-hills-view")).toBeGreaterThan(
      index.bm25.score(tokens, "riverside-lawns"),
    );
  });

  it("counts the name above the description above the area above the station", () => {
    expect(FIELD_WEIGHTS.name).toBeGreaterThan(FIELD_WEIGHTS.description);
    expect(FIELD_WEIGHTS.description).toBeGreaterThan(FIELD_WEIGHTS.area);
    expect(FIELD_WEIGHTS.area).toBeGreaterThan(FIELD_WEIGHTS.station);
  });

  it("lets a name hit beat a description hit on otherwise equal records", () => {
    const index = buildIndex(
      [
        makeRecord({ id: "named", name: "Hillside Ridge", description: "Nothing here.", area: "Testside", station: "Test Central" }),
        makeRecord({
          id: "described",
          name: "Valley Path",
          description: "Hillside Ridge is worth the climb.",
          area: "Testside",
          station: "Test Central",
        }),
      ],
    );
    const tokens = tokenize("hillside ridge");
    expect(index.bm25.score(tokens, "named")).toBeGreaterThan(index.bm25.score(tokens, "described"));
  });

  it("indexes facet tags as text, so a need value is searchable", () => {
    const index = buildIndex([
      makeRecord({ id: "quiet", name: "Reading Room", description: "Two hours inside.", access: { quiet_space: true } }),
      makeRecord({ id: "loud", name: "Reading Room Annex", description: "Two hours inside.", access: { quiet_space: false } }),
    ]);
    expect(index.bm25.score(tokenize("quiet_space"), "quiet")).toBeGreaterThan(0);
    expect(index.bm25.score(tokenize("quiet_space"), "loud")).toBe(0);
  });
});
