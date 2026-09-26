# ANANTA — SESSION CONTRACTS (frozen)

> **Read this before you write a single line. It is not a suggestion.**
> This file is the coordination mechanism that lets 10 sessions run simultaneously
> in one working tree without collapsing. Every cross-session type, code, formula
> and constant you need is written out here **as compilable TypeScript**. You do
> not need to read another session's code, wait for it, or ask for it. If a symbol
> you need is not in this file, you do not need it — you are building the wrong
> thing.

---

## 0. The three rules that prevent collapse

### Rule 1 — You own a file list. You touch nothing else.

Your prompt contains an `ALLOWED` list and a `FORBIDDEN` list. `ALLOWED` is
exhaustive. If a file is not on your `ALLOWED` list, you do not create it, you do
not edit it, and you do not "just quickly fix" it — no matter how broken it looks
or how much it blocks you. Several other sessions are editing in the same tree at
this moment and your edit would be overwritten or would break their typecheck.

**If you are blocked by a file you do not own, do not touch it.** Put the exact
blocker, the file, the line, and the one-line fix you want into
`SESSION/BLOCKERS/<your-session-number>.md` and continue with everything else.
That file is the only shared-write surface in the entire plan, and it is append-only
so concurrent appends cannot conflict destructively.

### Rule 2 — Import inward, never sideways, never outward.

```
   app/  →  lib/engine/index.ts  →  lib/engine/<stage>/  →  lib/engine/contracts/
                                    (all type-only, zero runtime deps)
```

- `lib/engine/contracts/` is the only leaf. It imports **nothing** from the repo
  except `import type { Experience } from "@/lib/seed"`.
- Stage modules (`retrieve`, `feasibility`, `scoring`, `packing`, `validation`,
  `replan`) may import from `contracts/` and from **earlier-numbered** stages only.
  Never from a later-numbered stage. Never from another stage at the same level.
- `lib/engine/index.ts` is the single public barrel. **Only session 1 edits it.**
  Every other session exposes its public API through its own stage `index.ts` and
  session 1 wires the barrel from the signatures written in this file. If the
  barrel is missing an export when you finish, that is session 1's problem, not
  yours.
- The UI (`app/`, `components/`) imports **only** from `@/lib/engine`. It never
  reaches into a stage directory.
- No barrel file (`index.ts` re-exporting siblings) may be created by anyone except
  session 1. One indirection, one owner.

### Rule 3 — Zero new dependencies, and one owner per config file.

`package.json` dependencies are **frozen at exactly what is there now**:
`@phosphor-icons/react`, `maplibre-gl`, `next`, `react`, `react-dom`.
Everything in this plan is implementable with those plus the standard library. If
you believe you need a package, you are wrong. BM25, Wilson lower bound,
Bron–Kerbosch, 2-opt, Or-opt, LAHC, Thompson sampling, a routing cache, a
`localStorage` store — all of it is a few dozen lines. Write it.

Config file ownership, because these are the classic collision points:

| File | Sole owner | Everyone else |
|---|---|---|
| `package.json` | session 10 | read-only, do not touch, do not add scripts |
| `tsconfig.json` | session 10 | read-only |
| `.eslintrc.json` | session 10 | read-only |
| `vitest.config.ts` | session 10 | read-only |
| `next.config.mjs` | session 10 | read-only |
| `lib/seed.ts` | **nobody — frozen** | read-only for all sessions |
| `lib/data/**` | session 8 | read-only for all other sessions |
| `docs/**` | session 10 | read-only |
| `.github/**` | session 10 | read-only |
| `scripts/**` | session 8 | read-only |
| `SESSION/BLOCKERS/**` | everyone, append-only | never edit another session's file |

`lib/seed.ts` is frozen on purpose. It is the current `Experience` type and it is
what 1107 records already satisfy. Session 1 introduces the richer
`ExperienceV2` beside it; session 8 populates it. Nobody edits the old type, so
nothing breaks while the two coexist.

---

## 1. Directory layout after all 10 sessions

```
lib/engine/
  contracts/          S1  types.ts  codes.ts  manifest.ts  objective-spec.md  index.ts
  retrieve/           S2  bm25.ts  index-builder.ts  facets.ts  isochrone.ts  retrieve.ts  *.test.ts
  feasibility/        S3  gate.ts  checks/*.ts  sentence.ts  feasibility.ts  *.test.ts
  scoring/            S4  components.ts  wilson.ts  weights.ts  thompson.ts  objective-fast.ts  *.test.ts
  packing/            S5  graph.ts  cliques.ts  tour.ts  two-opt.ts  or-opt.ts  lahc.ts  beam.ts  pack.ts  *.test.ts
  validation/         S6  objective-naive.ts  drift.ts  ladder.ts  validate.ts  *.test.ts
  replan/             S7  context.ts  triggers.ts  swap.ts  replan.ts  *.test.ts
  eval/              S10  scenarios.ts  harness.ts  metrics.ts  unmet-demand.ts  *.test.ts
  index.ts            S1  the only public barrel
lib/data/ananta/      S8  records.ts  curated/*.ts  provenance.ts  adapter.ts
components/ananta/    S9  * (new namespace, zero collision with existing components)
SESSION/              prompts + BLOCKERS/
```

---

## 2. Frozen types — copy from here, do not invent variants

Put this in `lib/engine/contracts/types.ts`. **Session 1 owns this file. Sessions
2–10 import from `@/lib/engine/contracts` and never redefine any of it.** If a type
here is missing something you need, that is a design bug — report it in your
blockers file rather than widening the type yourself.

```ts
import type { Experience } from "@/lib/seed";

/* ── provenance ─────────────────────────────────────────────────────────── */

/** Where a single field's value came from. Never inferred silently. */
export type Provenance = "curated" | "provider" | "osm" | "inferred" | "derived";

/**
 * How much to trust the value. `unverified` is a first-class, load-bearing
 * state: the gate must be able to refuse on it (`hours_unverified`).
 */
export type Confidence = "verified" | "community" | "estimate" | "unverified";

/** Every field that carries provenance. Adding a field here is a session-1 change. */
export type ProvenancedField =
  | "name" | "coordinates" | "address" | "category" | "duration" | "price"
  | "capacity" | "openingHours" | "accessibility" | "indoor" | "kidFriendly"
  | "booking" | "seasonality" | "bestTime" | "diet" | "rating" | "reviewCount"
  | "media" | "pricePerPerson";

export type FieldProvenance = Record<ProvenancedField, Provenance>;
export type FieldConfidence = Partial<Record<ProvenancedField, Confidence>>;

export interface Sourced<T> {
  value: T;
  provenance: Provenance;
  confidence: Confidence;
  /** ISO date. Required when provenance is `provider` or `inferred`. */
  asOf?: string;
  /** Real URL, or `null` when there is genuinely no source. Never `example.com`. */
  sourceUrl: string | null;
  /** 0..1. Only meaningful for `inferred` and `derived`. */
  score?: number;
  /** Human sentence shown in the provenance popover. No em dash. */
  note: string;
}

/* ── graded operational facts ───────────────────────────────────────────── */

export type AccessNeed =
  | "step_free" | "stroller_ok" | "accessible_restroom" | "seating_available"
  | "low_walking" | "quiet_space" | "service_animal_ok";

export type DietNeed = "vegetarian" | "vegan" | "halal" | "jain" | "nut_free";

export type IndoorOutdoor = "indoor" | "outdoor" | "mixed";

export interface HoursWindow {
  /** Minutes from local midnight, inclusive. */
  from: number;
  /** Minutes from local midnight, exclusive. May exceed 1440 for past-midnight. */
  to: number;
}

export interface OpeningHours {
  /** 0 = Sunday. Missing day = closed. */
  weekly: Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, HoursWindow[]>>;
  /** `null` means "not known", which is NOT the same as "always open". */
  confidence: Confidence;
  asOf?: string;
}

export interface SeasonWindow {
  /** 1..12 inclusive. */
  months: number[];
  note: string;
}

export interface Availability {
  /** Minutes of notice the provider needs before they will confirm. */
  leadTimeMinutes: number;
  /** ISO date-time of a sold-out slot, or `null`. */
  soldOutAt: string | null;
  /** Remaining seats for the requested party, or `null` when unknown. */
  remainingCapacity: number | null;
  /** `null` when the provider does not take bookings. */
  bookingUrl: string | null;
  updatedAt: string;
}

/* ── the record ─────────────────────────────────────────────────────────── */

export interface ExperienceV2 {
  id: string;
  name: string;
  area: string;
  city: string;
  zone: string;
  station: string;
  category: string;
  description: string;

  coordinates: [number, number];
  travelMinutes: number;

  /** Minutes of activity. The only duration the engine trusts. */
  durationMinutes: number;
  priceInr: number;
  /** `null` when genuinely free or genuinely unknown. */
  pricePerPersonInr: number | null;
  capacity: number | null;

  openingHours: OpeningHours;
  availability: Availability;
  access: Partial<Record<AccessNeed, boolean>>;
  diets: DietNeed[];
  indoor: IndoorOutdoor;
  kidFriendly: boolean | null;
  season: SeasonWindow | null;
  bestTimeOfDay: "morning" | "afternoon" | "evening" | "night" | "any";

  /** Wilson lower bound inputs. `null` when there are no reviews. */
  ratingSum: number | null;
  reviewCount: number | null;
  /** 0..1, hand-set. Local-ness: is this a resident-facing thing or a tourist trap. */
  authenticity: number | null;
  /** 0..1, from the interaction stream. `null` when unproven. */
  providerReliability: number | null;
  /** 0..1, from review text. Retrospective, attributed. */
  crowdProfile: number | null;

  provenance: FieldProvenance;
  confidence: FieldConfidence;
  /** Per-field detail for the provenance popover. */
  sources: Partial<Record<ProvenancedField, Sourced<unknown>>>;

  /** Carried from the v1 record so nothing regresses. */
  imageUrl: string;
  imageCredit: string;
  status: string;
  statusTone: "blue" | "green" | "amber";
  updated: string;
}

/* ── traveller context ──────────────────────────────────────────────────── */

export interface TravellerProfile {
  id: string;
  interests: Record<string, number>;
  avoid: Record<string, number>;
  accessibility: AccessNeed[];
  diets: DietNeed[];
  /** Explicitly excluded record ids. */
  excludes: string[];
  /** Explicitly pinned record ids. */
  pins: string[];
  /** Learned weights. Every key present, seeded from the prior. */
  weights: Weights;
  /** Thompson state, persisted. Opaque to everything but `thompson.ts`. */
  bandit: BanditState;
}

export interface DiscoveryContext {
  now: string;
  origin: { coordinates: [number, number]; label: string; area: string };
  availableMinutes: number;
  /** Earliest return, ISO. `null` when unbounded. */
  deadline: string | null;
  budgetInr: number;
  partySize: number;
  hasToddler: boolean;
  hasElderly: boolean;
  raining: boolean;
  /** `null` when weather is unknown. Unknown is not `false`. */
  weatherSeverity: "clear" | "rain" | "heavy_rain" | "storm" | null;
  travelMode: TravelMode;
  pace: "relaxed" | "normal" | "packed";
  idealStops: number;
  minStops: number;
  accessNeeds: AccessNeed[];
  diets: DietNeed[];
  query: string;
  profile: TravellerProfile;
  city: CityManifest;
  /**
   * The traveller's original intent, frozen at construction and never mutated.
   * Every replan diffs against THIS, never against the previous mutation.
   */
  original: DiscoveryContext;
}

export type TravelMode = "walk" | "auto" | "taxi" | "metro" | "ferry";

export interface CityManifest {
  id: string;
  displayName: string;
  currency: "INR";
  timezone: string;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  neighbourhoods: { name: string; coordinates: [number, number]; station: string }[];
  /** 1..12. Used to reason about `seasonal_mismatch`, never hard-coded. */
  monsoonMonths: number[];
  /** Multiplier applied to raw OSRM duration. Labelled as an estimate in the UI. */
  congestion: Record<TravelMode, number>;
  /** Ferry corridors, e.g. Nerul to Seawoods. Used by isochrone + routing. */
  ferryCorridors: { from: string; to: string; minutes: number }[];
  notes: string;
}

/* ── rejections ─────────────────────────────────────────────────────────── */

export type RejectionCode =
  | "too_far"
  | "travel_time_exceeds_budget" | "duration_exceeds_budget"
  | "closed_now" | "closed_during_window" | "hours_unverified"
  | "over_budget" | "over_budget_per_person"
  | "capacity_exceeded"
  | "not_step_free" | "not_stroller_ok" | "no_accessible_restroom"
  | "requires_steps" | "no_seating" | "not_quiet_enough"
  | "diet_mismatch"
  | "sold_out" | "requires_booking_not_available" | "lead_time_too_short"
  | "weather_unsafe"
  | "duplicate" | "already_planned" | "excluded_by_traveller"
  | "seasonal_mismatch"
  | "no_route" | "unverified_required_fact";

export type RejectionUnit = "minutes" | "inr" | "metres" | "km" | "seats" | "days" | "none";

export interface Rejection {
  code: RejectionCode;
  /** Finished sentence with real numbers. "Needs 40 min more than you have left." */
  sentence: string;
  /** How far short it fell, in `unit`. Signed positive = short by this much. */
  shortfall: number | null;
  unit: RejectionUnit;
  /** `true` when this alone is disqualifying. `false` = advisory only. */
  blocking: boolean;
  /** Provenance of the fact that caused the rejection, so the UI can be honest. */
  causedBy: Provenance;
  causedByConfidence: Confidence;
}

/* ── scoring ────────────────────────────────────────────────────────────── */

export type ComponentId =
  | "interest" | "rating" | "value" | "authenticity" | "weather"
  | "crowd" | "novelty" | "groupFit" | "travelFriction" | "reliability";

export interface Weights {
  interest: number; rating: number; value: number; authenticity: number;
  weather: number; crowd: number; novelty: number; groupFit: number;
  travelFriction: number; reliability: number;
  /** Penalty applied per superlinear travel increment. */
  travelPenalty: number;
  /** Penalty for deviating from `idealStops`. */
  pacePenalty: number;
}

export interface ScoreComponent {
  id: ComponentId;
  /** Normalised, in [-1, 1]. Signed: negative means a penalty. */
  normalised: number;
  weight: number;
  /** weight * normalised. The number shown in the "why this" panel. */
  contribution: number;
  /** Finished sentence, e.g. "Wilson lower bound 4.31 from 62 reviews." */
  sentence: string;
}

export interface Stop {
  record: ExperienceV2;
  arriveBy: number;
  /** Minutes of travel from the previous stop. 0 for the first. */
  travelMinutes: number;
  travelKm: number;
  visitMinutes: number;
  bufferMinutes: number;
  /** Cost for the whole party, in INR. */
  costInr: number;
}

export interface ObjectiveBreakdown {
  total: number;
  components: ScoreComponent[];
  aggregate: { travel: number; crowd: number; novelty: number; proximity: number; pace: number };
}

export interface Objective {
  /** The single scalar. Maximise. */
  value: number;
  breakdown: ObjectiveBreakdown;
}

/* ── packing ────────────────────────────────────────────────────────────── */

export type Rung = "strict" | "dropped_minimum" | "greedy_fill" | "single_best";

export interface PackResult {
  stops: Stop[];
  objective: Objective;
  /** Clusters formed, for the debug view. */
  clusters: { ids: string[]; diameterKm: number }[];
  /** Which rung of the ladder produced this. */
  rung: Rung;
  /** What the relaxation gave up, in the traveller's language. */
  relaxationNote: string;
  searchStats: { candidates: number; evaluated: number; acceptedImprovements: number };
}

export interface Plan {
  id: string;
  stops: Stop[];
  objective: Objective;
  createdFrom: DiscoveryContext;
}

/* ── validation ─────────────────────────────────────────────────────────── */

export interface ValidationIssue {
  code: RejectionCode | "objective_drift" | "window_overflow" | "budget_overflow" | "empty_plan";
  sentence: string;
  offendingId: string | null;
}

export interface ValidationResult {
  ok: boolean;
  /** |objectiveFast - objectiveNaive|. Must be <= 1e-6 when ok. */
  drift: number;
  issues: ValidationIssue[];
  satisfiedFraction: number;
}

/* ── replanning ─────────────────────────────────────────────────────────── */

export type TriggerId =
  | "rain_started" | "time_lost" | "sold_out" | "budget_dropped"
  | "needs_restroom" | "tired";

export interface Swap {
  removedId: string | null;
  addedId: string | null;
  /** Finished sentence naming the constraint that forced the change. */
  reason: string;
  /** objective(new) - objective(old). Negative is worse. */
  scoreDelta: number;
  /** Minutes added to or removed from total plan time. */
  minutesDelta: number;
}

export interface ReplanResult {
  plan: Plan;
  swaps: Swap[];
  /** Rungs walked, in order. */
  rungs: Rung[];
  /** What the replan is measured against. Always `context.original`. */
  diffedAgainst: "original";
}

/* ── learning ───────────────────────────────────────────────────────────── */

export interface BanditArm {
  component: ComponentId;
  alpha: number;
  beta: number;
  pulls: number;
}

export interface BanditState {
  arms: BanditArm[];
  /** Bumped on every meaningful interaction. */
  observations: number;
  updatedAt: string;
}

/* ── provider flywheel ──────────────────────────────────────────────────── */

export interface UnmetDemand {
  id: string;
  /** Stable hash of the area + interest, so repeats collapse. */
  fingerprint: string;
  area: string;
  /** What travellers actually searched for. Verbatim, escaped for display. */
  query: string;
  /** Travellers who wanted it and did not get it. */
  demandCount: number;
  /** The single constraint that killed it most often. */
  dominantRejection: { code: RejectionCode; sentence: string };
  /** The full distribution, so the provider sees the shape, not one cause. */
  rejectionMix: { code: RejectionCode; count: number }[];
  /** Median shortfall across all kills, in `dominantRejection`'s unit. */
  medianShortfall: number | null;
  unit: RejectionUnit;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Providers this is actionable for, given their own facts. */
  actionableFor: string[];
}

export interface DemandRequest {
  id: string;
  providerId: string;
  travellerId: string;
  recordId: string;
  message: string;
  state: "open" | "accepted" | "declined";
  createdAt: string;
  respondedAt: string | null;
}

/* ── evaluation ─────────────────────────────────────────────────────────── */

export interface EvalScenario {
  id: string;
  title: string;
  /** One line, shown in the report. Must read like something a traveller said. */
  prompt: string;
  context: Omit<DiscoveryContext, "original" | "city"> & { cityId?: string };
  /** A trigger to fire after the first plan, if the scenario is adaptive. */
  thenTrigger?: { trigger: TriggerId; mutate: Partial<DiscoveryContext> };
}

export interface EvalResult {
  scenarioId: string;
  producedPlan: boolean;
  rung: Rung | null;
  hardConstraints: number;
  satisfiedConstraints: number;
  satisfactionRate: number;
  objectiveDrift: number;
  timeUtilisation: number;
  medianTravelKmPerStop: number;
  swaps: number;
  rejections: { code: RejectionCode; count: number }[];
  notes: string[];
}

export interface EvalReport {
  results: EvalResult[];
  aggregate: {
    coverage: number;
    meanSatisfaction: number;
    maxDrift: number;
    medianSwaps: number;
    medianTravelKmPerStop: number;
    meanTimeUtilisation: number;
  };
}
```

---

## 3. The objective, written once

This is the single most important thing in this file. Session 4 implements it as
`objectiveFast`. Session 6 independently implements it as `objectiveNaive`, sharing
**no code** with session 4. They must agree to `1e-6`. If they do not, one of you
has a bug, and the test tells you which.

**Purity requirements, both implementations:**

- No `Date.now()`, no `new Date()` without an injected `now`, no `Math.random()`.
- No dependence on `Set` or `Map` iteration order. Sort before iterating.
- No floating-point accumulation order dependence: accumulate per-stop values into an
  array, then sum in index order.
- All inputs come from the `DiscoveryContext` passed in. No module-level mutable
  state, no module-level caches keyed by anything but a pure function of the input.

```
objective(stops, ctx, W) =
      Σ_{i=0..n-1}  W.cᵢ · Uᵢ(stops[i], ctx)          // utility, maximise
    − W.travelPenalty  · superlinearTravel(stops, ctx)
    − W.crowd          · crowdLoad(stops, ctx)
    − W.novelty        · redundancyPenalty(stops)
    − W.pacePenalty    · paceDeviation(n, ctx)
```

with, per stop `i`:

```
Uᵢ = w.interest·interestMatch(r, ctx)
   + w.rating·wilsonLowerBound(r)          // 0 when reviewCount is null
   + w.value·valueForMoney(r, ctx)         // 0 when price is unknown
   + w.authenticity·(r.authenticity ?? 0.5)
   + w.weather·weatherFit(r, ctx)          // 0 when weather is unknown
   + w.groupFit·groupFit(r, ctx)
   + w.reliability·(r.providerReliability ?? 0.5)
   + w.proximity·proximityDecay(stops[i], ctx)
```

Every component is normalised to `[-1, 1]`. Positive is better, everywhere. Penalties
are subtracted by the aggregate terms, never by flipping a sign inside `Uᵢ`, so the
breakdown stays legible in the UI.

```
superlinearTravel = Σ_{legs} minutes · (1 + km / 8)²
    // quadratic in distance: the Mumbai reality check is that the 6th km hurts
    // more than the 1st. Each leg's km comes from the injected distance matrix,
    // never from a straight-line recomputation.

crowdLoad   = mean over stops of clamp01(r.crowdProfile ?? 0.5) · peakHourFactor(ctx.now, r.bestTimeOfDay)
redundancy  = Σ over unordered pairs of categoryEqual(i,j) ? 0.5 : 0, then / max(1, n-1)
paceDeviation(n, ctx) = |n − ctx.idealStops| ^ 1.5 / max(1, ctx.idealStops)
proximityDecay(stop, ctx) = 1 / (1 + travelKm)      // in (0, 1], not [0,1]
peakHourFactor(now, best) = 1.0 at the record's bestTimeOfDay, decaying to 0.4 at the opposite end
```

**The validator's independence requirement.** `objectiveNaive` must not import
anything from `scoring/`, `packing/`, or `validation/`. It reads
`ExperienceV2[]` and `DiscoveryContext` and recomputes from first principles,
including recomputing distances from `coordinates` with its own haversine rather
than reading the matrix. That is the whole point: two independent derivations of
the same number, agreeing to 1e-6, is evidence. One derivation checking itself is
not.

---

## 4. Frozen public signatures

Session 1 wires `lib/engine/index.ts` to exactly these. Implement to them.

```ts
// ── contracts ────────────────────────────────────────────────────────────
export * from "./types";
export * from "./codes";
export * from "./manifest";
export const MUMBAI_MANIFEST: CityManifest;
export const NAVI_MUMBAI_MANIFEST: CityManifest;
export const CITY_MANIFESTS: Record<string, CityManifest>;
export function getCityManifest(id: string): CityManifest;   // throws on unknown id

// ── retrieve (S2) ────────────────────────────────────────────────────────
export interface RetrieveOptions {
  query: string;
  area?: string;
  categories?: string[];
  tags?: string[];
  origin: [number, number];
  /** Minutes. Travel-time prefilter. Uses `city.congestion`, never a raw radius. */
  maxTravelMinutes?: number;
  limit: number;
}
export interface RetrieveResult {
  ids: string[];
  /** BM25 score per id. Absent for facet-only hits. */
  scores: Record<string, number>;
  /** Which retriever produced each id. */
  via: Record<string, "bm25" | "facet" | "isochrone" | "union">;
  totalConsidered: number;
}
export function buildIndex(records: ExperienceV2[]): SearchIndex;
export function retrieve(index: SearchIndex, options: RetrieveOptions): RetrieveResult;
export function tokenize(text: string): string[];   // shared with nothing; local to S2

// ── feasibility (S3) ─────────────────────────────────────────────────────
export interface GateOptions {
  /** Visit window per candidate, computed from the plan position. */
  windowFor: (record: ExperienceV2) => { startMin: number; endMin: number };
}
export interface GateResult {
  passed: ExperienceV2[];
  rejected: { record: ExperienceV2; rejections: Rejection[] }[];
  /** Every rejection, flattened. Feeds the unmet-demand feed verbatim. */
  stream: { id: string; rejections: Rejection[] }[];
}
export function gate(
  records: ExperienceV2[],
  ctx: DiscoveryContext,
  options: GateOptions,
): GateResult;
/** The single most frequent blocking code across a rejection set. */
export function dominantRejection(rejections: Rejection[]): Rejection | null;

// ── scoring (S4) ─────────────────────────────────────────────────────────
export function objectiveFast(stops: Stop[], ctx: DiscoveryContext): Objective;
export function wilsonLowerBound(positive: number, total: number): number;
export const PRIOR_WEIGHTS: Weights;
export function sampleWeights(bandit: BanditState, rng: () => number): Weights;
export function updateBandit(bandit: BanditState, rewards: Record<ComponentId, number>): BanditState;
export function explainStop(stop: Stop, ctx: DiscoveryContext, objective: Objective): ScoreComponent[];

// ── packing (S5) ─────────────────────────────────────────────────────────
export interface PackOptions {
  /** Precomputed pairwise travel minutes. Inject it, never fetch inside. */
  matrix: (aId: string, bId: string) => { minutes: number; km: number };
  originMinutes: (id: string) => { minutes: number; km: number };
  beamWidth?: number;
  iters?: number;
  /** Deterministic. Defaults to a seeded LCG so runs are reproducible. */
  seed?: number;
}
export function pack(
  candidates: ExperienceV2[],
  ctx: DiscoveryContext,
  options: PackOptions,
): PackResult;
export function buildStops(order: string[], ctx: DiscoveryContext, options: PackOptions): Stop[];

// ── validation (S6) ──────────────────────────────────────────────────────
export function objectiveNaive(stops: Stop[], ctx: DiscoveryContext): Objective;
export function validate(
  stops: Stop[],
  ctx: DiscoveryContext,
  fast: Objective,
): ValidationResult;
export function relax(
  stops: Stop[],
  ctx: DiscoveryContext,
  cause: ValidationResult,
): { stops: Stop[]; rung: Rung; note: string } | null;

// ── replan (S7) ──────────────────────────────────────────────────────────
export function diffAgainstOriginal(
  before: Plan,
  after: Plan,
  ctx: DiscoveryContext,
): Swap[];
export function applyTrigger(
  plan: Plan,
  trigger: TriggerId,
  ctx: DiscoveryContext,
  mutate: (draft: DiscoveryContext) => DiscoveryContext,
  solve: (ctx: DiscoveryContext) => Plan,
): ReplanResult;
export function buildContext(
  input: Omit<DiscoveryContext, "original">,
  city: CityManifest,
): DiscoveryContext;   // deep-freezes `original`

// ── eval (S10) ───────────────────────────────────────────────────────────
export const SCENARIOS: EvalScenario[];
export function runEval(scenarios?: EvalScenario[]): EvalReport;
export function unmetDemandFromStream(
  stream: { id: string; rejections: Rejection[] }[],
  records: ExperienceV2[],
  ctx: DiscoveryContext,
): UnmetDemand[];
```

---

## 5. Rejection code discipline

`contracts/codes.ts` owns the human sentence for every code. **Every rejection
sentence in the entire product is generated from that one table.** No stage module
writes an English string literal for a rejection.

```ts
export interface CodeSpec {
  code: RejectionCode;
  /** Whether this can ever be non-blocking. */
  advisory: boolean;
  /** Build the finished sentence from measured numbers. */
  sentence: (m: { shortfall?: number; unit?: RejectionUnit; extra?: string }) => string;
}

export const REJECTION_CODES: Record<RejectionCode, CodeSpec>;
export const REJECTION_UNIT_LABEL: Record<RejectionUnit, string>;
export const REJECTION_UNIT_SUFFIX: Record<RejectionUnit, string>;
```

House style for every sentence, enforced by a test:

- No em dash character anywhere in the repo. Not in copy, not in comments, not in
  strings. See `docs/05-design/DESIGN-CONTRACT.md`.
- No emoji.
- No sentence may contain the words "constraint violated", "not eligible", or
  "unavailable" on their own. A sentence always carries a number or a named fact.
- `shortfall` is always positive and always in the unit named by `unit`. Sign
  discipline: a shortfall is a magnitude, never a delta.
- `unit: "none"` implies `shortfall: null`.

**Today the product emits 15 untyped English strings, only 3 of which carry a
number, and four unit tests assert on that prose.** Migrating to this table will
break `lib/recommendation.test.ts` and `lib/quick-filters.test.ts`. That is
expected and correct. Session 3 rewrites those assertions to match on
`rejection.code`, never on `rejection.sentence`.

---

## 6. Data contract between session 8 and everyone else

Session 8 owns populating `ExperienceV2`. Everyone else consumes it. The handoff is
one exported symbol:

```ts
// lib/data/ananta/records.ts   (session 8)
export const anantaRecords: ExperienceV2[];

/**
 * The 250 records that carry real, hand-authored Experience-layer facts.
 * Everything else in anantaRecords is a labelled deterministic estimate.
 */
export const curatedRecordIds: ReadonlySet<string>;

/** Fills every field OSM and the name list cannot know, and marks provenance. */
export function enrich(base: Experience, now: string): ExperienceV2;

/** Per-field provenance resolution, used by the UI provenance popover. */
export function fieldSource(
  record: ExperienceV2,
  field: ProvenancedField,
): Sourced<unknown> | null;
```

Rules session 8 must honour, because other sessions depend on them:

1. **`sourceUrl` is `string | null`.** Never `example.com`. If there is no real
   source, it is `null` and the UI says so. A test asserts no `example.com`
   anywhere in the repo.
2. **Every field gets a provenance and a confidence.** A missing entry is a
   `dataset.test.ts` failure, not a silent `undefined`.
3. **`openingHours.confidence === "unverified"` is legal and expected** for the
   long tail. That is precisely what makes `hours_unverified` a meaningful
   rejection instead of a guess.
4. **A `curated` field is never derived from a hash.** If it came from
   `hash(id) % band`, it is `inferred` + `estimate` + `score` set low, and the UI
   must show it as an estimate. This is the rule that stops the current situation,
   where 1064 records claim `source: "Curated record"` while every one of their
   prices is a hash.
5. **Determinism.** `enrich` takes `now` as a parameter. No `Date.now()` inside.
   The whole dataset must be byte-identical across runs, or the drift test and the
   geocode CI both become flaky.
6. **No Mumbai string in `lib/engine/`.** City-specific values live in
   `CityManifest`. Enforced by a test that reads the directory.

---

## 7. Test and verification conventions

- Test files sit next to the code they test: `foo.ts` and `foo.test.ts`. Do not
  create a `tests/` directory.
- `vitest` runs in `environment: "node"`. **No DOM, no React, no network.** A test
  that needs a browser does not go in `npm test`; it goes in
  `scripts/qa-*.mjs` and is labelled as not-in-CI until it is.
- Every pure function gets at least one test that asserts an exact value, not just
  a shape. The existing suite's best tests pin arithmetic to the digit
  (`expect(result.totalMinutes).toBe(147)`). Match that bar.
- Every rejection code needs a test that produces it. `contracts/codes.ts` exports
  `REJECTION_CODES`; write one table-driven test that walks all of them and asserts
  each sentence contains either a digit or a named fact.
- No `it.only`, no `.skip` left in a diff, no commented-out assertions.
- The verification command for every session is the same:

```
npm ci && npx tsc --noEmit && npm run lint && npx vitest run <your paths>
```

If `npx tsc --noEmit` reports errors in files you do not own, they are another
session's in-flight work. **Filter to your own paths** and report the rest in your
blockers file. Do not fix them.

---

## 8. Blocker protocol

`SESSION/BLOCKERS/<N>.md`, append-only, one file per session. Format:

```md
## <iso-timestamp> <one-line summary>
- blocked on: <path>:<line>
- symptom: <exact error text or wrong behaviour>
- why i cannot fix it: <file is owned by session N>
- proposed one-line fix: <the diff you want that owner to apply>
- severity: blocker | degraded | cosmetic
```

Append with a single write that includes everything you accumulated this run. Never
rewrite another session's file. Never delete an entry. Severity `blocker` means you
cannot finish your task without it; say so plainly rather than working around it
with a local shim, because a local shim is exactly how ten sessions end up with
ten divergent copies of the same idea.

---

## 9. What "done" means for every session

1. `npx tsc --noEmit` clean for your own paths.
2. `npx vitest run <your paths>` green, with exact-value assertions.
3. `npm run lint` clean, no em dash, no emoji.
4. Zero new entries in `package.json` dependencies.
5. No file outside your `ALLOWED` list modified. Verify with `git status --short`
   and confirm every path is yours.
6. Every blocker you hit is written down in `SESSION/BLOCKERS/<N>.md`, even the
   ones you worked around.
7. A short summary at the end of your run: what you built, what you deliberately
   skipped, the known ceiling of what you built, and the one command that proves it
   works.

Point 7 matters. State the ceiling honestly. `ponytail:` comments naming the
ceiling and the upgrade path are welcome in code. A session that says "this is a
greedy nearest-neighbour, not a Held-Karp solve, and at 25 candidates the gap is
under 3%" is more valuable than one that claims optimality.
