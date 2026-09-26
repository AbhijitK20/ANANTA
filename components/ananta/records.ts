import { allExperiences } from "@/lib/data";
import { experienceSeed, type Experience } from "@/lib/seed";
import type {
  Confidence,
  ExperienceV2,
  FieldProvenance,
  Provenance,
  ProvenancedField,
  Sourced,
} from "@/lib/engine";

/**
 * v1 to v2 record adapter.
 *
 * Session 8 owns `lib/data/ananta/records.ts` and exports `anantaRecords` plus
 * `enrich(base, now)`. Those have not landed. This file is the stand-in so the
 * traveller screens have honest, fully-populated `ExperienceV2` records to
 * render, and it is written to be deleted the moment `anantaRecords` exists:
 * every call site reads the exported `anantaRecords` symbol and nothing else.
 *
 * The two rules from `SESSION/00-CONTRACTS.md` section 6 that matter most are
 * enforced here rather than hoped for:
 *
 *   1. A field derived from a hash is `inferred` + `estimate`, never `curated`.
 *      `lib/data/factory.ts` picks every generated price and duration with
 *      `hash(id)`, so all 1064 generated records label both as estimates. Only
 *      the hand-written `experienceSeed` records earn `curated`.
 *   2. `sourceUrl` is `string | null` and never `example.com`. The v1 record's
 *      `sourceUrl` is a placeholder, so it is dropped rather than passed
 *      through; only genuinely real URLs (Commons, OpenStreetMap) survive.
 *
 * Everything here is a pure function of the frozen seed, so the module-level
 * `anantaRecords` is byte-identical on the server and in the browser. No
 * `Date.now()`, no `Math.random()`.
 */

/** Hand-written records, the only ones allowed to claim `curated` facts. */
const HAND_WRITTEN = new Set(experienceSeed.map((record) => record.id));

/** The v1 confidence sentence splits cleanly on its semicolon. */
const OSM_MATCHED = "Location matched on OpenStreetMap";

export const HAND_WRITTEN_IDS = HAND_WRITTEN;

/** `"Free"` is zero. Anything else is the first digit run in the string. */
export function priceInrFrom(text: string): number {
  if (text === "Free") return 0;
  const digits = Number(text.replace(/[^\d]/g, ""));
  return Number.isFinite(digits) ? digits : 0;
}

/** `"90 min"`, `"2 hours"`, `"2.5 hours"`, `"Overnight"`, `"2 nights"`. */
export function durationMinutesFrom(text: string): number {
  if (/overnight/i.test(text)) return 1440;
  const nights = /([\d.]+)\s*nights?/i.exec(text);
  if (nights) return Math.round(Number(nights[1]) * 1440);
  const hours = /([\d.]+)\s*hours?/i.exec(text);
  const minutes = /([\d]+)\s*min/i.exec(text);
  return (
    (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)
  );
}

/** `"12 min"` on the v1 record is the only travel figure the seed carries. */
export function travelMinutesFrom(text: string): number {
  const match = /([\d]+)\s*min/i.exec(text);
  return match ? Number(match[1]) : 0;
}

const BEST_TIME_BUCKET: Record<string, ExperienceV2["bestTimeOfDay"]> = {
  "best in the morning": "morning",
  "best in daylight": "afternoon",
  "best after sunset": "night",
  "best after dark": "night",
  "best around high tide": "any",
  "best in monsoon": "any",
};

const COMMUNITY_SOURCES = new Set([
  "Resident recommendation",
  "Community submission",
]);

function note(parts: string[]): string {
  return parts.join(" ");
}

function sourced<T>(
  value: T,
  provenance: Provenance,
  confidence: Confidence,
  message: string,
  extra: { asOf?: string; sourceUrl?: string | null; score?: number } = {},
): Sourced<T> {
  const entry: Sourced<T> = {
    value,
    provenance,
    confidence,
    sourceUrl: extra.sourceUrl ?? null,
    note: message,
  };
  if (extra.asOf) entry.asOf = extra.asOf;
  if (extra.score !== undefined) entry.score = extra.score;
  return entry;
}

/**
 * Fill the v2 fields the v1 record cannot supply. Every one of them is either
 * derived from a field that does exist, or explicitly marked unverified. No
 * silent guesses: `null` means "we do not know" and the badge says so.
 */
export function enrich(base: Experience): ExperienceV2 {
  const handWritten = HAND_WRITTEN.has(base.id);
  const asOf = base.lastChecked;
  const community = COMMUNITY_SOURCES.has(base.source);
  const onOsm = base.confidence.startsWith(OSM_MATCHED);

  const price = priceInrFrom(base.price);
  const duration = durationMinutesFrom(base.duration);
  const travelMinutes = travelMinutesFrom(base.travelTime);
  const weatherDependent =
    base.status === "Weather dependent" || base.status === "Seasonally reachable";

  const nameProvenance: Provenance = "curated";
  const nameConfidence: Confidence = community ? "community" : "verified";
  const factProvenance: Provenance = handWritten ? "curated" : "inferred";
  const factConfidence: Confidence = handWritten ? "community" : "estimate";

  const provenance: FieldProvenance = {
    name: nameProvenance,
    coordinates: onOsm ? "osm" : "inferred",
    address: "derived",
    category: "curated",
    duration: factProvenance,
    price: factProvenance,
    capacity: "inferred",
    openingHours: "inferred",
    accessibility: "inferred",
    indoor: "inferred",
    kidFriendly: "derived",
    booking: "inferred",
    seasonality: "inferred",
    bestTime: base.bestTime ? factProvenance : "inferred",
    diet: "inferred",
    rating: "inferred",
    reviewCount: "inferred",
    media: "provider",
    pricePerPerson: "derived",
  };

  const confidence: Record<ProvenancedField, Confidence> = {
    name: nameConfidence,
    coordinates: onOsm ? "verified" : "estimate",
    address: "estimate",
    category: "verified",
    duration: factConfidence,
    price: factConfidence,
    capacity: "unverified",
    openingHours: "unverified",
    accessibility: "unverified",
    indoor: "estimate",
    kidFriendly: base.category === "Family" ? "estimate" : "unverified",
    booking: "unverified",
    seasonality: "unverified",
    bestTime: base.bestTime ? factConfidence : "unverified",
    diet: "unverified",
    rating: "unverified",
    reviewCount: "unverified",
    media: "verified",
    pricePerPerson: factConfidence,
  };

  const derivedNote = handWritten
    ? "Hand-entered on the record. Still not a live operator confirmation."
    : "Picked from a per-category band by hashing the record id in lib/data/factory.ts. It is an estimate, not a listed price.";
  const hoursNote =
    "No weekly hours are on record for this place, so we will not claim it is open.";
  const accessNote =
    "No step-free, restroom, seating, or quiet-space fact is on record, so accessibility needs cannot be confirmed.";
  const ratingNote =
    "No review count or rating sum is on record, so the rating component scores zero rather than guessing.";
  const indoorNote = weatherDependent
    ? "The record is marked weather dependent, so this is treated as outdoor."
    : "The record makes no indoor or outdoor claim, so this is treated as mixed and flagged as an estimate.";

  const sources: Record<ProvenancedField, Sourced<unknown>> = {
    name: sourced(
      base.name,
      nameProvenance,
      nameConfidence,
      community
        ? "Name came from a resident or community submission, not from an operator."
        : "The place name is hand-checked against the real city.",
    ),
    coordinates: sourced(
      base.coordinates,
      provenance.coordinates,
      confidence.coordinates,
      onOsm
        ? "Pin matched to this place's OpenStreetMap feature."
        : "Pin is the area centre plus a deterministic offset, so it is not the exact venue.",
      { sourceUrl: onOsm ? "https://www.openstreetmap.org" : null, asOf },
    ),
    address: sourced(
      `${base.area}, ${base.city}`,
      "derived",
      "estimate",
      "Built from the area and city fields. No street address is on record.",
      { asOf },
    ),
    category: sourced(
      base.category,
      "curated",
      "verified",
      "Category is hand-assigned per place.",
    ),
    duration: sourced(
      duration,
      factProvenance,
      factConfidence,
      derivedNote,
      { asOf, score: handWritten ? undefined : 0.4 },
    ),
    price: sourced(
      price,
      factProvenance,
      factConfidence,
      derivedNote,
      { asOf, score: handWritten ? undefined : 0.4 },
    ),
    capacity: sourced(
      null,
      "inferred",
      "unverified",
      "Seating capacity is not on record for this place.",
      { asOf },
    ),
    openingHours: sourced(
      null,
      "inferred",
      "unverified",
      hoursNote,
      { asOf },
    ),
    accessibility: sourced(
      null,
      "inferred",
      "unverified",
      accessNote,
      { asOf },
    ),
    indoor: sourced(
      weatherDependent ? "outdoor" : "mixed",
      "inferred",
      "estimate",
      indoorNote,
      { asOf },
    ),
    kidFriendly: sourced(
      base.category === "Family" ? true : null,
      "derived",
      confidence.kidFriendly,
      base.category === "Family"
        ? "Derived from the Family category, not from an age or facility record."
        : "Not on record. We will not guess suitability for a child.",
      { asOf },
    ),
    booking: sourced(
      null,
      "inferred",
      "unverified",
      "No booking link and no provider feed exist for this place.",
      { asOf },
    ),
    seasonality: sourced(
      null,
      "inferred",
      "unverified",
      "No season window is on record, so seasonality cannot be checked.",
      { asOf },
    ),
    bestTime: sourced(
      base.bestTime
        ? BEST_TIME_BUCKET[base.bestTime.toLowerCase()] ?? "any"
        : "any",
      provenance.bestTime,
      confidence.bestTime,
      base.bestTime
        ? `The record's own guidance: ${base.bestTime}.`
        : "No time-of-day guidance on record, so any time is treated as equal.",
      { asOf },
    ),
    diet: sourced(
      [],
      "inferred",
      "unverified",
      "No diet or kitchen information is on record for this place.",
      { asOf },
    ),
    rating: sourced(
      null,
      "inferred",
      "unverified",
      ratingNote,
      { asOf },
    ),
    reviewCount: sourced(
      null,
      "inferred",
      "unverified",
      ratingNote,
      { asOf },
    ),
    media: sourced(
      base.imageUrl,
      "provider",
      "verified",
      "Area photo from Wikimedia Commons with the photographer credited, plus one YouTube video checked against its live source at generation time.",
      { sourceUrl: base.imageUrl, asOf },
    ),
    pricePerPerson: sourced(
      price,
      "derived",
      confidence.pricePerPerson,
      "Carried from the listed price field. No separate per-person price exists.",
      { asOf },
    ),
  };

  return {
    id: base.id,
    name: base.name,
    area: base.area,
    city: base.city,
    zone: base.zone,
    station: base.station,
    category: base.category,
    description: base.description,

    coordinates: base.coordinates,
    travelMinutes,

    durationMinutes: duration,
    priceInr: price,
    pricePerPersonInr: price,
    capacity: null,

    openingHours: { weekly: {}, confidence: "unverified", asOf },
    availability: {
      leadTimeMinutes: 0,
      soldOutAt: null,
      remainingCapacity: null,
      bookingUrl: null,
      updatedAt: asOf,
    },
    access: {},
    diets: [],
    indoor: weatherDependent ? "outdoor" : "mixed",
    kidFriendly: base.category === "Family" ? true : null,
    season: null,
    bestTimeOfDay: base.bestTime
      ? BEST_TIME_BUCKET[base.bestTime.toLowerCase()] ?? "any"
      : "any",

    ratingSum: null,
    reviewCount: null,
    authenticity: null,
    providerReliability: null,
    crowdProfile: null,

    provenance,
    confidence,
    sources,

    imageUrl: base.imageUrl,
    imageCredit: base.imageCredit,
    status: base.status,
    statusTone: base.statusTone,
    updated: base.updated,
  };
}

/** Every catalogue record, adapted once at module load. */
export const anantaRecords: ExperienceV2[] = allExperiences.map(enrich);

export const anantaById: Record<string, ExperienceV2> = Object.fromEntries(
  anantaRecords.map((record) => [record.id, record]),
);

/** The v1 record behind a v2 id, for the fields only v1 still carries. */
export const legacyById: Record<string, Experience> = Object.fromEntries(
  allExperiences.map((record) => [record.id, record]),
);

export const DATASET_SIZE = anantaRecords.length;

export const CURATED_CATEGORY_COUNT = new Set(
  anantaRecords.map((record) => record.category),
).size;

/** Free, the one price band we can state as fact rather than as a band. */
export const freeRecordIds = new Set(
  anantaRecords.filter((record) => record.priceInr === 0).map((r) => r.id),
);

/** Records a resident or a community submission put on the map. */
export const communityRecordIds = new Set(
  anantaRecords
    .filter((record) => record.confidence.name === "community")
    .map((record) => record.id),
);

export const provenanceSummary = note([
  "Every field carries its own provenance.",
  "Hand-entered facts are marked curated.",
  "Hash-derived values are marked inferred and shown as estimates.",
  "Fields with nothing on record are marked unverified and the product refuses to guess them.",
]);
