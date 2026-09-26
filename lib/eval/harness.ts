import type {
  DiscoveryContext,
  EvalResult,
  EvalScenario,
  ExperienceV2,
  Plan,
  Rejection,
  RejectionCode,
  Rung,
  Stop,
  Swap,
  ValidationResult,
} from "@/lib/engine/contracts";
import { getCityManifest } from "@/lib/engine/contracts";
import { buildCityIndex, retrieve } from "@/lib/engine/retrieve";
import { defaultWindowFor, gate } from "@/lib/engine/feasibility";
import { pack } from "@/lib/engine/packing";
import type { PackOptions } from "@/lib/engine/packing";
import { DRIFT_TOLERANCE, hardChecks, relax, validate } from "@/lib/engine/validation";
import { applyTrigger, buildContext } from "@/lib/engine/replan";
import type { ContextInput } from "@/lib/engine/replan";
import { anantaRecords } from "@/lib/data/ananta/records";

/**
 * The end-to-end eval harness: retrieve, gate, pack, validate, relax, trigger,
 * measure.
 *
 * One rule shapes this whole file: **no network, ever**. Every travel time comes
 * from the injected matrix below, which is a haversine plus a stated average
 * speed plus the manifest's congestion multiplier. That is the honest
 * straight-line fallback the product already ships as a labelled estimate, and
 * using it here is what makes "the eval suite passes with the network cable
 * pulled" true rather than aspirational. The live OSRM call in `lib/routing.ts`
 * is never reached from `lib/eval/`, and a test walks the import graph to prove
 * it.
 *
 * Determinism: no clock, no randomness outside the packer's seeded LCG, no
 * dependence on `Map` or `Set` iteration order. Two runs produce identical bytes.
 */

/** Candidates handed to the packer. Above this the beam search is the bottleneck. */
const MAX_CANDIDATES = 60;

/** How many candidates a scenario may retrieve before the gate sees them. */
const RETRIEVE_LIMIT = 140;

/** Fixed so two runs of the same scenario pack identically. */
const PACK_SEED = 20260926;

/**
 * Straight-line speeds in km/h, per mode, as published urban averages. These are
 * estimates and the report says so: the real Mumbai figure swings by a factor of
 * three across the day, and the manifest's single congestion multiplier cannot
 * model a peak band. A plan built on these numbers is honest arithmetic over a
 * stated assumption, which is the bar this repository holds.
 */
const STRAIGHT_LINE_KMH: Record<DiscoveryContext["travelMode"], number> = {
  walk: 4.5,
  auto: 18,
  taxi: 20,
  metro: 22,
  ferry: 12,
};

/**
 * IUGG mean earth radius in km. The same constant `validation/distance-naive.ts`
 * uses, and deliberately so: this harness is a third party to the fast/naive
 * agreement, not a third derivation. A different radius here would show up as
 * objective drift and read as a disagreement between sessions 4 and 6 when it is
 * really a disagreement about the radius of the planet. The independence
 * requirement lives between those two stages, and `validation/independence.test.ts`
 * is what enforces it.
 */
const EARTH_RADIUS_KM = 6371.0088;
const DEG_TO_RAD = Math.PI / 180;

const haversineKm = (from: readonly [number, number], to: readonly [number, number]): number => {
  const latFrom = from[1] * DEG_TO_RAD;
  const latTo = to[1] * DEG_TO_RAD;
  const dLat = (to[1] - from[1]) * DEG_TO_RAD;
  const dLng = (to[0] - from[0]) * DEG_TO_RAD;
  const halfChord =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(latFrom) * Math.cos(latTo) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(halfChord)));
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * A scheduled ferry crossing, when the manifest names both ends and the
 * straight line says the two are genuinely on opposite sides of water. Without
 * this a Navi Mumbai itinerary walks across the creek, which is the one thing
 * the second city exists to stress.
 */
const corridorMinutes = (ctx: DiscoveryContext, fromArea: string, toArea: string): number | null => {
  for (const corridor of ctx.city.ferryCorridors) {
    if (corridor.from === fromArea && corridor.to === toArea) return corridor.minutes;
    if (corridor.from === toArea && corridor.to === fromArea) return corridor.minutes;
  }
  return null;
};

/**
 * The injected travel matrix. Pure, symmetric, derived only from the input.
 *
 * Kilometres are the raw haversine, unrounded. They are the number
 * `objectiveNaive` recomputes independently, and rounding them here would put a
 * deliberate 5 metre lie into every leg and show up as objective drift.
 * Rounding is a display concern and belongs in the UI.
 *
 * Minutes are a stated estimate: distance over a published average speed, times
 * the manifest's congestion multiplier, and swapped for the scheduled crossing
 * time when the manifest names a ferry corridor between the two areas. The
 * crossing changes the time, not the map distance.
 */
export const estimateMatrix = (
  records: readonly ExperienceV2[],
  ctx: DiscoveryContext,
): PackOptions["matrix"] => {
  const byId = new Map(records.map((record) => [record.id, record]));
  const speed = STRAIGHT_LINE_KMH[ctx.travelMode];
  const congestion = ctx.city.congestion[ctx.travelMode];
  return (aId, bId) => {
    const a = byId.get(aId);
    const b = byId.get(bId);
    if (!a || !b) return { minutes: 0, km: 0 };
    const km = haversineKm(a.coordinates, b.coordinates);
    const corridor = corridorMinutes(ctx, a.area, b.area);
    if (corridor !== null && km > 1.5) return { minutes: corridor, km };
    return { minutes: Math.round((km / speed) * 60 * congestion), km };
  };
};

/** Origin-to-record travel, on the same honest basis. */
export const estimateOriginMinutes = (
  records: readonly ExperienceV2[],
  ctx: DiscoveryContext,
): PackOptions["originMinutes"] => {
  const byId = new Map(records.map((record) => [record.id, record]));
  const speed = STRAIGHT_LINE_KMH[ctx.travelMode];
  const congestion = ctx.city.congestion[ctx.travelMode];
  return (id) => {
    const record = byId.get(id);
    if (!record) return { minutes: 0, km: 0 };
    const km = haversineKm(ctx.origin.coordinates, record.coordinates);
    return { minutes: Math.round((km / speed) * 60 * congestion), km };
  };
};

/** Minutes a plan consumes, summed in index order so float order is fixed. */
export const planMinutes = (stops: readonly Stop[]): number =>
  stops.reduce((total, stop) => total + stop.travelMinutes + stop.visitMinutes + stop.bufferMinutes, 0);

/** The minutes the traveller actually has, from the same source the gate uses. */
export const availableMinutes = (ctx: DiscoveryContext): number => {
  if (!ctx.deadline) return Math.max(0, ctx.availableMinutes);
  const until = (Date.parse(ctx.deadline) - Date.parse(ctx.now)) / 60_000;
  return Number.isFinite(until) ? Math.max(0, Math.min(ctx.availableMinutes, until)) : ctx.availableMinutes;
};

const median = (values: readonly number[]): number => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

export interface PipelineOutcome {
  ctx: DiscoveryContext;
  plan: Plan;
  stops: Stop[];
  validation: ValidationResult;
  rungs: Rung[];
  swaps: Swap[];
  notes: string[];
  rejections: { code: RejectionCode; count: number }[];
  stream: { id: string; rejections: Rejection[] }[];
  candidates: number;
  considered: number;
  catalogueSize: number;
}

/** Retrieve and gate. Split out so the trigger's re-solve is the same work. */
export function shortlist(ctx: DiscoveryContext, catalogue: readonly ExperienceV2[]): {
  records: ExperienceV2[];
  stream: { id: string; rejections: Rejection[] }[];
  considered: number;
} {
  const index = buildCityIndex(catalogue as ExperienceV2[], ctx.city);
  const found = retrieve(index, {
    query: ctx.query,
    origin: ctx.origin.coordinates,
    maxTravelMinutes: Math.max(30, availableMinutes(ctx)),
    limit: RETRIEVE_LIMIT,
  });
  const byId = new Map(catalogue.map((record) => [record.id, record]));
  const retrieved = found.ids
    .map((id) => byId.get(id))
    .filter((record): record is ExperienceV2 => Boolean(record));
  const gated = gate(retrieved, ctx, { windowFor: defaultWindowFor(ctx) });
  return { records: gated.passed, stream: gated.stream, considered: retrieved.length };
}

const packOptionsFor = (
  catalogue: readonly ExperienceV2[],
  ctx: DiscoveryContext,
): PackOptions => ({
  matrix: estimateMatrix(catalogue, ctx),
  originMinutes: estimateOriginMinutes(catalogue, ctx),
  records: catalogue as ExperienceV2[],
  seed: PACK_SEED,
});

/** Pack, validate, and walk the relaxation ladder until it holds or runs out. */
export function packAndValidate(
  candidates: readonly ExperienceV2[],
  catalogue: readonly ExperienceV2[],
  ctx: DiscoveryContext,
): { plan: Plan; rungs: Rung[]; notes: string[] } {
  const options = packOptionsFor(catalogue, ctx);
  const packed = pack(candidates.slice(0, MAX_CANDIDATES), ctx, options);
  const rungs: Rung[] = [packed.rung];
  const notes: string[] = [];
  if (packed.relaxationNote) notes.push(packed.relaxationNote);

  let stops = packed.stops;
  // The ladder is walked at most three times. Past that the constraint is not
  // being relaxed, it is being ignored, and saying so is more honest than a
  // fourth attempt.
  for (let rung = 0; rung < 3; rung += 1) {
    const validation = validate(stops, ctx, packed.objective);
    if (validation.ok) break;
    if (validation.drift > DRIFT_TOLERANCE) {
      notes.push(`objective drift ${validation.drift.toExponential(2)} exceeds tolerance`);
    }
    const relaxed = relax(stops, ctx, validation, { pool: candidates });
    if (!relaxed) break;
    stops = relaxed.stops;
    rungs.push(relaxed.rung);
    notes.push(relaxed.note);
  }

  return { plan: { id: "eval-plan", stops, objective: packed.objective, createdFrom: ctx }, rungs, notes };
}

/** One scenario, start to finish. `ctx.original` is frozen by the stage that owns freezing. */
export function runScenario(scenario: EvalScenario): PipelineOutcome {
  const city = getCityManifest(scenario.context.cityId ?? "mumbai");
  const input = { ...scenario.context } as Record<string, unknown>;
  delete input.cityId;
  // `ContextInput` still carries `city` because the frozen signature for
  // `buildContext` replaces it. Spreading the manifest in first is the honest
  // way to satisfy the type without a cast that could hide a missing field.
  const ctx = buildContext({ ...input, city } as ContextInput, city);

  const catalogue = anantaRecords.filter((record) => record.city === city.displayName);
  const short = shortlist(ctx, catalogue);
  const notes: string[] = [];
  if (!short.records.length) notes.push("no candidate passed the hard gate");

  const { plan: packedPlan, rungs, notes: ladderNotes } = packAndValidate(short.records, catalogue, ctx);
  notes.push(...ladderNotes);

  let plan = packedPlan;
  let stops = plan.stops;
  const swaps: Swap[] = [];

  if (scenario.thenTrigger) {
    const mutated: DiscoveryContext = { ...ctx, ...scenario.thenTrigger.mutate, original: ctx.original };
    const result = applyTrigger(
      plan,
      scenario.thenTrigger.trigger,
      mutated,
      (draft) => draft,
      (next) => {
        const nextShort = shortlist(next, catalogue);
        return packAndValidate(nextShort.records, catalogue, next).plan;
      },
    );
    plan = result.plan;
    stops = result.plan.stops;
    swaps.push(...result.swaps);
    for (const rung of result.rungs) if (!rungs.includes(rung)) rungs.push(rung);
    notes.push(...result.swaps.map((swap) => swap.reason));
  }

  const validation = validate(stops, ctx, plan.objective);
  const tally = new Map<RejectionCode, number>();
  for (const entry of short.stream) {
    for (const rejection of entry.rejections) {
      if (!rejection.blocking) continue;
      tally.set(rejection.code, (tally.get(rejection.code) ?? 0) + 1);
    }
  }

  return {
    ctx,
    plan,
    stops,
    validation,
    rungs,
    swaps,
    notes,
    rejections: [...tally.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    stream: short.stream,
    candidates: Math.min(short.records.length, MAX_CANDIDATES),
    considered: short.considered,
    catalogueSize: catalogue.length,
  };
}

/**
 * One scenario, scored. Every field is in `MASTERPLAN.md` section 9.
 *
 * `hardConstraints` counts only the constraints this context actually imposes.
 * A 30 minute window with no budget imposes fewer than a 300 minute one, and
 * counting an un-imposed constraint as satisfied would inflate the score.
 */
export function scoreScenario(scenario: EvalScenario, outcome: PipelineOutcome): EvalResult {
  const { ctx, stops, validation } = outcome;
  const checks = hardChecks(stops, ctx);
  const imposed = checks.filter((check) => check.imposed);
  const satisfied = imposed.filter((check) => check.satisfied);
  const window = availableMinutes(ctx);
  const used = planMinutes(stops);
  const travelKm = stops.map((stop) => stop.travelKm);
  const failures = imposed
    .filter((check) => !check.satisfied)
    .flatMap((check) => check.issues.map((issue) => issue.sentence));

  return {
    scenarioId: scenario.id,
    producedPlan: stops.length > 0,
    rung: outcome.rungs[outcome.rungs.length - 1] ?? null,
    hardConstraints: imposed.length,
    satisfiedConstraints: satisfied.length,
    satisfactionRate: imposed.length === 0 ? 1 : satisfied.length / imposed.length,
    objectiveDrift: validation.drift,
    timeUtilisation: window > 0 ? Math.min(1, used / window) : 0,
    medianTravelKmPerStop: round2(median(travelKm)),
    swaps: outcome.swaps.length,
    rejections: outcome.rejections,
    notes: [...failures, ...outcome.notes],
  };
}

export { DRIFT_TOLERANCE };
