import { describe, expect, it } from "vitest";
import { cellSizeForZoom, clusterMarkers } from "@/lib/cluster";
import { experienceSeed } from "@/lib/seed";

const items = experienceSeed.map(({ id, coordinates }) => ({ id, coordinates }));

describe("cellSizeForZoom", () => {
  it("widens cells at low zoom and disables clustering when zoomed in", () => {
    expect(cellSizeForZoom(8)).toBe(0.5);
    expect(cellSizeForZoom(10.3)).toBe(0.1);
    expect(cellSizeForZoom(11)).toBe(0.1);
    expect(cellSizeForZoom(13)).toBe(0.05);
    expect(cellSizeForZoom(14)).toBeUndefined();
    expect(cellSizeForZoom(16)).toBeUndefined();
  });
});

describe("clusterMarkers", () => {
  it("clusters the seed set at city zoom and expands on zoom-in", () => {
    const cityView = clusterMarkers(items, 10.3);
    const clusters = cityView.filter((entry) => entry.kind === "cluster");
    expect(clusters.length).toBeGreaterThan(0);
    expect(cityView.length).toBeLessThan(items.length);

    const street = clusterMarkers(items, 15);
    expect(street).toHaveLength(items.length);
    expect(street.every((entry) => entry.kind === "point")).toBe(true);
  });

  it("keeps every id represented exactly once at each zoom", () => {
    for (const zoom of [8, 10.3, 12, 14, 16]) {
      const ids = clusterMarkers(items, zoom).flatMap((entry) => (entry.kind === "cluster" ? entry.ids : [entry.id]));
      expect(new Set(ids).size).toBe(items.length);
      expect(ids.length).toBe(items.length);
    }
  });

  it("is deterministic for identical input", () => {
    expect(clusterMarkers(items, 10.3)).toEqual(clusterMarkers(items, 10.3));
  });
});
