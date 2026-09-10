import { describe, expect, it } from "vitest";
import { parseDiscoveryIntent } from "@/lib/discovery";

describe("parseDiscoveryIntent", () => {
  it("maps lowercase category words onto canonical dataset categories", () => {
    for (const [word, canonical] of [
      ["food", "Food"],
      ["nightlife", "Nightlife"],
      ["shopping", "Shopping"],
      ["adventure", "Adventure"],
      ["recreation", "Recreation"],
      ["stay", "Stay"],
      ["culture", "Culture"],
      ["nature", "Nature"],
      ["workshop", "Workshop"],
      ["family", "Family"],
      ["hotels", "Stay"],
      ["restaurants", "Food"],
      ["trekking", "Adventure"],
    ] as const) {
      const intent = parseDiscoveryIntent(`any ${word} suggestions`);
      expect(intent.category, word).toBe(canonical);
    }
  });

  it("detects city, budget, duration, and rain intents", () => {
    const intent = parseDiscoveryIntent("cheap hotels in Navi Mumbai under ₹4000 for 3 hours, rainy day");
    expect(intent.category).toBe("Stay");
    expect(intent.city).toBe("Navi Mumbai");
    expect(intent.maxPrice).toBe(4000);
    expect(intent.availableMinutes).toBe(180);
    expect(intent.weather).toBe("rain");
  });

  it("returns no category for free-form text without a category word", () => {
    const intent = parseDiscoveryIntent("something quiet to do");
    expect(intent.category).toBeUndefined();
    expect(intent.city).toBeUndefined();
    expect(intent.maxPrice).toBeUndefined();
  });
});
