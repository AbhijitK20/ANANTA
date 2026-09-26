import type {
  DiscoveryContext,
  Objective,
  ObjectiveBreakdown,
  ScoreComponent,
  Stop,
} from "@/lib/engine/contracts";
import { peakHourFactor, scoreStop } from "./components";
import { clamp01, isFiniteNumber, safeDiv } from "./normalize";

/**
 * The fast path: composed from the values already on each `Stop`. It never
 * recomputes a distance, because the km on a leg came from the injected matrix
 * and a straight line would disagree with the route the traveller is shown.
 *
 * "Fast" is about the distance matrix, not about being allowed to be less
 * correct. Session 6 re-derives all of this from `coordinates` with its own
 * haversine and the two must agree to 1e-6, so every step here is total and
 * pure: no `Date.now`, no argument-less `new Date`, no `Math.random`, no module
 * state, and no iteration over a `Set` or `Map`.
 */

/** Kilometres at which a leg's cost has doubled, the constant in the published formula. */
export const TRAVEL_KM_SCALE = 8;

function sumInOrder(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * Quadratic in distance, linear in time. Each leg is
 * `minutes * (1 + km / 8)^2`, summed in plan order.
 *
 * The squaring is the point: the sixth kilometre of an afternoon hurts more
 * than the first, which is the difference between a plan a person can walk and
 * a plan that looks good on a map.
 */
export function superlinearTravel(stops: readonly Stop[]): number {
  const legs: number[] = [];
  for (const stop of stops) {
    const minutes = isFiniteNumber(stop.travelMinutes) ? Math.max(0, stop.travelMinutes) : 0;
    const km = isFiniteNumber(stop.travelKm) ? Math.max(0, stop.travelKm) : 0;
    legs.push(minutes * Math.pow(1 + km / TRAVEL_KM_SCALE, 2));
  }
  return sumInOrder(legs);
}

/**
 * Mean crowd pressure over the plan, each stop scaled by how well the current
 * time suits its best hour. An unrecorded crowd counts 0.5, an unknown best
 * hour counts 1, and an empty plan is 0 rather than NaN.
 */
export function crowdLoad(stops: readonly Stop[], ctx: DiscoveryContext): number {
  if (stops.length === 0) return 0;
  const parts: number[] = [];
  for (const stop of stops) {
    const raw = stop.record.crowdProfile;
    const crowd = raw === null || !isFiniteNumber(raw) ? 0.5 : clamp01(raw);
    parts.push(crowd * peakHourFactor(ctx.now, stop.record.bestTimeOfDay));
  }
  return safeDiv(sumInOrder(parts), stops.length);
}

/**
 * Penalty for repeating a category. Every unordered pair of stops in the same
 * category costs 0.5, divided by `max(1, n - 1)`, so a plan of two cafés is
 * penalised as hard as a plan of eight with two cafés in it.
 *
 * Enumerated as `i < j` over the array, never through a set, so the term cannot
 * depend on any iteration order.
 */
export function redundancyPenalty(stops: readonly Stop[]): number {
  let pairs = 0;
  for (let i = 0; i < stops.length; i += 1) {
    for (let j = i + 1; j < stops.length; j += 1) {
      if (stops[i].record.category === stops[j].record.category) pairs += 1;
    }
  }
  return safeDiv(0.5 * pairs, Math.max(1, stops.length - 1));
}

/** `|n - idealStops|^1.5 / max(1, idealStops)`. Zero only when the count matches. */
export function paceDeviation(stops: number, ctx: DiscoveryContext): number {
  const ideal = Math.max(1, ctx.idealStops);
  const gap = Math.abs(stops - ctx.idealStops);
  return safeDiv(Math.pow(gap, 1.5), ideal);
}

/** `1 / (1 + km)`, in (0, 1]. Zero distance is a perfect 1, never a division by zero. */
export function proximityDecay(stop: Stop): number {
  const km = isFiniteNumber(stop.travelKm) ? Math.max(0, stop.travelKm) : 0;
  return safeDiv(1, 1 + km);
}

/** Mean proximity decay over the plan. Reported for the debug panel, never subtracted. */
export function planProximity(stops: readonly Stop[]): number {
  if (stops.length === 0) return 0;
  return safeDiv(sumInOrder(stops.map((stop) => proximityDecay(stop))), stops.length);
}

/**
 * The single scalar. Maximise.
 *
 *     utility(stop)                       summed in plan order
 *   - travelPenalty * superlinearTravel
 *   - crowd         * crowdLoad
 *   - novelty       * redundancyPenalty
 *   - pacePenalty   * paceDeviation
 *
 * Every per-stop component is already signed, so no sign is flipped here. The
 * four aggregate terms are the only places a penalty is applied, which is what
 * keeps the breakdown legible in the UI: a negative contribution in the panel is
 * a property of that stop, and a negative aggregate is a property of the plan.
 *
 * The ten utility weights are read straight off the profile and are not
 * re-normalised. Section 3 of the contract states the scalar as `W.c_i * U_i`
 * and says nothing about the weight vector being a partition, so normalising
 * here would have been an unrequested change to the number session 6 checks.
 * `clampWeights` is exported for the code that *writes* a profile, which is
 * where making the vector a partition belongs.
 */
export function objectiveFast(stops: readonly Stop[], ctx: DiscoveryContext): Objective {
  const weights = ctx.profile.weights;
  const components: ScoreComponent[] = [];
  const perStop: number[] = [];

  for (let i = 0; i < stops.length; i += 1) {
    const block = scoreStop(stops[i], ctx, { index: i, prior: stops.slice(0, i) });
    const contributions: number[] = [];
    for (const entry of block) {
      components.push(entry);
      contributions.push(entry.contribution);
    }
    perStop.push(sumInOrder(contributions));
  }

  const utility = sumInOrder(perStop);
  const travel = superlinearTravel(stops);
  const crowd = crowdLoad(stops, ctx);
  const novelty = redundancyPenalty(stops);
  const pace = paceDeviation(stops.length, ctx);
  const proximity = planProximity(stops);

  const total = utility
    - weights.travelPenalty * travel
    - weights.crowd * crowd
    - weights.novelty * novelty
    - weights.pacePenalty * pace;

  const breakdown: ObjectiveBreakdown = {
    total,
    components,
    aggregate: { travel, crowd, novelty, proximity, pace },
  };
  return { value: total, breakdown };
}
