import { describe, expect, it } from "vitest";
import { applyQuickFilters, isHiddenGem } from "@/lib/quick-filters";
import { experienceSeed } from "@/lib/seed";

const byId = (id: string) => experienceSeed.find((experience) => experience.id === id)!;

describe("isHiddenGem", () => {
  it("treats resident-sourced records as gems and curated ones as not", () => {
    expect(isHiddenGem(byId("khotachiwadi-heritage-lanes"))).toBe(true);
    expect(isHiddenGem(byId("kala-ghoda-art-walk"))).toBe(false);
  });
});

describe("applyQuickFilters", () => {
  it("hidden gems keeps only resident-sourced records and cites the rule", () => {
    const result = applyQuickFilters(experienceSeed, { hiddenGems: true });
    expect(result.kept.length).toBeGreaterThan(5);
    for (const experience of result.kept) {
      expect(experience.source.startsWith("Resident recommendation")).toBe(true);
    }
    const excludedKala = result.excluded.find(({ experience }) => experience.id === "kala-ghoda-art-walk");
    expect(excludedKala?.reasons[0]).toContain("Not flagged as a hidden gem");
  });

  it("walkable excludes distant records with the measured minutes", () => {
    const result = applyQuickFilters(experienceSeed, { walkable: true });
    for (const experience of result.kept) {
      expect(experience.station).toBeDefined();
    }
    const excluded = result.excluded.find(({ experience }) => experience.id === "kanheri-caves-morning-trail");
    expect(excluded?.reasons[0]).toContain("min walk");
    expect(excluded?.reasons[0]).toContain("30 min");
  });

  it("free keeps zero-priced records and cites the listed price for others", () => {
    const result = applyQuickFilters(experienceSeed, { free: true });
    for (const experience of result.kept) {
      expect(experience.price).toBe("Free");
    }
    const excluded = result.excluded.find(({ experience }) => experience.id === "hill-road-cafe-crawl");
    expect(excluded?.reasons[0]).toContain("not free");
  });

  it("best time matches only records carrying that guidance", () => {
    const result = applyQuickFilters(experienceSeed, { bestTime: "Best after dark" });
    expect(result.kept.map(({ id }) => id).sort()).toEqual(["ncpa-waterfront-evening", "parel-mill-district-night", "prithvi-theatre-evening"]);
    const excluded = result.excluded.find(({ experience }) => experience.id === "vashi-market-loop");
    expect(excluded?.reasons[0]).toContain("No best-time guidance");
  });

  it("combines filters with AND semantics", () => {
    const result = applyQuickFilters(experienceSeed, { free: true, walkable: true });
    for (const experience of result.kept) {
      expect(experience.price).toBe("Free");
    }
  });

  it("returns everything unchanged when no filters are set", () => {
    const result = applyQuickFilters(experienceSeed, {});
    expect(result.kept).toHaveLength(experienceSeed.length);
    expect(result.excluded).toHaveLength(0);
  });
});
