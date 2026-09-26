import type { BanditArm, BanditState, ComponentId, Weights } from "@/lib/engine/contracts";
import { clamp01, isFiniteNumber, normaliseBySum, safeDiv } from "./normalize";
import { COMPONENT_WEIGHT_KEYS, DEFAULT_WEIGHT_PRIOR_STRENGTH, PRIOR_WEIGHTS, clampWeights } from "./weights";

/**
 * Thompson sampling over the ten utility components.
 *
 * `rng` is always injected. This file is the one place the guard test tolerates
 * a bare `Math.random`, and it does not use one: determinism is worth more than
 * the convenience, because an objective that cannot be reproduced cannot be
 * checked against session 6's independent derivation.
 *
 * Nothing here persists. These are pure functions over a `BanditState` value
 * that somebody else stores. Session 10 owns storage; this file owns no I/O and
 * no module state.
 */

/**
 * What counts as evidence, and how much. This is policy, so it lives in code
 * where it can be argued with rather than in a component that hard-codes it.
 */
export const REWARD = {
  /** The traveller explicitly saved it. Unambiguous, maximal evidence. */
  saved: 1,
  /**
   * It made it into a plan that was never opened. Weak positive, not neutral:
   * the ranking put it in front of someone and they walked away, which is
   * information, but it is weak information.
   */
  planNotOpened: 0.4,
  /**
   * A replan swapped it away. Near zero, because a swap is usually forced by a
   * constraint change rather than by taste, and punishing the component that
   * happened to be involved would learn the wrong lesson.
   */
  swappedAway: 0.1,
  /** The traveller explicitly rejected it. The only true zero. */
  rejected: 0,
} as const;

/**
 * Weight shares are clamped this far away from 0 and 1 before they become a
 * Beta posterior, because `alpha + beta` is fixed by the prior strength and a
 * share of exactly 0 or 1 would give one of the two shapes a zero and make the
 * sample degenerate.
 */
const MIN_ARM_SHARE = 0.01;

/** Shared mass: `alpha + beta`, chosen so the posterior mean is exactly the weight. */
function posteriorMass(strength: number): number {
  return Math.max(1, strength) + 2;
}

function armFor(weight: number, strength: number): { alpha: number; beta: number } {
  const share = Math.min(1 - MIN_ARM_SHARE, Math.max(MIN_ARM_SHARE, clamp01(weight)));
  const mass = posteriorMass(strength);
  return { alpha: share * mass, beta: (1 - share) * mass };
}

/** Box-Muller from the injected generator. `u1` is nudged off zero so the log stays finite. */
function normalSample(rng: () => number): number {
  let u1 = rng();
  if (!isFiniteNumber(u1) || u1 <= 0) u1 = 1e-12;
  const u2 = rng();
  if (!isFiniteNumber(u2)) return 0;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Rejection budget. Exhausting it falls through to the mean, so the function always returns. */
const GAMMA_MAX_DRAWS = 1000;

/** Marsaglia-Tsang, unit rate. Shape below 1 is boosted up, standard treatment. */
function gammaSample(shape: number, rng: () => number): number {
  if (!(shape > 0) || !isFiniteNumber(shape)) return 0;
  if (shape < 1) {
    let u = rng();
    if (!isFiniteNumber(u) || u <= 0) u = 1e-12;
    return gammaSample(1 + shape, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let draw = 0; draw < GAMMA_MAX_DRAWS; draw += 1) {
    const x = normalSample(rng);
    const v = 1 + c * x;
    if (!(v > 0)) continue;
    const cube = v * v * v;
    const u = rng();
    if (!isFiniteNumber(u) || u <= 0) continue;
    if (u < 1 - 0.0331 * x * x * x * x) return d * cube;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * cube;
  }
  return shape;
}

/** Beta as the ratio of two gammas, which is the definition. */
function betaSample(alpha: number, beta: number, rng: () => number): number {
  const x = gammaSample(alpha, rng);
  const y = gammaSample(beta, rng);
  if (x + y <= 0) return clamp01(safeDiv(alpha, alpha + beta));
  return clamp01(x / (x + y));
}

/** Array scan, never a Map lookup, so nothing here depends on key order. */
function findArm(bandit: BanditState, component: ComponentId, weight: number): { alpha: number; beta: number } {
  for (const arm of bandit.arms) {
    if (arm.component === component) return { alpha: arm.alpha, beta: arm.beta };
  }
  return armFor(weight, DEFAULT_WEIGHT_PRIOR_STRENGTH);
}

/**
 * One posterior draw per component, mapped into a `Weights`.
 *
 * The draw is anchored on the prior share rather than used raw: a component
 * nobody has interacted with keeps its prior share and stays stable, and one the
 * traveller keeps saving is pushed up. A cold start therefore produces a usable
 * ranking, and 200 draws from a fresh bandit produce a spread rather than a
 * point mass.
 *
 * The two penalty weights ride the prior. `BanditArm` is keyed by `ComponentId`
 * and the penalties are not components, so there is nothing to learn from. To
 * learn them: add penalty arms to `BanditArm`, which is a session 1 type change.
 */
export function sampleWeights(bandit: BanditState, rng: () => number): Weights {
  const prior = clampWeights(PRIOR_WEIGHTS);
  const raw: number[] = [];
  for (const key of COMPONENT_WEIGHT_KEYS) {
    const arm = findArm(bandit, key, prior[key]);
    raw.push(betaSample(arm.alpha, arm.beta, rng) * prior[key]);
  }
  const shares = normaliseBySum(raw);
  const out: Weights = { ...prior };
  for (let i = 0; i < COMPONENT_WEIGHT_KEYS.length; i += 1) out[COMPONENT_WEIGHT_KEYS[i]] = shares[i];
  return out;
}

/**
 * A cold-start bandit from a prior, so the "what I learned about you" panel can
 * render on a first visit with nothing stored.
 *
 * `now` is required because there is no honest default for a creation timestamp
 * and the function is not allowed to reach for a clock.
 */
export function banditFromWeights(weights: Weights, now: string): BanditState {
  const clamped = clampWeights(weights);
  const arms: BanditArm[] = [];
  for (const key of COMPONENT_WEIGHT_KEYS) {
    const { alpha, beta } = armFor(clamped[key], DEFAULT_WEIGHT_PRIOR_STRENGTH);
    arms.push({ component: key, alpha, beta, pulls: 0 });
  }
  return { arms, observations: 0, updatedAt: now };
}

/**
 * Fold one interaction into every arm.
 *
 * `now` defaults to the state's own timestamp so the function stays pure. It
 * does not invent a fresh one: a caller that forgets to pass a clock gets a
 * stale `updatedAt` rather than a fabricated one, and a stale field is a smaller
 * lie than a wrong one. Session 1's frozen signature is two arguments, so the
 * third is an optional widening.
 *
 * A reward that is missing from the map counts as a reject. Inventing a neutral
 * would let a caller bug drift the posterior invisibly.
 */
export function updateBandit(
  bandit: BanditState,
  rewards: Record<ComponentId, number>,
  now: string = bandit.updatedAt,
): BanditState {
  const arms: BanditArm[] = [];
  for (const arm of bandit.arms) {
    const reward = clamp01(rewards[arm.component] ?? REWARD.rejected);
    arms.push({
      component: arm.component,
      alpha: arm.alpha + reward,
      beta: arm.beta + (1 - reward),
      pulls: arm.pulls + 1,
    });
  }
  return { arms, observations: bandit.observations + 1, updatedAt: now };
}
