import type {
  BanditState,
  CityManifest,
  Confidence,
  DiscoveryContext,
  ExperienceV2,
  FieldProvenance,
  OpeningHours,
  Provenance,
  ProvenancedField,
  Rejection,
  Stop,
  TravellerProfile,
  Weights,
} from "@/lib/engine/contracts";

/**
 * Test support only. No check imports this file.
 *
 * It lives under `checks/` because that is the only module glob session 3 owns
 * that accepts a non-check file, and one set of fixtures beats three
 * hand-maintained copies drifting apart.
 */

/** A Saturday, so weekday and season cases are both unambiguous. */
export const TEST_NOW = "2026-07-04T09:30:00.000Z";
export const TEST_TIMEZONE = "UTC";
/** 09:30 on the test Saturday. */
export const TEST_MINUTES = 570;

const FIELDS: ProvenancedField[] = [
  "name", "coordinates", "address", "category", "duration", "price", "capacity",
  "openingHours", "accessibility", "indoor", "kidFriendly", "booking",
  "seasonality", "bestTime", "diet", "rating", "reviewCount", "media",
  "pricePerPerson",
];

function filledProvenance(value: Provenance): FieldProvenance {
  const out = {} as FieldProvenance;
  for (const field of FIELDS) out[field] = value;
  return out;
}

function filledConfidence(value: Confidence): Record<string, Confidence> {
  const out: Record<string, Confidence> = {};
  for (const field of FIELDS) out[field] = value;
  return out;
}

/** Open 09:00 to 21:00 every day, which contains the default visit window. */
export function openAllWeek(confidence: Confidence = "verified"): OpeningHours {
  const weekly: OpeningHours["weekly"] = {};
  for (const day of [0, 1, 2, 3, 4, 5, 6] as const) weekly[day] = [{ from: 540, to: 1260 }];
  return { weekly, confidence, asOf: TEST_NOW };
}

export function testManifest(): CityManifest {
  return {
    id: "test-city",
    displayName: "Test City",
    currency: "INR",
    timezone: TEST_TIMEZONE,
    bbox: [9, 19, 11, 21],
    neighbourhoods: [{ name: "Old Quarter", coordinates: [10, 20], station: "Central" }],
    monsoonMonths: [6, 7, 8, 9],
    congestion: { walk: 1.3, auto: 1, taxi: 1.2, metro: 1.1, ferry: 1.4 },
    ferryCorridors: [],
    notes: "Fixture city. No real place data is used in this stage's tests.",
  };
}

export const TEST_WEIGHTS: Weights = {
  interest: 1,
  rating: 0.6,
  value: 0.5,
  authenticity: 0.3,
  weather: 0.4,
  crowd: 0.3,
  novelty: 0.2,
  groupFit: 0.4,
  travelFriction: 0.5,
  reliability: 0.3,
  travelPenalty: 0.2,
  pacePenalty: 0.1,
};

export const TEST_BANDIT: BanditState = { arms: [], observations: 0, updatedAt: TEST_NOW };

/** A record that passes every check, so each test can break exactly one thing. */
export function makeRecord(overrides: Partial<ExperienceV2> = {}): ExperienceV2 {
  const base: ExperienceV2 = {
    id: "record-1",
    name: "Test Record",
    area: "Old Quarter",
    city: "Test City",
    zone: "Zone 1",
    station: "Central",
    category: "culture",
    description: "A fixture experience used by the feasibility tests.",

    coordinates: [10, 20],
    travelMinutes: 20,

    durationMinutes: 60,
    priceInr: 400,
    pricePerPersonInr: null,
    capacity: 20,

    openingHours: openAllWeek(),
    availability: {
      leadTimeMinutes: 0,
      soldOutAt: null,
      remainingCapacity: null,
      bookingUrl: null,
      updatedAt: TEST_NOW,
    },
    access: {},
    diets: [],
    indoor: "indoor",
    kidFriendly: true,
    season: null,
    bestTimeOfDay: "any",

    ratingSum: 430,
    reviewCount: 100,
    authenticity: 0.8,
    providerReliability: 0.9,
    crowdProfile: 0.4,

    provenance: filledProvenance("curated"),
    confidence: filledConfidence("verified"),
    sources: {},

    imageUrl: "",
    imageCredit: "",
    status: "Open",
    statusTone: "green",
    updated: TEST_NOW,
  };
  return { ...base, ...overrides };
}

export function makeProfile(overrides: Partial<TravellerProfile> = {}): TravellerProfile {
  return {
    id: "traveller-1",
    interests: {},
    avoid: {},
    accessibility: [],
    diets: [],
    excludes: [],
    pins: [],
    weights: TEST_WEIGHTS,
    bandit: TEST_BANDIT,
    ...overrides,
  };
}

export function makeContext(overrides: Partial<DiscoveryContext> = {}): DiscoveryContext {
  const context = {
    now: TEST_NOW,
    origin: { coordinates: [10, 20] as [number, number], label: "Start", area: "Old Quarter" },
    availableMinutes: 240,
    deadline: null,
    budgetInr: 2000,
    partySize: 2,
    hasToddler: false,
    hasElderly: false,
    raining: false,
    weatherSeverity: "clear" as const,
    travelMode: "auto" as const,
    pace: "normal" as const,
    idealStops: 3,
    minStops: 1,
    accessNeeds: [],
    diets: [],
    query: "",
    profile: makeProfile(),
    city: testManifest(),
    ...overrides,
  } as unknown as DiscoveryContext;
  // `buildContext` owns this in production. Mirrored here so a fixture that
  // mutates nothing still satisfies the type.
  return Object.assign(context, { original: context });
}

export function makePosition(overrides: Partial<GatePositionShape> = {}) {
  return {
    travelMinutes: 20,
    startOffsetMin: 20,
    window: { startMin: 590, endMin: 650 },
    weekday: 6,
    month: 7,
    planned: [],
    ...overrides,
  };
}

type GatePositionShape = {
  travelMinutes: number;
  startOffsetMin: number;
  window: { startMin: number; endMin: number };
  weekday: number;
  month: number;
  planned: { id: string; coordinates: [number, number] }[];
};

export function makeStop(overrides: Partial<Stop> = {}): Stop {
  return {
    record: makeRecord(),
    arriveBy: 590,
    travelMinutes: 20,
    travelKm: 1.2,
    visitMinutes: 60,
    bufferMinutes: 15,
    costInr: 800,
    ...overrides,
  };
}

export function codes(rejections: Rejection[]): string[] {
  return rejections.map((rejection) => rejection.code);
}
