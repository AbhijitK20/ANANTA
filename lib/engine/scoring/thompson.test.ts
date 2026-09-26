import { describe, expect, it } from "vitest";
import type { BanditState, ComponentId } from "@/lib/engine/contracts";
import { lcg } from "@/lib/engine/scoring/fixtures.test";
import { PRIOR_WEIGHTS, WEIGHT_COMPONENT_KEYS, clampWeights } from "@/lib/engine/scoring/weights";
import { REWARD, banditFromWeights, sampleWeights, updateBandit } from "@/lib/engine/scoring/thompson";

const NOW = "2026-01-15T09:30:00.000Z";

function freshBandit(): BanditState {
  return banditFromWeights(PRIOR_WEIGHTS, NOW);
}

describe("banditFromWeights", () => {
  it("builds one arm per component and no arm for the penalties", () => {
    const bandit = freshBandit();
    expect(bandit.arms).toHaveLength(10);
    expect(bandit.observations).toBe(0);
    expect(bandit.updatedAt).toBe(NOW);
    for (const arm of bandit.arms) expect(WEIGHT_COMPONENT_KEYS).toContain(arm.component);
  });

  it("sets the posterior mean to exactly the weight, so a cold start reproduces the prior", () => {
    const prior = clampWeights(PRIOR_WEIGHTS);
    for (const arm of freshBandit().arms) {
      const key = arm.component;
      expect(arm.alpha / (arm.alpha + arm.beta), key).toBeCloseTo(prior[key], 12);
      expect(arm.pulls).toBe(0);
    }
  });

  it("keeps both Beta shapes positive even for a saturated prior weight", () => {
    const bandit = banditFromWeights({ ...PRIOR_WEIGHTS, interest: 1, reliability: 0 }, NOW);
    for (const arm of bandit.arms) {
      expect(arm.alpha, arm.component).toBeGreaterThan(0);
      expect(arm.beta, arm.component).toBeGreaterThan(0);
    }
  });
});

describe("sampleWeights", () => {
  it("returns a deterministic result for a fixed seeded generator", () => {
    const bandit = freshBandit();
    const first = sampleWeights(bandit, lcg(7));
    const second = sampleWeights(bandit, lcg(7));
    expect(first).toEqual(second);
    for (const key of WEIGHT_COMPONENT_KEYS) expect(second[key]).toBe(first[key]);
  });

  it("returns a partition that sums to 1 on every draw", () => {
    const rng = lcg(11);
    const bandit = freshBandit();
    for (let draw = 0; draw < 25; draw += 1) {
      const weights = sampleWeights(bandit, rng);
      const total = WEIGHT_COMPONENT_KEYS.reduce((sum, key) => sum + weights[key], 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it("produces a spread over 200 draws, not a point mass at the prior", () => {
    const rng = lcg(2026);
    const bandit = freshBandit();
    const prior = clampWeights(PRIOR_WEIGHTS);
    const samples: number[] = [];
    for (let draw = 0; draw < 200; draw += 1) samples.push(sampleWeights(bandit, rng).interest);
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(max - min).toBeGreaterThan(0.02);
    expect(min).toBeLessThan(prior.interest);
    expect(max).toBeGreaterThan(prior.interest);
    // A bandit that always returns the prior is not a bandit. The prior is
    // deliberately weak, so the spread is wide and the mean sits near, not on,
    // the prior share.
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    expect(Math.abs(mean - prior.interest)).toBeLessThan(0.05);
  });

  it("draws each component independently, so the ten shares are not all equal", () => {
    const rng = lcg(31);
    const bandit = freshBandit();
    const draws = Array.from({ length: 10 }, () => sampleWeights(bandit, rng));
    const distinct = new Set(draws.map((weights) => weights.interest.toFixed(9))).size;
    expect(distinct).toBeGreaterThan(1);
  });

  it("carries the penalty weights from the prior, because nothing can learn them", () => {
    const weights = sampleWeights(freshBandit(), lcg(3));
    const prior = clampWeights(PRIOR_WEIGHTS);
    expect(weights.travelPenalty).toBe(prior.travelPenalty);
    expect(weights.pacePenalty).toBe(prior.pacePenalty);
  });

  it("survives a generator that returns only zeroes or only garbage", () => {
    const bandit = freshBandit();
    const zero = sampleWeights(bandit, () => 0);
    const one = sampleWeights(bandit, () => 1);
    for (const weights of [zero, one]) {
      for (const key of WEIGHT_COMPONENT_KEYS) expect(Number.isFinite(weights[key]), key).toBe(true);
    }
  });
});

describe("updateBandit", () => {
  const allRewards = (value: number): Record<ComponentId, number> => {
    const out = {} as Record<ComponentId, number>;
    for (const key of WEIGHT_COMPONENT_KEYS) out[key as ComponentId] = value;
    return out;
  };

  it("raises every arm's mean on a save and lowers it on a reject", () => {
    const prior = clampWeights(PRIOR_WEIGHTS);
    const saved = updateBandit(freshBandit(), allRewards(REWARD.saved), NOW);
    const rejected = updateBandit(freshBandit(), allRewards(REWARD.rejected), NOW);
    for (const arm of saved.arms) {
      const mean = arm.alpha / (arm.alpha + arm.beta);
      expect(mean, arm.component).toBeGreaterThan(prior[arm.component]);
    }
    for (const arm of rejected.arms) {
      const mean = arm.alpha / (arm.alpha + arm.beta);
      expect(mean, arm.component).toBeLessThan(prior[arm.component]);
    }
  });

  it("counts one pull per arm and one observation per interaction", () => {
    const once = updateBandit(freshBandit(), allRewards(REWARD.saved), NOW);
    const twice = updateBandit(once, allRewards(REWARD.saved), NOW);
    for (const arm of twice.arms) expect(arm.pulls).toBe(2);
    expect(twice.observations).toBe(2);
  });

  it("leaves the input state untouched", () => {
    const before = freshBandit();
    const snapshot = JSON.stringify(before);
    updateBandit(before, allRewards(REWARD.saved), NOW);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("keeps the previous timestamp when no clock is passed, rather than inventing one", () => {
    const updated = updateBandit(freshBandit(), allRewards(REWARD.saved));
    expect(updated.updatedAt).toBe(NOW);
  });

  it("carries a passed clock through", () => {
    const later = "2026-02-01T18:00:00.000Z";
    expect(updateBandit(freshBandit(), allRewards(REWARD.saved), later).updatedAt).toBe(later);
  });

  it("treats a missing reward as a reject rather than inventing a neutral", () => {
    const before = freshBandit();
    const partial = { interest: REWARD.saved } as Record<ComponentId, number>;
    const updated = updateBandit(before, partial, NOW);
    const mean = (state: BanditState, component: ComponentId) => {
      const arm = state.arms.find((entry) => entry.component === component);
      return arm ? arm.alpha / (arm.alpha + arm.beta) : 0;
    };
    expect(mean(updated, "interest")).toBeGreaterThan(mean(before, "interest"));
    expect(mean(updated, "rating")).toBeLessThan(mean(before, "rating"));
  });

  it("orders the reward policy the way it is meant to be read", () => {
    expect(REWARD.saved).toBe(1);
    expect(REWARD.planNotOpened).toBe(0.4);
    expect(REWARD.swappedAway).toBe(0.1);
    expect(REWARD.rejected).toBe(0);
  });
});
