import { describe, expect, it } from "vitest";
import { makeContext, makeRecords, TEST_CITY } from "./fixtures.test";
import { buildDistanceMatrix, matrixLookup } from "./distance";
import { buildRadiusGraph, clusterRadiusKm } from "./graph";
import { bronKerbosch, cliqueDiameter, clusterCandidates, diameterBounded } from "./cliques";

const records = makeRecords();
const km = matrixLookup(buildDistanceMatrix(records, 19.09));
const ids = records.map((record) => record.id);

describe("clusterRadiusKm", () => {
  it("comes from the manifest congestion and the available window", () => {
    const base = makeContext({ travelMode: "walk" });
    expect(clusterRadiusKm(base)).toBe(clusterRadiusKm(makeContext({ travelMode: "walk", availableMinutes: base.availableMinutes })));
    const shorter = clusterRadiusKm(makeContext({ travelMode: "walk", availableMinutes: 30 }));
    const longer = clusterRadiusKm(makeContext({ travelMode: "walk", availableMinutes: 120 }));
    expect(shorter).toBe(1.295);
    expect(longer).toBe(5.175);
    expect(shorter).toBeLessThan(longer);
  });

  it("is clamped so neither a short window nor a whole day becomes a scatter", () => {
    expect(clusterRadiusKm(makeContext({ travelMode: "walk", availableMinutes: 10 }))).toBe(0.8);
    expect(clusterRadiusKm(makeContext({ travelMode: "walk", availableMinutes: 5000 }))).toBe(6);
  });

  it("grows when the city is congested", () => {
    const clear = makeContext({ travelMode: "walk", availableMinutes: 60 });
    const jammed = makeContext({
      travelMode: "walk",
      availableMinutes: 60,
      city: { ...TEST_CITY, congestion: { ...TEST_CITY.congestion, walk: 2.5 } },
    });
    expect(clusterRadiusKm(jammed)).toBeGreaterThan(clusterRadiusKm(clear));
  });

  it("stays inside the diameter bound the packer applies, whatever the window", () => {
    for (const minutes of [10, 30, 60, 240, 600, 5000]) {
      expect(clusterRadiusKm(makeContext({ travelMode: "taxi", availableMinutes: minutes }))).toBeLessThanOrEqual(6);
    }
  });
});

describe("buildRadiusGraph", () => {
  const graph = buildRadiusGraph(ids, km, 1.2);

  it("links only pairs inside the radius, both ways", () => {
    for (const id of graph.ids) {
      for (const other of graph.neighbours[id]) {
        expect(ids).toContain(other);
        expect(km(id, other)).toBeLessThanOrEqual(1.2);
        expect(graph.neighbours[other]).toContain(id);
      }
    }
    expect(graph.neighbours["r00"]).not.toContain("r04");
    expect(graph.neighbours["r00"]).toContain("r01");
  });

  it("sorts every adjacency list so the graph has one shape", () => {
    for (const id of graph.ids) expect(graph.neighbours[id]).toEqual([...graph.neighbours[id]].sort());
    expect(buildRadiusGraph(ids, km, 1.2)).toEqual(graph);
  });

  it("leaves an isolated node with no edges at zero radius", () => {
    const none = buildRadiusGraph(ids, km, 0);
    expect(Object.values(none.neighbours).every((list) => list.length === 0)).toBe(true);
  });
});

describe("bronKerbosch", () => {
  it("returns the known maximum clique of a hand-built graph", () => {
    // a-b-c-d is a 4-clique; e hangs off a and f hangs off d, so each is its own
    // maximal clique. Three maximal cliques, one maximum.
    const neighbours: Record<string, string[]> = {
      a: ["b", "c", "d", "e"],
      b: ["a", "c", "d"],
      c: ["a", "b", "d"],
      d: ["a", "b", "c", "f"],
      e: ["a"],
      f: ["d"],
    };
    const cliques = bronKerbosch({ ids: ["a", "b", "c", "d", "e", "f"], neighbours, radiusKm: 1 });
    expect(cliques).toEqual([["a", "b", "c", "d"], ["a", "e"], ["d", "f"]]);
  });

  it("orders cliques by size then lexicographically, and repeats exactly", () => {
    const graph = buildRadiusGraph(ids, km, 1.2);
    const first = bronKerbosch(graph);
    expect(first).toEqual(bronKerbosch(graph));
    for (let i = 1; i < first.length; i += 1) {
      const before = first[i - 1];
      const after = first[i];
      const ordered = before.length > after.length || (before.length === after.length && before.join() < after.join());
      expect(ordered).toBe(true);
    }
  });

  it("finds a 4-clique in the fixture clusters at a tight radius", () => {
    const cliques = bronKerbosch(buildRadiusGraph(ids, km, 1));
    expect(cliques[0]).toEqual(["r00", "r01", "r02", "r03"]);
  });
});

describe("diameterBounded", () => {
  it("keeps a clique inside the bound", () => {
    expect(diameterBounded(["r00", "r01", "r02"], km, 0.6)).toBe(true);
    expect(cliqueDiameter(km, ["r00", "r01", "r02"])).toBe(0.5535488086524822);
  });
  it("rejects a clique whose diameter exceeds the bound", () => {
    expect(diameterBounded(["r00", "r04", "r07"], km, 4)).toBe(false);
    expect(diameterBounded(["r00", "r04"], km, 4)).toBe(false);
    expect(diameterBounded(["r00", "r01"], km, 4)).toBe(true);
  });

  it("treats a single node as zero diameter", () => {
    expect(diameterBounded(["r00"], km, 0)).toBe(true);
  });
});

describe("clusterCandidates", () => {
  it("keeps every id exactly once, at several radii", () => {
    for (const radius of [0.6, 0.95, 1.2, 2, 4, 10]) {
      const clusters = clusterCandidates(ids, km, radius, 6, 4);
      const flattened = clusters.flatMap((cluster) => cluster.ids);
      expect(new Set(flattened).size).toBe(ids.length);
      expect([...flattened].sort()).toEqual([...ids].sort());
      expect(clusters).toEqual(clusterCandidates(ids, km, radius, 6, 4));
    }
  });

  it("groups the fixture's tight quarters into separate clusters", () => {
    const clusters = clusterCandidates(ids, km, 1, 6, 4);
    const found = clusters.map((cluster) => cluster.ids.join(","));
    expect(found).toContain("r00,r01,r02,r03");
    expect(found).toContain("r04,r05,r06");
    expect(found).toContain("r07,r08,r09");
  });

  it("never lets a cluster exceed the diameter bound", () => {
    const clusters = clusterCandidates(ids, km, 8, 4, 4);
    for (const cluster of clusters) {
      expect(cliqueDiameter(km, cluster.ids)).toBeLessThanOrEqual(4);
      expect(cluster.diameterKm).toBe(cliqueDiameter(km, cluster.ids));
    }
  });

  it("gives every oversized clique back as singletons rather than dropping it", () => {
    const clusters = clusterCandidates(ids, km, 10, 0.1, 4);
    const singletons = clusters.filter((cluster) => cluster.ids.length === 1);
    expect(singletons).toHaveLength(ids.length);
    expect(singletons.every((cluster) => cluster.diameterKm === 0)).toBe(true);
  });

  it("respects the cluster cap", () => {
    const clusters = clusterCandidates(ids, km, 1, 6, 2);
    const multi = clusters.filter((cluster) => cluster.ids.length > 1);
    expect(multi.length).toBeLessThanOrEqual(2);
  });
});
