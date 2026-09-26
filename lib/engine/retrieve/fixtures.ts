/**
 * Test fixtures for the retrieval stage.
 *
 * Not a `.test.ts` file, because six test files need the same record factory and
 * importing a `.test.ts` from another `.test.ts` registers its cases twice. The
 * stage barrel does not re-export it, so no product code can reach a fixture.
 *
 * Records are built field by field with no cast, so if a field is renamed in the
 * contracts every test here fails to compile rather than silently testing a
 * shape that no longer exists.
 *
 * Locality names appear only in fixtures, and only where a test has to name a
 * real place. No engine source file contains a city, a neighbourhood or a
 * station name.
 */

import type { CityManifest, ExperienceV2, FieldProvenance, ProvenancedField } from "@/lib/engine/contracts";

const PROVENANCE_FIELDS: ProvenancedField[] = [
  "name", "coordinates", "address", "category", "duration", "price", "capacity", "openingHours",
  "accessibility", "indoor", "kidFriendly", "booking", "seasonality", "bestTime", "diet", "rating",
  "reviewCount", "media", "pricePerPerson",
];

function provenance(field: ProvenancedField): FieldProvenance {
  const out = {} as FieldProvenance;
  for (const key of PROVENANCE_FIELDS) out[key] = "curated";
  out[field] = "curated";
  return out;
}

export type RecordOverrides = Partial<ExperienceV2> & Pick<ExperienceV2, "id" | "name">;

/** A complete record. Overrides are shallow; nested objects are replaced whole. */
export function makeRecord(overrides: RecordOverrides): ExperienceV2 {
  return {
    area: "Testside",
    city: "Testville",
    zone: "Testside Zone",
    station: "Test Central",
    category: "Nature",
    description: "A quiet place to walk.",
    coordinates: [72.9, 19.05],
    travelMinutes: 20,
    durationMinutes: 60,
    priceInr: 200,
    pricePerPersonInr: 100,
    capacity: 40,
    openingHours: { weekly: { 0: [], 1: [{ from: 540, to: 1260 }] }, confidence: "verified" },
    availability: { leadTimeMinutes: 0, soldOutAt: null, remainingCapacity: null, bookingUrl: null, updatedAt: "2026-01-01" },
    access: { step_free: true },
    diets: ["vegetarian"],
    indoor: "outdoor",
    kidFriendly: true,
    season: null,
    bestTimeOfDay: "morning",
    ratingSum: 400,
    reviewCount: 100,
    authenticity: 0.8,
    providerReliability: null,
    crowdProfile: null,
    provenance: provenance("name"),
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

/**
 * A synthetic city. The neighbourhood anchors and the one ferry corridor are
 * copied from the real `lib/engine/contracts/manifest.ts` values, so a test that
 * proves the corridor wins against the straight-line estimate is proving it
 * against the shape of the real problem. Every other number here is invented
 * for a test.
 */
export const TEST_MANIFEST: CityManifest = {
  id: "testville",
  displayName: "Testville",
  currency: "INR",
  timezone: "Asia/Kolkata",
  bbox: [72.8, 18.9, 73.1, 19.2],
  neighbourhoods: [
    { name: "Testside", coordinates: [72.9, 19.05], station: "Test Central" },
    { name: "Nerul/Seawoods", coordinates: [73.0142, 19.0365], station: "Nerul" },
    { name: "Belapur", coordinates: [73.0276, 19.0151], station: "Belapur" },
  ],
  monsoonMonths: [6, 7, 8, 9],
  congestion: { walk: 1, auto: 1.9, taxi: 1.9, metro: 1.15, ferry: 1 },
  ferryCorridors: [{ from: "Nerul/Seawoods", to: "Belapur", minutes: 12 }],
  notes: "Synthetic manifest for retrieval tests. Anchors and the corridor mirror the real manifest.",
};

/** A catalogue of `count` generated records, deterministic, for build cost work. */
export function makeManyRecords(count: number): ExperienceV2[] {
  const out: ExperienceV2[] = [];
  for (let i = 0; i < count; i += 1) {
    const n = String(i).padStart(4, "0");
    out.push(
      makeRecord({
        id: `synthetic-${n}`,
        name: `Synthetic Place ${n}`,
        area: `Area ${i % 23}`,
        zone: `Zone ${i % 7}`,
        station: `Station ${i % 11}`,
        category: ["Nature", "Food", "Culture", "Workshop", "Family", "Nightlife"][i % 6],
        description: `A generated description number ${n} about trails, food and local art in area ${i % 23}.`,
        coordinates: [72.8 + (i % 40) * 0.0075, 18.95 + (i % 30) * 0.0085],
        priceInr: (i % 12) * 150,
      }),
    );
  }
  return out;
}
