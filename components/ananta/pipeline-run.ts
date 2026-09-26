/**
 * The orchestration the view layer needs, and nothing else.
 *
 * This file used to be 1356 lines and held a second, complete implementation of
 * the engine inside a React component directory: `tokenize`, `buildIndex`,
 * `retrieve`, `gate`, `wilsonLowerBound`, `objectiveFast`, `pack`,
 * `objectiveNaive`, `validate`, `relax` and `rank`. It cost more than a
 * duplicated file. `objectiveFast` and `objectiveNaive` sat 240 lines apart in
 * the same file, so the drift test that is this project's credibility anchor was
 * measuring a function against its own neighbour, and `lib/engine/guard`'s
 * no-model walk of `lib/engine/**` never saw any of it.
 *
 * Every number below now comes from `lib/engine`. What is left here is the
 * three things an engine must not know about:
 *
 *   1. Presentation. A twelve hour clock, a rupee, "3 h 20 min". The engine
 *      formats its own error sentences and is deliberately not a design system.
 *   2. The adapter between the engine's frozen shapes and the shapes the screens
 *      already pass. Every adapter below is named for the difference it absorbs.
 *   3. A run that calls the six stages in order and reports what each one said.
 *
 * `pipeline.ts` re-exports everything from here, because nine files import from
 * that path and none of them were re-checked when the engine landed.
 */

import {
  getCityManifest,
  rejectionSentence,
  type BanditState,
  type CityManifest,
  type DiscoveryContext,
  type ExperienceV2,
  type Objective,
  type Rejection,
  type RejectionCode,
  type Rung,
  type ScoreComponent,
  type Stop,
  type TravellerProfile,
  type TravelMode,
  type ValidationResult,
  type Weights,
} from "@/lib/engine";
// `GateOptions`, `GateResult`, `PackOptions`, `PackResult`, `RetrieveOptions`,
// `RetrieveResult` and `SearchIndex` are not in `contracts/types.ts`. They are
// declared by the stage that owns them, which is why the import path names the
// stage. See `UI-UX-Fix-Prompts/BLOCKERS/2.md` for the one-line barrel change
// that removes the need to name a stage from a view file.
import { dominantRejection, gate as feasibilityGate, type GateResult } from "@/lib/engine/feasibility";
import { buildStops as engineBuildStops, pack as enginePack, type PackOptions } from "@/lib/engine/packing";
import { explainStop, objectiveFast as engineObjectiveFast } from "@/lib/engine/scoring";
import { buildCityIndex, retrieve, type RetrieveResult, type SearchIndex } from "@/lib/engine/retrieve";
import { objectiveNaive as engineObjectiveNaive, relax as engineRelax, validate as engineValidate } from "@/lib/engine/validation";
import { haversineKm } from "@/lib/location";
import { COMPONENT_LABEL } from "@/components/ananta/tokens";
import { DATASET_SIZE, anantaById, anantaRecords } from "@/components/ananta/records";
import { PRIOR_WEIGHTS, lcg, priorBandit, sampleWeights } from "@/components/ananta/learning";

/* ── shared, injectable numbers ─────────────────────────────────────────── */

/** Slack per stop for walking, parking and queueing. A plan, not a promise. */
export const PLAN_BUFFER_MINUTES = 15;

/**
 * Straight-line to street distance. 1.3 is the usual planning factor and it is
 * the factor `lib/location.ts` already labels as an estimate. Not a route.
 */
export const STREET_FACTOR = 1.3;

/** Walking minutes per kilometre. The same constant `lib/location.ts` uses. */
export const WALK_MIN_PER_KM = 5;

/** Minutes past local midnight, read straight out of the ISO text. */
export function minutesOfDay(iso: string): number {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

/**
 * "2:15 PM".
 *
 * The view's own clock. `lib/engine/validation/window.ts` has a `clockLabel`
 * too and it renders 24 hour, because it is building validator sentences. That
 * is a different function with an unfortunate shared name; see
 * `UI-UX-Fix-Prompts/BLOCKERS/2.md`.
 */
export function clockLabel(minutes: number): string {
  const wrapped = (((Math.round(minutes) % 1440) + 1440) % 1440);
  const hour24 = Math.floor(wrapped / 60);
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(wrapped % 60).padStart(2, "0")} ${suffix}`;
}

export function hoursLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function inrLabel(value: number): string {
  return `\u20b9${Math.round(value).toLocaleString("en-IN")}`;
}

/** Minutes for a leg whose `km` is already the street distance. */
function legMinutesFor(km: number, mode: TravelMode, city: CityManifest): number {
  return Math.max(1, Math.round(km * WALK_MIN_PER_KM * city.congestion[mode]));
}

/* ── stage 0: context ───────────────────────────────────────────────────── */

export type EngineInput = {
  query: string;
  cityId: string;
  city: "All" | "Mumbai" | "Navi Mumbai";
  category: string;
  zone: string;
  availableMinutes: number;
  budgetInr: number;
  /** "HH:MM" the traveller says they start. Every clock in the UI derives here. */
  startTime: string;
  deadline: string | null;
  rainMode: boolean;
  freeOnly: boolean;
  communityOnly: boolean;
  bestTimeOfDay: ExperienceV2["bestTimeOfDay"] | "any";
  partySize: number;
  hasToddler: boolean;
  hasElderly: boolean;
  pace: DiscoveryContext["pace"];
  idealStops: number;
  minStops: number;
  travelMode: TravelMode;
  /** Record ids already in the draft plan. Read by the packer as pins. */
  planIds: string[];
  originLabel: string;
  originArea: string;
  originCoordinates: [number, number];
};

export function todayStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * `ctx.now` is a local ISO string carrying the manifest offset, so the objective
 * can read minutes-past-midnight out of the text. No `new Date()` inside any
 * scoring function and no timezone database at runtime.
 */
export function contextFromInput(input: EngineInput, city: CityManifest): DiscoveryContext {
  const day = todayStamp();
  const clock = /^\d{2}:\d{2}$/.test(input.startTime) ? input.startTime : "10:00";
  const now = `${day}T${clock}:00+05:30`;
  const profile: TravellerProfile = {
    id: "demo-traveller",
    interests: {},
    avoid: {},
    accessibility: [],
    diets: [],
    excludes: [],
    pins: input.planIds,
    weights: { ...PRIOR_WEIGHTS },
    bandit: priorBandit(now),
  };
  const base = {
    now,
    origin: {
      coordinates: input.originCoordinates,
      label: input.originLabel,
      area: input.originArea,
    },
    availableMinutes: Math.max(15, input.availableMinutes),
    deadline: input.deadline ? `${day}T${input.deadline}:00+05:30` : null,
    budgetInr: Math.max(0, input.budgetInr),
    partySize: Math.max(1, input.partySize),
    hasToddler: input.hasToddler,
    hasElderly: input.hasElderly,
    raining: input.rainMode,
    weatherSeverity: input.rainMode ? ("rain" as const) : null,
    travelMode: input.travelMode,
    pace: input.pace,
    idealStops: Math.max(1, input.idealStops),
    minStops: Math.max(0, input.minStops),
    accessNeeds: [],
    diets: [],
    query: input.query,
    profile,
    city,
  };
  const draft = {
    ...base,
    original: undefined as unknown as DiscoveryContext,
  } as DiscoveryContext;
  // The original is frozen once, and every replan diffs against this object.
  // Assign before freezing, or the assignment itself throws on a frozen object.
  draft.original = draft;
  deepFreeze(draft);
  return draft;
}

/**
 * `ctx.original` is the context itself, so the walk needs a seen-set. Without
 * one this recurses forever, and with a plain `Object.freeze(draft)` after the
 * assignment it throws on the assignment instead. Both are silent in a
 * production build and loud here, which is the only reason this function exists.
 */
function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (!value || typeof value !== "object") return value;
  const node = value as unknown as object;
  if (seen.has(node)) return value;
  seen.add(node);
  Object.freeze(node);
  for (const item of Object.values(node as Record<string, unknown>)) deepFreeze(item, seen);
  return value;
}

/**
 * The engine reads its ten utility weights off `ctx.profile.weights`
 * (`lib/engine/scoring/objective-fast.ts:125`) and takes no weights argument.
 * Every screen, on the other hand, holds a learner state and passes `weights`
 * explicitly, so the three adapters below fold that argument into a copy of the
 * context.
 *
 * The context is deep frozen by `contextFromInput`, so the only way to carry a
 * different weight set is a new object. `original` is deliberately left pointing
 * at the frozen original, so a replan still diffs against what the traveller
 * actually asked for.
 */
function withWeights(ctx: DiscoveryContext, weights?: Weights): DiscoveryContext {
  if (!weights) return ctx;
  const next = { ...ctx, profile: { ...ctx.profile, weights } } as DiscoveryContext;
  next.original = ctx.original;
  return next;
}

/** The traveller's edited weights, optionally Thompson-sampled. */
export function weightsFor(ctx: DiscoveryContext, bandit?: BanditState, seed = 20260926): Weights {
  return bandit ? sampleWeights(bandit, lcg(seed), ctx.profile.weights) : ctx.profile.weights;
}

/* ── stage 1: retrieve ──────────────────────────────────────────────────── */

const CITY_INDEX: Record<string, SearchIndex> = {};

/** The built index for one city, built once per city and then shared. */
export function catalogueIndex(cityId: string): SearchIndex {
  const found = CITY_INDEX[cityId];
  if (found) return found;
  const built = buildCityIndex(anantaRecords, getCityManifest(cityId));
  CITY_INDEX[cityId] = built;
  return built;
}

/** The default city's index, for callers that do not switch cities. */
export const CATALOGUE_INDEX: SearchIndex = catalogueIndex("mumbai");

/* ── adapters: the differences between the engine and what the screens pass ─ */

/**
 * `objectiveFast(stops, ctx, weights)` to `objectiveFast(stops, ctx)`.
 * The third argument is the traveller's weight set, which the engine reads from
 * the profile. See `withWeights`.
 */
export function objectiveFast(stops: readonly Stop[], ctx: DiscoveryContext, weights?: Weights): Objective {
  return engineObjectiveFast(stops, withWeights(ctx, weights));
}

/**
 * `objectiveNaive(stops, ctx, weights)` to `objectiveNaive(stops, ctx)`. The
 * independent re-derivation has to be handed the same weights the fast path
 * was, or the drift number measures a weight mismatch instead of a
 * disagreement about the arithmetic.
 */
export function objectiveNaive(stops: readonly Stop[], ctx: DiscoveryContext, weights?: Weights): Objective {
  return engineObjectiveNaive(stops, withWeights(ctx, weights));
}

/**
 * `stopComponents(stop, ctx, weights)` to `explainStop(stop, ctx, objective)`.
 * The engine derives the score it is explaining rather than accepting one, so
 * the single stop objective is computed here and handed over.
 */
export function stopComponents(stop: Stop, ctx: DiscoveryContext, weights?: Weights): ScoreComponent[] {
  const live = withWeights(ctx, weights);
  return explainStop(stop, live, engineObjectiveFast([stop], live));
}

/**
 * `validate(stops, ctx, fast, weights)` to `validate(stops, ctx, fast)`. The
 * engine re-derives the objective itself, so the weights have to be on the
 * context it is given.
 */
export function validate(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
  fast: Objective,
  weights?: Weights,
): ValidationResult {
  return engineValidate(stops, withWeights(ctx, weights), fast);
}

/**
 * `relax(stops, ctx, cause, options, weights)` to
 * `relax(stops, ctx, cause, { pool })`. The engine's fourth argument is a record
 * pool to refill from, not a travel model, and the caller's travel model is not
 * something the ladder can use, so it is dropped rather than translated into
 * something the engine would misread.
 */
export function relax(
  stops: readonly Stop[],
  ctx: DiscoveryContext,
  cause: ValidationResult,
  _travel?: unknown,
  weights?: Weights,
): { stops: Stop[]; rung: Rung; note: string } | null {
  return engineRelax(stops, withWeights(ctx, weights), cause);
}

/* ── stop helpers ───────────────────────────────────────────────────────── */

/** The travel model, injected so the packer never fetches or guesses inside. */
export function makeTravelOptions(ctx: DiscoveryContext, pool: ExperienceV2[]): PackOptions {
  const position = new Map(pool.map((record) => [record.id, record.coordinates]));
  const leg = (aId: string, bId: string) => {
    const a = position.get(aId) ?? ctx.origin.coordinates;
    const b = position.get(bId) ?? ctx.origin.coordinates;
    const km = haversineKm(a, b) * STREET_FACTOR;
    return { km, minutes: legMinutesFor(km, ctx.travelMode, ctx.city) };
  };
  return {
    matrix: (aId: string, bId: string) => leg(aId, bId),
    originMinutes: (id: string) => leg("origin", id),
    beamWidth: 6,
    iters: 60,
    seed: 20260926,
    // The engine's frozen `buildStops(order, ctx, options)` has nowhere else to
    // resolve an id, so it asks for the record table rather than reaching for a
    // module-level registry.
    records: pool,
  };
}

export type StopTotals = {
  activity: number;
  travel: number;
  buffer: number;
  cost: number;
  total: number;
};

export function stopTotals(stops: readonly Stop[]): StopTotals {
  const activity = stops.reduce((sum, stop) => sum + stop.visitMinutes, 0);
  const travel = stops.reduce((sum, stop) => sum + stop.travelMinutes, 0);
  const buffer = stops.reduce((sum, stop) => sum + stop.bufferMinutes, 0);
  const cost = stops.reduce((sum, stop) => sum + stop.costInr, 0);
  return { activity, travel, buffer, cost, total: activity + travel + buffer };
}

/** Nearest-neighbour seed, then 2-opt on the superlinear travel cost. */
export function routeOrder(ids: string[], ctx: DiscoveryContext, options: PackOptions, iters: number): string[] {
  if (ids.length < 3) return [...ids];
  const remaining = [...ids];
  const order: string[] = [];
  let cursor = ctx.origin.coordinates;
  while (remaining.length) {
    let bestAt = 0;
    let bestCost = Number.POSITIVE_INFINITY;
    remaining.forEach((id, at) => {
      const record = anantaById[id];
      if (!record) return;
      const cost = haversineKm(cursor, record.coordinates) ** 2;
      if (cost < bestCost - 1e-12 || (Math.abs(cost - bestCost) <= 1e-12 && id < remaining[bestAt])) {
        bestCost = cost;
        bestAt = at;
      }
    });
    const [next] = remaining.splice(bestAt, 1);
    order.push(next);
    cursor = anantaById[next].coordinates;
  }
  const cost = (candidate: string[]): number =>
    candidate.reduce((sum, id, index) => {
      const from = index === 0 ? ctx.origin.coordinates : anantaById[candidate[index - 1]].coordinates;
      const km = haversineKm(from, anantaById[id].coordinates) * STREET_FACTOR;
      return sum + legMinutesFor(km, ctx.travelMode, ctx.city) * (1 + km / 8) ** 2;
    }, 0);
  let best = [...order];
  let bestCost = cost(best);
  for (let pass = 0; pass < iters; pass += 1) {
    let improved = false;
    for (let i = 0; i < best.length - 1; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const value = cost(candidate);
        if (value < bestCost - 1e-9) {
          best = candidate;
          bestCost = value;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

/** A one-stop view of a record, used to rank it before any plan exists. */
export function probe(record: ExperienceV2, ctx: DiscoveryContext, options: PackOptions): Stop {
  const leg = options.originMinutes(record.id);
  return {
    record,
    arriveBy: leg.minutes,
    travelMinutes: leg.minutes,
    travelKm: leg.km,
    visitMinutes: record.durationMinutes,
    bufferMinutes: PLAN_BUFFER_MINUTES,
    costInr: record.priceInr * ctx.partySize,
  };
}

/* ── why nothing fitted ─────────────────────────────────────────────────── */

export type RelaxationOption = {
  code: RejectionCode;
  label: string;
  unlockedCount: number;
  unlockedNames: string[];
  medianShortfall: number | null;
  unit: Rejection["unit"];
};

/**
 * A noun phrase for each code, so "the cheapest thing to relax" reads as
 * something a traveller can go and do. The finished sentence from the codes
 * table is a claim about the record, not an instruction, so it is not reused
 * here.
 */
const RELAX_HINT: Partial<Record<RejectionCode, string>> = {
  too_far: "your travel window",
  travel_time_exceeds_budget: "your travel window",
  duration_exceeds_budget: "how long you can stay",
  closed_now: "the start time",
  closed_during_window: "the visit window",
  over_budget: "your budget cap",
  over_budget_per_person: "your per-person budget",
  capacity_exceeded: "the party size",
  not_step_free: "the step-free requirement",
  not_stroller_ok: "the stroller requirement",
  no_accessible_restroom: "the accessible restroom requirement",
  requires_steps: "the step-free requirement",
  no_seating: "the seating requirement",
  not_quiet_enough: "the quiet-space requirement",
  diet_mismatch: "the dietary requirement",
  sold_out: "the sold-out slot",
  requires_booking_not_available: "the booking requirement",
  lead_time_too_short: "how much notice you give",
  weather_unsafe: "the weather requirement",
  already_planned: "what is already in your plan",
  excluded_by_traveller: "your own exclusions",
  seasonal_mismatch: "the season requirement",
  no_route: "the travel mode",
  duplicate: "the duplicate radius",
  hours_unverified: "nothing, it is advisory only",
  unverified_required_fact: "nothing, it is advisory only",
};

/**
 * The single cheapest constraint to relax, with the number of records it would
 * unlock. A code is a candidate only when it is the sole blocker for a record,
 * which is exactly the set that relaxing that one code would recover.
 */
export function cheapestRelaxation(
  stream: { id: string; rejections: Rejection[] }[],
  records: ExperienceV2[],
): RelaxationOption | null {
  const byId = new Map(records.map((record) => [record.id, record]));
  const buckets = new Map<RejectionCode, { ids: string[]; shortfalls: number[]; unit: Rejection["unit"]; sample: Rejection }>();
  for (const row of stream) {
    const blocking = row.rejections.filter((item) => item.blocking);
    if (blocking.length !== 1) continue;
    const only = blocking[0];
    const bucket = buckets.get(only.code) ?? { ids: [], shortfalls: [], unit: only.unit, sample: only };
    bucket.ids.push(row.id);
    if (only.shortfall !== null) bucket.shortfalls.push(only.shortfall);
    buckets.set(only.code, bucket);
  }
  let best: RelaxationOption | null = null;
  for (const [code, bucket] of Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...bucket.shortfalls].sort((a, b) => a - b);
    const row: RelaxationOption = {
      code,
      label: RELAX_HINT[code] ?? bucket.sample.sentence.replace(/\.$/, "").toLowerCase(),
      unlockedCount: bucket.ids.length,
      unlockedNames: bucket.ids.slice(0, 5).map((id) => byId.get(id)?.name ?? id),
      medianShortfall: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
      unit: bucket.unit,
    };
    if (!best || row.unlockedCount > best.unlockedCount) best = row;
  }
  return best;
}

/* ── the composed run both pages consume ────────────────────────────────── */

export type RankedRow = {
  record: ExperienceV2;
  objective: Objective;
  components: ScoreComponent[];
  travelMinutes: number;
  travelKm: number;
  /** Non-blocking rejections, which is the honest "we do not know" list. */
  advisory: Rejection[];
};

export type PipelineRun = {
  ctx: DiscoveryContext;
  weights: Weights;
  retrieved: RetrieveResult;
  gated: GateResult;
  ranked: RankedRow[];
  /** Records the retrieve stage handed to the gate. */
  retrievalCount: number;
  consideredCount: number;
  cheapest: RelaxationOption | null;
  dominant: Rejection | null;
  byCode: { code: RejectionCode; count: number; blocking: number }[];
};

/**
 * Rank a gated set by the same objective the packer maximises.
 *
 * This used to be a standalone `rank` at line 1376 of `pipeline.ts`. It is not
 * an engine function and it is not a reimplementation of one: it is the
 * orchestration of `probe`, `objectiveFast` and `stopComponents` into the row
 * shape the results list renders. It lost its own name so that it cannot be
 * mistaken for engine surface.
 */
function rankRows(
  records: ExperienceV2[],
  ctx: DiscoveryContext,
  weights: Weights,
  options: PackOptions,
  advisoryById: Map<string, Rejection[]>,
): RankedRow[] {
  return records
    .map((record) => {
      const stop = probe(record, ctx, options);
      return {
        record,
        objective: objectiveFast([stop], ctx, weights),
        components: stopComponents(stop, ctx, weights),
        travelMinutes: stop.travelMinutes,
        travelKm: stop.travelKm,
        advisory: advisoryById.get(record.id) ?? [],
      };
    })
    .sort((a, b) => b.objective.value - a.objective.value || a.record.id.localeCompare(b.record.id));
}

/** The blocking code that stopped the most records, with the count in the sentence. */
function dominantAcross(stream: { id: string; rejections: Rejection[] }[]): Rejection | null {
  const blocking = stream.flatMap((row) => row.rejections.filter((item) => item.blocking));
  if (!blocking.length) return null;
  const winner = dominantRejection(blocking);
  if (!winner) return null;
  const count = blocking.filter((item) => item.code === winner.code).length;
  return {
    ...winner,
    sentence: `${winner.sentence} This is what stopped ${count} of the records you did not see.`,
  };
}

/**
 * Retrieve, gate, rank. Three calls into the engine and the counts it reports.
 *
 * Two differences between `EngineInput` and the engine's `RetrieveOptions` are
 * absorbed here:
 *
 *   - `RetrieveOptions` has no `travelMode`, so the engine's isochrone always
 *     walks (`DEFAULT_TRAVEL_MODE` in `lib/engine/retrieve/retrieve.ts`). The
 *     caller's budget is converted into the walk budget that buys the same real
 *     time, using the manifest's own congestion multipliers. A 45 minute taxi
 *     budget becomes a much larger walk radius, not a much smaller one.
 *   - `RetrieveOptions` has no community filter, so `communityOnly` is applied
 *     here and `totalConsidered` is restated from the survivors, because the
 *     number on screen has to be the number actually considered.
 */
export function runPipeline(input: EngineInput, weights: Weights): PipelineRun {
  const city = getCityManifest(input.cityId);
  const ctx = contextFromInput(input, city);
  const options = makeTravelOptions(ctx, anantaRecords);
  const start = minutesOfDay(ctx.now);

  const modeBudget = Math.round(
    (input.availableMinutes * city.congestion[input.travelMode]) / city.congestion.walk,
  );
  const tags: string[] = [];
  if (input.freeOnly) tags.push("priceBand:free");
  if (input.bestTimeOfDay !== "any") tags.push(`bestTimeOfDay:${input.bestTimeOfDay}`);

  const found = retrieve(catalogueIndex(input.cityId), {
    query: input.query,
    origin: input.originCoordinates,
    maxTravelMinutes: modeBudget,
    limit: 120,
    area: input.zone === "All" ? undefined : input.zone,
    categories: input.category === "All" ? undefined : [input.category],
    tags: tags.length ? tags : undefined,
  });

  const survivors = input.communityOnly
    ? found.ids.filter((id) => anantaById[id]?.confidence.name === "community")
    : found.ids;
  const retrieved: RetrieveResult =
    input.communityOnly && survivors.length !== found.ids.length
      ? { ...found, ids: survivors, totalConsidered: survivors.length }
      : found;

  const pool = retrieved.ids.map((id) => anantaById[id]).filter(Boolean);
  const gated = feasibilityGate(pool, ctx, {
    windowFor: (record) => {
      const leg = options.originMinutes(record.id);
      return { startMin: start + leg.minutes, endMin: start + leg.minutes + record.durationMinutes };
    },
  });

  const advisoryById = new Map(
    gated.stream.map((row) => [row.id, row.rejections.filter((item) => !item.blocking)]),
  );

  const counts = new Map<RejectionCode, { code: RejectionCode; count: number; blocking: number }>();
  for (const row of gated.stream) {
    for (const item of row.rejections) {
      const bucket = counts.get(item.code) ?? { code: item.code, count: 0, blocking: 0 };
      bucket.count += 1;
      if (item.blocking) bucket.blocking += 1;
      counts.set(item.code, bucket);
    }
  }

  return {
    ctx,
    weights,
    retrieved,
    gated,
    ranked: rankRows(gated.passed, ctx, weights, options, advisoryById),
    retrievalCount: pool.length,
    consideredCount: DATASET_SIZE,
    cheapest: cheapestRelaxation(gated.stream, pool),
    dominant: dominantAcross(gated.stream),
    byCode: Array.from(counts.values()).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
  };
}

/**
 * A fixed `EngineInput` for tests. `now` is derived from `startTime`, so the
 * only thing that moves between runs is what the test chooses to move.
 */
export function defaultTestInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    query: "",
    cityId: "mumbai",
    city: "All",
    category: "All",
    zone: "All",
    availableMinutes: 240,
    budgetInr: 1500,
    startTime: "10:00",
    deadline: null,
    rainMode: false,
    freeOnly: false,
    communityOnly: false,
    bestTimeOfDay: "any",
    partySize: 1,
    hasToddler: false,
    hasElderly: false,
    pace: "normal",
    idealStops: 3,
    minStops: 1,
    travelMode: "walk",
    planIds: [],
    originCoordinates: [72.82339, 18.93367],
    originLabel: "Marine Drive promenade",
    originArea: "Churchgate",
    ...overrides,
  };
}

/**
 * The engine's stage functions, re-exported under their own names so the
 * public surface can offer them without a second import path. These are
 * re-exports, not wrappers: the wrappers above are the only adapted names.
 */
export { COMPONENT_LABEL, engineBuildStops as buildStops, feasibilityGate as gate, enginePack as pack, rejectionSentence };
export type { PackOptions };
