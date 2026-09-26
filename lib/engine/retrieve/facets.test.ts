import { describe, expect, it } from "vitest";

import { buildIndex } from "./index-builder";
import { FACET_DIMENSIONS, PRICE_BANDS, facetCounts, facetValuesOf, kidFriendlyFacet, priceBand } from "./facets";
import { makeRecord } from "./fixtures";

describe("FACET_DIMENSIONS", () => {
  it("is the eleven dimensions the brief names, in render order", () => {
    expect(FACET_DIMENSIONS).toEqual([
      "category",
      "area",
      "zone",
      "station",
      "city",
      "bestTimeOfDay",
      "access",
      "diet",
      "indoor",
      "priceBand",
      "kidFriendly",
    ]);
  });
});

describe("priceBand", () => {
  it("pins every boundary", () => {
    expect(priceBand(0)).toBe("free");
    expect(priceBand(1)).toBe("under-200");
    expect(priceBand(199.99)).toBe("under-200");
    expect(priceBand(200)).toBe("200-600");
    expect(priceBand(599)).toBe("200-600");
    expect(priceBand(600)).toBe("600-1500");
    expect(priceBand(1499)).toBe("600-1500");
    expect(priceBand(1500)).toBe("1500-plus");
    expect(priceBand(100000)).toBe("1500-plus");
  });

  it("puts a missing price in unknown, never in free", () => {
    expect(priceBand(null)).toBe("unknown");
    expect(priceBand(undefined)).toBe("unknown");
    expect(priceBand(Number.NaN)).toBe("unknown");
    expect(priceBand(Number.POSITIVE_INFINITY)).toBe("unknown");
    expect(priceBand(-10)).toBe("unknown");
  });

  it("keeps unknown a real bucket", () => {
    expect(PRICE_BANDS).toContain("unknown");
    expect(PRICE_BANDS).toContain("free");
  });
});

describe("kidFriendlyFacet", () => {
  it("does not invent an answer for an unknown value", () => {
    expect(kidFriendlyFacet(true)).toBe("yes");
    expect(kidFriendlyFacet(false)).toBe("no");
    expect(kidFriendlyFacet(null)).toBe("unknown");
  });
});

describe("facetValuesOf", () => {
  it("counts only the access needs that are actually true", () => {
    const values = facetValuesOf(
      makeRecord({ id: "access", name: "Access Place", access: { step_free: false, seating_available: true, quiet_space: true, stroller_ok: false } }),
    );
    expect(values.access).toEqual(["quiet_space", "seating_available"]);
  });

  it("deduplicates and sorts diets so the stored form is stable", () => {
    const values = facetValuesOf(makeRecord({ id: "diet", name: "Diet Place", diets: ["vegan", "vegetarian", "vegan"] }));
    expect(values.diet).toEqual(["vegan", "vegetarian"]);
  });

  it("drops an empty value instead of creating an empty facet", () => {
    const values = facetValuesOf(makeRecord({ id: "s", name: "Sparse Place", station: "", description: "" }));
    expect(values.station).toEqual([]);
  });

  it("has a value in every dimension", () => {
    const values = facetValuesOf(makeRecord({ id: "all", name: "All Dims" }));
    for (const dimension of FACET_DIMENSIONS) {
      expect(values[dimension].length).toBeGreaterThan(0);
    }
  });
});

describe("facetCounts", () => {
  const CATALOGUE = [
    makeRecord({ id: "a", name: "Riverside Tea", area: "Riverside", category: "Food", priceInr: 150, kidFriendly: true }),
    makeRecord({ id: "b", name: "Riverside Diner", area: "Riverside", category: "Food", priceInr: 900, kidFriendly: true }),
    makeRecord({ id: "c", name: "Hillside Trail", area: "Hillside", category: "Nature", priceInr: 2500, kidFriendly: null }),
  ];

  it("counts a dimension, most common first, ties broken on the value", () => {
    const counts = facetCounts(buildIndex(CATALOGUE), "area");
    expect(counts).toEqual([
      { value: "Riverside", count: 2 },
      { value: "Hillside", count: 1 },
    ]);
  });

  it("breaks equal counts on the value, ascending, so the render never jitters", () => {
    const index = buildIndex([
      makeRecord({ id: "x", name: "Zebra Hall", station: "Zebra" }),
      makeRecord({ id: "y", name: "Alpha Hall", station: "Alpha" }),
      makeRecord({ id: "z", name: "Mango Hall", station: "Mango" }),
    ]);
    expect(facetCounts(index, "station").map((entry) => entry.value)).toEqual(["Alpha", "Mango", "Zebra"]);
  });

  it("restricts to the ids the caller passes, so counts respect live filters", () => {
    const index = buildIndex(CATALOGUE);
    expect(facetCounts(index, "category", ["a", "c"])).toEqual([
      { value: "Food", count: 1 },
      { value: "Nature", count: 1 },
    ]);
    expect(facetCounts(index, "category", new Set(["b"]))).toEqual([{ value: "Food", count: 1 }]);
  });

  it("puts a record with no usable price in the unknown bucket", () => {
    const index = buildIndex([
      makeRecord({ id: "priced", name: "Priced Place", priceInr: 150 }),
      makeRecord({ id: "unpriced", name: "Unpriced Place", priceInr: Number.NaN }),
      makeRecord({ id: "free", name: "Free Place", priceInr: 0 }),
    ]);
    const counts = facetCounts(index, "priceBand");
    expect(counts).toEqual([
      { value: "free", count: 1 },
      { value: "under-200", count: 1 },
      { value: "unknown", count: 1 },
    ]);
  });

  it("counts an unknown kidFriendly value without folding it into no", () => {
    const index = buildIndex([
      makeRecord({ id: "yes", name: "Yes Place", kidFriendly: true }),
      makeRecord({ id: "no", name: "No Place", kidFriendly: false }),
      makeRecord({ id: "unknown", name: "Unknown Place", kidFriendly: null }),
    ]);
    expect(facetCounts(index, "kidFriendly")).toEqual([
      { value: "no", count: 1 },
      { value: "unknown", count: 1 },
      { value: "yes", count: 1 },
    ]);
  });

  it("returns an empty list for an empty catalogue", () => {
    expect(facetCounts(buildIndex([]), "area")).toEqual([]);
  });

  it("returns an empty list when the filter excludes everything", () => {
    expect(facetCounts(buildIndex(CATALOGUE), "area", ["nope"])).toEqual([]);
  });
});
