import { describe, expect, it } from "vitest";
import { recommendExperiences } from "@/lib/recommendation";
import { experienceSeed } from "@/lib/seed";

describe("recommendExperiences", () => {
  it("keeps every ranked record inside the requested city and category", () => {
    const result = recommendExperiences(experienceSeed, { city: "Mumbai", category: "Food", maxPrice: 800, intentApplied: true });
    expect(result.ranked.length).toBeGreaterThan(0);
    for (const { experience } of result.ranked) {
      expect(experience.city).toBe("Mumbai");
      expect(experience.category).toBe("Food");
      expect(experience.id).not.toBe("vashi-market-loop");
    }
    expect(result.excluded.find(({ experience }) => experience.id === "vashi-market-loop")?.reasons).toContain("Outside Mumbai");
  });

  it("includes travel and buffer in the available-time constraint", () => {
    const result = recommendExperiences(experienceSeed, { availableMinutes: 90, intentApplied: true });
    for (const { experience, reasons } of result.ranked) {
      const excluded = result.excluded.find((item) => item.experience.id === experience.id);
      expect(excluded).toBeUndefined();
      void reasons;
    }
    expect(result.excluded.length).toBeGreaterThan(0);
    expect(result.excluded.every(({ reasons }) => reasons.some((reason) => reason.includes("minutes")))).toBe(true);
  });

  it("excludes every weather-dependent record in rain mode", () => {
    const result = recommendExperiences(experienceSeed, { rainMode: true, intentApplied: true });
    const amber = experienceSeed.filter((experience) => experience.statusTone === "amber");
    expect(amber.length).toBeGreaterThan(1);
    for (const experience of amber) {
      expect(result.excluded.find((item) => item.experience.id === experience.id)?.reasons).toContain("Weather dependent");
    }
    expect(result.ranked.every(({ experience }) => experience.statusTone !== "amber")).toBe(true);
  });

  it("supports direct locality search", () => {
    const result = recommendExperiences(experienceSeed, { query: "Matunga", intentApplied: false });
    expect(result.ranked.map(({ experience }) => experience.id)).toContain("matunga-breakfast-trail");
    expect(result.ranked.every(({ experience }) => `${experience.name} ${experience.area} ${experience.city} ${experience.zone}`.toLowerCase().includes("matunga"))).toBe(true);
  });

  it("excludes an experience that its provider marked closed", () => {
    const result = recommendExperiences(experienceSeed, { availability: { "matunga-breakfast-trail": "Closed" } });
    expect(result.ranked.some(({ experience }) => experience.id === "matunga-breakfast-trail")).toBe(false);
    expect(result.excluded.find(({ experience }) => experience.id === "matunga-breakfast-trail")?.reasons).toContain("Provider marked this experience closed");
  });
});
