import { describe, expect, it } from "vitest";
import { evaluatePlan, generatePlanVariants, parseDurationMinutes } from "@/lib/plan";
import { experienceSeed } from "@/lib/seed";

const freePlaces = experienceSeed.filter((experience) => experience.price === "Free");

describe("plan calculations", () => {
  it("parses hour and minute durations", () => {
    expect(parseDurationMinutes("2.5 hours")).toBe(150);
    expect(parseDurationMinutes("90 min")).toBe(90);
  });

  it("includes activity, access estimate, and buffer", () => {
    const place = experienceSeed.find((experience) => experience.id === "kala-ghoda-art-walk")!;
    const result = evaluatePlan([place], 1000, 180);
    expect(result.totalMinutes).toBe(147);
    expect(result.totalCost).toBe(700);
    expect(result.feasible).toBe(true);
  });

  it("only returns feasible plan variants", () => {
    const current = freePlaces.slice(0, 2);
    const variants = generatePlanVariants(current, experienceSeed, 800, 240);
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.every(({ evaluation }) => evaluation.feasible)).toBe(true);
    expect(variants.every(({ experiences }) => experiences.length === current.length)).toBe(true);
  });

  it("does not duplicate identical variants", () => {
    const variants = generatePlanVariants([freePlaces[0]], experienceSeed, 1000, 240);
    const signatures = variants.map(({ experiences }) => experiences.map(({ id }) => id).sort().join(","));
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});
