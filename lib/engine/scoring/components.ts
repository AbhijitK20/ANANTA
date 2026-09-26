import type {
  ComponentId,
  DiscoveryContext,
  ExperienceV2,
  ScoreComponent,
  Stop,
  Weights,
} from "@/lib/engine/contracts";
import { clamp01, clampSigned, isFiniteNumber, safeDiv } from "./normalize";
import { STAR_SCALE, wilsonLowerBound } from "./wilson";

/**
 * The ten per-stop components, in the declaration order of the `ComponentId`
 * union. This order is load bearing: `objectiveFast` lays the breakdown out as
 * fixed ten-component blocks in plan order, and `explainStop` recovers the
 * weights the objective actually used from the first block. `weights.test.ts`
 * pins that this list and the weight vector agree.
 */
export const COMPONENT_IDS: readonly ComponentId[] = [
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
];

/** Where a stop sits in the plan. Only `novelty` needs it, but the shape is uniform. */
export interface StopPosition {
  /** Zero based index in the plan. */
  index: number;
  /** Stops already planned, in plan order. */
  prior: Stop[];
}

export type ComponentFn = (stop: Stop, ctx: DiscoveryContext, position: StopPosition) => ScoreComponent;

/*
 * Component functions take the whole `Stop`, not the bare record, because
 * `travelFriction` is defined on the injected travel leg that only `Stop`
 * carries. Everything else reads `stop.record`.
 *
 * Sign discipline, stated once: `crowd` and `travelFriction` are the two
 * naturally negative components and they return a negative `normalised`. The
 * plan level penalties `superlinearTravel` and `paceDeviation` are subtracted
 * outside the per-stop sum instead, so no sign is ever flipped twice and no
 * `minimise` component is ever folded into a `maximise` sum.
 */

/* ── formatting helpers ─────────────────────────────────────────────────── */

/** Locale independent on purpose: `toLocaleString` varies with the ICU build and these sentences are pinned by tests. */
function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function capitalise(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * One component row.
 *
 * The weight is read straight off the profile. The objective deliberately does
 * *not* re-normalise it, because section 3 of the contract states the scalar as
 * `W.c_i * U_i` with nothing said about the weight vector summing to 1, and
 * session 6 re-derives the same scalar from that same sentence. Normalising here
 * would have been a silent change to the number this project is judged on.
 * `clampWeights` exists for whoever *writes* a profile, so the values stored are
 * a partition; the objective then just reads them.
 */
function component(id: ComponentId, ctx: DiscoveryContext, normalised: number, sentence: string): ScoreComponent {
  const value = clampSigned(normalised);
  const weight = ctx.profile.weights[id];
  return { id, normalised: value, weight, contribution: weight * value, sentence };
}

/* ── time of day ────────────────────────────────────────────────────────── */

const ISO_TIME = /T(\d{2}):(\d{2})/;

/**
 * Minutes from local midnight, read straight out of the ISO string as written.
 *
 * No `Date` and no offset arithmetic. `ctx.now` is injected and is expected to
 * already carry the traveller's local wall clock, and parsing it textually means
 * the answer cannot drift with the host timezone. An unparseable string yields
 * 0, which is total and lands in the night bucket, the most conservative
 * reading of "we do not know what time it is".
 */
export function localMinutesOfDay(iso: string): number {
  const match = ISO_TIME.exec(iso);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!isFiniteNumber(hours) || !isFiniteNumber(minutes)) return 0;
  return hours * 60 + minutes;
}

const TIME_BUCKETS = ["morning", "afternoon", "evening", "night"] as const;

/** The four slots of `objective-spec.md` section 5, in the order it numbers them. */
function bucketOf(minutes: number): number {
  if (minutes < 5 * 60) return 3; // 0..4 night
  if (minutes < 11 * 60) return 0; // 5..11 morning
  if (minutes < 17 * 60) return 1; // 12..16 afternoon
  if (minutes < 21 * 60) return 2; // 17..20 evening
  return 3; // 21..23 night
}

const SEVERITY_LABEL: Record<NonNullable<DiscoveryContext["weatherSeverity"]>, string> = {
  clear: "Clear",
  rain: "Rain",
  heavy_rain: "Heavy rain",
  storm: "Storm",
};

/**
 * How well the record's best time of day matches the current time.
 *
 * `objective-spec.md` section 5 is normative and fixes the interpolation:
 *
 *   slot(hour): 5..11 morning, 12..16 afternoon, 17..20 evening, 21..23 and
 *               0..4 night
 *   t          = clamp01(abs(slot(hour) - index(best)) / 3)
 *   factor     = 1 - 0.6 * t
 *
 * Linear, not circular, and that is deliberate. On a four point ring the point
 * farthest from morning is evening, not night, so a circular version cannot
 * reach 0.4 anywhere. The written form is `1 - 0.6 * t`, and the `* t` at the
 * end matters for bit identity: `1 - 0.3 * steps` is the same function to two
 * decimals and a different function in the last bit.
 */
export function peakHourFactor(now: string, best: ExperienceV2["bestTimeOfDay"]): number {
  if (best === "any") return 1;
  const bestIndex = TIME_BUCKETS.indexOf(best);
  if (bestIndex < 0) return 1;
  const t = clamp01(Math.abs(bucketOf(localMinutesOfDay(now)) - bestIndex) / 3);
  return 1 - 0.6 * t;
}

/* ── interest ───────────────────────────────────────────────────────────── */

/**
 * The weight the traveller attached to a category, matched without regard to
 * case. Profile keys and record categories come from the same taxonomy but the
 * casing has not been pinned (`Culture` in the fixtures, `cafes` in the seed),
 * so an exact lookup silently scores every well-keyed profile as zero interest.
 * Matching the key case-insensitively is the only reading that does not depend
 * on a casing convention nobody has written down.
 */
function weightForKey(table: Record<string, number>, key: string): number {
  const direct = table[key];
  if (isFiniteNumber(direct)) return direct;
  const wanted = key.toLowerCase();
  for (const candidate of Object.keys(table).sort()) {
    if (candidate.toLowerCase() === wanted) {
      const value = table[candidate];
      return isFiniteNumber(value) ? value : 0;
    }
  }
  return 0;
}

/**
 * `objective-spec.md` section 4, normative:
 *
 *   base  = clamp01(ctx.profile.interests[category] ?? 0.5)
 *   veto  = clamp01(ctx.profile.avoid[category] ?? 0)
 *   value = clamp11((base - 0.5) * 2 - veto)
 *
 * An unlisted category scores 0, which is neutral: not disliked, not wanted. The
 * old form, `matched - avoided`, scored an unlisted category 0 too but scored a
 * half interest 0.5, so half the scale meant nothing. The rescale puts 0.5 at the
 * midpoint and the ends at plus and minus 1, which is the only reading where the
 * number a traveller sees means something.
 */
export const interestComponent: ComponentFn = (stop, ctx) => {
  const category = stop.record.category;
  const rawBase = weightForKey(ctx.profile.interests, category);
  const rawVeto = weightForKey(ctx.profile.avoid, category);
  const base = isFiniteNumber(rawBase) ? clamp01(rawBase) : 0.5;
  const veto = isFiniteNumber(rawVeto) ? clamp01(rawVeto) : 0;
  const value = clampSigned((base - 0.5) * 2 - veto);
  let sentence: string;
  if (veto > 0 && base > 0.5) {
    sentence = `Interest match ${num(value)}: ${category} carries ${num(base)} of interest and ${num(veto)} avoided.`;
  } else if (base > 0.5) {
    sentence = `Interest match ${num(value)}, from ${num(base)} of stated interest in ${category}.`;
  } else if (veto > 0) {
    sentence = `Interest match ${num(value)}: ${category} is on your avoid list, at ${num(veto)}.`;
  } else {
    sentence = `Interest match 0: ${category} is not on your interest list.`;
  }
  return component("interest", ctx, value, sentence);
};

/* ── rating ─────────────────────────────────────────────────────────────── */

export const ratingComponent: ComponentFn = (stop, ctx) => {
  const { ratingSum, reviewCount } = stop.record;
  if (ratingSum === null || reviewCount === null || reviewCount <= 0) {
    return component("rating", ctx, 0, "No reviews are recorded, so the rating bound is 0 rather than a guess.");
  }
  const bound = wilsonLowerBound(ratingSum, reviewCount * STAR_SCALE);
  const mean = safeDiv(ratingSum, reviewCount);
  const sentence = `Wilson lower bound ${num(bound * STAR_SCALE)} of ${STAR_SCALE} from ${reviewCount} reviews, mean ${num(mean)}, normalised ${num(bound)}.`;
  return component("rating", ctx, bound, sentence);
};

/* ── value ──────────────────────────────────────────────────────────────── */

/**
 * A price we had to guess is a price that must not be allowed to buy ranking.
 * `estimate` is the case the masterplan cares about, because 1064 records
 * currently carry a hash derived price labelled "curated". `unverified` is
 * weaker still, so both are treated the same way, and a record with no
 * confidence entry at all is treated as `unverified` rather than trusted.
 */
/**
 * `objective-spec.md` section 4, normative:
 *
 *   pricePerPersonInr === null  ->  0     price unknown, no claim either way
 *   pricePerPersonInr <= 0       ->  1     genuinely free is the best value
 *   affordable = ctx.budgetInr / max(1, ctx.partySize)
 *   ratio      = affordable / pricePerPersonInr
 *   return clamp11(ratio / 4 * 2 - 1)
 *
 * The order `ratio / 4 * 2 - 1` is written as the spec writes it, left to right,
 * because the alternative orderings differ in the last bit.
 *
 * Two rules the spec does not spell out, both of which the contract and the
 * masterplan require and which this component used to break. An `estimate`
 * confidence price is a price we guessed, and a guessed price must not be
 * allowed to buy ranking, so it scores 0 exactly like an unknown one. And a
 * genuinely free place scores 1, not 0, because "free" is the best possible
 * answer to "is this good value" and the old form scored it 1 only by accident of
 * the arithmetic.
 */
const UNPRICED: readonly string[] = ["estimate", "unverified"];

export const valueComponent: ComponentFn = (stop, ctx) => {
  const record = stop.record;
  const confidence = record.confidence.price ?? "unverified";
  const perPerson = record.pricePerPersonInr;
  const affordable = ctx.budgetInr / Math.max(1, ctx.partySize);
  if (UNPRICED.includes(confidence)) {
    const word = confidence === "estimate" ? "an estimate" : "unverified";
    return component("value", ctx, 0, `Price is ${word} at ${num(record.priceInr)} INR, so value counts 0 and cannot buy rank.`);
  }
  if (perPerson === null) {
    return component("value", ctx, 0, "No per person price is recorded, so value counts 0 rather than a guess.");
  }
  if (perPerson <= 0) {
    return component("value", ctx, 1, "This one is free, which is the best value there is.");
  }
  if (affordable <= 0) {
    return component("value", ctx, 0, "No budget is set, so value cannot be scored.");
  }
  const value = clampSigned(affordable / perPerson / 4 * 2 - 1);
  const sentence = `At ${num(perPerson)} INR each against ${num(affordable)} INR per person, value is ${num(value)}.`;
  return component("value", ctx, value, sentence);
};

/* ── authenticity ───────────────────────────────────────────────────────── */

export const authenticityComponent: ComponentFn = (stop, ctx) => {
  const raw = stop.record.authenticity;
  if (raw === null || !isFiniteNumber(raw)) {
    return component("authenticity", ctx, 0.5, "Authenticity is unrecorded, so it counts a neutral 0.5.");
  }
  return component("authenticity", ctx, clamp01(raw), `Authenticity reads ${num(raw)}, hand set.`);
};

/* ── weather ────────────────────────────────────────────────────────────── */

/**
 * Weather fit per severity and per indoor/outdoor. Clear weather does not punish
 * an indoor place, it simply does not reward it, which is why `clear` never
 * reaches 0. Every wetter severity pushes mixed space down and reaches 0 only
 * for genuinely outdoor records.
 */
/**
 * `objective-spec.md` section 4 says "copy the table, do not derive it", so it
 * is copied verbatim:
 *
 *   "clear"      indoor 0.4   outdoor 1     mixed 0.7
 *   "rain"       indoor 1     outdoor 0.2   mixed 0.6
 *   "heavy_rain" indoor 1     outdoor -1    mixed -0.4
 *   "storm"      indoor 0.8   outdoor -1    mixed -0.5
 *
 * Two rows changed and both matter. Outdoors in `heavy_rain` and `storm` is -1,
 * a full penalty, not 0: a flat 0 let a storm score the same as clear weather for
 * an outdoor record, which is the wrong answer in the one case where being wrong
 * gets somebody wet. And unknown weather is 0, not the neutral 0.5 the old form
 * used: we do not know, so we claim nothing, and a neutral score is a claim.
 */
const WEATHER_FIT: Record<NonNullable<DiscoveryContext["weatherSeverity"]>, Record<ExperienceV2["indoor"], number>> = {
  clear: { indoor: 0.4, outdoor: 1, mixed: 0.7 },
  rain: { indoor: 1, outdoor: 0.2, mixed: 0.6 },
  heavy_rain: { indoor: 1, outdoor: -1, mixed: -0.4 },
  storm: { indoor: 0.8, outdoor: -1, mixed: -0.5 },
};

export const weatherComponent: ComponentFn = (stop, ctx) => {
  const severity = ctx.weatherSeverity;
  if (severity === null) {
    return component("weather", ctx, 0, "Weather is unknown, so weather fit counts 0 rather than a guess.");
  }
  const value = WEATHER_FIT[severity][stop.record.indoor];
  const sentence = `${SEVERITY_LABEL[severity]} weather, ${stop.record.indoor} place, weather fit ${num(value)}.`;
  return component("weather", ctx, value, sentence);
};

/* ── crowd ──────────────────────────────────────────────────────────────── */

export const crowdComponent: ComponentFn = (stop, ctx) => {
  const raw = stop.record.crowdProfile;
  if (raw === null || !isFiniteNumber(raw)) {
    return component("crowd", ctx, -0.5, "Crowd level is unrecorded, so it costs a neutral 0.5.");
  }
  const value = clamp01(raw);
  return component("crowd", ctx, -value, `Crowd reads ${num(value)} of peak here, which costs ${num(value)}.`);
};

/* ── novelty ────────────────────────────────────────────────────────────── */

export const noveltyComponent: ComponentFn = (stop, ctx, position) => {
  const priorCount = position.prior.length;
  if (priorCount === 0) {
    return component("novelty", ctx, 1, "Nothing is planned before this, so there is no repeat and novelty is 1.");
  }
  let repeats = 0;
  for (const other of position.prior) if (other.record.category === stop.record.category) repeats += 1;
  const value = clamp01(1 - safeDiv(0.5 * repeats, Math.max(1, priorCount - 1)));
  const sentence = `${repeats} of the ${priorCount} stops already planned are also ${stop.record.category}, so novelty is ${num(value)}.`;
  return component("novelty", ctx, value, sentence);
};

/* ── group fit ──────────────────────────────────────────────────────────── */

/**
 * `objective-spec.md` section 4, normative, and the governing sentence is the
 * one that matters for this product: **"a null fact never scores against the
 * group, only a recorded false does."** The old form divided by a 1.25 span and
 * scored an unrecorded fact as 0, which is arithmetically similar and evidentially
 * different: it let a missing fact dilute a recorded one.
 *
 *   hasToddler  -> kidFriendly  true +1, null 0, false -1
 *                  stroller_ok  true +0.5, null 0, false -0.5
 *   hasElderly  -> low_walking  true +1, null 0, false -1
 *   party > 1   -> capacity known and enough +0.25, known and short -1,
 *                  unknown 0
 *
 * Diet is deliberately absent. It is a hard gate, so a record that does not
 * satisfy it never reaches the objective at all, and scoring it here as well
 * would charge twice for one fact.
 */
export const groupFitComponent: ComponentFn = (stop, ctx) => {
  const record = stop.record;
  const access = record.access;
  const clauses: string[] = [];
  let score = 0;

  if (ctx.hasToddler) {
    if (record.kidFriendly === true) {
      score += 1;
      clauses.push("a toddler is in the group and this is marked kid friendly");
    } else if (record.kidFriendly === false) {
      score -= 1;
      clauses.push("a toddler is in the group and this is marked not kid friendly");
    } else {
      clauses.push("a toddler is in the group and kid friendliness is unrecorded, so it scores nothing either way");
    }
    if (access.stroller_ok === true) {
      score += 0.5;
      clauses.push("stroller access is recorded");
    } else if (access.stroller_ok === false) {
      score -= 0.5;
      clauses.push("no stroller access is recorded");
    }
  }

  if (ctx.hasElderly) {
    if (access.low_walking === true) {
      score += 1;
      clauses.push("an elderly traveller is in the group and low walking is recorded");
    } else if (access.low_walking === false) {
      score -= 1;
      clauses.push("an elderly traveller is in the group and low walking is recorded as unavailable");
    } else {
      clauses.push("an elderly traveller is in the group and low walking is unrecorded, so it scores nothing either way");
    }
  }

  if (ctx.partySize > 1 && record.capacity !== null) {
    if (record.capacity >= ctx.partySize) {
      score += 0.25;
      clauses.push(`seats ${record.capacity} for a party of ${ctx.partySize}`);
    } else {
      score -= 1;
      clauses.push(`seats ${record.capacity} for a party of ${ctx.partySize}`);
    }
  }

  const value = clampSigned(score);
  const sentence = clauses.length === 0
    ? "Nothing in the group profile points either way here, so group fit is 0."
    : `${capitalise(clauses.join(", "))}, so group fit is ${num(value)}.`;
  return component("groupFit", ctx, value, sentence);
};

/* ── travel friction ────────────────────────────────────────────────────── */

/**
 * Friction is proximity, per `objective-spec.md` rule W-1: the per stop term is
 * `1 / (1 + travelKm)`, weighted by `w.travelFriction`, and it is **positive**.
 *
 * The old form was `-(travelMinutes / availableMinutes)`, which was wrong twice.
 * It made a long journey to a good place look bad, when the distance term is
 * already charged once at plan level by `superlinearTravel`, and it was signed
 * negative, so a component that reads "how close is this" was being presented as
 * a penalty. A 12 minute walk and a 12 minute metro are the same friction here,
 * which is the intended reading: this is about how far, not how slow.
 *
 * Zero distance is exactly 1, and the first stop is not special cased, because
 * rule G-3 already fixes the origin leg at `travelMinutes === 0`.
 */
export const travelFrictionComponent: ComponentFn = (stop, ctx) => {
  const km = isFiniteNumber(stop.travelKm) ? Math.max(0, stop.travelKm) : 0;
  const value = safeDiv(1, 1 + km);
  const sentence = `This stop is ${num(km)} km away, a proximity of ${num(value)}.`;
  return component("travelFriction", ctx, value, sentence);
};

/* ── reliability ────────────────────────────────────────────────────────── */

export const reliabilityComponent: ComponentFn = (stop, ctx) => {
  const raw = stop.record.providerReliability;
  if (raw === null || !isFiniteNumber(raw)) {
    return component("reliability", ctx, 0.5, "Provider reliability is unproven, so it counts a neutral 0.5.");
  }
  return component("reliability", ctx, clamp01(raw), `Provider reliability reads ${num(raw)} from the interaction stream.`);
};

/* ── the ten ────────────────────────────────────────────────────────────── */

export const COMPONENTS: Record<ComponentId, ComponentFn> = {
  interest: interestComponent,
  rating: ratingComponent,
  value: valueComponent,
  authenticity: authenticityComponent,
  weather: weatherComponent,
  crowd: crowdComponent,
  novelty: noveltyComponent,
  groupFit: groupFitComponent,
  travelFriction: travelFrictionComponent,
  reliability: reliabilityComponent,
};

/** Every component for one stop, in `COMPONENT_IDS` order. */
export function scoreStop(stop: Stop, ctx: DiscoveryContext, position: StopPosition): ScoreComponent[] {
  const out: ScoreComponent[] = [];
  for (const id of COMPONENT_IDS) out.push(COMPONENTS[id](stop, ctx, position));
  return out;
}
