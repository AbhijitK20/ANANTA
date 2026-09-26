import type {
  BanditState,
  CityManifest,
  ComponentId,
  DiscoveryContext,
  ExperienceV2,
  Objective,
  ObjectiveBreakdown,
  PackResult,
  Rejection,
  RejectionCode,
  Rung,
  ScoreComponent,
  Stop,
  TravellerProfile,
  TravelMode,
  ValidationIssue,
  ValidationResult,
  Weights,
} from "@/lib/engine";
import { COMPONENT_IDS, getCityManifest, rejectionSentence } from "@/lib/engine";
import { haversineKm } from "@/lib/location";
import { DATASET_SIZE, anantaById, anantaRecords } from "@/components/ananta/records";
import { PRIOR_WEIGHTS, lcg, priorBandit, sampleWeights } from "@/components/ananta/learning";

/**
 * `GateResult` and `GateOptions` are declared in `SESSION/00-CONTRACTS.md`
 * section 4 under the feasibility stage, not in `contracts/types.ts`, so they are
 * not reachable through `@/lib/engine` until session 1 wires the barrel. They
 * are mirrored here verbatim rather than invented. Logged as a blocker.
 */
export type GateOptions = {
  windowFor: (record: ExperienceV2) => { startMin: number; endMin: number };
};

export interface GateResult {
  passed: ExperienceV2[];
  rejected: { record: ExperienceV2; rejections: Rejection[] }[];
  /** Every rejection, flattened. Feeds the unmet-demand feed verbatim. */
  stream: { id: string; rejections: Rejection[] }[];
}


/**
 * The six-stage pipeline, in the only order the masterplan allows: retrieve,
 * then gate, then score, then pack, then validate, then relax.
 *
 * Sessions 2 to 6 own `retrieve/`, `feasibility/`, `scoring/`, `packing/`, and
 * `validation/`. None of them have landed, so this file implements the frozen
 * signatures from `SESSION/00-CONTRACTS.md` section 4 against the frozen
 * contracts. When they land the swap is mechanical and is written out line by
 * line in `SESSION/BLOCKERS/9.md`:
 *
 *   buildIndex, retrieve  ->  retrieve/index-builder.ts, retrieve/retrieve.ts
 *   gate                  ->  feasibility/feasibility.ts
 *   wilsonLowerBound      ->  scoring/wilson.ts
 *   objectiveFast         ->  scoring/objective-fast.ts
 *   pack, buildStops      ->  packing/pack.ts
 *   objectiveNaive        ->  validation/objective-naive.ts
 *   validate, relax       ->  validation/validate.ts, validation/ladder.ts
 *
 * `ponytail:` ceilings, stated rather than hidden.
 *
 *   - `pack` is nearest-neighbour seeding plus 2-opt, not Bron-Kerbosch clique
 *     peeling plus LAHC. On the 20 to 40 gated candidates the retrieve stage
 *     leaves us with, the gap to a full Held-Karp solve is a few percent of the
 *     objective. Above 60 gated candidates this stops being true and the
 *     candidate list should be trimmed before packing.
 *   - `objectiveNaive` shares a file with `objectiveFast`. It is a re-derivation
 *     with its own haversine, its own Wilson bound, and its own component math,
 *     but it is not session 6's independent implementation, so the drift it
 *     reports is a weaker signal than the contract wants. The validation panel
 *     says so on screen.
 */

/* ── shared, injectable numbers ─────────────────────────────────────────── */

/** Slack per stop for walking, parking, and queueing. A plan, not a promise. */
export const PLAN_BUFFER_MINUTES = 15;

/**
 * Straight-line to street distance. 1.3 is the usual planning factor and it is
 * the factor `lib/location.ts` already labels as an estimate. Not a route.
 */
const STREET_FACTOR = 1.3;

/** Walking minutes per kilometre. The same constant `lib/location.ts` uses. */
const WALK_MIN_PER_KM = 5;

/** Minutes past local midnight, read straight out of the ISO text. */
export function minutesOfDay(iso: string): number {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

/** "2:15 PM". Every clock in the product comes from a time the traveller set. */
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

/**
 * Minutes for a leg whose `km` is already the street distance, that is, already
 * multiplied by `STREET_FACTOR`. Callers must not multiply again: doing so
 * inflates every travel figure by 30 percent, which is exactly the sort of bug
 * the two independent objectives exist to catch.
 */
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

/** The traveller's edited weights, optionally Thompson-sampled. */
export function weightsFor(
  ctx: DiscoveryContext,
  bandit?: BanditState,
  seed = 20260926,
): Weights {
  return bandit ? sampleWeights(bandit, lcg(seed), ctx.profile.weights) : ctx.profile.weights;
}

/* ── stage 1: retrieve ──────────────────────────────────────────────────── */

export type SearchIndex = {
  postings: Map<string, number[]>;
  lengths: number[];
  averageLength: number;
  records: ExperienceV2[];
};

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "near", "me",
  "i", "have", "is", "are", "want", "need", "under", "with", "from", "my", "it",
  "that", "this", "best", "day", "before", "return", "rain", "monsoon",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function buildIndex(records: ExperienceV2[]): SearchIndex {
  const postings = new Map<string, number[]>();
  const lengths: number[] = [];
  let total = 0;
  records.forEach((record, at) => {
    const tokens = tokenize(
      `${record.name} ${record.area} ${record.city} ${record.zone} ${record.category} ${record.description} ${record.station}`,
    );
    lengths[at] = tokens.length;
    total += tokens.length;
    for (const token of tokens) {
      const list = postings.get(token);
      if (list) list.push(at);
      else postings.set(token, [at]);
    }
  });
  return { postings, lengths, averageLength: records.length ? total / records.length : 0, records };
}

/** Built once at module load, so typing in a filter never rebuilds it. */
export const CATALOGUE_INDEX = buildIndex(anantaRecords);

export type RetrieveFacet = {
  city?: string;
  zone?: string;
  category?: string;
  freeOnly?: boolean;
  communityOnly?: boolean;
  bestTimeOfDay?: ExperienceV2["bestTimeOfDay"];
};

export type RetrieveOptions = {
  query: string;
  origin: [number, number];
  /** Travel-time prefilter in minutes. Uses city congestion, never a raw radius. */
  maxTravelMinutes?: number;
  limit: number;
  facets?: RetrieveFacet;
  mode?: TravelMode;
};

export type RetrieveResult = {
  ids: string[];
  scores: Record<string, number>;
  via: Record<string, "bm25" | "facet" | "isochrone" | "union">;
  totalConsidered: number;
  /** How many records survived the query, the facets, and the isochrone. */
  matchedTerms: number;
};

const BM25_K1 = 1.2;
const BM25_B = 0.75;

/** Okapi BM25 with precomputed term frequencies. */
export function bm25(index: SearchIndex, query: string): Map<number, number> {
  const hits = new Map<number, number>();
  const terms = tokenize(query);
  if (!terms.length || !index.records.length) return hits;
  const total = index.records.length;
  for (const term of Array.from(new Set(terms))) {
    const posting = index.postings.get(term);
    if (!posting) continue;
    const idf = Math.log(1 + (total - posting.length + 0.5) / (posting.length + 0.5));
    const frequency = new Map<number, number>();
    for (const at of posting) frequency.set(at, (frequency.get(at) ?? 0) + 1);
    for (const [at, count] of Array.from(frequency.entries())) {
      const length = index.lengths[at] || 1;
      const norm =
        (BM25_K1 + 1) /
        (BM25_K1 * (1 - BM25_B + (BM25_B * length) / (index.averageLength || 1)) + BM25_K1);
      hits.set(at, (hits.get(at) ?? 0) + idf * count * norm * 1000);
    }
  }
  return hits;
}

export function retrieve(
  index: SearchIndex,
  options: RetrieveOptions,
  city: CityManifest = getCityManifest("mumbai"),
): RetrieveResult {
  const mode = options.mode ?? "walk";
  const facets = options.facets ?? {};
  const textHits = bm25(index, options.query);
  const hasQuery = textHits.size > 0;
  const faceted = Boolean(facets.city || facets.zone || facets.category || facets.freeOnly || facets.communityOnly || facets.bestTimeOfDay);

  const scores: Record<string, number> = {};
  const via: Record<string, "bm25" | "facet" | "isochrone" | "union"> = {};
  const rows: { id: string; score: number }[] = [];

  index.records.forEach((record, at) => {
    if (facets.city && record.city !== facets.city) return;
    if (facets.zone && record.zone !== facets.zone) return;
    if (facets.category && record.category !== facets.category) return;
    if (facets.freeOnly && record.priceInr !== 0) return;
    if (facets.communityOnly && record.confidence.name !== "community") return;
    if (facets.bestTimeOfDay && record.bestTimeOfDay !== facets.bestTimeOfDay) return;

    const travel = legMinutesFor(haversineKm(options.origin, record.coordinates) * STREET_FACTOR, mode, city);
    if (options.maxTravelMinutes !== undefined && travel > options.maxTravelMinutes) return;

    const text = hasQuery ? textHits.get(at) : undefined;
    if (hasQuery && text === undefined) return;

    // With no query the ordering is nearest first, which is what the page says.
    const score = text ?? Math.max(0, 1000 - travel);
    scores[record.id] = score;
    via[record.id] = hasQuery ? (faceted ? "union" : "bm25") : "isochrone";
    rows.push({ id: record.id, score });
  });

  rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    ids: rows.slice(0, Math.max(1, options.limit)).map((row) => row.id),
    scores,
    via,
    totalConsidered: index.records.length,
    matchedTerms: rows.length,
  };
}

/* ── stage 2: gate ──────────────────────────────────────────────────────── */

const ACCESS_CODE: Record<string, RejectionCode> = {
  step_free: "not_step_free",
  stroller_ok: "not_stroller_ok",
  accessible_restroom: "no_accessible_restroom",
  seating_available: "no_seating",
  quiet_space: "not_quiet_enough",
};

function reject(
  record: ExperienceV2,
  field: keyof ExperienceV2["provenance"],
  code: RejectionCode,
  blocking: boolean,
  shortfall: number | null,
  unit: Rejection["unit"],
  extra?: string,
): Rejection {
  return {
    code,
    sentence: rejectionSentence(code, { shortfall: shortfall ?? undefined, unit, extra }),
    shortfall,
    unit,
    blocking,
    causedBy: record.provenance[field] ?? "inferred",
    causedByConfidence: record.confidence[field] ?? "unverified",
  };
}

function inBbox(point: [number, number], manifest: CityManifest): boolean {
  const [west, south, east, north] = manifest.bbox;
  return point[0] >= west && point[0] <= east && point[1] >= south && point[1] <= north;
}

/**
 * The hard gate, cheapest check first. Every drop carries a typed `Rejection`
 * whose sentence comes from the one table in `contracts/codes.ts`. Advisory
 * codes never block: saying a fact is missing is not saying the record fails.
 */
export function gate(
  records: ExperienceV2[],
  ctx: DiscoveryContext,
  options: GateOptions,
): GateResult {
  const passed: ExperienceV2[] = [];
  const rejected: { record: ExperienceV2; rejections: Rejection[] }[] = [];
  const stream: { id: string; rejections: Rejection[] }[] = [];
  const excluded = new Set(ctx.profile.excludes);
  const planned = new Set(ctx.profile.pins);
  const start = minutesOfDay(ctx.now);
  const windowMinutes = Math.max(15, ctx.availableMinutes);
  const deadlineMinutes = ctx.deadline === null ? null : minutesOfDay(ctx.deadline);
  const perPersonBudget = ctx.budgetInr / Math.max(1, ctx.partySize);
  const month = Number(/^\d{4}-(\d{2})-/.exec(ctx.now)?.[1] ?? "1");
  const weekday = new Date(`${todayStamp()}T00:00:00`).getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  for (const record of records) {
    const out: Rejection[] = [];
    if (excluded.has(record.id)) out.push(reject(record, "name", "excluded_by_traveller", true, null, "none"));
    if (planned.has(record.id)) out.push(reject(record, "name", "already_planned", true, null, "none"));

    // Straight-line km is kept for the `too_far` shortfall; the travel figure
    // uses the street-adjusted distance so it matches what the packer measures.
    const km = haversineKm(ctx.origin.coordinates, record.coordinates) * STREET_FACTOR;
    const travel = legMinutesFor(km, ctx.travelMode, ctx.city);
    const { startMin, endMin } = options.windowFor(record);

    // Hours, only checked when there is something to check them against.
    const windows = record.openingHours.weekly[weekday];
    if (windows && windows.length) {
      const covers = windows.some((window) => startMin >= window.from && endMin <= window.to);
      if (!covers) {
        const close = windows.reduce((max, window) => Math.max(max, window.to), 0);
        out.push(
          reject(
            record,
            "openingHours",
            startMin < close ? "closed_now" : "closed_during_window",
            true,
            startMin < close ? close - startMin : Math.max(0, endMin - close),
            "minutes",
          ),
        );
      }
    } else if (record.openingHours.confidence === "unverified") {
      out.push(reject(record, "openingHours", "hours_unverified", false, null, "none"));
    }

    if (record.durationMinutes + PLAN_BUFFER_MINUTES > windowMinutes) {
      out.push(
        reject(record, "duration", "duration_exceeds_budget", true, record.durationMinutes + PLAN_BUFFER_MINUTES - windowMinutes, "minutes"),
      );
    } else if (travel + record.durationMinutes + PLAN_BUFFER_MINUTES > windowMinutes) {
      out.push(
        reject(record, "coordinates", "travel_time_exceeds_budget", true, travel + record.durationMinutes + PLAN_BUFFER_MINUTES - windowMinutes, "minutes"),
      );
    }
    if (deadlineMinutes !== null && start + travel > deadlineMinutes) {
      out.push(reject(record, "coordinates", "travel_time_exceeds_budget", true, start + travel - deadlineMinutes, "minutes"));
    }

    const partyCost = record.priceInr * ctx.partySize;
    if (partyCost > ctx.budgetInr) {
      out.push(reject(record, "price", "over_budget", true, partyCost - ctx.budgetInr, "inr"));
    } else if (record.pricePerPersonInr !== null && record.pricePerPersonInr > perPersonBudget) {
      out.push(reject(record, "pricePerPerson", "over_budget_per_person", true, record.pricePerPersonInr - perPersonBudget, "inr"));
    }
    if (record.capacity !== null && record.capacity < ctx.partySize) {
      out.push(reject(record, "capacity", "capacity_exceeded", true, ctx.partySize - record.capacity, "seats"));
    }

    for (const need of ctx.accessNeeds) {
      const known = record.access[need];
      const label = need.replace(/_/g, " ");
      if (known === false) out.push(reject(record, "accessibility", ACCESS_CODE[need] ?? "unverified_required_fact", true, null, "none", label));
      else if (known === undefined) out.push(reject(record, "accessibility", "unverified_required_fact", false, null, "none", label));
    }
    if (ctx.diets.length) {
      const missing = ctx.diets.filter((diet) => !record.diets.includes(diet));
      if (record.diets.length === 0) out.push(reject(record, "diet", "unverified_required_fact", false, null, "none", ctx.diets.join(", ")));
      else if (missing.length) out.push(reject(record, "diet", "diet_mismatch", true, missing.length, "none", missing.join(", ")));
    }

    if (record.availability.soldOutAt && record.availability.soldOutAt <= ctx.now) {
      out.push(reject(record, "booking", "sold_out", true, null, "none"));
    }
    const latestArrival = deadlineMinutes ?? start + windowMinutes;
    if (record.availability.leadTimeMinutes > 0) {
      if (start + record.availability.leadTimeMinutes > latestArrival) {
        out.push(reject(record, "booking", "lead_time_too_short", true, start + record.availability.leadTimeMinutes - latestArrival, "minutes"));
      }
      if (record.availability.bookingUrl === null) {
        out.push(reject(record, "booking", "requires_booking_not_available", false, null, "none"));
      }
    }

    if (ctx.weatherSeverity && record.indoor === "outdoor") {
      out.push(reject(record, "indoor", "weather_unsafe", true, null, "none", ctx.weatherSeverity.replace(/_/g, " ")));
    } else if (ctx.weatherSeverity && record.indoor === "mixed" && (ctx.weatherSeverity === "heavy_rain" || ctx.weatherSeverity === "storm")) {
      out.push(reject(record, "indoor", "weather_unsafe", true, null, "none", ctx.weatherSeverity.replace(/_/g, " ")));
    }
    if (record.season && !record.season.months.includes(month)) {
      out.push(reject(record, "seasonality", "seasonal_mismatch", true, null, "none", record.season.note));
    }
    if (ctx.travelMode !== "ferry" && !inBbox(record.coordinates, ctx.city) && !ctx.city.ferryCorridors.some((corridor) => [corridor.from, corridor.to].includes(record.area))) {
      out.push(reject(record, "coordinates", "no_route", true, null, "none", record.city));
    }

    if (out.some((item) => item.blocking)) {
      rejected.push({ record, rejections: out });
      stream.push({ id: record.id, rejections: out });
    } else {
      passed.push(record);
      if (out.length) stream.push({ id: record.id, rejections: out });
    }
  }

  return { passed, rejected, stream };
}

/** The most frequent blocking code in a rejection set. Never an advisory. */
export function dominantRejection(rejections: Rejection[]): Rejection | null {
  const blocking = rejections.filter((item) => item.blocking);
  const pool = blocking.length ? blocking : rejections;
  const tally = new Map<RejectionCode, { count: number; sample: Rejection }>();
  for (const item of pool) {
    const row = tally.get(item.code);
    if (row) row.count += 1;
    else tally.set(item.code, { count: 1, sample: item });
  }
  let best: { count: number; sample: Rejection } | null = null;
  for (const row of Array.from(tally.values())) {
    if (!best || row.count > best.count || (row.count === best.count && row.sample.code < best.sample.code)) best = row;
  }
  if (!best) return null;
  return {
    ...best.sample,
    sentence: `${best.sample.sentence} This is what stopped ${best.count} of the records you did not see.`,
  };
}

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

/* ── stage 3: score ─────────────────────────────────────────────────────── */

const Z_95 = 1.959963984540054;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const round4 = (value: number): number => Number(value.toFixed(4));
const mean = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/** Wilson lower bound on the positive rate, on 0 to 1. Zero means no reviews. */
export function wilsonLowerBound(positive: number, total: number): number {
  if (!(total > 0)) return 0;
  const p = clamp01(positive / total);
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = Z_95 * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / denominator);
}

/** Wilson on a one to five rating scale, normalised to 0 to 1. */
export function wilsonRating(ratingSum: number | null, reviewCount: number | null): number {
  if (ratingSum === null || reviewCount === null || reviewCount <= 0) return 0;
  return wilsonLowerBound(ratingSum, 5 * reviewCount) * 5;
}

const BUCKETS = ["morning", "afternoon", "evening", "night"] as const;

function bucketOf(minutes: number): string {
  const hour = Math.floor(((((minutes % 1440) + 1440) % 1440) as number) / 60);
  if (hour < 11) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 20) return "evening";
  return "night";
}

/** 1.0 at the record's best time of day, 0.4 at the opposite end. */
function peakHourFactor(now: number, best: ExperienceV2["bestTimeOfDay"]): number {
  if (best === "any") return 0.7;
  const here = BUCKETS.indexOf(bucketOf(now) as (typeof BUCKETS)[number]);
  const there = BUCKETS.indexOf(best);
  if (here < 0 || there < 0) return 0.7;
  const raw = Math.abs(here - there);
  return 1 - 0.3 * Math.min(raw, BUCKETS.length - raw);
}

function interestMatch(record: ExperienceV2, ctx: DiscoveryContext): number {
  const terms = tokenize(`${ctx.query} ${Object.keys(ctx.profile.interests).join(" ")}`);
  if (!terms.length) return 0;
  const hay = new Set(
    tokenize(`${record.name} ${record.area} ${record.zone} ${record.category} ${record.description}`),
  );
  return terms.filter((term) => hay.has(term)).length / terms.length;
}

function valueForMoney(record: ExperienceV2, ctx: DiscoveryContext): number {
  const price = record.pricePerPersonInr;
  if (price === null) return 0;
  const perPerson = ctx.budgetInr / Math.max(1, ctx.partySize);
  if (perPerson <= 0) return 0;
  if (price === 0) return 1;
  return Math.max(-1, Math.min(1, (perPerson - price) / perPerson));
}

function weatherFit(record: ExperienceV2, ctx: DiscoveryContext): number {
  if (ctx.weatherSeverity === null) return 0;
  const severe = ctx.weatherSeverity === "heavy_rain" || ctx.weatherSeverity === "storm";
  if (record.indoor === "outdoor") return severe ? -1 : -0.6;
  if (record.indoor === "indoor") return 1;
  return severe ? -0.3 : 0.3;
}

function groupFit(record: ExperienceV2, ctx: DiscoveryContext): number {
  let score = 0;
  let signals = 0;
  if (ctx.hasToddler) {
    signals += 1;
    if (record.kidFriendly === true) score += 1;
    else if (record.kidFriendly === false) score -= 1;
  }
  if (ctx.hasElderly) {
    signals += 1;
    if (record.access.seating_available === true) score += 1;
    else if (record.access.seating_available === false) score -= 1;
  }
  if (ctx.accessNeeds.length) {
    signals += 1;
    const unmet = ctx.accessNeeds.filter((need) => record.access[need] === false).length;
    const unknown = ctx.accessNeeds.filter((need) => record.access[need] === undefined).length;
    score += (ctx.accessNeeds.length - unmet * 2 - unknown * 0.5) / ctx.accessNeeds.length;
  }
  return signals ? Math.max(-1, Math.min(1, score / signals)) : 0;
}

const proximityDecay = (travelKm: number): number => 1 / (1 + Math.max(0, travelKm));

export const COMPONENT_LABEL: Record<ComponentId, string> = {
  interest: "Interest match",
  rating: "Rating",
  value: "Value for money",
  authenticity: "Authenticity",
  weather: "Weather fit",
  crowd: "Crowd at that hour",
  novelty: "Novelty",
  groupFit: "Group fit",
  travelFriction: "Proximity",
  reliability: "Provider reliability",
};

const UTILITY_COMPONENTS: ComponentId[] = [
  "interest", "rating", "value", "authenticity", "weather", "groupFit", "reliability",
];

type ComponentReading = { normalised: number; sentence: string };

/** One component's normalised value in [-1, 1]. Every one names its own number. */
function fastComponent(
  id: ComponentId,
  record: ExperienceV2,
  ctx: DiscoveryContext,
  travelKm: number,
): ComponentReading {
  const perPerson = ctx.budgetInr / Math.max(1, ctx.partySize);
  switch (id) {
    case "interest": {
      const value = interestMatch(record, ctx);
      return {
        normalised: value,
        sentence: ctx.query.trim()
          ? `Interest match ${round4(value)} against the words you typed.`
          : "No search words typed, so interest scored a neutral 0.",
      };
    }
    case "rating": {
      const value = wilsonRating(record.ratingSum, record.reviewCount);
      return {
        normalised: value,
        sentence: record.reviewCount === null
          ? "No review count is on record, so rating scored 0 instead of guessing."
          : `Wilson lower bound ${round4(value)} from ${record.reviewCount} reviews.`,
      };
    }
    case "value": {
      const value = valueForMoney(record, ctx);
      return {
        normalised: value,
        sentence: record.pricePerPersonInr === null
          ? "No per-person price is on record, so value scored 0."
          : record.pricePerPersonInr === 0
            ? `Listed as free against ${inrLabel(perPerson)} per person, so value scored the maximum.`
            : `${inrLabel(record.pricePerPersonInr)} per person against ${inrLabel(perPerson)} available.`,
      };
    }
    case "authenticity":
      return {
        normalised: record.authenticity ?? 0.5,
        sentence: record.authenticity === null
          ? "No authenticity score is on record, so it scored a neutral 0.5."
          : `Authenticity ${round4(record.authenticity)}, set on the record.`,
      };
    case "weather": {
      const value = weatherFit(record, ctx);
      return {
        normalised: value,
        sentence: ctx.weatherSeverity === null
          ? "Weather is unknown here, so weather fit scored 0. Unknown is not clear."
          : `${value < 0 ? "Rules out" : "Suits"} the ${ctx.weatherSeverity.replace(/_/g, " ")} you told us about.`,
      };
    }
    case "groupFit": {
      const value = groupFit(record, ctx);
      return {
        normalised: value,
        sentence: !ctx.hasToddler && !ctx.hasElderly && !ctx.accessNeeds.length
          ? "No traveller needs on record, so group fit scored 0."
          : `Group fit ${round4(value)} from the party needs you listed.`,
      };
    }
    case "crowd": {
      const factor = peakHourFactor(minutesOfDay(ctx.now), record.bestTimeOfDay);
      const value = clamp01(record.crowdProfile ?? 0.5) * factor;
      return {
        normalised: value,
        sentence: record.crowdProfile === null
          ? `No crowd profile on record, so a neutral 0.5 was scaled by a ${round4(factor)} time-of-day factor.`
          : `Crowd index ${round4(value)} at the hour you start.`,
      };
    }
    case "novelty":
      return { normalised: 0, sentence: "Novelty is scored across the whole plan, not per stop." };
    case "travelFriction":
      return {
        normalised: proximityDecay(travelKm),
        sentence: `${round4(travelKm)} km from where you stand, decaying to ${round4(proximityDecay(travelKm))}.`,
      };
    case "reliability":
      return {
        normalised: record.providerReliability ?? 0.5,
        sentence: record.providerReliability === null
          ? "No provider track record on file, so reliability scored a neutral 0.5."
          : `Provider reliability ${round4(record.providerReliability)} from the interaction stream.`,
      };
    default:
      return { normalised: 0, sentence: "Not scored." };
  }
}

/** Per-stop components, each with its number and its weight applied. */
export function stopComponents(stop: Stop, ctx: DiscoveryContext, weights: Weights): ScoreComponent[] {
  return UTILITY_COMPONENTS.map((id) => {
    const { normalised, sentence } = fastComponent(id, stop.record, ctx, stop.travelKm);
    const weight = weights[id as keyof Weights];
    return { id, normalised: round4(normalised), weight, contribution: round4(weight * normalised), sentence };
  });
}

type Reader = ComponentReader;
type ComponentReader = (
  id: ComponentId,
  record: ExperienceV2,
  ctx: DiscoveryContext,
  travelKm: number,
) => ComponentReading;

function composeObjective(
  stops: Stop[],
  ctx: DiscoveryContext,
  weights: Weights,
  reader: Reader,
  legs?: { travelMinutes: number; travelKm: number }[],
): Objective {
  const geometry = legs ?? stops.map((stop) => ({ travelMinutes: stop.travelMinutes, travelKm: stop.travelKm }));
  const count = stops.length;
  const buckets = new Map<ComponentId, number[]>(UTILITY_COMPONENTS.map((id) => [id, []]));
  const sentences = new Map<ComponentId, string>();
  const crowd: number[] = [];
  const proximity: number[] = [];

  // Per-stop values go into arrays, then sum in index order, so the result
  // never depends on floating point accumulation order.
  stops.forEach((stop, index) => {
    const leg = geometry[index] ?? { travelMinutes: 0, travelKm: 0 };
    for (const id of UTILITY_COMPONENTS) {
      const reading = reader(id, stop.record, ctx, leg.travelKm);
      buckets.get(id)!.push(reading.normalised);
      if (!sentences.has(id)) sentences.set(id, reading.sentence);
    }
    crowd.push(reader("crowd", stop.record, ctx, leg.travelKm).normalised);
    proximity.push(proximityDecay(leg.travelKm));
  });

  const components: ScoreComponent[] = UTILITY_COMPONENTS.map((id) => {
    const normalised = mean(buckets.get(id)!);
    const weight = weights[id as keyof Weights];
    return {
      id,
      normalised: round4(normalised),
      weight,
      contribution: round4(weight * normalised * count),
      sentence: sentences.get(id) ?? "Not scored.",
    };
  });

  const superlinear = geometry.reduce((sum, leg) => sum + leg.travelMinutes * (1 + leg.travelKm / 8) ** 2, 0);
  const crowdLoad = mean(crowd);
  const proximityMean = mean(proximity);
  const redundancy = redundancyPenalty(stops);
  // No stops is not a pace deviation. Charging one made an empty plan score
  // negative, which reads as a bad plan rather than as no plan.
  const pace = count === 0 ? 0 : paceDeviation(count, ctx);

  components.push({
    id: "travelFriction",
    normalised: round4(proximityMean),
    weight: weights.travelFriction,
    contribution: round4(weights.travelFriction * proximityMean * count),
    sentence: `Proximity ${round4(proximityMean)} across ${geometry.length} leg${geometry.length === 1 ? "" : "s"}; superlinear travel cost ${round4(superlinear)} against a penalty weight of ${weights.travelPenalty}.`,
  });
  components.push({
    id: "crowd",
    normalised: round4(crowdLoad),
    weight: weights.crowd,
    contribution: round4(-weights.crowd * crowdLoad),
    sentence: `Mean crowd load ${round4(crowdLoad)} across ${count} stop${count === 1 ? "" : "s"}.`,
  });
  components.push({
    id: "novelty",
    normalised: round4(1 - redundancy),
    weight: weights.novelty,
    contribution: round4(-weights.novelty * redundancy),
    sentence: `Redundancy ${round4(redundancy)} from same-category pairs.`,
  });

  // The contract names a `w.proximity` term but `Weights` has no `proximity`
  // key, so `travelFriction` carries it. Logged as a session 1 blocker.
  const total =
    components.reduce((sum, item) => sum + item.contribution, 0) -
    weights.travelPenalty * superlinear -
    weights.pacePenalty * pace;

  const breakdown: ObjectiveBreakdown = {
    total: round4(total),
    components,
    aggregate: {
      travel: round4(superlinear),
      crowd: round4(crowdLoad),
      novelty: round4(redundancy),
      proximity: round4(proximityMean),
      pace: round4(pace),
    },
  };
  return { value: breakdown.total, breakdown };
}

function redundancyPenalty(stops: Stop[]): number {
  if (stops.length < 2) return 0;
  let pairs = 0;
  for (let i = 0; i < stops.length; i += 1) {
    for (let j = i + 1; j < stops.length; j += 1) {
      if (stops[i].record.category === stops[j].record.category) pairs += 1;
    }
  }
  return (pairs * 0.5) / Math.max(1, stops.length - 1);
}

function paceDeviation(count: number, ctx: DiscoveryContext): number {
  return Math.abs(count - ctx.idealStops) ** 1.5 / Math.max(1, ctx.idealStops);
}

/** The objective, composed. O(n), and it recomputes no distance. */
export function objectiveFast(stops: Stop[], ctx: DiscoveryContext, weights: Weights): Objective {
  return composeObjective(stops, ctx, weights, fastComponent);
}

/* ── stage 4: pack ──────────────────────────────────────────────────────── */

export type PackOptions = {
  matrix: (aId: string, bId: string) => { minutes: number; km: number };
  originMinutes: (id: string) => { minutes: number; km: number };
  beamWidth?: number;
  iters?: number;
  seed?: number;
};

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
    matrix: (aId, bId) => leg(aId, bId),
    originMinutes: (id) => leg("origin", id),
    beamWidth: 6,
    iters: 3,
    seed: 20260926,
  };
}

export function buildStops(order: string[], ctx: DiscoveryContext, options: PackOptions): Stop[] {
  const stops: Stop[] = [];
  let elapsed = 0;
  for (let index = 0; index < order.length; index += 1) {
    const record = anantaById[order[index]];
    if (!record) continue;
    const leg = index === 0 ? options.originMinutes(record.id) : options.matrix(order[index - 1], record.id);
    elapsed += leg.minutes;
    stops.push({
      record,
      arriveBy: elapsed,
      travelMinutes: leg.minutes,
      travelKm: leg.km,
      visitMinutes: record.durationMinutes,
      bufferMinutes: PLAN_BUFFER_MINUTES,
      costInr: record.priceInr * ctx.partySize,
    });
    elapsed += record.durationMinutes + PLAN_BUFFER_MINUTES;
  }
  return stops;
}

export type StopTotals = {
  activity: number;
  travel: number;
  buffer: number;
  cost: number;
  total: number;
};

export function stopTotals(stops: Stop[]): StopTotals {
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

/**
 * The relaxation ladder, always named. Pins in `ctx.profile.pins` are routed as
 * given; with no pins the packer greedily fills to the traveller's ideal count.
 */
export function pack(candidates: ExperienceV2[], ctx: DiscoveryContext, options: PackOptions): PackResult {
  const weights = weightsFor(ctx);
  const evaluated = candidates.length;
  const pins = new Set(ctx.profile.pins);
  const pinned = candidates.filter((record) => pins.has(record.id));
  let rung: Rung = "strict";
  let note = "";

  const fits = (ids: string[]): boolean => {
    const totals = stopTotals(buildStops(routeOrder(ids, ctx, options, options.iters ?? 3), ctx, options));
    return totals.total <= ctx.availableMinutes && totals.cost <= ctx.budgetInr;
  };

  let order: string[];
  if (pinned.length) {
    order = routeOrder(pinned.map((record) => record.id), ctx, options, options.iters ?? 3);
    if (!fits(order)) {
      rung = "dropped_minimum";
      const kept = order.slice(0, Math.max(0, order.length - 1));
      note = kept.length
        ? `Dropped the last stop, so the plan is ${stopTotals(buildStops(kept, ctx, options)).total} minutes against your ${ctx.availableMinutes}.`
        : `Your ${pinned.length} chosen stops need more than the ${ctx.availableMinutes} minutes you have, so nothing was kept.`;
      order = kept;
    } else {
      note = `All ${order.length} of your stops fit the window and the budget, so nothing was relaxed.`;
    }
  } else {
    rung = "greedy_fill";
    order = greedyFill(candidates, ctx, options, weights);
    note = order.length
      ? `Filled ${order.length} stop${order.length === 1 ? "" : "s"} from the ${evaluated} records that passed the gate.`
      : "No gated record fits the window and the budget you set.";
  }

  if (!order.length) {
    rung = "single_best";
    const best = candidates[0];
    order = best ? [best.id] : [];
    note = note || "Nothing fit, so the single top-scoring gated record is shown on its own.";
  }

  const stops = buildStops(order, ctx, options);
  return {
    stops,
    objective: objectiveFast(stops, ctx, weights),
    clusters: stops.map((stop) => ({ ids: [stop.record.id], diameterKm: 0 })),
    rung,
    relaxationNote: note,
    searchStats: { candidates: evaluated, evaluated, acceptedImprovements: 0 },
  };
}

/** Add the gated record that improves the objective most, until the window is full. */
function greedyFill(
  pool: ExperienceV2[],
  ctx: DiscoveryContext,
  options: PackOptions,
  weights: Weights,
): string[] {
  const chosen: string[] = [];
  const left = [...pool];
  const cap = Math.max(1, Math.min(ctx.idealStops, 6));
  const scored = left
    .slice(0, 60)
    .map((record) => ({ id: record.id, value: objectiveFast([probe(record, ctx, options)], ctx, weights).value }))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));

  while (chosen.length < cap && left.length) {
    const current = stopTotals(buildStops(chosen, ctx, options));
    const headroom = ctx.availableMinutes - current.total;
    const affordable = new Set(
      left
        .filter(
          (record) =>
            record.durationMinutes + PLAN_BUFFER_MINUTES <= headroom &&
            current.cost + record.priceInr * ctx.partySize <= ctx.budgetInr,
        )
        .map((record) => record.id),
    );
    const optionsLeft = scored.filter((row) => affordable.has(row.id));
    if (!optionsLeft.length) break;
    let bestId = "";
    let bestValue = -Infinity;
    for (const row of optionsLeft.slice(0, 24)) {
      const value = objectiveFast(buildStops([...chosen, row.id], ctx, options), ctx, weights).value;
      if (value > bestValue) {
        bestValue = value;
        bestId = row.id;
      }
    }
    if (!bestId) break;
    chosen.push(bestId);
    left.splice(left.findIndex((record) => record.id === bestId), 1);
  }
  return routeOrder(chosen, ctx, options, options.iters ?? 3);
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

/* ── stage 5: validate ──────────────────────────────────────────────────── */

/**
 * The independent re-derivation. It reads the records, recomputes every leg
 * from `coordinates` with its own haversine, its own congestion lookup, and its
 * own Wilson bound. It never reads `Stop.travelKm` and never calls the fast
 * path. Two derivations of one number, agreeing, is evidence. One derivation
 * checking itself is not.
 */
export function objectiveNaive(stops: Stop[], ctx: DiscoveryContext, weights: Weights): Objective {
  const earthRadiusKm = 6371;
  const rad = (value: number) => (value * Math.PI) / 180;
  const gap = (a: [number, number], b: [number, number]) => {
    const dLat = rad(b[1] - a[1]);
    const dLng = rad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  const congestion = ctx.city.congestion[ctx.travelMode];
  const legs = stops.map((stop, index) => {
    const from = index === 0 ? ctx.origin.coordinates : stops[index - 1].record.coordinates;
    const km = gap(from, stop.record.coordinates) * 1.3;
    return { km, minutes: Math.max(1, Math.round(km * 5 * congestion)) };
  });

  const read = (id: ComponentId, record: ExperienceV2, travelKm: number): number => {
    switch (id) {
      case "interest": {
        const terms = tokenize(`${ctx.query} ${Object.keys(ctx.profile.interests).join(" ")}`);
        if (!terms.length) return 0;
        const hay = new Set(
          tokenize(`${record.name} ${record.area} ${record.zone} ${record.category} ${record.description}`),
        );
        return terms.filter((term) => hay.has(term)).length / terms.length;
      }
      case "rating": {
        if (record.ratingSum === null || record.reviewCount === null || record.reviewCount <= 0) return 0;
        const total = 5 * record.reviewCount;
        const p = record.ratingSum / total;
        const z = 1.959963984540054;
        const d = 1 + (z * z) / total;
        const c = p + (z * z) / (2 * total);
        const m = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
        return Math.max(0, (c - m) / d) * 5;
      }
      case "value": {
        if (record.pricePerPersonInr === null) return 0;
        const perPerson = ctx.budgetInr / Math.max(1, ctx.partySize);
        if (perPerson <= 0) return 0;
        if (record.pricePerPersonInr === 0) return 1;
        return Math.max(-1, Math.min(1, (perPerson - record.pricePerPersonInr) / perPerson));
      }
      case "authenticity":
        return record.authenticity ?? 0.5;
      case "weather": {
        if (ctx.weatherSeverity === null) return 0;
        const severe = ctx.weatherSeverity === "heavy_rain" || ctx.weatherSeverity === "storm";
        if (record.indoor === "outdoor") return severe ? -1 : -0.6;
        if (record.indoor === "indoor") return 1;
        return severe ? -0.3 : 0.3;
      }
      case "groupFit": {
        let score = 0;
        let signals = 0;
        if (ctx.hasToddler) {
          signals += 1;
          if (record.kidFriendly === true) score += 1;
          else if (record.kidFriendly === false) score -= 1;
        }
        if (ctx.hasElderly) {
          signals += 1;
          if (record.access.seating_available === true) score += 1;
          else if (record.access.seating_available === false) score -= 1;
        }
        if (ctx.accessNeeds.length) {
          signals += 1;
          const unmet = ctx.accessNeeds.filter((need) => record.access[need] === false).length;
          const unknown = ctx.accessNeeds.filter((need) => record.access[need] === undefined).length;
          score += (ctx.accessNeeds.length - unmet * 2 - unknown * 0.5) / ctx.accessNeeds.length;
        }
        return signals ? Math.max(-1, Math.min(1, score / signals)) : 0;
      }
      case "reliability":
        return record.providerReliability ?? 0.5;
      case "crowd": {
        // The neutral 0.5 still scales the time-of-day factor. Dropping it
        // makes an unprofiled record look twice as crowded as a profiled one.
        const profile = clamp01(record.crowdProfile ?? 0.5);
        if (record.bestTimeOfDay === "any") return profile * 0.7;
        const here = BUCKETS.indexOf(bucketOf(minutesOfDay(ctx.now)) as (typeof BUCKETS)[number]);
        const there = BUCKETS.indexOf(record.bestTimeOfDay);
        const raw = Math.abs(here - there);
        return profile * (1 - 0.3 * Math.min(raw, BUCKETS.length - raw));
      }
      default:
        return 1 / (1 + Math.max(0, travelKm));
    }
  };

  return composeObjective(
    stops,
    ctx,
    weights,
    (id, record, _ctx, travelKm) => ({ normalised: read(id, record, travelKm), sentence: "Recomputed from the record." }),
    legs.map((leg) => ({ travelMinutes: leg.minutes, travelKm: leg.km })),
  );
}

export function validate(
  stops: Stop[],
  ctx: DiscoveryContext,
  fast: Objective,
  weights: Weights,
): ValidationResult {
  const naive = objectiveNaive(stops, ctx, weights);
  const drift = Math.abs(fast.value - naive.value);
  const issues: ValidationIssue[] = [];
  const totals = stopTotals(stops);

  if (!stops.length) {
    issues.push({ code: "empty_plan", sentence: "The plan has no stops in it.", offendingId: null });
  }
  if (drift > 1e-6) {
    issues.push({
      code: "objective_drift",
      sentence: `The fast objective and the independent re-derivation disagree by ${drift.toExponential(2)}.`,
      offendingId: null,
    });
  }
  if (totals.total > ctx.availableMinutes) {
    issues.push({
      code: "window_overflow",
      sentence: `The plan needs ${totals.total} minutes and the window is ${ctx.availableMinutes} minutes.`,
      offendingId: null,
    });
  }
  if (totals.cost > ctx.budgetInr) {
    issues.push({
      code: "budget_overflow",
      sentence: `The plan costs ${inrLabel(totals.cost)} against a ${inrLabel(ctx.budgetInr)} budget.`,
      offendingId: null,
    });
  }
  for (const stop of stops) {
    if (stop.costInr > ctx.budgetInr) {
      issues.push({
        code: "over_budget",
        sentence: rejectionSentence("over_budget", { shortfall: stop.costInr - ctx.budgetInr, unit: "inr" }),
        offendingId: stop.record.id,
      });
    }
  }

  const hard =
    1 +
    Number(drift > 1e-6) +
    Number(totals.total > ctx.availableMinutes) +
    Number(totals.cost > ctx.budgetInr);
  return {
    ok: issues.length === 0,
    drift,
    issues,
    satisfiedFraction: Math.max(0, (hard - issues.length) / hard),
  };
}

/* ── stage 6: relax ─────────────────────────────────────────────────────── */

export function relax(
  stops: Stop[],
  ctx: DiscoveryContext,
  cause: ValidationResult,
  options: PackOptions,
  weights: Weights,
): { stops: Stop[]; rung: Rung; note: string } | null {
  if (cause.ok) return null;
  const order = stops.map((stop) => stop.record.id);
  if (order.length <= 1) {
    return {
      stops,
      rung: "single_best",
      note: `One stop still needs more than the ${ctx.availableMinutes} minutes available, so nothing was dropped.`,
    };
  }
  for (let drop = 1; drop < order.length; drop += 1) {
    const trimmed = buildStops(order.slice(0, order.length - drop), ctx, options);
    const check = validate(trimmed, ctx, objectiveFast(trimmed, ctx, weights), weights);
    if (check.ok) {
      return {
        stops: trimmed,
        rung: "dropped_minimum",
        note: `Relaxed one rung: dropped ${drop} stop${drop === 1 ? "" : "s"}, so the plan is ${stopTotals(trimmed).total} minutes against ${ctx.availableMinutes}.`,
      };
    }
  }
  return null;
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

/** Rank a gated set by the same objective the packer maximises. */
export function rank(
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

export function runPipeline(input: EngineInput, weights: Weights): PipelineRun {
  const city = getCityManifest(input.cityId);
  const ctx = contextFromInput(input, city);
  const options = makeTravelOptions(ctx, anantaRecords);
  const start = minutesOfDay(ctx.now);

  const retrieved = retrieve(
    CATALOGUE_INDEX,
    {
      query: input.query,
      origin: input.originCoordinates,
      maxTravelMinutes: input.availableMinutes,
      limit: 120,
      mode: input.travelMode,
      facets: {
        city: input.city === "All" ? undefined : input.city,
        zone: input.zone === "All" ? undefined : input.zone,
        category: input.category === "All" ? undefined : input.category,
        freeOnly: input.freeOnly || undefined,
        communityOnly: input.communityOnly || undefined,
        bestTimeOfDay: input.bestTimeOfDay === "any" ? undefined : input.bestTimeOfDay,
      },
    },
    city,
  );

  const pool = retrieved.ids.map((id) => anantaById[id]).filter(Boolean);
  const gated = gate(pool, ctx, {
    windowFor: (record) => {
      const leg = options.originMinutes(record.id);
      return { startMin: start + leg.minutes, endMin: start + leg.minutes + record.durationMinutes };
    },
  });

  const advisoryById = new Map(
    gated.stream.map((row) => [row.id, row.rejections.filter((item) => !item.blocking)]),
  );

  const counts = new Map<RejectionCode, { code: RejectionCode; count: number; blocking: number }>();
  const blockingSamples = new Map<RejectionCode, Rejection>();
  for (const row of gated.stream) {
    for (const item of row.rejections) {
      const bucket = counts.get(item.code) ?? { code: item.code, count: 0, blocking: 0 };
      bucket.count += 1;
      if (item.blocking) {
        bucket.blocking += 1;
        if (!blockingSamples.has(item.code)) blockingSamples.set(item.code, item);
      }
      counts.set(item.code, bucket);
    }
  }

  let dominant: Rejection | null = null;
  let dominantCount = 0;
  for (const [code, count] of Array.from(counts.entries()).sort(
    (a, b) => b[1].blocking - a[1].blocking || a[0].localeCompare(b[0]),
  )) {
    if (count.blocking > dominantCount && blockingSamples.has(code)) {
      dominantCount = count.blocking;
      const sample = blockingSamples.get(code)!;
      dominant = { ...sample, sentence: `${sample.sentence} This is what stopped ${count.blocking} of the records you did not see.` };
    }
  }

  return {
    ctx,
    weights,
    retrieved,
    gated,
    ranked: rank(gated.passed, ctx, weights, options, advisoryById),
    retrievalCount: pool.length,
    consideredCount: DATASET_SIZE,
    cheapest: cheapestRelaxation(gated.stream, pool),
    dominant,
    byCode: Array.from(counts.values()).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
  };
}

export { COMPONENT_IDS };

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
