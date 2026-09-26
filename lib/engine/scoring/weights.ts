import type { ComponentId, Weights } from "@/lib/engine/contracts";
import { clamp01, normaliseBySum } from "./normalize";

/**
 * The cold start. Every key present, because `Weights` is a total record and a
 * missing key would read as `undefined` and poison every downstream sum.
 *
 * These numbers are shown to the traveller and are editable, so each one is
 * defensible out loud. They are relative intent, not calibrated truth: they are
 * normalised into a partition by `clampWeights`, so only the ratios matter here.
 * Declared in `ComponentId` order with the two penalties last, which is what
 * `WEIGHT_COMPONENT_KEYS` below relies on.
 */
export const PRIOR_WEIGHTS: Weights = {
  // Highest. Stated interest is the only signal the traveller gave us on purpose.
  interest: 1,
  // Solid but not dominant. Most of the catalogue carries no reviews, so this
  // discriminates between the curated head and the long tail, nothing finer.
  rating: 0.55,
  // High. Money is a hard constraint and the gate already refuses what does not
  // fit, so this is a tiebreak between the things that do fit.
  value: 0.6,
  // High. Local authenticity is the thing this product is for and the thing a
  // tourist ranking cannot buy, so it must outrank a comfortable star rating.
  authenticity: 0.7,
  // Middling. The signal is coarse and often unknown, and a neutral 0.5 on an
  // unknown weather is already most of the available range.
  weather: 0.5,
  // Meaningful. A plan ruined by queues is a failed plan, and crowd pressure is
  // the complaint this product hears most.
  crowd: 0.6,
  // Moderate. Two cafés in a day is a good day, five is a bad one, but a rigid
  // novelty bonus would ban the second stop of any category.
  novelty: 0.45,
  // High. A toddler in the group makes or breaks the day, more than any single
  // other factor, and this is graded so a soft signal can still be expressed.
  groupFit: 0.8,
  // Meaningful, and deliberately below the aggregate travel penalty rather than
  // above it. Distance is punished once, quadratically, at plan level.
  travelFriction: 0.7,
  // Low on purpose. Almost nothing is rated by the interaction stream yet, so a
  // high weight here would amplify noise into the ranking. Raise it once there
  // is data, not before.
  reliability: 0.25,
  // Small because `superlinearTravel` is in minutes times a squared distance
  // factor, which runs to hundreds for a realistic afternoon. At 0.004 a typical
  // three stop afternoon costs about 0.5, the same order as the whole utility
  // sum. Uncalibrated, see the ceiling note in the blockers file.
  travelPenalty: 0.004,
  // Larger, because `paceDeviation` is order 1. At 0.35 a plan that is three
  // stops off the traveller's stated ideal loses about 0.6.
  pacePenalty: 0.35,
};

const PENALTY_KEYS = ["travelPenalty", "pacePenalty"] as const;

/**
 * The ten utility keys, derived from the prior's own key order rather than
 * restated, so the two lists cannot drift. `components.test.ts` asserts this
 * matches `COMPONENT_IDS`.
 */
export const WEIGHT_COMPONENT_KEYS: readonly (keyof Weights)[] = (Object.keys(PRIOR_WEIGHTS) as (keyof Weights)[]).filter(
  (key) => !(PENALTY_KEYS as readonly string[]).includes(key),
);

export type WeightKey = keyof Weights;

export const WEIGHT_KEYS: readonly WeightKey[] = [...WEIGHT_COMPONENT_KEYS, ...PENALTY_KEYS];

/**
 * Force the ten utility weights into a partition that sums to 1, and clamp both
 * penalties into [0, 1].
 *
 * This is the reason the objective's absolute scale is stable while a traveller
 * drags sliders around. Without it, turning every slider up would silently change
 * what a given score means, and no two sessions would be comparable. The
 * invariant `element <= total` for non-negative inputs means the division can
 * never push a value above 1, so nothing is clamped afterwards and the sum is
 * preserved.
 *
 * Every component and the objective itself read weights through this function,
 * so the number shown next to a sentence is always the number that was used.
 *
 * All ten at zero stays all zero, on purpose. A traveller who zeroes every
 * slider has not asked for "rank on penalties alone", they have broken the
 * request, and silently substituting the prior would be worse than letting the
 * validator notice.
 */
export function clampWeights(weights: Weights): Weights {
  const out: Weights = { ...weights };
  const shares = normaliseBySum(WEIGHT_COMPONENT_KEYS.map((key) => weights[key]));
  for (let i = 0; i < WEIGHT_COMPONENT_KEYS.length; i += 1) out[WEIGHT_COMPONENT_KEYS[i]] = shares[i];
  out.travelPenalty = clamp01(weights.travelPenalty);
  out.pacePenalty = clamp01(weights.pacePenalty);
  return out;
}

/** Per key change from `before` to `after`, for the "what changed" panel. `after` minus `before`. */
export function diffWeights(before: Weights, after: Weights): Record<WeightKey, number> {
  const out = {} as Record<WeightKey, number>;
  for (const key of WEIGHT_KEYS) out[key] = after[key] - before[key];
  return out;
}

/**
 * How many pseudo observations the Beta prior gets, so `alpha + beta` is
 * `PRIOR_STRENGTH + 2` and the posterior mean is exactly the prior weight.
 *
 * Weak, and deliberately so. We have no interaction data at all, so any prior
 * strong enough to matter would mean the bandit never visibly moves and the
 * "what I learned about you" panel is decoration. Two is the smallest strength
 * that still regularises a cold start. It is a product decision, and two is the
 * honest answer to "we know nothing".
 */
export const DEFAULT_WEIGHT_PRIOR_STRENGTH = 2;

/** Component keys as `ComponentId`, for the bandit, which only speaks components. */
export const COMPONENT_WEIGHT_KEYS = WEIGHT_COMPONENT_KEYS as readonly ComponentId[];
