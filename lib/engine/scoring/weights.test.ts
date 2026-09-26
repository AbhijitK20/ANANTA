import { describe, expect, it } from "vitest";
import type { Weights } from "@/lib/engine/contracts";
import {
  DEFAULT_WEIGHT_PRIOR_STRENGTH,
  PRIOR_WEIGHTS,
  WEIGHT_COMPONENT_KEYS,
  WEIGHT_KEYS,
  clampWeights,
  diffWeights,
} from "@/lib/engine/scoring/weights";

const COMPONENT_KEYS = [
  "interest",
  "rating",
  "value",
  "authenticity",
  "weather",
  "crowd",
  "novelty",
  "groupFit",
  "travelFriction",
  "reliability",
] as const;

function total(weights: Weights): number {
  return COMPONENT_KEYS.reduce((sum, key) => sum + weights[key], 0);
}

describe("PRIOR_WEIGHTS", () => {
  it("has every key of the frozen type, so nothing reads as undefined", () => {
    for (const key of WEIGHT_KEYS) expect(PRIOR_WEIGHTS[key], key).toBeTypeOf("number");
    expect(WEIGHT_KEYS).toHaveLength(12);
  });

  it("makes interest the largest share and reliability the smallest, which is the stated intent", () => {
    const shares = clampWeights(PRIOR_WEIGHTS);
    const ranked = COMPONENT_KEYS.slice().sort((a, b) => shares[b] - shares[a]);
    expect(ranked[0]).toBe("interest");
    expect(ranked[ranked.length - 1]).toBe("reliability");
  });

  it("keeps a weak prior, because a strong one would freeze the learned panel", () => {
    expect(DEFAULT_WEIGHT_PRIOR_STRENGTH).toBe(2);
  });
});

describe("clampWeights", () => {
  it("divides the ten utility weights into a partition summing to 1", () => {
    const shares = clampWeights(PRIOR_WEIGHTS);
    expect(total(shares)).toBeCloseTo(1, 12);
    expect(shares.interest).toBeCloseTo(0.1626016260, 10);
    expect(shares.groupFit).toBeCloseTo(0.1300813008, 10);
    expect(shares.reliability).toBeCloseTo(0.0406504065, 10);
  });

  it("preserves the sum after clamping, so the objective scale survives a slider drag", () => {
    const dragged: Weights = {
      ...PRIOR_WEIGHTS,
      interest: 1000,
      rating: -4,
      value: 0,
      authenticity: 0.5,
      weather: 0.5,
      crowd: 0.5,
      novelty: 0.5,
      groupFit: 0.5,
      travelFriction: 0.5,
      reliability: 0.5,
    };
    const shares = clampWeights(dragged);
    expect(total(shares)).toBeCloseTo(1, 12);
    for (const key of COMPONENT_KEYS) {
      expect(shares[key], key).toBeGreaterThanOrEqual(0);
      expect(shares[key], key).toBeLessThanOrEqual(1);
    }
    // A negative and a zero both floor at 0, and a thousand keeps its share
    // rather than saturating, so the drag above cannot blow the objective's
    // scale up or down.
    expect(shares.rating).toBe(0);
    expect(shares.value).toBe(0);
    expect(shares.interest).toBeCloseTo(1000 / 1003.5, 12);
    const largest = COMPONENT_KEYS.slice().sort((a, b) => shares[b] - shares[a])[0];
    expect(largest).toBe("interest");
  });

  it("is scale invariant, so a uniformly rescaled profile cannot move the objective", () => {
    const doubled: Weights = {
      interest: 2, rating: 1.1, value: 1.2, authenticity: 1.4, weather: 1,
      crowd: 1.2, novelty: 0.9, groupFit: 1.6, travelFriction: 1.4, reliability: 0.5,
      travelPenalty: 0.008, pacePenalty: 0.7,
    };
    const base = clampWeights(PRIOR_WEIGHTS);
    const scaled = clampWeights(doubled);
    for (const key of COMPONENT_KEYS) {
      expect(scaled[key], key).toBeCloseTo(base[key], 12);
    }
  });

  it("clamps both penalties into 0 to 1 and leaves them unnormalised", () => {
    const clamped = clampWeights({ ...PRIOR_WEIGHTS, travelPenalty: 9, pacePenalty: -1 });
    expect(clamped.travelPenalty).toBe(1);
    expect(clamped.pacePenalty).toBe(0);
    expect(clampWeights(PRIOR_WEIGHTS).travelPenalty).toBe(0.004);
    expect(clampWeights(PRIOR_WEIGHTS).pacePenalty).toBe(0.35);
  });

  it("leaves an all zero request at zero rather than silently substituting the prior", () => {
    const zeroed: Weights = {
      interest: 0, rating: 0, value: 0, authenticity: 0, weather: 0,
      crowd: 0, novelty: 0, groupFit: 0, travelFriction: 0, reliability: 0,
      travelPenalty: 0, pacePenalty: 0,
    };
    expect(total(clampWeights(zeroed))).toBe(0);
  });

  it("is idempotent, so re-clamping a normalised vector does not move the numbers", () => {
    const once = clampWeights(PRIOR_WEIGHTS);
    const twice = clampWeights(once);
    for (const key of WEIGHT_KEYS) expect(twice[key], key).toBeCloseTo(once[key], 12);
  });

  it("does not mutate its argument", () => {
    const input: Weights = { ...PRIOR_WEIGHTS };
    clampWeights(input);
    expect(input).toEqual(PRIOR_WEIGHTS);
  });

  it("never returns a number that is not finite, whatever it is fed", () => {
    const broken: Weights = { ...PRIOR_WEIGHTS, interest: Number.NaN, rating: Number.POSITIVE_INFINITY };
    const clamped = clampWeights(broken);
    for (const key of WEIGHT_KEYS) expect(Number.isFinite(clamped[key]), key).toBe(true);
    expect(clamped.interest).toBe(0);
  });
});

describe("WEIGHT_COMPONENT_KEYS", () => {
  it("is the ten component keys in the ComponentId declaration order, penalties excluded", () => {
    expect(WEIGHT_COMPONENT_KEYS).toEqual(COMPONENT_KEYS);
  });
});

describe("diffWeights", () => {
  it("reports the change per key as after minus before", () => {
    const before = clampWeights(PRIOR_WEIGHTS);
    const after = clampWeights({ ...PRIOR_WEIGHTS, interest: 2, reliability: 0.1 });
    const delta = diffWeights(before, after);
    expect(delta.interest).toBeCloseTo(after.interest - before.interest, 12);
    expect(delta.interest).toBeGreaterThan(0);
    expect(delta.reliability).toBeLessThan(0);
    expect(delta.travelPenalty).toBe(0);
  });

  it("covers every key including the two penalties", () => {
    const delta = diffWeights(PRIOR_WEIGHTS, clampWeights(PRIOR_WEIGHTS));
    expect(Object.keys(delta).sort()).toEqual(WEIGHT_KEYS.slice().sort());
  });
});
