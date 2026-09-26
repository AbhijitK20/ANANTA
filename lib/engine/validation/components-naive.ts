import type {
  DiscoveryContext,
  ExperienceV2,
  ScoreComponent,
  Stop,
  Weights,
} from "@/lib/engine/contracts/types";

/**
 * Every normalised score component, re-derived from the written objective in
 * `SESSION/00-CONTRACTS.md` section 3.
 *
 * Audit note: this file and `scoring/objective-fast.ts` are deliberate duplicates
 * of the same specification. Never merge them. A shared helper is a shared bug,
 * and the drift comparison is evidence only while the two derivations are
 * independent.
 *
 * What the spec pins down:
 *   - the shape of the scalar, with utility minus four aggregate penalties
 *   - superlinearTravel = sum( minutes * (1 + km / 8)^2 )
 *   - crowdLoad = mean over stops of clamp01(crowdProfile ?? 0.5) * peakHour
 *   - redundancy = sum over unordered pairs of 0.5 per equal category, / max(1, n-1)
 *   - paceDeviation = |n - idealStops|^1.5 / max(1, idealStops)
 *   - proximityDecay = 1 / (1 + travelKm)
 *   - peakHourFactor = 1.0 at the record's best time, 0.4 at the opposite end
 *   - nil fallbacks: rating 0 when reviewCount is null, value 0 when the price
 *     is unknown, weather 0 when the weather is unknown
 *
 * What the spec leaves open, and what this file does:
 *   ponytail: the normalisations below are this file's reading of a spec that
 *   names the components without giving their closed form. They are collected
 *   here rather than scattered so that a divergence is one edit, not six.
 *   Upgrade path: when session 4 lands `objectiveFast`, `drift.test.ts` names
 *   the first component that disagrees, and the fix is to move that row to the
 *   agreed formula. Logged in SESSION/BLOCKERS/6.md.
 *
 *   1. rating     ratings are on a 1..5 scale, so (lowerBound - 3) / 2 maps
 *                 1 -> -1, 3 -> 0, 5 -> +1.
 *   2. interest   profile.interests[category] minus profile.avoid[category],
 *                 clamped to [-1, 1]. An unlisted category is neutral, not zero
 *                 interest.
 *   3. value      the per-head price as a share of the traveller's own per-head
 *                 budget: 1 - 2 * clamp01(share). Free is +1, a stop that eats
 *                 the whole head budget is -1, half of it is 0.
 *   4. weather    0 when the weather is unknown, 1 for every record when it is
 *                 clear, and an indoor/mixed/outdoor ladder when it is not.
 *   5. groupFit   0.25 baseline, minus 0.5 per unmet access need, minus 0.4 per
 *                 unmet diet, minus 1 for a party larger than capacity, minus 1
 *                 for a record that is not kid friendly when a toddler is
 *                 present. Clamped to [-1, 1].
 *   6. peakHour   morning -> afternoon -> evening -> night is a 4-step cycle.
 *                 0 steps away is 1.0, 1 or 3 steps is 0.7, 2 steps is 0.4.
 *                 A record whose best time is "any" never loses anything.
 *   7. time of day comes from the text of the ISO string, never from the host
 *                 clock or the host timezone, so the result cannot depend on
 *                 where the test happens to run.
 */

/** 1..5 rating scale midpoint and half span, used to lift the Wilson bound into [-1, 1]. */
const RATING_MIDPOINT = 3;
const RATING_HALF_SPAN = 2;
/** A record's ratings are stars out of five, so there are five trials per review. */
const STAR_SCALE = 5;

/** How sharply a record is punished for being outdoors as the weather worsens. */
const WEATHER_OUTDOOR: Record<
  NonNullable<DiscoveryContext["weatherSeverity"]>,
  number
> = {
  clear: 0.7,
  rain: 0.1,
  heavy_rain: 0,
  storm: 0,
};

const WEATHER_MIXED: Record<
  NonNullable<DiscoveryContext["weatherSeverity"]>,
  number
> = {
  clear: 0.9,
  rain: 0.5,
  heavy_rain: 0.35,
  storm: 0.2,
};

const WEATHER_INDOOR: Record<
  NonNullable<DiscoveryContext["weatherSeverity"]>,
  number
> = {
  clear: 1,
  rain: 1,
  heavy_rain: 1,
  storm: 1,
};

const SLOTS = ["morning", "afternoon", "evening", "night"] as const;

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function clampSigned(value: number): number {
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
}

/**
 * Wilson score lower bound at 95% (z = 1.96) for `positive` successes out of
 * `total` trials, returned as a proportion in [0, 1].
 *
 * `ExperienceV2.ratingSum` is a sum of star ratings on a five point scale, so
 * the trial count is `reviewCount * 5`, not `reviewCount`. Passing `reviewCount`
 * here makes `positive` exceed `total`, the proportion runs above 1 and the
 * square root returns NaN, which is a silent NaN in the objective rather than a
 * loud failure. The proportion is therefore clamped even though the caller is
 * supposed to get it right.
 */
export function wilsonLowerBound(
  positive: number,
  total: number,
  z = 1.96,
): number {
  if (total <= 0) return 0;
  const p = clamp01(positive / total);
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return clamp01((centre - margin) / denominator);
}

/** Wilson lower bound lifted onto [-1, 1]. 0 when there are no reviews. */
export function ratingScore(record: ExperienceV2): number {
  if (record.ratingSum === null || record.reviewCount === null) return 0;
  if (record.reviewCount <= 0) return 0;
  // A five point scale, so there are five trials per review, not one.
  const bound = wilsonLowerBound(record.ratingSum, record.reviewCount * STAR_SCALE);
  return clampSigned((bound * STAR_SCALE - RATING_MIDPOINT) / RATING_HALF_SPAN);
}

export function interestScore(
  record: ExperienceV2,
  ctx: DiscoveryContext,
): number {
  const wanted = ctx.profile.interests[record.category] ?? 0;
  const avoided = ctx.profile.avoid[record.category] ?? 0;
  return clampSigned(wanted - avoided);
}

export function valueScore(record: ExperienceV2, ctx: DiscoveryContext): number {
  const perPerson = record.pricePerPersonInr;
  if (perPerson === null) return 0;
  const perHead = ctx.budgetInr / Math.max(1, ctx.partySize);
  if (perHead <= 0) return 0;
  return 1 - 2 * clamp01(perPerson / perHead);
}

export function weatherScore(
  record: ExperienceV2,
  ctx: DiscoveryContext,
): number {
  const severity = ctx.weatherSeverity;
  if (severity === null) return 0;
  if (record.indoor === "indoor") return WEATHER_INDOOR[severity];
  if (record.indoor === "mixed") return WEATHER_MIXED[severity];
  return WEATHER_OUTDOOR[severity];
}

export function groupScore(
  record: ExperienceV2,
  ctx: DiscoveryContext,
): number {
  let score = 0.25;
  for (const need of ctx.accessNeeds) {
    if (record.access[need] === false) score -= 0.5;
  }
  for (const diet of ctx.diets) {
    if (record.diets.indexOf(diet) === -1) score -= 0.4;
  }
  if (record.capacity !== null && record.capacity < ctx.partySize) score -= 1;
  if (ctx.hasToddler && record.kidFriendly === false) score -= 1;
  return clampSigned(score);
}

export function authenticityScore(record: ExperienceV2): number {
  return clamp01(record.authenticity ?? 0.5);
}

export function reliabilityScore(record: ExperienceV2): number {
  return clamp01(record.providerReliability ?? 0.5);
}

/** Which of the four slots an ISO local timestamp falls in. */
export function slotOfDay(iso: string): number {
  const match = /T(\d{1,2}):\d{2}/.exec(iso);
  const hour = match ? Number(match[1]) : 0;
  if (hour < 12) return 0;
  if (hour < 17) return 1;
  if (hour < 21) return 2;
  return 3;
}

/** 1.0 at the record's best time, 0.7 one step either way, 0.4 opposite. */
export function peakHourFactor(
  now: string,
  best: ExperienceV2["bestTimeOfDay"],
): number {
  if (best === "any") return 1;
  const here = slotOfDay(now);
  const there = SLOTS.indexOf(best);
  const raw = Math.abs(here - there);
  const steps = Math.min(raw, 4 - raw);
  return 1 - 0.6 * (steps / 2);
}

export function proximityDecay(travelKm: number): number {
  return 1 / (1 + travelKm);
}

export function superlinearTravel(
  stops: readonly Stop[],
  legKm: readonly number[],
): number {
  let total = 0;
  for (let i = 0; i < stops.length; i += 1) {
    const km = legKm[i] ?? 0;
    const ratio = 1 + km / 8;
    total += stops[i].travelMinutes * ratio * ratio;
  }
  return total;
}

export function crowdLoad(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): number {
  if (stops.length === 0) return 0;
  let total = 0;
  for (const stop of stops) {
    const crowd = clamp01(stop.record.crowdProfile ?? 0.5);
    total += crowd * peakHourFactor(ctx.now, stop.record.bestTimeOfDay);
  }
  return total / stops.length;
}

export function redundancyPenalty(stops: readonly Stop[]): number {
  let pairs = 0;
  for (let i = 0; i < stops.length; i += 1) {
    for (let j = i + 1; j < stops.length; j += 1) {
      if (stops[i].record.category === stops[j].record.category) pairs += 0.5;
    }
  }
  return pairs / Math.max(1, stops.length - 1);
}

export function paceDeviation(stopCount: number, ctx: DiscoveryContext): number {
  const gap = Math.abs(stopCount - ctx.idealStops);
  return Math.pow(gap, 1.5) / Math.max(1, ctx.idealStops);
}

/**
 * `Weights` has no `proximity` key, so the per-stop proximity term has to come
 * from somewhere. This reads the key when it is present and falls back to a
 * documented constant when it is not, so the day session 1 adds it, both
 * derivations use their own number with no edit here.
 * ponytail: ceiling is the fallback constant. Upgrade path is one deleted line.
 */
export const PROXIMITY_WEIGHT_FALLBACK = 0.15;

export function proximityWeight(weights: Weights): number {
  const candidate = (weights as { proximity?: number }).proximity;
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : PROXIMITY_WEIGHT_FALLBACK;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

export function component(
  id: ScoreComponent["id"],
  normalised: number,
  weight: number,
  sentence: string,
): ScoreComponent {
  return { id, normalised, weight, contribution: weight * normalised, sentence };
}
