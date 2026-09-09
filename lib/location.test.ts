import { describe, expect, it } from "vitest";
import { bandFor, demoUserLocation, estimateAllFromUser, estimateFromUser, formatDistance, haversineKm, proximityBonus, walkMinutesFor } from "@/lib/location";
import { experienceSeed } from "@/lib/seed";

describe("haversineKm", () => {
  it("is zero for identical points", () => {
    expect(haversineKm([72.83, 18.93], [72.83, 18.93])).toBe(0);
  });

  it("is honest for a known pair", () => {
    // Churchgate to Marine Drive seafront is roughly one kilometer.
    const km = haversineKm(demoUserLocation.coordinates, [72.8216, 18.944]);
    expect(km).toBeGreaterThan(0.5);
    expect(km).toBeLessThan(1.5);
  });
});

describe("walkMinutesFor and formatDistance", () => {
  it("uses five minutes per kilometer with a one minute floor", () => {
    expect(walkMinutesFor(0)).toBe(1);
    expect(walkMinutesFor(2)).toBe(10);
  });

  it("formats meters below one kilometer", () => {
    expect(formatDistance(0.4)).toBe("400 m");
    expect(formatDistance(3.2)).toBe("3.2 km");
  });
});

describe("estimateFromUser", () => {
  it("adds a street factor to the straight-line walk estimate", () => {
    const { km, walkMinutes } = estimateFromUser([72.8311, 18.9275]);
    expect(walkMinutes).toBe(Math.round(km * 1.3 * 5));
  });
});

describe("estimateAllFromUser", () => {
  it("covers every seeded experience with a display label", () => {
    const estimates = estimateAllFromUser(experienceSeed);
    expect(Object.keys(estimates)).toHaveLength(experienceSeed.length);
    for (const experience of experienceSeed) {
      expect(estimates[experience.id].label).toContain("min walk");
    }
  });
});

describe("proximityBonus", () => {
  it("decays with distance and never exceeds three points", () => {
    expect(proximityBonus(1)).toBe(3);
    expect(proximityBonus(4)).toBe(2);
    expect(proximityBonus(8)).toBe(1);
    expect(proximityBonus(25)).toBe(0);
  });
});

describe("bandFor", () => {
  it("buckets by walking time", () => {
    expect(bandFor(15)).toBe("Walkable");
    expect(bandFor(45)).toBe("Short ride");
    expect(bandFor(90)).toBe("Across town");
  });
});
