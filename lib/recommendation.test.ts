import { describe, expect, it } from "vitest";
import { recommendExperiences } from "@/lib/recommendation";
import { experienceSeed } from "@/lib/seed";

describe("recommendExperiences", () => {
  it("keeps Mumbai food within budget and excludes other records with reasons", () => {
    const result = recommendExperiences(experienceSeed, { city: "Mumbai", category: "Food", maxPrice: 800, intentApplied: true });
    expect(result.ranked.map(({ experience }) => experience.id)).toEqual(["matunga-breakfast-trail"]);
    expect(result.excluded.find(({ experience }) => experience.id === "vashi-market-loop")?.reasons).toContain("Outside Mumbai");
  });

  it("includes travel and buffer in the available-time constraint", () => {
    const result = recommendExperiences(experienceSeed, { availableMinutes: 90, intentApplied: true });
    expect(result.excluded.find(({ experience }) => experience.id === "matunga-breakfast-trail")?.reasons[0]).toContain("including travel and buffer");
  });

  it("excludes weather-dependent records in rain mode", () => {
    const result = recommendExperiences(experienceSeed, { rainMode: true, intentApplied: true });
    expect(result.excluded.find(({ experience }) => experience.id === "kharghar-hills-view")?.reasons).toContain("Weather dependent");
  });

  it("supports direct locality search", () => {
    const result = recommendExperiences(experienceSeed, { query: "Matunga", intentApplied: false });
    expect(result.ranked.map(({ experience }) => experience.id)).toEqual(["matunga-breakfast-trail"]);
  });

  it("excludes an experience that its provider marked closed", () => {
    const result = recommendExperiences(experienceSeed, { availability: { "matunga-breakfast-trail": "Closed" } });
    expect(result.ranked.some(({ experience }) => experience.id === "matunga-breakfast-trail")).toBe(false);
    expect(result.excluded.find(({ experience }) => experience.id === "matunga-breakfast-trail")?.reasons).toContain("Provider marked this experience closed");
  });
});
