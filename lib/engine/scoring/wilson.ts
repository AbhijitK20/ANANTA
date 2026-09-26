import { clamp01, isFiniteNumber } from "./normalize";

/** Two sided 95% normal quantile. Fixed, not tunable: the contract names it. */
export const WILSON_Z = 1.96;

/**
 * The rating scale the dataset is expressed in. `ratingSum` is a sum of star
 * ratings, so the Wilson bound is evaluated against `reviewCount * 5` possible
 * stars and reported back on the same 5 point scale the traveller sees.
 */
export const STAR_SCALE = 5;

/**
 * Wilson score lower bound at 95% confidence.
 *
 *     lower = (p + z^2/2n - z * sqrt((p(1-p) + z^2/4) / n)) / (1 + z^2/n)
 *
 * Why a lower bound and not the mean: a single five star review is not the same
 * claim as five hundred, and the raw mean cannot tell those apart. The bound
 * shrinks towards the mean as evidence accumulates, so `n` is priced in for
 * free. That is the whole "weighted by sample size" property of the masterplan,
 * and it is why a place with three reviews cannot outrank a place with six
 * hundred reviews of the same mean.
 *
 * Returns 0 when there is no evidence. Not 0.5, not a prior. A place with no
 * reviews has no evidence, and handing it the neutral midpoint would let an
 * unrated record beat a genuinely well reviewed one.
 *
 * `positive` and `total` accept null precisely so that "no reviews" and "zero
 * reviews" stay distinguishable to the caller, even though both score 0 here.
 * The contract types them as `number` at the call site; widening a parameter is
 * safe, and the drift test never calls this (session 6 has its own copy).
 */
export function wilsonLowerBound(positive: number | null, total: number | null): number {
  if (positive === null || total === null) return 0;
  if (!isFiniteNumber(positive) || !isFiniteNumber(total)) return 0;
  if (total <= 0) return 0;
  // A sum of stars cannot exceed 5n and cannot be negative. Clamping here keeps
  // a corrupt record from producing a bound above 1.
  const successes = Math.min(total, Math.max(0, positive));
  const p = successes / total;
  const z2 = WILSON_Z * WILSON_Z;
  const denominator = 1 + z2 / total;
  const inner = (p * (1 - p) + z2 / 4) / total;
  const lower = (p + z2 / (2 * total) - WILSON_Z * Math.sqrt(Math.max(0, inner))) / denominator;
  return clamp01(lower);
}
