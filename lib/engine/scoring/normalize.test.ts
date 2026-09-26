import { describe, expect, it } from "vitest";
import { clamp01, clampSigned, isFiniteNumber, normaliseBySum, safeDiv } from "@/lib/engine/scoring/normalize";

describe("clamp01", () => {
  it("passes the interior through untouched", () => {
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(1)).toBe(1);
  });

  it("saturates at both ends", () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.2)).toBe(0);
  });

  it("returns 0 for NaN and for both infinities", () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clamp01(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("clampSigned", () => {
  it("holds the contract range of minus 1 to 1", () => {
    expect(clampSigned(-0.4)).toBe(-0.4);
    expect(clampSigned(0.4)).toBe(0.4);
    expect(clampSigned(4)).toBe(1);
    expect(clampSigned(-4)).toBe(-1);
    expect(clampSigned(Number.NaN)).toBe(0);
  });
});

describe("isFiniteNumber", () => {
  it("rejects NaN and the infinities", () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("safeDiv", () => {
  it("divides normally when the denominator is usable", () => {
    expect(safeDiv(3, 4)).toBe(0.75);
  });

  it("returns 0 for a zero denominator instead of Infinity", () => {
    expect(safeDiv(3, 0)).toBe(0);
    expect(safeDiv(0, 0)).toBe(0);
    expect(safeDiv(-3, 0)).toBe(0);
  });

  it("returns 0 for NaN and Infinity on either side, never NaN", () => {
    expect(safeDiv(Number.NaN, 4)).toBe(0);
    expect(safeDiv(4, Number.NaN)).toBe(0);
    expect(safeDiv(Number.POSITIVE_INFINITY, 4)).toBe(0);
    expect(safeDiv(4, Number.POSITIVE_INFINITY)).toBe(0);
    expect(safeDiv(Number.NEGATIVE_INFINITY, 4)).toBe(0);
    expect(safeDiv(4, Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("cannot produce Infinity from a tiny non-zero denominator", () => {
    expect(safeDiv(1, 1e-320)).toBe(0);
  });
});

describe("normaliseBySum", () => {
  it("makes the values a partition that sums to 1", () => {
    const shares = normaliseBySum([0.25, 0.75]);
    expect(shares[0]).toBe(0.25);
    expect(shares[1]).toBe(0.75);
    expect(shares[0] + shares[1]).toBeCloseTo(1, 12);
  });

  it("is scale invariant, so a weight of 2 and a weight of 1 divide alike", () => {
    expect(normaliseBySum([1, 3])).toEqual([0.25, 0.75]);
    expect(normaliseBySum([2, 6])).toEqual([0.25, 0.75]);
  });

  it("never returns a value above 1, because no input can exceed the total", () => {
    const shares = normaliseBySum([5, 5, 0.0001]);
    for (const share of shares) expect(share).toBeLessThanOrEqual(1);
  });

  it("returns all zeros when there is nothing to distribute", () => {
    expect(normaliseBySum([0, 0, 0])).toEqual([0, 0, 0]);
    expect(normaliseBySum([])).toEqual([]);
  });

  it("returns zeros rather than NaN when an input is not a number", () => {
    expect(normaliseBySum([Number.NaN, 1])).toEqual([0, 1]);
    expect(normaliseBySum([Number.POSITIVE_INFINITY])).toEqual([0]);
  });

  it("clamps negative input to zero before dividing", () => {
    expect(normaliseBySum([-1, 1])).toEqual([0, 1]);
  });

  it("is stable under key order because it indexes, never enumerates", () => {
    const forward = normaliseBySum([0.1, 0.2, 0.3, 0.4]);
    const reversed = normaliseBySum([0.4, 0.3, 0.2, 0.1]);
    expect(forward.map((v) => v.toFixed(12))).toEqual(["0.100000000000", "0.200000000000", "0.300000000000", "0.400000000000"]);
    expect(reversed[0]).toBeCloseTo(forward[3], 12);
  });
});
