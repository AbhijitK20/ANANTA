import { describe, expect, it } from "vitest";
import { experiencesToGeoJson } from "@/lib/map-data";
import { experienceSeed } from "@/lib/seed";

describe("experience map data", () => {
  it("converts every experience into a point feature", () => {
    const collection = experiencesToGeoJson(experienceSeed);
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toHaveLength(experienceSeed.length);
    expect(collection.features[0].geometry.type).toBe("Point");
  });

  it("preserves identity and display properties", () => {
    const feature = experiencesToGeoJson(experienceSeed)["features"][0];
    expect(feature.properties.id).toBe(experienceSeed[0].id);
    expect(feature.properties.name).toBe(experienceSeed[0].name);
    expect(feature.geometry.coordinates).toEqual(experienceSeed[0].coordinates);
  });
});
