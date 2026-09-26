import type {
  ComponentId,
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
 * Rule G-3: a stop with `travelMinutes === 0` contributes nothing, whatever its
 * `travelKm`. The origin leg is the one place the two readings of `Stop` can
 * disagree, and this makes both produce the same total, so the ambiguity in the
 * `Stop` comment cannot cost anyone the drift test.
 *
 * The squaring is the point: the sixth kilometre of an afternoon hurts more than
 * the first, which is the difference between a plan a person can walk and a plan
 * that looks good on a map.
 */
export function superlinearTravel(stops: readonly Stop[]): number {
  const legs: number[] = [];
  for (const stop of stops) {
    const minutes = isFiniteNumber(stop.travelMinutes) ? Math.max(0, stop.travelMinutes) : 0;
    if (minutes === 0) {
      legs.push(0);
      continue;
    }
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

/** Spec section 5: "exact string equality, folded to lowercase and trimmed". */
function categoryKey(category: string): string {
  return category.toLowerCase().trim();
}

/**
 * Penalty for repeating a category. Every unordered pair of stops in the same
 * category costs 0.5, divided by `max(1, n - 1)`, so a plan of two cafés is
 * penalised as hard as a plan of eight with two cafés in it.
 *
 * Enumerated as `i < j` over the array, never through a set, so the term cannot
 * depend on any iteration order. The case fold matters: `interestMatch` folds
 * case for the same reason, and a product that treats "Food" and "food" as one
 * category when scoring interest and as two when scoring novelty is incoherent.
 */
export function redundancyPenalty(stops: readonly Stop[]): number {
  let pairs = 0;
  for (let i = 0; i < stops.length; i += 1) {
    for (let j = i + 1; j < stops.length; j += 1) {
      if (categoryKey(stops[i].record.category) === categoryKey(stops[j].record.category)) pairs += 1;
    }
  }
  return safeDiv(0.5 * pairs, Math.max(1, stops.length - 1));
}

/**
 * `objective-spec.md` section 5 writes this as `d * sqrt(d)` and says explicitly
 * that it is written that way, "not as `d ^ 1.5`, because they are equal
 * mathematically and only one of them is guaranteed to be the same bits in two
 * independently written implementations". `Math.pow(d, 1.5)` is the other one.
 */
export function paceDeviation(stops: number, ctx: DiscoveryContext): number {
  const ideal = Math.max(1, ctx.idealStops);
  const gap = Math.abs(stops - ctx.idealStops);
  return safeDiv(gap * Math.sqrt(gap), ideal);
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
 *     sum over stops of  U(stop)
 *   - W.travelPenalty * superlinearTravel
 *   - W.crowd         * crowdLoad
 *   - W.novelty       * redundancyPenalty
 *   - W.pacePenalty   * paceDeviation
 *
 * **`crowd` and `novelty` are aggregate only.** `objective-spec.md`'s component
 * table puts them in `aggregate.crowd` and `aggregate.novelty`, subtracted once
 * each by `w.crowd` and `w.novelty`. The old composition added their per stop
 * contributions into the utility *and* subtracted the aggregate, so both were
 * charged twice. That single bug guaranteed the drift could never close, and it
 * is the reason 15 tests are disabled: `UPSTREAM_AGREES` is
 * `driftProbe().drift <= 1e-6`, and it has been false since the pipeline landed.
 *
 * The per stop breakdown still lists all ten components, because the traveller is
 * owed to see what a crowd reading did on the card they are looking at. Those two
 * rows are diagnostic. They are not added.
 *
 * Composition order is normative, section 6: push per stop values into an array,
 * push the four penalties into another in the order travel, crowd, novelty, pace,
 * then reduce each in index order and subtract. `(a + b) + c` is not `a + (b + c)`
 * in binary floating point, and the reducer is the contract.
 */
const AGGREGATE_ONLY: ReadonlySet<ComponentId> = new Set(["crowd", "novelty"]);

export function objectiveFast(stops: readonly Stop[], ctx: DiscoveryContext): Objective {
  const weights = ctx.profile.weights;
  const components: ScoreComponent[] = [];
  const perStop: number[] = [];

  for (let i = 0; i < stops.length; i += 1) {
    const block = scoreStop(stops[i], ctx, { index: i, prior: stops.slice(0, i) });
    const utilityParts: number[] = [];
    for (const entry of block) {
      components.push(entry);
      if (AGGREGATE_ONLY.has(entry.id)) continue;
      utilityParts.push(entry.contribution);
    }
    perStop.push(sumInOrder(utilityParts));
  }
  const travel = superlinearTravel(stops);
  const crowd = crowdLoad(stops, ctx);
  const novelty = redundancyPenalty(stops);
  const pace = paceDeviation(stops.length, ctx);
  const proximity = planProximity(stops);

  const penaltyTerms: number[] = [];
  penaltyTerms.push(weights.travelPenalty * travel);
  penaltyTerms.push(weights.crowd * crowd);
  penaltyTerms.push(weights.novelty * novelty);
  penaltyTerms.push(weights.pacePenalty * pace);

  const total = sumInOrder(perStop) - sumInOrder(penaltyTerms);

  const breakdown: ObjectiveBreakdown = {
    total,
    components,
    aggregate: { travel, crowd, novelty, proximity, pace },
  };
  return { value: total, breakdown };
}
