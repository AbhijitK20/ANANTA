import { describe, expect, it } from "vitest";

import { BROWSE_POOL, DEFAULT_TRAVEL_MODE, retrieve } from "./retrieve";
import { buildCityIndex, buildIndex } from "./index-builder";
import { TEST_MANIFEST, makeManyRecords, makeRecord } from "./fixtures";

const TESTSIDE = TEST_MANIFEST.neighbourhoods[0].coordinates;
const KM_PER_DEG_LNG = 111.319 * Math.cos((TESTSIDE[1] * Math.PI) / 180);
const eastOf = (km: number): [number, number] => [TESTSIDE[0] + km / KM_PER_DEG_LNG, TESTSIDE[1]];

/**
 * Distances on foot from the first anchor, so every ranking assertion in this
 * file is a real ordering: near-park 0.5 km, riverside-tea 1.5, kanheri 2.5,
 * the park 3, far-park 30. A 20 minute budget is therefore about 1.2 km.
 */
const CATALOGUE = [
  makeRecord({
    id: "sanjay-gandhi-national-park",
    name: "Sanjay Gandhi National Park",
    area: "Hillside",
    category: "Nature",
    description: "A large park with a trail network and a lake.",
    coordinates: eastOf(3),
  }),
  makeRecord({
    id: "kanheri-trailhead",
    name: "Kanheri Trailhead",
    area: "Hillside",
    category: "Nature",
    description: "Start of the bamboo trail, off the Sanjay Gandhi park road.",
    coordinates: eastOf(2.5),
  }),
  makeRecord({
    id: "riverside-tea",
    name: "Riverside Tea Stall",
    area: "Riverside",
    category: "Food",
    description: "Chai and two chairs under a tree.",
    coordinates: eastOf(1.5),
  }),
  makeRecord({ id: "near-park", name: "Park Gate Chai", area: "Hillside", category: "Food", coordinates: eastOf(0.5) }),
  makeRecord({ id: "far-park", name: "Distant Park Annex", area: "Nowhere", category: "Nature", coordinates: eastOf(30) }),
];

const cityIndex = buildCityIndex(CATALOGUE, TEST_MANIFEST);
const bareIndex = buildIndex(CATALOGUE);
const base = { origin: TESTSIDE, limit: 10 } as const;

describe("retrieve", () => {
  it("ranks the exact name above an incidental description mention", () => {
    const result = retrieve(cityIndex, { ...base, query: "Sanjay Gandhi National Park" });
    expect(result.ids[0]).toBe("sanjay-gandhi-national-park");
    expect(result.via["sanjay-gandhi-national-park"]).toBe("bm25");
    expect(result.scores["sanjay-gandhi-national-park"]).toBeGreaterThan(result.scores["kanheri-trailhead"]);
  });

  it("labels a record found by both text and facets as a union", () => {
    const result = retrieve(cityIndex, { ...base, query: "park", categories: ["Nature"] });
    expect(result.via["sanjay-gandhi-national-park"]).toBe("union");
  });

  it("returns nothing when the query matches nothing at all", () => {
    const result = retrieve(cityIndex, { ...base, query: "submarine" });
    expect(result.ids).toEqual([]);
    expect(result.totalConsidered).toBe(CATALOGUE.length);
  });

  it("treats maxTravelMinutes as a floor, not a ranking hint", () => {
    const unbounded = retrieve(cityIndex, { ...base, query: "park", limit: 10 });
    expect(unbounded.ids).toContain("far-park");

    // 20 minutes on foot from the first anchor is about 1.2 km.
    const bounded = retrieve(cityIndex, { ...base, query: "park", maxTravelMinutes: 20, limit: 10 });
    expect(bounded.ids).not.toContain("far-park");
    expect(bounded.totalConsidered).toBeLessThan(CATALOGUE.length);
    for (const id of bounded.ids) {
      const record = CATALOGUE.find((entry) => entry.id === id);
      expect(record?.coordinates[0]).toBeLessThan(TESTSIDE[0] + 2 / KM_PER_DEG_LNG);
    }
  });

  it("still applies the floor to a record that scored highest on text", () => {
    const index = buildCityIndex(
      [
        makeRecord({ id: "textual", name: "Quarry Restaurant", description: "Quarry views, quarry paths.", coordinates: eastOf(40) }),
        makeRecord({ id: "physical", name: "Corner Cafe", description: "Small and quiet.", coordinates: eastOf(0.2) }),
      ],
      TEST_MANIFEST,
    );
    const unbounded = retrieve(index, { ...base, query: "quarry" });
    expect(unbounded.ids[0]).toBe("textual");
    const bounded = retrieve(index, { ...base, query: "quarry", maxTravelMinutes: 20 });
    expect(bounded.ids).toEqual([]);
  });

  it("answers a facet-only call ranked by affinity to the origin", () => {
    const result = retrieve(cityIndex, { ...base, query: "", categories: ["Food"] });
    expect(result.ids).toEqual(["near-park", "riverside-tea"]);
    expect(result.via["near-park"]).toBe("facet");
    expect(result.via["riverside-tea"]).toBe("facet");
    expect(Object.keys(result.scores)).toEqual([]);
  });

  it("answers a facet-only call with no categories by returning the nearest records", () => {
    const result = retrieve(cityIndex, { ...base, query: "" });
    expect(result.ids[0]).toBe("near-park");
    expect(result.via["near-park"]).toBe("isochrone");
    expect(result.totalConsidered).toBe(CATALOGUE.length);
  });

  it("caps ids at the limit while scores still cover the runners up", () => {
    const result = retrieve(cityIndex, { ...base, query: "park", limit: 1 });
    expect(result.ids).toHaveLength(1);
    expect(Object.keys(result.scores).length).toBeGreaterThan(1);
  });

  it("returns nothing for a limit of zero or less", () => {
    expect(retrieve(cityIndex, { ...base, query: "park", limit: 0 }).ids).toEqual([]);
    expect(retrieve(cityIndex, { ...base, query: "park", limit: -3 }).ids).toEqual([]);
  });

  it("filters on area, case insensitively, and ranks the matches by affinity", () => {
    const result = retrieve(cityIndex, { ...base, query: "", area: "hillside" });
    expect(result.ids).toEqual(["near-park", "kanheri-trailhead", "sanjay-gandhi-national-park"]);
  });

  it("filters on a scoped tag and on a bare tag in any dimension", () => {
    expect(retrieve(cityIndex, { ...base, query: "", tags: ["category:nature"] }).ids.sort()).toEqual([
      "far-park",
      "kanheri-trailhead",
      "sanjay-gandhi-national-park",
    ]);
    // A bare tag matches the value wherever it appears.
    expect(retrieve(cityIndex, { ...base, query: "", tags: ["quiet_space"] }).ids).toEqual([]);
  });

  it("requires every constraint, not any of them", () => {
    const result = retrieve(cityIndex, { ...base, query: "", categories: ["Food"], area: "Riverside" });
    expect(result.ids).toEqual(["riverside-tea"]);
  });

  it("skips the isochrone when the index carries no city, rather than guessing one", () => {
    const result = retrieve(bareIndex, { ...base, query: "park", maxTravelMinutes: 20 });
    expect(result.totalConsidered).toBe(CATALOGUE.length);
    expect(result.ids).toContain("far-park");
  });

  it("walks a large catalogue without a budget and reports what it considered", () => {
    const index = buildCityIndex(makeManyRecords(1107), TEST_MANIFEST);
    const result = retrieve(index, { origin: TESTSIDE, query: "", limit: 25 });
    expect(result.ids).toHaveLength(25);
    expect(result.totalConsidered).toBe(1107);
    expect(BROWSE_POOL).toBe(120);
    expect(DEFAULT_TRAVEL_MODE).toBe("walk");
  });

  it("cuts a large catalogue down to the reachable set when a budget is given", () => {
    const index = buildCityIndex(makeManyRecords(1107), TEST_MANIFEST);
    const result = retrieve(index, { origin: TESTSIDE, query: "", maxTravelMinutes: 20, limit: 50 });
    expect(result.totalConsidered).toBeLessThan(1107);
    expect(result.totalConsidered).toBeGreaterThan(0);
    for (const id of result.ids) expect(result.via[id]).toBeDefined();
  });

  it("gives every returned id a reason", () => {
    const result = retrieve(cityIndex, { ...base, query: "park", maxTravelMinutes: 20 });
    for (const id of result.ids) {
      expect(["bm25", "facet", "isochrone", "union"]).toContain(result.via[id]);
    }
  });

  it("is deterministic across repeated calls and across input order", () => {
    const shuffled = buildCityIndex(CATALOGUE.slice().reverse(), TEST_MANIFEST);
    const options = { ...base, query: "park", maxTravelMinutes: 60, limit: 5 };
    expect(retrieve(cityIndex, options).ids).toEqual(retrieve(cityIndex, options).ids);
    expect(retrieve(shuffled, options).ids).toEqual(retrieve(cityIndex, options).ids);
  });
});
