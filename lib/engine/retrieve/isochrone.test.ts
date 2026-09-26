import { describe, expect, it } from "vitest";

import {
  MODE_SPEED_KMH,
  NEIGHBOURHOOD_SNAP_KM,
  STREET_FACTOR,
  haversineMetres,
  isochroneIds,
  nearestNeighbourhood,
  reachableFrom,
} from "./isochrone";
import { TEST_MANIFEST, makeRecord } from "./fixtures";

/** The synthetic manifest anchors, so a test never hardcodes a coordinate twice. */
const TESTSIDE = TEST_MANIFEST.neighbourhoods[0].coordinates;
const NERUL = TEST_MANIFEST.neighbourhoods[1].coordinates;
const BELAPUR = TEST_MANIFEST.neighbourhoods[2].coordinates;

/** A point the given number of kilometres due east of the first anchor. */
const KM_PER_DEG_LNG = 111.319 * Math.cos((TESTSIDE[1] * Math.PI) / 180);
const eastOf = (km: number): [number, number] => [TESTSIDE[0] + km / KM_PER_DEG_LNG, TESTSIDE[1]];

describe("haversineMetres", () => {
  it("measures a degree of latitude to the radius of the earth", () => {
    expect(haversineMetres([0, 0], [0, 1])).toBeCloseTo(111195.0802335329, 6);
    expect(haversineMetres([0, 0], [1, 0])).toBeCloseTo(111195.0802335329, 6);
  });

  it("is zero for the same point and symmetric either way round", () => {
    expect(haversineMetres(TESTSIDE, TESTSIDE)).toBe(0);
    expect(haversineMetres(TESTSIDE, NERUL)).toBeCloseTo(haversineMetres(NERUL, TESTSIDE), 9);
  });
});

describe("reachableFrom", () => {
  it("turns a distance into minutes with the mode speed and the manifest congestion", () => {
    // 1 km straight line, 1.3 street factor, 4.8 km/h, congestion 1.
    // (1 * 1.3 / 4.8) * 60 * 1 = 16.25 min.
    const estimate = reachableFrom({ coordinates: TESTSIDE }, { coordinates: eastOf(1) }, "walk", TEST_MANIFEST);
    expect(estimate.basis).toBe("haversine");
    expect(estimate.km).toBeCloseTo(1, 2);
    expect(estimate.minutes).toBeCloseTo(16.25, 1);
    expect(STREET_FACTOR).toBe(1.3);
    expect(MODE_SPEED_KMH.walk).toBe(4.8);
  });

  it("applies the congestion multiplier for the mode it was asked about", () => {
    const target = { coordinates: eastOf(1) };
    const walk = reachableFrom({ coordinates: TESTSIDE }, target, "walk", TEST_MANIFEST);
    const auto = reachableFrom({ coordinates: TESTSIDE }, target, "auto", TEST_MANIFEST);
    expect(auto.minutes).toBeLessThan(walk.minutes);
    expect(auto.minutes).toBeCloseTo(((1 * STREET_FACTOR) / MODE_SPEED_KMH.auto) * 60 * 1.9, 0);
  });

  it("refuses to route to or from a record with no real coordinates", () => {
    expect(reachableFrom({ coordinates: [0, 0] }, { coordinates: NERUL }, "walk", TEST_MANIFEST).reachable).toBe(false);
    expect(reachableFrom({ coordinates: TESTSIDE }, { coordinates: [0, 0] }, "walk", TEST_MANIFEST).reachable).toBe(false);
    expect(
      reachableFrom({ coordinates: TESTSIDE }, { coordinates: [Number.NaN, 19] }, "walk", TEST_MANIFEST).reachable,
    ).toBe(false);
  });

  it("uses the ferry corridor from Nerul/Seawoods to Belapur, where the crow line lies", () => {
    const estimate = reachableFrom({ coordinates: NERUL, area: "Nerul/Seawoods" }, { coordinates: BELAPUR, area: "Belapur" }, "ferry", TEST_MANIFEST);
    expect(estimate.basis).toBe("corridor");
    expect(estimate.minutes).toBe(12);
    // The whole reason the corridor table exists: 3.68 km apart in a straight
    // line, which a road estimate turns into 17.08 minutes at 1.9 congestion.
    expect(estimate.km).toBeCloseTo(2.765244798, 6);
    const byRoad = reachableFrom({ coordinates: NERUL, area: "Nerul/Seawoods" }, { coordinates: BELAPUR, area: "Belapur" }, "auto", TEST_MANIFEST);
    expect(byRoad.basis).toBe("haversine");
    expect(byRoad.minutes).toBeCloseTo(17.07538662875187, 8);
    expect(byRoad.minutes).toBeGreaterThan(estimate.minutes);
  });

  it("uses the corridor in either direction", () => {
    const forward = reachableFrom({ coordinates: NERUL, area: "Nerul/Seawoods" }, { coordinates: BELAPUR, area: "Belapur" }, "ferry", TEST_MANIFEST);
    const backward = reachableFrom({ coordinates: BELAPUR, area: "Belapur" }, { coordinates: NERUL, area: "Nerul/Seawoods" }, "ferry", TEST_MANIFEST);
    expect(backward.basis).toBe("corridor");
    expect(backward.minutes).toBe(forward.minutes);
  });

  it("does not apply a corridor to a mode that is not a ferry, or to unmatched areas", () => {
    const unmatched = reachableFrom({ coordinates: NERUL, area: "Nowhere" }, { coordinates: BELAPUR, area: "Belapur" }, "ferry", TEST_MANIFEST);
    const noAreas = reachableFrom({ coordinates: NERUL }, { coordinates: BELAPUR }, "ferry", TEST_MANIFEST);
    expect(unmatched.basis).toBe("haversine");
    expect(noAreas.basis).toBe("haversine");
  });

  it("falls back to walking speed when a manifest omits the mode", () => {
    const partial = { ...TEST_MANIFEST, congestion: { walk: 1, auto: 0, taxi: 0, metro: 0, ferry: 0 } };
    const estimate = reachableFrom({ coordinates: TESTSIDE }, { coordinates: eastOf(1) }, "auto", partial);
    expect(estimate.minutes).toBeCloseTo(((1 * STREET_FACTOR) / MODE_SPEED_KMH.auto) * 60, 0);
  });
});

describe("isochroneIds", () => {
  // 1 km is 16.25 min on foot, 2 km is 32.5, 10 km is 162.5.
  const RECORDS = [
    makeRecord({ id: "near", name: "Near Place", coordinates: eastOf(1) }),
    makeRecord({ id: "mid", name: "Mid Place", coordinates: eastOf(2) }),
    makeRecord({ id: "far", name: "Far Place", coordinates: eastOf(10) }),
    makeRecord({ id: "broken", name: "Broken Place", coordinates: [0, 0] }),
  ];

  it("keeps only what is inside the budget, nearest first", () => {
    const ids = isochroneIds({ coordinates: TESTSIDE }, 40, "walk", TEST_MANIFEST, RECORDS);
    expect(ids).toEqual(["near", "mid"]);
  });

  it("breaks equal travel times on id, not on input order", () => {
    const same = [
      makeRecord({ id: "zulu", name: "Zulu Place", coordinates: eastOf(1) }),
      makeRecord({ id: "alpha", name: "Alpha Place", coordinates: eastOf(1) }),
    ];
    expect(isochroneIds({ coordinates: TESTSIDE }, 40, "walk", TEST_MANIFEST, same)).toEqual(["alpha", "zulu"]);
  });

  it("never returns a record it cannot locate", () => {
    const ids = isochroneIds({ coordinates: TESTSIDE }, 600, "walk", TEST_MANIFEST, RECORDS);
    expect(ids).not.toContain("broken");
    expect(ids).toHaveLength(3);
  });

  it("returns nothing when nothing is close enough", () => {
    expect(isochroneIds({ coordinates: TESTSIDE }, 1, "walk", TEST_MANIFEST, RECORDS)).toEqual([]);
  });

  it("returns nothing when the origin cannot be located", () => {
    expect(isochroneIds({ coordinates: [0, 0] }, 600, "walk", TEST_MANIFEST, RECORDS)).toEqual([]);
  });
});

describe("nearestNeighbourhood", () => {
  it("snaps a point onto a real anchor", () => {
    const match = nearestNeighbourhood({ coordinates: [TESTSIDE[0] + 0.001, TESTSIDE[1]] }, TEST_MANIFEST);
    expect(match?.name).toBe("Testside");
    expect(match?.km).toBeCloseTo(0.105, 2);
  });

  it("refuses to snap a point that is nowhere near an anchor", () => {
    expect(nearestNeighbourhood({ coordinates: [0, 0] }, TEST_MANIFEST)).toBeNull();
    expect(NEIGHBOURHOOD_SNAP_KM).toBe(2);
  });

  it("returns null for a manifest with no anchors", () => {
    expect(nearestNeighbourhood({ coordinates: TESTSIDE }, { ...TEST_MANIFEST, neighbourhoods: [] })).toBeNull();
  });
});
