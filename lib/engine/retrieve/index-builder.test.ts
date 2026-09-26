import { describe, expect, it } from "vitest";

import { PHRASE_DESCRIPTION_BOOST, PHRASE_NAME_BOOST, buildCityIndex, buildIndex, phraseBoost, withManifest } from "./index-builder";
import { foldForMatch } from "./tokenize";
import { TEST_MANIFEST, makeManyRecords, makeRecord } from "./fixtures";

const CATALOGUE = [
  makeRecord({
    id: "sanjay-gandhi-national-park",
    name: "Sanjay Gandhi National Park",
    area: "Borivali East",
    description: "A large park north of the city, with a trail network and a lake.",
  }),
  makeRecord({
    id: "kanheri-trailhead",
    name: "Kanheri Trailhead",
    area: "Borivali East",
    description: "Start of the bamboo trail, reached from Sanjay Gandhi National Park road.",
  }),
  makeRecord({
    id: "unrelated",
    name: "Fort Reading Room",
    area: "Fort",
    description: "Quiet tables and a lamp, no hills.",
  }),
];

describe("buildIndex", () => {
  it("indexes every id in ascending order, whatever order it was given", () => {
    const forward = buildIndex(CATALOGUE);
    const reversed = buildIndex(CATALOGUE.slice().reverse());
    expect(forward.ids).toEqual(["kanheri-trailhead", "sanjay-gandhi-national-park", "unrelated"]);
    expect(reversed.ids).toEqual(forward.ids);
  });

  it("keeps the record so a caller never has to carry a parallel array", () => {
    const index = buildIndex(CATALOGUE);
    expect(index.records.get("unrelated")?.name).toBe("Fort Reading Room");
  });

  it("carries no manifest when it was built without one", () => {
    expect(buildIndex(CATALOGUE).manifest).toBeNull();
  });

  it("adds a manifest without rebuilding anything", () => {
    const bare = buildIndex(CATALOGUE);
    const withCity = withManifest(bare, TEST_MANIFEST);
    expect(withCity.manifest).toBe(TEST_MANIFEST);
    expect(withCity.ids).toBe(bare.ids);
    expect(withCity.bm25).toBe(bare.bm25);
    expect(withCity.facets).toBe(bare.facets);
    expect(buildCityIndex(CATALOGUE, TEST_MANIFEST).manifest).toBe(TEST_MANIFEST);
  });

  it("deduplicates by id", () => {
    const index = buildIndex([CATALOGUE[0], CATALOGUE[0]]);
    expect(index.ids).toEqual(["sanjay-gandhi-national-park"]);
  });

  it("handles an empty catalogue", () => {
    const index = buildIndex([]);
    expect(index.ids).toEqual([]);
    expect(index.bm25.docCount).toBe(0);
    expect(index.bm25.score(["anything"], "anything")).toBe(0);
  });

  it("builds 1107 records inside the interactive budget", () => {
    const records = makeManyRecords(1107);
    // Median of three, not a single cold call: the first execution of a module
    // in a vitest worker is dominated by the transform environment rather than
    // by the build, and the explore page calls this from a `useMemo` on an
    // engine that is already warm.
    //
    // Measured on the development machine: 24 ms median under tsx, 60 ms median
    // inside the vitest worker, which runs everything about two and a half times
    // slower. The bound sits at 150 ms so it is not a hardware assertion, and a
    // six times slower index still fails it.
    //
    // performance.now, not Date.now: the no-model guard forbids an unguarded
    // clock anywhere under lib/engine, and this is a measurement, not a value.
    const samples: number[] = [];
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now();
      const index = buildIndex(records);
      samples.push(performance.now() - started);
      expect(index.ids).toHaveLength(1107);
      expect(index.bm25.docCount).toBe(1107);
    }
    samples.sort((a, b) => a - b);
    expect(samples[1]).toBeLessThan(150);
  });
});

describe("phrase index", () => {
  it("beats an incidental description mention with the whole query as a phrase", () => {
    const index = buildIndex(CATALOGUE);
    const folded = foldForMatch("Sanjay Gandhi National Park");
    const exact = phraseBoost(index, "sanjay-gandhi-national-park", folded);
    const incidental = phraseBoost(index, "kanheri-trailhead", folded);
    expect(exact).toBe(PHRASE_NAME_BOOST);
    expect(incidental).toBe(PHRASE_DESCRIPTION_BOOST);
    expect(exact).toBeGreaterThan(incidental);
  });

  it("adds both boosts when the query is the name and also appears in the description", () => {
    const index = buildIndex([
      makeRecord({ id: "both", name: "Riverside Walk", description: "Everyone calls it Riverside Walk." }),
    ]);
    expect(phraseBoost(index, "both", "riverside walk")).toBe(PHRASE_NAME_BOOST + PHRASE_DESCRIPTION_BOOST);
  });

  it("returns zero for an empty query so a blank search never scores", () => {
    const index = buildIndex(CATALOGUE);
    expect(phraseBoost(index, "sanjay-gandhi-national-park", "")).toBe(0);
  });

  it("returns zero for an unknown record rather than throwing", () => {
    expect(phraseBoost(buildIndex(CATALOGUE), "missing", "park")).toBe(0);
  });
});
