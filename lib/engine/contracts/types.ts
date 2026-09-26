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
  /**
   * Real URL, or `null` when there is genuinely no source. A placeholder
   * domain is a lie about where a fact came from, so it is never acceptable.
   */
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

/* ── legacy alias ───────────────────────────────────────────────────────── */

/**
 * The frozen v1 record from `@/lib/seed`, unchanged. `ExperienceV2` is a
 * superset of this, not a replacement, so both types stay live side by side
 * while session 8 populates `ExperienceV2` and the UI migrates field by field.
 */
export type LegacyExperience = Experience;

/* ── runtime mirrors of the unions above ────────────────────────────────── */

/**
 * Types erase. These are the runtime values for the five unions that stage
 * modules need to iterate: the gate and the codes table walk rejections, the
 * gate walks access needs and diets, the bandit walks components, and the
 * provenance popover walks provenances.
 *
 * `codes.test.ts` asserts each list is set-equal to the union it mirrors, so a
 * union that grows without its runtime twin fails the build.
 */

export const REJECTION_CODES_LIST: readonly RejectionCode[] = [
  "too_far",
  "travel_time_exceeds_budget",
  "duration_exceeds_budget",
  "closed_now",
  "closed_during_window",
  "hours_unverified",
  "over_budget",
  "over_budget_per_person",
  "capacity_exceeded",
  "not_step_free",
  "not_stroller_ok",
  "no_accessible_restroom",
  "requires_steps",
  "no_seating",
  "not_quiet_enough",
  "diet_mismatch",
  "sold_out",
  "requires_booking_not_available",
  "lead_time_too_short",
  "weather_unsafe",
  "duplicate",
  "already_planned",
  "excluded_by_traveller",
  "seasonal_mismatch",
  "no_route",
  "unverified_required_fact",
];

export const PROVENANCE_VALUES: readonly Provenance[] = [
  "curated",
  "provider",
  "osm",
  "inferred",
  "derived",
];

export const ACCESS_NEEDS: readonly AccessNeed[] = [
  "step_free",
  "stroller_ok",
  "accessible_restroom",
  "seating_available",
  "low_walking",
  "quiet_space",
  "service_animal_ok",
];

export const DIET_NEEDS: readonly DietNeed[] = [
  "vegetarian",
  "vegan",
  "halal",
  "jain",
  "nut_free",
];

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
