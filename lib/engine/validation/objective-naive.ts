import type {
  ComponentId,
  DiscoveryContext,
  Objective,
  ObjectiveBreakdown,
  ScoreComponent,
  Stop,
} from "@/lib/engine/contracts/types";
import { legDistancesKm } from "./distance-naive";
import {
  authenticityScore,
  crowdLoad,
  groupScore,
  interestScore,
  mean,
  paceDeviation,
  proximityDecay,
  ratingScore,
  redundancyPenalty,
  reliabilityScore,
  superlinearTravel,
  valueScore,
  weatherScore,
  wilsonLowerBound,
} from "./components-naive";

/**
 * The objective, implemented a second time.
 *
 * This file intentionally duplicates `scoring/objective-fast.ts`. It must never
 * be "deduplicated" into it, and a lint rule or a well-meaning refactor that
 * shares a helper between the two is a regression, not a cleanup. The only
 * evidence this project has that its producer is correct is that an
 * independently written second derivation of the same written specification
 * agrees with it to 1e-6. Destroy the duplication and the evidence disappears.
 *
 * It is allowed to be slow, naive and obviously correct. Cleverness here is a
 * defect. Read it top to bottom and check it against section 3 of
 * `SESSION/00-CONTRACTS.md` by hand.
 *
 * Purity: no clock, no randomness, no `Set` or `Map` iteration, index-ordered
 * accumulation, no module-level mutable state.
 */

/**
 * Left to right, in index order, into a running total.
 *
 * Spec section 2 requires this shape on both sides: values are pushed into an
 * array in plan order and reduced afterwards, because `(a + b) + c` and
 * `a + (b + c)` are different doubles. Written as a named reducer here so the
 * fast path and this one can be read side by side and seen to agree on the shape
 * as well as the arithmetic.
 */
function sumOrdered(values: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) total += values[i];
  return total;
}

function fixed(value: number): string {  return (Math.round(value * 100) / 100).toFixed(2);
}

function plural(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

/**
 * One utility row. `mean` is the component's per-stop average, so `normalised`
 * stays inside the [-1, 1] the type promises. The plan total is a *sum* over
 * stops, not an average, so `contribution` scales by the stop count.
 *
 * ponytail: this means `contribution === weight * normalised * stopCount` at
 * plan level, not the `weight * normalised` the frozen type writes. The type
 * describes one stop; a plan of four has four times the interest of one, and
 * fudging that to make the identity hold would make the panel lie about the
 * score. Logged in SESSION/BLOCKERS/6.md.
 */
function utilityRow(
  id: ComponentId,
  weight: number,
  mean: number,
  stopCount: number,
  sentence: string,
): ScoreComponent {
  return {
    id,
    weight,
    contribution: mean * weight * stopCount,
    normalised: mean,
    sentence,
  };
}

/**
 * One plan-level row. A penalty carries two different weights when two
 * different terms share a row, so the contribution is stated outright rather
 * than reconstructed from a single weight.
 *
 * ponytail: `normalised` on a penalty row can leave [-1, 1], because a
 * quadratic distance term is unbounded and squashing it would hide the cost.
 * The magnitude is stated in `contribution` and in the sentence.
 */
function penaltyRow(
  id: ComponentId,
  weight: number,
  penalty: number,
  normalised: number,
  sentence: string,
): ScoreComponent {
  return { id, weight, contribution: -penalty, normalised, sentence };
}

function sameCategoryPairs(stops: readonly Stop[]): number {
  let pairs = 0;
  for (let i = 0; i < stops.length; i += 1) {
    for (let j = i + 1; j < stops.length; j += 1) {
      if (stops[i].record.category === stops[j].record.category) pairs += 1;
    }
  }
  return pairs;
}

function ratingSentence(stops: readonly Stop[]): string {
  let positive = 0;
  let reviews = 0;
  for (const stop of stops) {
    positive += stop.record.ratingSum ?? 0;
    reviews += stop.record.reviewCount ?? 0;
  }
  if (reviews === 0) {
    return "Wilson lower bound 0 because no stop in this plan has a review count.";
  }
  return `Wilson lower bound ${fixed(
    wilsonLowerBound(positive, reviews * 5) * 5,
  )} from ${reviews} reviews across ${plural(stops.length, "stop", "stops")}.`;
}

export function objectiveNaive(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
): Objective {
  const w = ctx.profile.weights;
  const n = stops.length;

  /**
   * Rule G-1: `Stop.travelKm` is an input to both implementations and neither
   * one recomputes it. The spec gives the reason and it is the whole ballgame:
   * without G-1 the 1e-6 bound is unreachable, because OSRM road kilometres and
   * a haversine great-circle distance differ by tens of percent.
   *
   * The old code fed this file's own `legDistancesKm` into the objective, which
   * is what rule G-2 forbids. G-2's haversine exists to *check* the numbers it
   * was handed, and `validate` still does that and reports `distance_drift`; it
   * was never meant to replace the input. On a fixture whose stops carry road
   * distances, that difference was worth 1.01 on the objective.
   */
  const km: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const value = stops[i].travelKm;
    km.push(typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
  }

  // Rule W-1: the per stop proximity term is weighted by `w.travelFriction`.
  // `Weights` has no `proximity` key, and the old 0.15 fallback constant meant
  // this derivation scored proximity on a different weight to the fast path for
  // every profile ever written, which is drift by construction.
  const proximityW = w.travelFriction;

  // Per-stop utility, accumulated in index order into an array, summed after.
  const perStop: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = stops[i].record;
    perStop.push(
      w.interest * interestScore(r, ctx) +
        w.rating * ratingScore(r) +
        w.value * valueScore(r, ctx) +
        w.authenticity * authenticityScore(r) +
        w.weather * weatherScore(r, ctx) +
        w.groupFit * groupScore(r, ctx) +
        w.reliability * reliabilityScore(r) +
        proximityW * proximityDecay(km[i] ?? 0),
    );
  }
  const utilityTotal = sumOrdered(perStop);
  const travel = superlinearTravel(stops, km);
  const crowd = crowdLoad(stops, ctx);
  const novelty = redundancyPenalty(stops);
  const pace = paceDeviation(n, ctx);
  const proximity = mean(stops.map((_, i) => proximityDecay(km[i] ?? 0)));

  // Composition order is normative, spec section 6: push the four penalties into
  // an array in the order travel, crowd, novelty, pace, reduce that in index
  // order, and subtract once. `a - b - c - d` is not `a - (b + c + d)` in binary
  // floating point, and the reducer is the contract.
  //
  // Proximity is NOT subtracted again here. It already entered the total through
  // the per stop term by rule W-1, and the old `proximityContribution` charged it
  // a third time on top of that.
  const penaltyTerms: number[] = [];
  penaltyTerms.push(w.travelPenalty * travel);
  penaltyTerms.push(w.crowd * crowd);
  penaltyTerms.push(w.novelty * novelty);
  penaltyTerms.push(w.pacePenalty * pace);
  let penaltySum = 0;
  for (const term of penaltyTerms) penaltySum += term;

  const value = utilityTotal - penaltySum;
  const travelPenalty = w.travelPenalty * travel;
  const crowdPenalty = w.crowd * crowd;
  const noveltyPenalty = w.novelty * novelty;
  const pacePenalty = w.pacePenalty * pace;

  const interest = mean(stops.map((s) => interestScore(s.record, ctx)));
  const rating = mean(stops.map((s) => ratingScore(s.record)));
  const worth = mean(stops.map((s) => valueScore(s.record, ctx)));
  const authenticity = mean(stops.map((s) => authenticityScore(s.record)));
  const weather = mean(stops.map((s) => weatherScore(s.record, ctx)));
  const group = mean(stops.map((s) => groupScore(s.record, ctx)));
  const reliability = mean(stops.map((s) => reliabilityScore(s.record)));

  const components: ScoreComponent[] = [
    utilityRow(
      "interest",
      w.interest,
      interest,
      n,
      `Interest match ${fixed(interest)} on average across ${plural(n, "stop", "stops")}.`,
    ),
    utilityRow("rating", w.rating, rating, n, ratingSentence(stops)),
    utilityRow(
      "value",
      w.value,
      worth,
      n,
      `Value for money ${fixed(worth)} against a head budget of ${Math.round(
        ctx.budgetInr / Math.max(1, ctx.partySize),
      )} INR.`,
    ),
    utilityRow(
      "authenticity",
      w.authenticity,
      authenticity,
      n,
      `Local character ${fixed(authenticity)} on average across ${plural(n, "stop", "stops")}.`,
    ),
    utilityRow(
      "weather",
      w.weather,
      weather,
      n,
      ctx.weatherSeverity === null
        ? "Weather fit 0 because the weather is unknown, not because it is fine."
        : `Weather fit ${fixed(weather)} under ${ctx.weatherSeverity.replace("_", " ")}.`,
    ),
    penaltyRow(
      "crowd",
      w.crowd,
      crowdPenalty,
      crowd,
      `Crowd load ${fixed(crowd)} on average, peak-hour weighted, across ${plural(n, "stop", "stops")}.`,
    ),
    penaltyRow(
      // Redundancy and pace are both "the plan is the wrong shape" penalties and
      // neither has a ComponentId to itself, so they share this row. Both
      // numbers are named so the panel can show what it gave up.
      "novelty",
      w.novelty,
      noveltyPenalty + pacePenalty,
      novelty + pace,
      `Redundancy ${fixed(novelty)} from ${plural(
        sameCategoryPairs(stops),
        "repeated category pair",
        "repeated category pairs",
      )}; pace ${fixed(pace)} away from an ideal of ${ctx.idealStops} ${
        ctx.idealStops === 1 ? "stop" : "stops"
      }.`,
    ),
    utilityRow(
      "groupFit",
      w.groupFit,
      group,
      n,
      `Group fit ${fixed(group)} on average across ${plural(n, "stop", "stops")}.`,
    ),
    penaltyRow(
      // Proximity has no ComponentId of its own, so the per-stop proximity term
      // and the quadratic travel penalty share this row. Both numbers are named.
      // The contribution is the travel penalty alone: proximity already entered
      // the total through the per-stop term, and subtracting it here as well
      // charged it twice, which is what kept the drift off zero.
      "travelFriction",
      w.travelPenalty,
      travelPenalty,
      travel - proximity,
      `Proximity ${fixed(proximity)} on average; quadratic travel cost ${fixed(
        travelPenalty,
      )} over ${plural(Math.max(0, n - 1), "leg", "legs")}.`,
    ),
    utilityRow(
      "reliability",
      w.reliability,
      reliability,
      n,
      `Provider reliability ${fixed(reliability)} on average across ${plural(n, "stop", "stops")}.`,
    ),
  ];

  const breakdown: ObjectiveBreakdown = {
    total: value,
    components,
    aggregate: { travel, crowd, novelty, proximity, pace },
  };
  return { value, breakdown };
}
