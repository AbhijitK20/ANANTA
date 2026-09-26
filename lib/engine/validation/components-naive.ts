import type {
  DiscoveryContext,
  ExperienceV2,
  ScoreComponent,
  Stop,
  Weights,
} from "@/lib/engine/contracts/types";

/**
 * Every normalised score component, re-derived from `lib/engine/objective-spec.md`.
 *
 * Audit note: this file and `scoring/objective-fast.ts` are deliberate duplicates
 * of the same specification. **Never merge them, and never let one import the
 * other.** A shared helper is a shared bug, and the drift comparison is evidence
 * only while the two derivations are independent.
 *
 * The spec is normative and this file now conforms to it. It previously did not:
 * the ten terms below each had their own reading, and the measured drift on a
 * four stop plan was 7.588 against a 1e-6 bound. Every divergence is annotated
 * with what the spec says and why the old reading was wrong.
 */

/** 1..5 rating scale, so a `ratingSum` is a sum of stars out of five per review. */
const STAR_SCALE = 5;

/**
 * `objective-spec.md` section 4 gives the weather table and says "copy the
 * table, do not derive it":
 *
 *   "clear"      indoor 0.4   outdoor 1     mixed 0.7
 *   "rain"       indoor 1     outdoor 0.2   mixed 0.6
 *   "heavy_rain" indoor 1     outdoor -1    mixed -0.4
 *   "storm"      indoor 0.8   outdoor -1    mixed -0.5
 *
 * and unknown weather is 0, not a neutral 0.5. A neutral score is a claim; "we
 * do not know" is not one.
 */
const WEATHER_FIT: Record<
  NonNullable<DiscoveryContext["weatherSeverity"]>,
  Record<ExperienceV2["indoor"], number>
> = {
  clear: { indoor: 0.4, outdoor: 1, mixed: 0.7 },
  rain: { indoor: 1, outdoor: 0.2, mixed: 0.6 },
  heavy_rain: { indoor: 1, outdoor: -1, mixed: -0.4 },
  storm: { indoor: 0.8, outdoor: -1, mixed: -0.5 },
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
 * Wilson score lower bound at 95%, as the proportion in `[0, 1]`.
 *
 * The spec pins `z2 = 3.8416` as that literal rather than `z * z`, precisely so
 * two independently written implementations cannot disagree in the last bit, so
 * it is written that way here and in `scoring/wilson.ts`.
 *
 * `ratingSum` is a sum of star ratings out of five, so the trial count is
 * `reviewCount * STAR_SCALE`, not `reviewCount`.
 */
export function wilsonLowerBound(positive: number, total: number): number {
  if (total <= 0) return 0;
  const z = 1.96;
  const z2 = 3.8416;
  const p = clamp01(positive / total);
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / 4) / total);
  return clamp01((centre - margin) / denom);
}

/** The raw bound, unrescaled. The spec is explicit: the result is in [0,1] already. */
export function ratingScore(record: ExperienceV2): number {
  if (record.ratingSum === null || record.reviewCount === null) return 0;
  if (record.reviewCount <= 0) return 0;
  return wilsonLowerBound(record.ratingSum, record.reviewCount * STAR_SCALE);
}

/**
 * `base = clamp01(interests[category] ?? 0.5)`, `veto = clamp01(avoid[..] ?? 0)`,
 * `value = clamp11((base - 0.5) * 2 - veto)`.
 *
 * The old reading was `interests - avoid`, which put an unlisted category at 0
 * by accident and a half interest at 0.5, so half the scale carried no meaning.
 */
export function interestScore(record: ExperienceV2, ctx: DiscoveryContext): number {
  const rawBase = ctx.profile.interests[record.category];
  const rawVeto = ctx.profile.avoid[record.category];
  const base = typeof rawBase === "number" && Number.isFinite(rawBase) ? clamp01(rawBase) : 0.5;
  const veto = typeof rawVeto === "number" && Number.isFinite(rawVeto) ? clamp01(rawVeto) : 0;
  return clampSigned((base - 0.5) * 2 - veto);
}

/**
 * null price scores 0, a non positive price scores 1, and otherwise it is
 * `clamp11(ratio / 4 * 2 - 1)` with `ratio = perHeadBudget / pricePerPerson`.
 * An `estimate` confidence price scores 0, because a price we guessed must not
 * be allowed to buy ranking.
 */
const UNPRICED: readonly string[] = ["estimate", "unverified"];

export function valueScore(record: ExperienceV2, ctx: DiscoveryContext): number {
  const confidence = record.confidence.price ?? "unverified";
  if (UNPRICED.indexOf(confidence) !== -1) return 0;
  const perPerson = record.pricePerPersonInr;
  if (perPerson === null) return 0;
  if (perPerson <= 0) return 1;
  const perHead = ctx.budgetInr / Math.max(1, ctx.partySize);
  if (perHead <= 0) return 0;
  return clampSigned(perHead / perPerson / 4 * 2 - 1);
}

export function weatherScore(record: ExperienceV2, ctx: DiscoveryContext): number {
  const severity = ctx.weatherSeverity;
  if (severity === null) return 0;
  return WEATHER_FIT[severity][record.indoor];
}

/**
 * The spec's clause tree. Its governing sentence is the one this product is
 * built on: a null fact never scores against the group, only a recorded false
 * does. The old reading started from a 0.25 baseline and subtracted per unmet
 * need, so a record with nothing recorded scored slightly positive, which is a
 * claim about a record nobody checked.
 */
export function groupScore(record: ExperienceV2, ctx: DiscoveryContext): number {
  let score = 0;
  if (ctx.hasToddler) {
    if (record.kidFriendly === true) score += 1;
    else if (record.kidFriendly === false) score -= 1;
    if (record.access.stroller_ok === true) score += 0.5;
    else if (record.access.stroller_ok === false) score -= 0.5;
  }
  if (ctx.hasElderly) {
    if (record.access.low_walking === true) score += 1;
    else if (record.access.low_walking === false) score -= 1;
  }
  if (ctx.partySize > 1 && record.capacity !== null) {
    score += record.capacity >= ctx.partySize ? 0.25 : -1;
  }
  return clampSigned(score);
}

export function authenticityScore(record: ExperienceV2): number {
  return clamp01(record.authenticity ?? 0.5);
}

export function reliabilityScore(record: ExperienceV2): number {
  return clamp01(record.providerReliability ?? 0.5);
}

/** The four slots exactly as the spec numbers them: 5..11, 12..16, 17..20, else night. */
export function slotOfDay(iso: string): number {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  const hours = match ? Number(match[1]) : 0;
  if (!Number.isFinite(hours)) return 0;
  if (hours >= 5 && hours < 12) return 0;
  if (hours >= 12 && hours < 17) return 1;
  if (hours >= 17 && hours < 21) return 2;
  return 3;
}

/**
 * `t = clamp01(abs(slot(hour) - index(best)) / 3)`, `factor = 1 - 0.6 * t`.
 *
 * Linear, not a ring. The old reading was `1 - 0.6 * (steps / 2)` on a four point
 * cycle, which is the same shape but reaches its floor at two steps, so it could
 * not distinguish "one slot away" from "two slots away" the way the spec's `t`
 * does. The hour also came from `hour < 12` as a single test, which put 05:00 in
 * the morning bucket for the wrong reason.
 */
export function peakHourFactor(now: string, best: ExperienceV2["bestTimeOfDay"]): number {
  if (best === "any") return 1;
  const bestIndex = SLOTS.indexOf(best);
  if (bestIndex < 0) return 1;
  const t = clamp01(Math.abs(slotOfDay(now) - bestIndex) / 3);
  return 1 - 0.6 * t;
}

export function proximityDecay(travelKm: number): number {
  return 1 / (1 + travelKm);
}

/** Rule G-3: a zero minute leg contributes zero whatever its km. */
export function superlinearTravel(
  stops: readonly Stop[],
  legKm: readonly number[],
): number {
  const legs: number[] = [];
  for (let i = 0; i < stops.length; i += 1) {
    const minutes = stops[i].travelMinutes > 0 ? stops[i].travelMinutes : 0;
    if (minutes === 0) {
      legs.push(0);
      continue;
    }
    const km = legKm[i] ?? 0;
    const ratio = 1 + km / 8;
    legs.push(minutes * Math.pow(ratio, 2));
  }
  let total = 0;
  for (const value of legs) total += value;
  return total;
}

export function crowdLoad(stops: readonly Stop[], ctx: DiscoveryContext): number {
  if (stops.length === 0) return 0;
  const parts: number[] = [];
  for (const stop of stops) {
    parts.push(clamp01(stop.record.crowdProfile ?? 0.5) * peakHourFactor(ctx.now, stop.record.bestTimeOfDay));
  }
  let total = 0;
  for (const value of parts) total += value;
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

/** The spec writes this `d * sqrt(d)`, not `d ^ 1.5`, for bit identity. */
export function paceDeviation(stopCount: number, ctx: DiscoveryContext): number {
  const gap = Math.abs(stopCount - ctx.idealStops);
  return (gap * Math.sqrt(gap)) / Math.max(1, ctx.idealStops);
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
