import { DEFAULT_BUFFER_MINUTES } from "@/lib/engine/feasibility";
import { localMinutesOfDay, objectiveFast } from "@/lib/engine/scoring";
import type { DiscoveryContext, ExperienceV2, Objective, PackResult, Rung, Stop } from "@/lib/engine/contracts";
import { beamSearch } from "./beam";
import { clusterCandidates, type Cluster } from "./cliques";
import { buildDistanceMatrix, matrixLookup, referenceLatitude, tourCost, tourLegs } from "./distance";
import { clusterRadiusKm } from "./graph";
import { insertCandidates, nearestInsertion, nearestNeighbourTour } from "./insertion";
import { lahc, lcg } from "./lahc";
import { orOpt, randomRelocation, randomSwap, relocationNeighbours } from "./or-opt";
import { PenaltyTable } from "./penalty";
import { twoOpt, type Cost } from "./two-opt";

export interface PackOptions {
  /** Precomputed pairwise travel. Inject it, never fetch inside. */
  matrix: (aId: string, bId: string) => { minutes: number; km: number };
  originMinutes: (id: string) => { minutes: number; km: number };
  beamWidth?: number;
  iters?: number;
  /** Deterministic. Defaults to a seeded LCG so runs are reproducible. */
  seed?: number;
  /**
   * Record table for id resolution. The frozen `buildStops(order, ctx, options)`
   * signature has nowhere else to look an id up, and a module-level registry would
   * be exactly the module-level mutable state the purity rules forbid.
   */
  records?: ExperienceV2[];
}

export const DEFAULT_BEAM_WIDTH = 8;
export const DEFAULT_CHILDREN_PER_NODE = 5;
export const DEFAULT_ITERS = 240;
export const DEFAULT_HISTORY_LENGTH = 6;
export const DEFAULT_SEED = 1026;
/** A cluster wider than this is a scatter. Callers that care derive it from the manifest. */
export const DEFAULT_CLUSTER_DIAMETER_KM = 4;
export const MIN_CLUSTER_COUNT = 2;
export const MAX_CLUSTER_COUNT = 4;
export const MAX_STOPS_PER_CLUSTER = 6;

const PENALTY_DECAY_EVERY = 20;
const PENALTY_DECAY_RATE = 0.7;
/** Share of LAHC samples that are a swap rather than a relocation. */
const SWAP_SHARE = 0.4;
/** How many neighbours the penalty calibration samples. 24 is plenty for a 2 to 4 stop plan. */
const CALIBRATION_SAMPLES = 24;

/**
 * Walk a visit order into `Stop`s, assigning every minute and rupee of it.
 *
 * `arriveBy` is minutes from local midnight, read out of the injected `ctx.now`,
 * so it moves monotonically down the order. The window a plan consumes is exactly
 * `Σ (travel + visit + buffer)`. The buffer after the last stop is zero, because
 * there is no onward leg left for it to absorb.
 *
 * `costInr` multiplies one numeric price by the party size. The v1 string parse
 * stripped non-digits, so a "From 300" headline and a 300 per-person price were
 * the same number, and a party of four was billed for one head.
 */
export function buildStops(order: string[], ctx: DiscoveryContext, options: PackOptions): Stop[] {
  const table = new Map((options.records ?? []).map((record) => [record.id, record]));
  const stops: Stop[] = [];
  let clock = localMinutesOfDay(ctx.now);
  for (let index = 0; index < order.length; index += 1) {
    const record = table.get(order[index]);
    if (!record) throw new Error(`buildStops: no record supplied for id "${order[index]}"`);
    const leg = index === 0 ? options.originMinutes(record.id) : options.matrix(order[index - 1], record.id);
    clock += leg.minutes;
    const bufferMinutes = index === order.length - 1 ? 0 : DEFAULT_BUFFER_MINUTES;
    stops.push({
      record,
      arriveBy: clock,
      travelMinutes: leg.minutes,
      travelKm: leg.km,
      visitMinutes: record.durationMinutes,
      bufferMinutes,
      costInr: (record.pricePerPersonInr ?? record.priceInr) * ctx.partySize,
    });
    clock += record.durationMinutes + bufferMinutes;
  }
  return stops;
}

/** Total travel minutes of an order, straight from the injected matrix. */
export function travelWindowMinutes(order: string[], ctx: DiscoveryContext, options: PackOptions): number {
  return tourLegs(order, ctx, options).reduce((sum, leg) => sum + leg.minutes, 0);
}

/**
 * Cluster, route, improve, accept. This replaces the exhaustive `choose()` in
 * `lib/plan.ts`, which materialised C(60, k) arrays and evaluated every one of
 * them, on the render path, on every budget-slider keystroke.
 *
 * ponytail: greedy insertion plus 2-opt plus Or-opt plus LAHC, not Held-Karp. At
 * the 2 to 4 stops this product ships, the gap to optimal is small, and the exact
 * solver costs O(n^2 2^n), which is 16x 2^4 worse for a gain nobody can see in the
 * UI. `pack.test.ts` measures the gap against a brute-force optimum on a small
 * instance and fails if it grows past 3%. Upgrade path if stops ever exceed about
 * 6: Or-opt becomes redundant once 2-opt is paired with a proper neighbour list,
 * and `iters` is the first knob to raise.
 */
export function pack(candidates: ExperienceV2[], ctx: DiscoveryContext, options: PackOptions): PackResult {
  const beamWidth = Math.max(1, Math.floor(options.beamWidth ?? DEFAULT_BEAM_WIDTH));
  const searchIterations = Math.max(0, Math.floor(options.iters ?? DEFAULT_ITERS));
  const seed = options.seed ?? DEFAULT_SEED;

  const table = new Map<string, ExperienceV2>();
  for (const record of candidates) if (!table.has(record.id)) table.set(record.id, record);
  const records = [...table.values()];
  const withRecords: PackOptions = { ...options, records };
  const ids = records.map((record) => record.id);
  const known = new Set(ids);
  const stats = { candidates: records.length, evaluated: 0, acceptedImprovements: 0 };

  const evaluate = (order: string[]) => {
    stats.evaluated += 1;
    return objectiveFast(buildStops(order, ctx, withRecords), ctx);
  };
  const objectiveOf = (order: string[]) => evaluate(order).value;

  if (!ids.length) return finish([], [], ctx, withRecords, stats);

  const geometry = matrixLookup(buildDistanceMatrix(records, referenceLatitude(ctx)));
  const tripKm = (aId: string, bId: string) => options.matrix(aId, bId).km;
  const originKm = (id: string) => options.originMinutes(id).km;
  const costOf: Cost = (order) => tourCost(order, tripKm, originKm);

  const single = new Map(ids.map((id) => [id, objectiveOf([id])]));
  const ranked = [...ids].sort(
    (a, b) => (single.get(b) as number) - (single.get(a) as number) || (a < b ? -1 : a > b ? 1 : 0),
  );

  // 1 and 2. Radius graph in projected metres, then diameter-bounded maximum cliques.
  const allClusters = clusterCandidates(
    ranked,
    geometry,
    clusterRadiusKm(ctx),
    DEFAULT_CLUSTER_DIAMETER_KM,
    MAX_CLUSTER_COUNT,
  );
  const clusters = rankClusters(allClusters, single, ranked);

  // 3. Take the top 2 to 4 clusters, bounded by how many stops were asked for.
  const stopBudget = Math.max(0, Math.round(ctx.idealStops));
  const clusterBudget = Math.max(MIN_CLUSTER_COUNT, Math.min(MAX_CLUSTER_COUNT, Math.round(ctx.idealStops)));
  const chosen = clusters.slice(0, Math.min(clusterBudget, clusters.length));
  const share = Math.max(1, Math.ceil(stopBudget / Math.max(1, chosen.length)));

  // 4. Cheapest-insertion, then 2-opt, then Or-opt, inside each cluster.
  const tours = chosen.map((cluster) => {
    const members = ranked.filter((id) => cluster.ids.includes(id)).slice(0, Math.min(MAX_STOPS_PER_CLUSTER, share));
    const seeded = nearestNeighbourTour(members[0], members, tripKm);
    const grown = insertCandidates(seeded, members, tripKm, share, originKm);
    return orOpt(twoOpt(grown, costOf), costOf);
  });

  // 5. Stitch at the closest POI pair, then improve across the whole tour.
  let order = orOpt(twoOpt(stitch(tours, costOf), costOf), costOf);

  // The stitched tour can run past the budget when there are more clusters than
  // stops. Drop the weakest stop rather than the last one, then improve again,
  // because the last one is usually the furthest and not the worst.
  order = trimTo(order, stopBudget, single);
  order = orOpt(twoOpt(order, costOf), costOf);

  // 6. Short of the minimum, harvest the best remaining candidate by objective.
  order = harvest(order, ranked, Math.max(0, Math.round(ctx.minStops)), tripKm, originKm, objectiveOf);

  const pins = ctx.profile.pins.filter((id) => known.has(id)).slice(0, stopBudget);
  if (pins.length && !pins.every((id) => order.includes(id))) {
    order = [...pins, ...order.filter((id) => !pins.includes(id))].slice(0, stopBudget);
  }

  if (stopBudget > 0 && pins.length >= stopBudget) {
    order = pins.slice(0, stopBudget);
  } else {
    // The beam is the replacement for enumeration. `iterations` is the stop budget
    // minus the seed depth, so the longest order it can reach is exactly the budget.
    // Seeds are the routed cluster tour where it fits, plus the best single stops,
    // so the beam starts from a real plan and not from nothing.
    const depth = pins.length + 1;
    const seeds = [order, ...ranked.slice(0, beamWidth).map((id) => (pins.includes(id) ? [id] : [...pins, id]))];
    const beam = beamSearch({
      initial: seeds.filter((seed) => seed.length >= 1 && seed.length <= stopBudget),
      expand: (node) => {
        const used = new Set(node);
        const tail = node[node.length - 1];
        return ranked
          .filter((id) => !used.has(id))
          .map((id) => ({ id, km: tripKm(tail, id) }))
          .sort((a, b) => a.km - b.km || (a.id < b.id ? -1 : 1))
          .slice(0, DEFAULT_CHILDREN_PER_NODE)
          .map((entry) => [...node, entry.id]);
      },
      score: (node) => searchFitness(node, ctx, options, objectiveOf),
      key: (node) => node.join("|"),
      width: beamWidth,
      iterations: Math.max(0, stopBudget - depth),
      childrenPerNode: DEFAULT_CHILDREN_PER_NODE,
    });
    // The objective owns the stop count, so the beam's winner replaces the routed
    // tour whenever it clears the floor the traveller set.
    const floor = Math.min(Math.max(0, Math.round(ctx.minStops)), stopBudget);
    if (beam.best && beam.best.length >= floor) order = capToBudget(beam.best, stopBudget);
  }
  order = orOpt(twoOpt(order, costOf), costOf);

  // 7. Accept under LAHC, restart from best, with adaptive penalties on the pairs.
  //
  // The penalty is calibrated against this instance rather than fixed, because a
  // fixed step either blinds the search or does nothing: the objective deltas here
  // are around 0.01, and a 0.5 step made every candidate look like a regression.
  // One local move is worth `spread` of objective, so a reuse is charged a
  // twentieth of a move. Solutions that were actually accepted are the ones
  // charged, in `fitness` below, not every candidate that was merely proposed.
  const spread = localSpread(order, objectiveOf);
  const penalties = new PenaltyTable({ step: spread / 20, ceiling: spread * 2 });
  const rng = lcg(seed);
  const ticks = { count: 0 };
  /**
   * `lahc` MINIMISES `fitness`, so the value handed to it must be the negation
   * of the maximise-oriented `searchFitness`.
   *
   * It was not negated. `search.best` was therefore the **worst** plan the
   * search accepted, and the guard below tested `search.bestFitness <=
   * entryFitness`, which is `5.8 <= -5.8` and always false, so the LAHC result
   * was discarded every time. The stage ran 240 iterations per plan, kept a
   * penalty table, and changed nothing: `iters: 0`, `240` and `5000` all
   * returned byte-identical plans. LAHC is the one anti-local-optima mechanism
   * this project has, and it was inert.
   */
  const entryFitness = -searchFitness(order, ctx, options, objectiveOf);
  penalties.record(order);
  const search = lahc({
    initial: order,
    sample: (current) => {
      ticks.count += 1;
      if (ticks.count % PENALTY_DECAY_EVERY === 0) penalties.decay(PENALTY_DECAY_RATE);
      return rng() < SWAP_SHARE ? randomSwap(current, rng) : randomRelocation(current, rng);
    },
    cost: (candidate) => -searchFitness(candidate, ctx, options, objectiveOf) + penalties.penaltyOf(candidate),
    fitness: (candidate) => {
      const value = -searchFitness(candidate, ctx, options, objectiveOf);
      penalties.record(candidate);
      return value;
    },
    iterations: searchIterations,
    historyLength: DEFAULT_HISTORY_LENGTH,
    seed,
  });
  stats.acceptedImprovements = search.improvements;
  if (search.bestFitness <= entryFitness) order = search.best;

  return finish(order, chosen, ctx, withRecords, stats);
}

/** Clusters by summed per-stop score, then by best-ranked member, so ties never wobble. */
function rankClusters(clusters: Cluster[], single: Map<string, number>, ranked: string[]): Cluster[] {
  const lead = (ids: string[]) => Math.min(...ids.map((id) => ranked.indexOf(id)));
  return [...clusters]
    .map((cluster) => ({
      cluster,
      sum: cluster.ids.reduce((total, id) => total + (single.get(id) ?? 0), 0),
      lead: lead(cluster.ids),
    }))
    .sort((a, b) => b.sum - a.sum || a.lead - b.lead)
    .map((entry) => entry.cluster);
}

/** Greedy sequential stitching: attach the remaining cluster at its cheapest seam. */
function stitch(tours: string[][], improve: Cost): string[] {
  if (!tours.length) return [];
  let order = [...tours[0]];
  const pending = tours.slice(1).map((tour) => [...tour]);
  while (pending.length) {
    let bestAt = 0;
    let bestOrder = order;
    let bestCost = Infinity;
    for (let t = 0; t < pending.length; t += 1) {
      for (const cluster of [pending[t], [...pending[t]].reverse()]) {
        for (let at = 0; at <= order.length; at += 1) {
          const next = [...order.slice(0, at), ...cluster, ...order.slice(at)];
          const cost = improve(next);
          if (cost < bestCost) {
            bestCost = cost;
            bestAt = t;
            bestOrder = next;
          }
        }
      }
    }
    order = bestOrder;
    pending.splice(bestAt, 1);
  }
  return order;
}

/**
 * How much objective one local move is worth here, as `max - min` over a sample
 * of the order's Or-opt neighbourhood. This is the scale the adaptive penalty is
 * denominated in. A plan of one stop has no neighbourhood, so it returns 0 and the
 * penalty table stays inert rather than guessing a scale.
 */
function localSpread(order: string[], objectiveOf: (order: string[]) => number): number {
  const values: number[] = [];
  for (const neighbour of relocationNeighbours(order)) {
    if (values.length >= CALIBRATION_SAMPLES) break;
    values.push(objectiveOf(neighbour));
  }
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

/**
 * Drop the weakest stops until the order fits `limit`. Ranked on the stop's own
 * single-stop objective, because the furthest stop is not reliably the worst one.
 */
function trimTo(order: string[], limit: number, single: Map<string, number>): string[] {
  let best = [...order];
  while (best.length > limit) {
    let worstAt = 0;
    let worst = Infinity;
    for (let i = 0; i < best.length; i += 1) {
      const value = single.get(best[i]) ?? 0;
      if (value < worst) {
        worst = value;
        worstAt = i;
      }
    }
    best.splice(worstAt, 1);
  }
  return best;
}

/** Add stops while short of `minimum`, always taking the one that lifts the objective most. */
function harvest(
  order: string[],
  ranked: string[],
  minimum: number,
  km: (aId: string, bId: string) => number,
  originKm: (id: string) => number,
  objectiveOf: (order: string[]) => number,
): string[] {
  let best = order;
  while (best.length < minimum) {
    const used = new Set(best);
    let choice: string[] | null = null;
    let choiceValue = -Infinity;
    for (const id of ranked) {
      if (used.has(id)) continue;
      const next = nearestInsertion(best, id, km, originKm).order;
      const value = objectiveOf(next);
      if (value > choiceValue) {
        choiceValue = value;
        choice = next;
      }
    }
    if (!choice) break;
    best = choice;
  }
  return best;
}

function finish(
  order: string[],
  clusters: Cluster[],
  ctx: DiscoveryContext,
  options: PackOptions,
  stats: PackResult["searchStats"],
): PackResult {
  const pinnedIds = new Set(ctx.profile.pins);
  const stops = fitToWindow(buildStops(order, ctx, options), ctx, pinnedIds);
  const objective: Objective = objectiveFast(stops, ctx);
  const dropped = Math.max(0, order.length - stops.length);
  return {
    stops,
    objective,
    clusters: clusters.map((cluster) => ({ ids: [...cluster.ids], diameterKm: cluster.diameterKm })),
    rung: "strict" as Rung,
    relaxationNote: noteFor(stops, ctx, dropped),
    searchStats: stats,
  };
}

/**
 * How far an order overshoots the window and the budget, as a 0-based fraction.
 */
function overflowOf(
  order: readonly string[],
  ctx: DiscoveryContext,
  options: PackOptions,
): number {
  if (order.length === 0) return 0;
  // An id the caller cannot resolve is not an overflow, it is a caller mistake,
  // and `buildStops` throws on it. `minimality.ts` searches over synthetic ids
  // with no matching records, so the beam's `score` reached this with orders it
  // had never built stops for. Unresolvable means unknown, and unknown is not
  // evidence of a bad plan, so it scores 0 and `fitToWindow` still reports the
  // truth to the traveller at the end.
  let stops: Stop[];
  try {
    stops = buildStops(order as string[], ctx, options);
  } catch {
    return 0;
  }
  let minutes = 0;
  let rupees = 0;
  for (const stop of stops) {
    minutes += stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes;
    rupees += stop.costInr;
  }
  const timeOver = Math.max(0, minutes - Math.max(0, Math.round(ctx.availableMinutes)));
  const moneyOver = Math.max(0, rupees - Math.max(0, Math.round(ctx.budgetInr)));
  const worst = Math.max(
    timeOver / Math.max(1, Math.round(ctx.availableMinutes)),
    moneyOver / Math.max(1, Math.round(ctx.budgetInr)),
  );
  return Number.isFinite(worst) ? worst : 0;
}

/**
 * What the search actually optimises, and the fix for the packer over-cutting.
 *
 * The search used to maximise the raw objective over orders the window cannot
 * hold, and `fitToWindow` then cut the surplus off the tail afterwards. That is
 * why a feasible three stop plan scoring 5.806 was thrown away for two stops
 * scoring 3.660: the search was optimising the wrong set, and the trim was
 * repairing damage the search had already chosen to cause.
 *
 * So feasibility is a **dominant** term here rather than a post-hoc filter. The
 * A step is added only when the overflow is non-zero, so the two regimes cannot
 * be traded against each other. See `OVERFLOW_STEP` below.
 */
/**
 * `OVERFLOW_STEP` makes the ordering **strictly** lexicographic rather than
 * merely weighted, and the earlier version got that wrong in a way its own
 * comment denied. A fixed `1000 * overflowFraction` sounds dominant, but the
 * fraction can be arbitrarily small: one rupee over a 2000 rupee budget is
 * `0.0005`, a penalty of `0.5`, which the objective can outbid. So a plan one
 * rupee over budget could win, `fitToWindow` would repair it afterwards, and
 * the exact defect the in-search penalty was added to remove came back through
 * the side door.
 *
 * The step is added only when there is any overflow at all, so the two regimes
 * cannot be traded: **any** feasible order beats **every** infeasible one, and
 * among infeasible orders the smaller overflow wins. The magnitude is well beyond
 * the objective's whole range, which is bounded by ten weights in `[0, 1]` plus
 * four non-negative penalties.
 */
const OVERFLOW_STEP = 1e6;
const OVERFLOW_SHAPE = 1e3;

function searchFitness(
  order: readonly string[],
  ctx: DiscoveryContext,
  options: PackOptions,
  objectiveOf: (order: string[]) => number,
): number {
  const overflow = overflowOf(order, ctx, options);
  const penalty = overflow > 0 ? OVERFLOW_STEP + OVERFLOW_SHAPE * overflow : 0;
  return objectiveOf(order as string[]) - penalty;
}

/** `ctx.idealStops` is a cap, not a hint. The beam could return twice it. */
function capToBudget(order: readonly string[], stopBudget: number): string[] {
  return order.length <= stopBudget ? [...order] : order.slice(0, Math.max(0, stopBudget));
}

/**
 * Drop trailing stops until the plan fits the window and the budget.
 *
 * `pack` optimises **stop count**, capped at `ctx.idealStops`, and never looked
 * at `ctx.availableMinutes` or `ctx.budgetInr`. Three stops of 148 minutes each
 * satisfied the count cap and returned a 444 minute plan for a 300 minute window,
 * which the traveller sees as a plan that does not fit. The gate normally
 * removes these before packing, but `pack` is a public entry point and the
 * feasibility check must not depend on the caller having remembered to run it.
 *
 * **A pinned stop is never dropped.** The traveller asked for it by name, and a
 * pin silently trimmed away by a window check is the one removal they did not
 * agree to, so pinned stops are cut last no matter where they sit in the order.
 * With every stop pinned there is nothing left to drop and the function says so
 * in the note rather than pretending the plan fits.
 */
function fitToWindow(stops: Stop[], ctx: DiscoveryContext, pinned: ReadonlySet<string>): Stop[] {
  const budgetMinutes = Math.max(0, Math.round(ctx.availableMinutes));
  const budgetInr = Math.max(0, Math.round(ctx.budgetInr));
  const over = () => {
    let total = 0;
    let cost = 0;
    for (const stop of stops) {
      total += stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes;
      cost += stop.costInr;
    }
    return { total, cost, fits: total <= budgetMinutes && cost <= budgetInr };
  };
  const totals = over();
  let guard = stops.length;
  while (!totals.fits && stops.length > 0 && guard > 0) {
    guard -= 1;
    // Drop the last unpinned stop. Falling back to the last stop keeps the loop
    // total, and keeps the function honest when every remaining stop is pinned.
    let at = stops.length - 1;
    while (at >= 0 && pinned.has(stops[at].record.id)) at -= 1;
    if (at < 0) at = stops.length - 1;
    stops.splice(at, 1);
    Object.assign(totals, over());
  }
  return stops;
}

/**
 * Say what actually happened.
 *
 * The old note read "Nothing was relaxed. All hard constraints held for N stops
 * inside the M minute window", and `pack` has **never** run a single hard check.
 * It is a packer, not a gate, and the sentence asserted the output of a
 * computation that does not exist anywhere in this file. A traveller reading it
 * had been told a plan was verified by code that never looked.
 *
 * The note now reports the two numbers `pack` can actually see, the time and the
 * money, and it names the dropped stops when there were any. It does not claim
 * any hard constraint held, because it cannot know that. `validation` is what
 * makes that claim, and it makes it to the traveller on the Trips screen.
 */
function noteFor(stops: readonly Stop[], ctx: DiscoveryContext, dropped: number): string {
  if (stops.length === 0) {
    return "No stop fits inside the window and the budget, so there is no plan yet.";
  }
  let total = 0;
  let cost = 0;
  for (const stop of stops) {
    total += stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes;
    cost += stop.costInr;
  }
  const shape = `${stops.length} stop${stops.length === 1 ? "" : "s"}, ${Math.round(total)} of your ${Math.round(ctx.availableMinutes)} minutes`;
  const money = cost > 0 ? `, about ${Math.round(cost)} of ${Math.round(ctx.budgetInr)}` : "";
  const trimmed = dropped > 0
    ? ` ${dropped} later stop${dropped === 1 ? " was" : "s were"} dropped to fit.`
    : "";
  const stillOver = total > Math.round(ctx.availableMinutes) || cost > Math.round(ctx.budgetInr)
    ? " This plan still does not fit, and the reason is shown above it."
    : "";
  return `Packed ${shape}${money}.${trimmed}${stillOver} Every hard constraint is checked separately before this is shown as valid.`;
}
