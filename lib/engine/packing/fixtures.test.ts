import { describe, expect, it } from "vitest";
import { PRIOR_WEIGHTS } from "@/lib/engine/scoring";
import type {
  BanditState, CityManifest, Confidence, DiscoveryContext, ExperienceV2,
  FieldProvenance, ProvenancedField, TravellerProfile,
} from "@/lib/engine/contracts";
import { haversineKm } from "./distance";
import type { PackOptions } from "./pack";

/**
 * Test scaffolding. The city is deliberately unnamed: a Mumbai literal anywhere
 * under `lib/engine/` fails the portability test session 1 owns.
 */

export const TEST_CITY: CityManifest = {
  id: "test-city",
  displayName: "Test City",
  currency: "INR",
  timezone: "Asia/Kolkata",
  bbox: [72.79, 18.9, 72.99, 19.28],
  neighbourhoods: [
    { name: "Old Quarter", coordinates: [72.83, 19.05], station: "old" },
    { name: "Riverside", coordinates: [72.87, 19.19], station: "river" },
    { name: "South Gate", coordinates: [72.93, 18.95], station: "gate" },
  ],
  monsoonMonths: [6, 7, 8, 9],
  congestion: { walk: 1.15, auto: 1.35, taxi: 1.4, metro: 1.1, ferry: 1.25 },
  ferryCorridors: [{ from: "riverside", to: "gate", minutes: 35 }],
  notes: "Fixture city for the packing stage.",
};

export const TEST_BANDIT: BanditState = { arms: [], observations: 0, updatedAt: "2026-01-01T00:00:00.000Z" };

export function makeProfile(overrides: Partial<TravellerProfile> = {}): TravellerProfile {
  return {
    id: "traveller-1",
    interests: { food: 1, market: 0.8, walk: 0.6, museum: 0.4 },
    avoid: {},
    accessibility: [],
    diets: [],
    excludes: [],
    pins: [],
    weights: { ...PRIOR_WEIGHTS },
    bandit: TEST_BANDIT,
    ...overrides,
  };
}

const PROVENANCE_FIELDS: ProvenancedField[] = [
  "name", "coordinates", "address", "category", "duration", "price", "capacity",
  "openingHours", "accessibility", "indoor", "kidFriendly", "booking", "seasonality",
  "bestTime", "diet", "rating", "reviewCount", "media", "pricePerPerson",
];

function fullProvenance(overrides: Partial<FieldProvenance> = {}): FieldProvenance {
  const base = {} as FieldProvenance;
  for (const field of PROVENANCE_FIELDS) base[field] = "curated";
  return { ...base, ...overrides };
}

export function makeRecord(index: number, coordinates: [number, number], overrides: Partial<ExperienceV2> = {}): ExperienceV2 {
  const id = `r${String(index).padStart(2, "0")}`;
  return {
    id,
    name: `Place ${id}`,
    area: "Old Quarter",
    city: "Test City",
    zone: "z1",
    station: "old",
    category: index % 3 === 0 ? "food market" : index % 3 === 1 ? "museum" : "walk",
    description: `Fixture record ${id}.`,
    coordinates,
    travelMinutes: 0,
    durationMinutes: 45 + (index % 3) * 15,
    priceInr: 200 + (index % 5) * 100,
    pricePerPersonInr: 200 + (index % 5) * 100,
    capacity: 20,
    openingHours: { weekly: { 0: [], 1: [{ from: 600, to: 1320 }] }, confidence: "verified" as Confidence },
    availability: { leadTimeMinutes: 0, soldOutAt: null, remainingCapacity: null, bookingUrl: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    access: { step_free: true },
    diets: ["vegetarian"],
    indoor: index % 2 === 0 ? "indoor" : "outdoor",
    kidFriendly: true,
    season: null,
    bestTimeOfDay: "afternoon",
    ratingSum: 300 + (index % 4) * 20,
    reviewCount: 40 + (index % 6) * 15,
    authenticity: 0.4 + (index % 5) * 0.1,
    providerReliability: 0.5 + (index % 3) * 0.1,
    crowdProfile: 0.2 + (index % 4) * 0.15,
    provenance: fullProvenance(),
    confidence: {},
    sources: {},
    imageUrl: "",
    imageCredit: "",
    status: "Open",
    statusTone: "green",
    updated: "2026-01-01",
    ...overrides,
  };
}

/** Three tight groups, so the cluster stage has something to actually cluster. */
export const TEST_COORDINATES: [number, number][] = [
  [72.8300, 19.0500], [72.8320, 19.0520], [72.8345, 19.0480], [72.8310, 19.0555],
  [72.8700, 19.1900], [72.8725, 19.1925], [72.8690, 19.1875],
  [72.9300, 18.9500], [72.9320, 18.9520], [72.9285, 18.9480],
  [72.8500, 19.1000], [72.8520, 19.1020], [72.8480, 19.0980],
  [72.8900, 19.1200], [72.8925, 19.1225],
];

export function makeRecords(overrides: Record<number, Partial<ExperienceV2>> = {}): ExperienceV2[] {
  return TEST_COORDINATES.map((coordinates, index) => makeRecord(index, coordinates, overrides[index] ?? {}));
}

/**
 * A tighter grid than `TEST_COORDINATES`, so the candidates sit close enough
 * together that no single cluster dominates and the local search has real work.
 */
export function makeGrid(count: number, stepDegrees: number): ExperienceV2[] {
  return Array.from({ length: count }, (_, index) =>
    makeRecord(index, [72.8 + (index % 5) * stepDegrees, 18.93 + Math.floor(index / 5) * stepDegrees]),
  );
}

export function makeContext(overrides: Partial<DiscoveryContext> = {}): DiscoveryContext {
  const base: Omit<DiscoveryContext, "original"> = {
    now: "2026-02-14T15:40:00.000Z",
    origin: { coordinates: [72.8290, 19.0490], label: "Start", area: "Old Quarter" },
    availableMinutes: 300,
    deadline: null,
    budgetInr: 2000,
    partySize: 2,
    hasToddler: false,
    hasElderly: false,
    raining: false,
    weatherSeverity: "clear",
    travelMode: "auto",
    pace: "normal",
    idealStops: 3,
    minStops: 2,
    accessNeeds: [],
    diets: [],
    query: "afternoon",
    profile: makeProfile(),
    city: TEST_CITY,
  };
  const ctx = { ...base, ...overrides } as DiscoveryContext;
  ctx.original = ctx;
  return ctx;
}

const MODE_SPEED_KMH = { walk: 4.5, auto: 18, taxi: 20, metro: 16, ferry: 14 } as const;

/** Route table derived from the fixture coordinates, so km and minutes agree. */
export function makeOptions(records: ExperienceV2[], ctx: DiscoveryContext, overrides: Partial<PackOptions> = {}): PackOptions {
  const table = new Map(records.map((record) => [record.id, record.coordinates]));
  const congestion = ctx.city.congestion[ctx.travelMode];
  const speed = MODE_SPEED_KMH[ctx.travelMode];
  const leg = (from: [number, number], to: [number, number]) => {
    const km = haversineKm(from, to);
    return { km, minutes: Math.max(1, Math.round((km / speed) * 60 * congestion)) };
  };
  return {
    matrix: (aId, bId) => leg(lookup(table, aId), lookup(table, bId)),
    originMinutes: (id) => leg(ctx.origin.coordinates, lookup(table, id)),
    records,
    ...overrides,
  };
}

function lookup(table: Map<string, [number, number]>, id: string): [number, number] {
  const point = table.get(id);
  if (!point) throw new Error(`fixture: no coordinates for "${id}"`);
  return point;
}

describe("packing fixtures", () => {
  it("builds a deterministic record set with unique ids", () => {
    const records = makeRecords();
    expect(records).toHaveLength(15);
    expect(new Set(records.map((record) => record.id)).size).toBe(15);
    expect(makeRecords()).toEqual(records);
  });

  it("gives every record a provenance entry for every field", () => {
    for (const record of makeRecords()) {
      expect(Object.keys(record.provenance).sort()).toEqual([...PROVENANCE_FIELDS].sort());
    }
  });

  it("puts a name on no city so the portability scan stays clean", () => {
    expect(TEST_CITY.displayName).toBe("Test City");
    expect(JSON.stringify(TEST_CITY)).not.toMatch(/mumbai/i);
  });
});
