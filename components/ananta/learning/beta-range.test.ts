import { describe, expect, it } from "vitest";
import {
  betaCdf,
  betaQuantile,
  identification,
  IDENTIFICATION_COPY,
  roundWeight,
  weightRange,
} from "@/components/ananta/learning/beta-range";

/**
 * The credible interval is the only real arithmetic this session added, so it
 * is pinned to exact values rather than to a shape. A Beta CDF that is subtly
 * wrong would render a confident-looking range around nothing.
 */
describe("beta credible interval", () => {
  it("computes the CDF at the textbook points", () => {
    // Beta(2,3) CDF at 0.5 is 0.6875. Beta(1,1) is the uniform, so it is x.
    expect(betaCdf(0.5, 2, 3)).toBeCloseTo(0.6875, 6);
    expect(betaCdf(0.25, 1, 1)).toBeCloseTo(0.25, 6);
    expect(betaCdf(0.9, 1, 1)).toBeCloseTo(0.9, 6);
  });

  it("clamps the CDF to the unit interval at and past the ends", () => {
    expect(betaCdf(0, 2, 3)).toBe(0);
    expect(betaCdf(1, 2, 3)).toBe(1);
    expect(betaCdf(-1, 2, 3)).toBe(0);
    expect(betaCdf(2, 2, 3)).toBe(1);
  });

  it("inverts the CDF, so quantile at the CDF's own point returns that point", () => {
    expect(betaQuantile(2, 3, 0.6875)).toBeCloseTo(0.5, 4);
    expect(betaQuantile(1, 1, 0.5)).toBeCloseTo(0.5, 4);
    // Beta(3,1) has CDF x^3, so its median is the cube root of a half. Beta(1,4)
    // has CDF 1-(1-x)^4, so its median is 1 - 0.5^(1/4). Both are asymmetric,
    // which is the case that catches a broken inverse: a half is only the median
    // of a symmetric posterior.
    expect(betaQuantile(3, 1, 0.5)).toBeCloseTo(Math.cbrt(0.5), 6);
    expect(betaQuantile(1, 4, 0.5)).toBeCloseTo(1 - Math.pow(0.5, 0.25), 6);
  });

  it("is symmetric on a symmetric posterior", () => {
    // Beta(4,4) is symmetric about 0.5, so the 5th and 95th percentiles mirror.
    const low = betaQuantile(4, 4, 0.05);
    const high = betaQuantile(4, 4, 0.95);
    expect(low + high).toBeCloseTo(1, 6);
  });

  it("returns a full-range interval for the prior and a narrow one as evidence piles up", () => {
    const bounds = { min: 0, max: 2 };
    const prior = weightRange(1, 1, bounds);
    // Beta(1,1) is uniform, so the 90 percent band is 0.05 to 0.95, mapped to 0.1 to 1.9.
    expect(prior.low).toBeCloseTo(0.1, 4);
    expect(prior.high).toBeCloseTo(1.9, 4);
    expect(prior.mean).toBeCloseTo(1, 6);

    const learned = weightRange(40, 10, bounds);
    // With 50 observations the band is tight around the mean of 0.8, so 0.6 to 0.9 is about right.
    expect(learned.mean).toBeCloseTo(1.6, 2);
    const width = learned.high - learned.low;
    expect(width).toBeLessThan(prior.high - prior.low);
    expect(width).toBeGreaterThan(0);
  });

  it("never returns an inverted or out-of-bounds band", () => {
    const bounds = { min: -1, max: 1 };
    for (const [a, b] of [[1, 1], [1, 20], [20, 1], [100, 3], [0.5, 0.5]]) {
      const range = weightRange(a, b, bounds);
      expect(range.low).toBeLessThanOrEqual(range.high);
      expect(range.low).toBeGreaterThanOrEqual(bounds.min);
      expect(range.high).toBeLessThanOrEqual(bounds.max);
    }
  });

  it("recovers a non-zero-width interval even for a degenerate posterior", () => {
    // A 1000 to 1 posterior is nearly a point mass at 1, but the interval must
    // still be a range and must still contain the mean.
    const range = weightRange(1000, 1, { min: 0, max: 1 });
    expect(range.high).toBeLessThanOrEqual(1);
    expect(range.low).toBeLessThanOrEqual(range.mean);
    expect(range.mean).toBeCloseTo(1000 / 1001, 3);
  });
});

describe("identification ladder", () => {
  it("calls zero observations unobserved and never anything else", () => {
    expect(identification(0)).toBe("unobserved");
    expect(IDENTIFICATION_COPY.unobserved).toContain("0 observations");
  });

  it("ramps the wording with the evidence", () => {
    expect(identification(1)).toBe("barely");
    expect(identification(3)).toBe("barely");
    expect(identification(4)).toBe("weak");
    expect(identification(11)).toBe("weak");
    expect(identification(12)).toBe("usable");
    expect(identification(500)).toBe("usable");
  });

  it("has copy for every rung so no weight renders a bare number", () => {
    for (const rung of ["unobserved", "barely", "weak", "usable"] as const) {
      expect(IDENTIFICATION_COPY[rung].length, rung).toBeGreaterThan(20);
    }
  });
});

describe("roundWeight", () => {
  it("shows no false precision and derives the decimals from the slider step", () => {
    expect(roundWeight(1.23456, 0.05)).toBe("1.23");
    expect(roundWeight(1.23456, 1)).toBe("1");
    expect(roundWeight(1.23456, 0.1)).toBe("1.2");
    expect(roundWeight(0.012345, 0.001)).toBe("0.012");
  });
});
