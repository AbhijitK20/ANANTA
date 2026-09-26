/**
 * A credible interval for a Thompson-sampled weight.
 *
 * The bandit holds one Beta posterior per component. `sampleWeights` draws from
 * it, so a weight is not a number, it is a distribution. Showing only the point
 * estimate makes a learned panel look exactly like a hard-coded table, which is
 * the one thing this panel must never be mistaken for. So the range is shown,
 * and it is computed from the arm's own `alpha` and `beta`.
 *
 * `ponytail:` ceiling. The interval maps the Beta quantiles linearly onto the
 * weight's own bounds, which is the sampler reading rather than the sampler's
 * exact jitter arithmetic. Re-deriving the jitter would mean copying
 * `sampleWeights` from `components/ananta/learning.ts`, which is session 7's and
 * which RULE 0 forbids me to fork. When session 7 moves the sampler into
 * `@/lib/engine`, swap `weightRange` for an engine function that returns the
 * interval directly and delete `betaQuantile` from here.
 */

/** ln of the gamma function, Lanczos approximation, enough for a 5 digit answer. */
function lnGamma(x: number): number {
  const COF = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let series = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) series += COF[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * series) / x);
}

/** Continued fraction for the incomplete beta, Numerical Recipes `betacf`. */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAX_ITERATIONS = 200;
  const TINY = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITERATIONS; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-16) break;
  }
  return h;
}

/** Regularised incomplete beta `I_x(a, b)`, the CDF of a Beta distribution. */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/**
 * Inverse CDF by bisection. 60 halvings takes the interval below 1e-15, which
 * is far tighter than the 0.05 step a weight slider moves in, so the answer is
 * exact at the precision the UI can show.
 */
export function betaQuantile(alpha: number, beta: number, p: number): number {
  if (!Number.isFinite(alpha) || !Number.isFinite(beta) || alpha <= 0 || beta <= 0) return 0.5;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (betaCdf(mid, alpha, beta) < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export type WeightRange = {
  /** Plausible low end on the weight's own scale. */
  low: number;
  /** Plausible high end on the weight's own scale. */
  high: number;
  /** Posterior mean, which is what a Thompson sampler drifts towards. */
  mean: number;
  /** Mass inside the reported band, so the label can state its own coverage. */
  coverage: number;
};

/** Two-sided band. 90 percent by default: 95 reads as over-precise at 12 samples. */
export function weightRange(
  alpha: number,
  beta: number,
  bounds: { min: number; max: number },
  coverage = 0.9,
): WeightRange {
  const tail = (1 - coverage) / 2;
  const low = betaQuantile(alpha, beta, tail);
  const high = betaQuantile(alpha, beta, 1 - tail);
  const map = (q: number) => bounds.min + q * (bounds.max - bounds.min);
  return {
    low: map(low),
    high: map(high),
    mean: map(alpha / (alpha + beta)),
    coverage,
  };
}

/**
 * Round for display without pretending to more precision than the slider can
 * produce. A step of 0.001 shows three decimals, 0.05 shows two, 0.1 shows one,
 * and a whole number shows none. Derived from the step so it can never drift
 * from the bounds the slider uses.
 */
export function roundWeight(value: number, step: number): string {
  const decimals = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step)));
  return value.toFixed(decimals);
}

/**
 * How much a weight has actually been observed, as a word rather than a
 * percentage. A weight with no pulls has not been learned, and the panel says so
 * in the same sentence as the number.
 */
export function identification(pulls: number): "unobserved" | "barely" | "weak" | "usable" {
  if (pulls <= 0) return "unobserved";
  if (pulls < 4) return "barely";
  if (pulls < 12) return "weak";
  return "usable";
}

export const IDENTIFICATION_COPY: Record<ReturnType<typeof identification>, string> = {
  unobserved: "prior, 0 observations, so this is the starting value and not something learned",
  barely: "a handful of observations, too few to call this learned",
  weak: "some observations, still more of a guess than a finding",
  usable: "enough observations to say this weight moved because of your choices",
};
