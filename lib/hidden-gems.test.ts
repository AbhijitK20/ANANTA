import { describe, expect, it } from "vitest";
import { hiddenGemCandidates } from "@/lib/hidden-gems";

describe("hiddenGemCandidates", () => {
  it("only proposes candidates that exist in the curated seed", () => {
    for (const candidate of hiddenGemCandidates()) {
      expect(candidate.sourceUrl).toContain("example.com/sources/");
      expect(candidate.verificationHistory.length).toBeGreaterThan(0);
    }
  });

  it("attaches safety flags and history to every candidate", () => {
    const candidates = hiddenGemCandidates();
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    for (const candidate of candidates) {
      expect(candidate.safetyFlags.length).toBeGreaterThan(0);
      expect(candidate.verificationHistory.at(-1)?.state).toContain("Awaiting");
    }
  });

  it("keeps the aarey candidate pending with its lighting and flood flags", () => {
    const aarey = hiddenGemCandidates().find(({ id }) => id === "aarey-colony-nature-trail");
    expect(aarey?.safetyFlags.map(({ field }) => field)).toEqual(["After dark", "Weather"]);
    expect(aarey?.verificationHistory.at(-1)?.state).toBe("Awaiting operator verification");
  });
});
