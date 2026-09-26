import { describe, expect, it } from "vitest";
import { STAR_SCALE, WILSON_Z, wilsonLowerBound } from "@/lib/engine/scoring/wilson";

describe("wilsonLowerBound", () => {
  it("scores no reviews as zero, not as a prior", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it("scores a null total and a null positive as zero", () => {
    expect(wilsonLowerBound(null, 40)).toBe(0);
    expect(wilsonLowerBound(40, null)).toBe(0);
    expect(wilsonLowerBound(null, null)).toBe(0);
  });

  it("keeps one perfect review strictly below 1, which is the point of a lower bound", () => {
    const bound = wilsonLowerBound(1, 1);
    expect(bound).toBeGreaterThan(0);
    expect(bound).toBeLessThan(1);
    expect(bound).toBeCloseTo(0.2065, 4);
  });

  it("is the symmetric case at two of two, and matches the closed form to the digit", () => {
    const z2 = WILSON_Z * WILSON_Z;
    const n = 2;
    const expected = (1 + z2 / (2 * n) - WILSON_Z * Math.sqrt((0 + z2 / 4) / n)) / (1 + z2 / n);
    expect(wilsonLowerBound(2, 2)).toBeCloseTo(expected, 12);
    expect(wilsonLowerBound(2, 2)).toBeCloseTo(0.2062, 4);
  });

  it("rises with sample size at a fixed mean, which is the whole point of using it", () => {
    const atFive = wilsonLowerBound(0.8 * 5, 5);
    const atFifty = wilsonLowerBound(0.8 * 50, 50);
    const atFiveHundred = wilsonLowerBound(0.8 * 500, 500);
    expect(atFive).toBeLessThan(atFifty);
    expect(atFifty).toBeLessThan(atFiveHundred);
    expect(atFive).toBeCloseTo(0.145, 4);
    expect(atFifty).toBeCloseTo(0.5061, 4);
    expect(atFiveHundred).toBeCloseTo(0.7056, 4);
  });

  it("is below the raw mean for every sample size, never above it", () => {
    for (const n of [1, 3, 10, 100, 1000]) {
      const mean = 0.72;
      expect(wilsonLowerBound(mean * n, n)).toBeLessThan(mean);
    }
  });

  it("keeps a corrupted sum from ever buying a bound of 1", () => {
    expect(wilsonLowerBound(600, 100)).toBeLessThan(1);
    expect(wilsonLowerBound(-50, 100)).toBe(0);
  });

  it("rejects non-finite input rather than propagating NaN into the objective", () => {
    expect(wilsonLowerBound(Number.NaN, 100)).toBe(0);
    expect(wilsonLowerBound(50, Number.POSITIVE_INFINITY)).toBe(0);
    expect(Number.isNaN(wilsonLowerBound(Number.NaN, Number.NaN))).toBe(false);
  });

  it("treats a negative total as no evidence", () => {
    expect(wilsonLowerBound(0, -5)).toBe(0);
  });

  it("publishes the 95% quantile and the rating scale it is expressed in", () => {
    expect(WILSON_Z).toBe(1.96);
    expect(STAR_SCALE).toBe(5);
  });
});
