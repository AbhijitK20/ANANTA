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

function bucketOf(minutes: number): number {
  if (minutes < 5 * 60) return 3;
  if (minutes < 11 * 60) return 0;
  if (minutes < 17 * 60) return 1;
  if (minutes < 21 * 60) return 2;
  return 3;
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
 * The contract fixes the endpoints, 1.0 at the record's best time decaying to
 * 0.4 at the opposite end, but not the interpolation. This is the linear version
 * on a four position ring, so the two published numbers determine it entirely:
 * 1.0 aligned, 0.7 one step round the ring, 0.4 opposite. A record with
 * `bestTimeOfDay: "any"` has no opposite, so it scores 1.0 at all times.
 */
export function peakHourFactor(now: string, best: ExperienceV2["bestTimeOfDay"]): number {
  if (best === "any") return 1;
  const bestIndex = TIME_BUCKETS.indexOf(best);
  if (bestIndex < 0) return 1;
  const nowIndex = bucketOf(localMinutesOfDay(now));
  const raw = Math.abs(bestIndex - nowIndex);
  const steps = Math.min(raw, TIME_BUCKETS.length - raw);
  return clamp01(1 - 0.3 * steps);
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

export const interestComponent: ComponentFn = (stop, ctx) => {
  const category = stop.record.category;
  const matched = weightForKey(ctx.profile.interests, category);
  const avoided = weightForKey(ctx.profile.avoid, category);
  const value = clampSigned(matched - avoided);
  let sentence: string;
  if (matched > 0 && avoided > 0) {
    sentence = `Interest match ${num(value)}: ${category} carries ${num(matched)} of interest and ${num(avoided)} avoided.`;
  } else if (matched > 0) {
    sentence = `Interest match ${num(value)}, from ${num(matched)} of stated interest in ${category}.`;
  } else if (avoided > 0) {
    sentence = `Interest match ${num(value)}: only ${category} is on your avoid list, at ${num(avoided)}.`;
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
const UNPRICED: readonly string[] = ["estimate", "unverified"];

export const valueComponent: ComponentFn = (stop, ctx) => {
  const record = stop.record;
  const party = Math.max(1, ctx.partySize);
  const confidence = record.confidence.price ?? "unverified";
  if (UNPRICED.includes(confidence)) {
    const word = confidence === "estimate" ? "an estimate" : "unverified";
    const sentence = `Price is ${word} at ${num(record.priceInr)} INR, so value counts 0 and cannot buy rank.`;
    return component("value", ctx, 0, sentence);
  }
  const value = clamp01(1 - safeDiv(record.priceInr * party, ctx.budgetInr));
  const sentence = `At ${num(record.priceInr)} INR each for ${party} against your ${num(ctx.budgetInr)} INR budget, value is ${num(value)}.`;
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
const WEATHER_FIT: Record<NonNullable<DiscoveryContext["weatherSeverity"]>, Record<ExperienceV2["indoor"], number>> = {
  clear: { indoor: 0.5, outdoor: 1, mixed: 0.75 },
  rain: { indoor: 1, outdoor: 0, mixed: 0.6 },
  heavy_rain: { indoor: 1, outdoor: 0, mixed: 0.4 },
  storm: { indoor: 1, outdoor: 0, mixed: 0.25 },
};

export const weatherComponent: ComponentFn = (stop, ctx) => {
  const severity = ctx.weatherSeverity;
  if (severity === null) {
    return component("weather", ctx, 0.5, "Weather is unknown, so weather fit counts a neutral 0.5.");
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

/** Widest positive spread the clauses can produce. The negative tail clamps at minus 1. */
const GROUP_FIT_SPAN = 1.25;

export const groupFitComponent: ComponentFn = (stop, ctx) => {
  const record = stop.record;
  const access = record.access;
  const clauses: string[] = [];
  let score = 0;

  if (ctx.hasToddler) {
    if (record.kidFriendly === true) {
      score += 0.5;
      clauses.push("a toddler is in the group and this is marked kid friendly");
    } else if (record.kidFriendly === false) {
      score -= 0.5;
      clauses.push("a toddler is in the group and this is marked not kid friendly");
    } else {
      clauses.push("a toddler is in the group and kid friendliness is unrecorded, so the signal is skipped");
    }
    if (access.stroller_ok === false) {
      score -= 0.25;
      clauses.push("no stroller access is recorded");
    }
  }

  if (ctx.hasElderly) {
    if (access.seating_available === true) {
      score += 0.25;
      clauses.push("an elderly traveller is in the group and seating is recorded");
    } else if (access.seating_available === false) {
      score -= 0.25;
      clauses.push("an elderly traveller is in the group and seating is recorded as unavailable");
    } else {
      clauses.push("an elderly traveller is in the group and seating is unrecorded, so the signal is skipped");
    }
    if (record.indoor === "outdoor") {
      score -= 0.25;
      clauses.push("an elderly traveller is in the group and this is outdoors");
    }
  }

  if (ctx.partySize >= 5) {
    if (access.low_walking === true) {
      score += 0.25;
      clauses.push("a party of 5 or more and low walking is recorded");
    } else if (access.low_walking === false) {
      score -= 0.25;
      clauses.push("a party of 5 or more and low walking is recorded as unavailable");
    } else {
      clauses.push("a party of 5 or more and low walking is unrecorded, so the signal is skipped");
    }
  }

  if (ctx.diets.length > 0) {
    const met = ctx.diets.filter((need) => record.diets.includes(need)).length;
    if (met === ctx.diets.length) {
      score += 0.25;
      clauses.push(`all ${met} dietary needs are covered`);
    } else if (met === 0) {
      score -= 0.25;
      clauses.push(`none of the ${ctx.diets.length} dietary needs are covered`);
    } else {
      clauses.push(`${met} of ${ctx.diets.length} dietary needs are covered`);
    }
  }

  const value = clampSigned(safeDiv(score, GROUP_FIT_SPAN));
  const sentence = clauses.length === 0
    ? "Nothing in the group profile points either way here, so group fit is 0."
    : `${capitalise(clauses.join(", "))}, so group fit is ${num(value)}.`;
  return component("groupFit", ctx, value, sentence);
};

/* ── travel friction ────────────────────────────────────────────────────── */

/**
 * Friction is the share of the traveller's whole window that this one leg eats.
 * Scale free on purpose: a 25 minute leg in a 300 minute afternoon is mild and
 * the same leg in a 90 minute window is not. The quadratic in distance is
 * already carried once at plan level by `superlinearTravel`, so it is not
 * counted twice here.
 */
export const travelFrictionComponent: ComponentFn = (stop, ctx, position) => {
  const available = Math.max(1, ctx.availableMinutes);
  if (position.index === 0 && stop.travelMinutes <= 0) {
    return component("travelFriction", ctx, 0, "This is the first stop, so there is no travel leg and friction is 0.");
  }
  const value = clamp01(safeDiv(stop.travelMinutes, available));
  const sentence = `This leg is ${num(stop.travelMinutes)} of your ${num(available)} available minutes, a friction of ${num(value)}.`;
  return component("travelFriction", ctx, -value, sentence);
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
