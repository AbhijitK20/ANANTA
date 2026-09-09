import { describe, expect, it } from "vitest";
import { closedPlanItems, suggestClosedReplacements } from "@/lib/adapt";
import { experienceSeed } from "@/lib/seed";

const [kala, matunga, vashi, kharghar] = experienceSeed;

describe("closedPlanItems", () => {
  it("finds only planned items the provider marked closed", () => {
    const closed = closedPlanItems([kala, matunga], { [kala.id]: "Closed", [matunga.id]: "Open" });
    expect(closed.map(({ id }) => id)).toEqual([kala.id]);
  });
});

describe("suggestClosedReplacements", () => {
  it("proposes a feasible replacement when a planned place closes", () => {
    const suggestions = suggestClosedReplacements({
      plan: [kala, matunga],
      catalog: experienceSeed,
      budget: 1500,
      availableMinutes: 240,
      availability: { [kala.id]: "Closed" },
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].closed.id).toBe(kala.id);
    expect(suggestions[0].replacement?.id).toBe(vashi.id);
  });

  it("never proposes a replacement that breaks the budget", () => {
    const suggestions = suggestClosedReplacements({
      plan: [matunga],
      catalog: experienceSeed,
      budget: 400,
      availableMinutes: 240,
      availability: { [matunga.id]: "Closed" },
    });
    expect(suggestions[0].replacement?.id).toBe(vashi.id);
  });

  it("reports honestly when no candidate keeps the plan feasible", () => {
    const suggestions = suggestClosedReplacements({
      plan: [vashi],
      catalog: experienceSeed,
      budget: 100,
      availableMinutes: 30,
      availability: { [vashi.id]: "Closed" },
    });
    expect(suggestions[0].replacement).toBeUndefined();
    expect(suggestions[0].candidatesConsidered).toBe(3);
    expect(suggestions[0].detail).toContain("No listed alternative");
  });

  it("skips weather-dependent candidates in rain mode", () => {
    const suggestions = suggestClosedReplacements({
      plan: [kala],
      catalog: experienceSeed,
      budget: 1500,
      availableMinutes: 600,
      availability: { [kala.id]: "Closed" },
      rainMode: true,
    });
    expect(suggestions[0].replacement?.statusTone).not.toBe("amber");
  });
});
