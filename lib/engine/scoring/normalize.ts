/**
 * Every number that reaches the objective goes through this file first.
 *
 * The reason is not tidiness. Session 6 re-derives the objective from first
 * principles and the two must agree to 1e-6. A single NaN that leaks into the
 * scalar turns a one-line failure into a two-hour hunt, because NaN propagates
 * silently through every sum it touches. The rule here is therefore uniform and
 * boring: a value that is not a finite number is zero.
 */

/** True only for a real, finite number. Rejects NaN and both infinities. */
export function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Clamp into [0, 1]. A non-finite input returns 0 rather than saturating:
 * `Infinity` cannot be a real measurement here, and handing a garbage input the
 * best possible score is the one way a normalisation bug becomes a ranking bug.
 */
export function clamp01(value: number): number {
  if (!isFiniteNumber(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Clamp into [-1, 1]. Same non-finite discipline as {@link clamp01}.
 *
 * A negative zero is folded to positive zero on the way out. It is not a
 * cosmetic concern: a negated component (`-crowdLoad`) at zero produces `-0`,
 * and `Object.is(-0, 0)` is false, so a checker comparing the objective with
 * `toBe` would fail on a plan with an empty crowd.
 */
export function clampSigned(value: number): number {
  if (!isFiniteNumber(value)) return 0;
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value === 0 ? 0 : value;
}

/**
 * Division that cannot produce NaN or Infinity. A zero denominator is a real
 * condition here (an empty profile, a plan with no stops), so it returns 0.
 */
export function safeDiv(numerator: number, denominator: number): number {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator)) return 0;
  if (denominator === 0) return 0;
  const result = numerator / denominator;
  return isFiniteNumber(result) ? result : 0;
}

/**
 * Turn a list of non-negative weights into a partition: every element divided by
 * the total, so the result sums to 1.
 *
 * Invariant worth knowing: inputs are floored at zero and made finite, so
 * `element <= total` always holds and no output can exceed 1. That is why there
 * is no clamp after the division, which would silently destroy the sum.
 *
 * Deliberately *not* capped at 1 on the way in. Capping would break scale
 * invariance, and scale invariance is the whole point: a weight vector of
 * `{interest: 2, ...}` and one of `{interest: 1, ...}` with the same ratios must
 * produce the same partition, or a slider drag changes what a score means.
 *
 * A non-positive or non-finite total returns all zeros, which is the honest
 * answer for "there is nothing to distribute" and keeps the caller total.
 * The total is summed in index order so the result is bitwise reproducible.
 */
export function normaliseBySum(values: readonly number[]): number[] {
  const floored = values.map((value) => (isFiniteNumber(value) && value > 0 ? value : 0));
  let total = 0;
  for (const value of floored) total += value;
  if (!isFiniteNumber(total) || total <= 0) return floored.map(() => 0);
  return floored.map((value) => value / total);
}
