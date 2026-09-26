import { describe, expect, it } from "vitest";
import type {
  CityManifest,
  Confidence,
  DiscoveryContext,
  ExperienceV2,
  FieldConfidence,
  FieldProvenance,
  Provenance,
  Stop,
  TravellerProfile,
} from "@/lib/engine/contracts";
import { PRIOR_WEIGHTS, clampWeights } from "@/lib/engine/scoring/weights";

/**
 * Shared fixtures for the scoring tests.
 *
 * This file ends in `.test.ts` only because the session contract allows this
 * directory `lib/engine/scoring/*.test.ts` and nothing else, and forbids a
 * `tests/` directory. Duplicating a 40 field record factory into five files
 * would be the alternative, and that is how fixtures drift out of agreement with
 * the type they are supposed to describe. The suite at the bottom is not filler:
 * it asserts the fixtures still satisfy the data contract session 8 must honour.
 */

const PROVENANCED_FIELDS: (keyof FieldProvenance)[] = [
  "name",
  "coordinates",
  "address",
  "category",
  "duration",
  "price",
  "capacity",
  "openingHours",
  "accessibility",
  "indoor",
  "kidFriendly",
  "booking",
  "seasonality",
  "bestTime",
  "diet",
  "rating",
  "reviewCount",
  "media",
  "pricePerPerson",
];

function fullProvenance(value: Provenance): FieldProvenance {
  const out = {} as FieldProvenance;
  for (const field of PROVENANCED_FIELDS) out[field] = value;
  return out;
}

function confidence(pairs: Record<string, Confidence>): FieldConfidence {
  return pairs as FieldConfidence;
}

const TEST_CITY: CityManifest = {
  id: "test-city",
  displayName: "Test city",
  currency: "INR",
  timezone: "Asia/Kolkata",
  bbox: [72.7, 18.8, 73, 19.1],
  neighbourhoods: [],
  monsoonMonths: [6, 7, 8, 9],
  congestion: { walk: 1, auto: 1.2, taxi: 1.3, metro: 1.1, ferry: 1.4 },
  ferryCorridors: [],
  notes: "Fixture manifest. Not a real city.",
};

/** A complete, deliberately well-populated record. Override one field per test. */
export function makeRecord(overrides: Partial<ExperienceV2> = {}): ExperienceV2 {
  const base: ExperienceV2 = {
    id: "rec-1",
    name: "Test spot",
    area: "Test area",
    city: "Test city",
    zone: "Test zone",
    station: "Test station",
    category: "cafes",
    description: "A record used only by tests.",
    coordinates: [72.83, 18.93],
    travelMinutes: 20,
    durationMinutes: 45,
    priceInr: 200,
    pricePerPersonInr: 200,
    capacity: 20,
    openingHours: {
      weekly: {
        0: [{ from: 540, to: 1260 }],
        1: [{ from: 540, to: 1260 }],
        2: [{ from: 540, to: 1260 }],
        3: [{ from: 540, to: 1260 }],
        4: [{ from: 540, to: 1260 }],
        5: [{ from: 540, to: 1260 }],
        6: [{ from: 540, to: 1260 }],
      },
      confidence: "verified",
    },
    availability: {
      leadTimeMinutes: 0,
      soldOutAt: null,
      remainingCapacity: 20,
      bookingUrl: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    access: {
      step_free: true,
      stroller_ok: true,
      accessible_restroom: true,
      seating_available: true,
      low_walking: true,
      quiet_space: false,
      service_animal_ok: true,
    },
    diets: ["vegetarian", "vegan"],
    indoor: "indoor",
    kidFriendly: true,
    season: null,
    bestTimeOfDay: "morning",
    ratingSum: 258,
    reviewCount: 60,
    authenticity: 0.9,
    providerReliability: 0.8,
    crowdProfile: 0.4,
    provenance: fullProvenance("curated"),
    confidence: confidence({
      name: "verified",
      coordinates: "verified",
      category: "verified",
      duration: "verified",
      price: "verified",
      capacity: "estimate",
      openingHours: "verified",
      accessibility: "estimate",
      indoor: "verified",
      kidFriendly: "estimate",
      bestTime: "estimate",
      diet: "estimate",
      rating: "community",
      reviewCount: "community",
      pricePerPerson: "verified",
    }),
    sources: {},
    imageUrl: "",
    imageCredit: "",
    status: "Open",
    statusTone: "green",
    updated: "2026-01-01",
  };
  return { ...base, ...overrides };
}

export function makeProfile(overrides: Partial<TravellerProfile> = {}): TravellerProfile {
  return {
    id: "traveller-1",
    interests: { cafes: 0.6, galleries: 0.4 },
    avoid: {},
    accessibility: [],
    diets: [],
    excludes: [],
    pins: [],
    weights: clampWeights(PRIOR_WEIGHTS),
    bandit: { arms: [], observations: 0, updatedAt: "2026-01-01T00:00:00.000Z" },
    ...overrides,
  };
}

/** A context whose `original` points at itself, which is how a fresh request looks. */
export function makeContext(overrides: Partial<DiscoveryContext> = {}): DiscoveryContext {
  const merged: DiscoveryContext = {
    now: "2026-01-15T09:30:00.000Z",
    origin: { coordinates: [72.83, 18.93], label: "Start", area: "Test area" },
    availableMinutes: 300,
    deadline: null,
    budgetInr: 1000,
    partySize: 1,
    hasToddler: false,
    hasElderly: false,
    raining: false,
    weatherSeverity: "clear",
    travelMode: "walk",
    pace: "normal",
    idealStops: 3,
    minStops: 2,
    accessNeeds: [],
    diets: [],
    query: "",
    profile: makeProfile(),
    city: TEST_CITY,
    original: undefined as unknown as DiscoveryContext,
    ...overrides,
  };
  merged.original = merged;
  return merged;
}

export function makeStop(record: Partial<ExperienceV2> = {}, leg: { minutes?: number; km?: number } = {}): Stop {
  return {
    record: makeRecord(record),
    arriveBy: 0,
    travelMinutes: leg.minutes ?? 0,
    travelKm: leg.km ?? 0,
    visitMinutes: 45,
    bufferMinutes: 10,
    costInr: 200,
  };
}

/** Deterministic uniform generator, so every sampling test is reproducible. */
export function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe("scoring fixtures", () => {
  it("gives the record a provenance for every field, which session 8 must also do", () => {
    const record = makeRecord();
    for (const field of PROVENANCED_FIELDS) {
      expect(record.provenance[field], `provenance.${field}`).toBeDefined();
    }
  });

  it("gives the record a verified price by default, so the value component is live", () => {
    expect(makeRecord().confidence.price).toBe("verified");
  });

  it("builds a context whose original is itself", () => {
    const ctx = makeContext();
    expect(ctx.original).toBe(ctx);
  });

  it("builds a profile whose weights are already a partition", () => {
    const weights = makeProfile().weights;
    const total = (["interest", "rating", "value", "authenticity", "weather", "crowd", "novelty", "groupFit", "travelFriction", "reliability"] as const)
      .reduce((sum, key) => sum + weights[key], 0);
    expect(total).toBeCloseTo(1, 12);
  });
});
