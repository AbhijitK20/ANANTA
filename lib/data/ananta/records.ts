import type { Experience } from "@/lib/seed";
import type {
  Availability,
  ExperienceV2,
  FieldProvenance,
  ProvenancedField,
  Sourced,
} from "@/lib/engine/contracts";
import { allExperiences } from "@/lib/data";
import { zoneRows } from "@/lib/data/zones";
import { geocodedPlaces } from "@/lib/data/geocoded.generated";
import { curatedById, curatedRecordIds, type CuratedFacts } from "@/lib/data/ananta/curated";
import {
  commonsFilePage,
  estimateTravelMinutes,
  inferIndoor,
  osmSearchUrl,
  parseDurationMinutes,
  parsePriceInr,
  realUrlOrNull,
} from "@/lib/data/ananta/adapter";
import {
  buildProvenance,
  fieldSource,
  PROVENANCE_BY_BASIS,
  resolveProvenance,
  type Basis,
} from "@/lib/data/ananta/provenance";

export { curatedById, curatedRecordIds, duplicateCuratedIds } from "@/lib/data/ananta/curated";
export { fieldSource, resolveProvenance, PROVENANCE_BY_BASIS, PROVENANCED_FIELDS } from "@/lib/data/ananta/provenance";
export type { Basis } from "@/lib/data/ananta/provenance";
export type { CuratedFacts } from "@/lib/data/curated/types";

/**
 * The dataset, with every field labelled by where it came from.
 *
 * `enrich` is deterministic. It takes `now` as a parameter and calls no clock, so
 * the same input always produces the same output, which is what lets session 6's
 * drift test and the geocode workflow both be reproducible. `asOf` and
 * `availability.updatedAt` are the only places `now` appears, and they are the
 * only fields that move when the caller passes a different `now`.
 *
 * The honest summary, once, so it is not buried in a popover:
 *
 *   - Names, areas, zones, and stations are hand authored and mostly right.
 *   - About 360 of 1,100 records have a matched OpenStreetMap coordinate. The
 *     rest sit on an area anchor jittered by about 800 m.
 *   - A little over a hundred records carry hand-authored Experience facts.
 *   - Every other price, duration, and travel time is a derived estimate, and is
 *     labelled `inferred` + `estimate` so the scorer can give it no weight.
 *   - Ratings, review counts, per-person prices, and capacities are unknown
 *     almost everywhere, and are published as unknown.
 */

/** The record-level "when was this last checked" string, from the frozen seed. */
function imageCreditIsReal(credit: string): boolean {
  return credit.trim().length > 0 && credit !== "Wikimedia Commons contributor";
}

const geocodedById = new Map(geocodedPlaces.map((row) => [row.id, row]));
const anchorByArea = new Map(zoneRows.map((zone) => [zone.area, zone.coordinates]));

/** Commons file name for a record, recovered from the FilePath URL the seed built. */
function commonsFileOf(imageUrl: string): string | null {
  const match = /Special:FilePath\/([^?]+)/.exec(imageUrl);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * The per-field basis map for a record. Everything downstream reads the
 * provenance from here, so this function is the single place where a value
 * becomes either a fact or an estimate.
 */
function basesFor(
  base: Experience,
  facts: CuratedFacts | undefined,
  matched: boolean,
): Record<ProvenancedField, Basis> {
  const isCurated = facts !== undefined;
  const seedClaimedProviderSubmission = base.source === "Provider submission";
  const hasRealCredit = imageCreditIsReal(base.imageCredit);

  const curated = isCurated ? "curated_community" : "absent";
  const estimated = "hash_inferred";
  const unknown = "absent";

  return {
    // A person typed the name when the record was written. Nobody confirmed the
    // spelling with the venue, so it is community, never verified, unless a
    // curated record says otherwise.
    name: isCurated ? curated : seedClaimedProviderSubmission ? "provider_submitted" : "curated_community",
    coordinates: matched ? "osm_match" : estimated,
    // There is no address data anywhere in this repo. Say so every time.
    address: unknown,
    // The category is a human classification made when the name was authored. It
    // is not on the hash path, so it is curated rather than inferred.
    category: "curated_community",
    duration: isCurated ? curated : estimated,
    price: isCurated ? curated : estimated,
    pricePerPerson: isCurated ? curated : unknown,
    capacity: isCurated ? curated : unknown,
    openingHours: isCurated ? curated : unknown,
    accessibility: isCurated ? curated : unknown,
    // The `ExperienceV2` type does not allow this to be null, so it is inferred
    // from the name rather than left empty. Labelled as the guess it is.
    indoor: isCurated ? curated : estimated,
    kidFriendly: isCurated ? curated : unknown,
    booking: unknown,
    seasonality: isCurated ? curated : unknown,
    bestTime: isCurated ? curated : unknown,
    diet: isCurated ? curated : unknown,
    // No ratings exist anywhere in this dataset. Empty is the honest answer.
    rating: unknown,
    reviewCount: unknown,
    // The photograph is externally submitted and verified against the Commons
    // file at generation time, which is a provider-shaped fact with a real URL.
    media: hasRealCredit ? "provider_submitted" : unknown,
  };
}

/** Detail for the fields that have a real, citable source. */
function sourcesFor(
  base: Experience,
  facts: CuratedFacts | undefined,
  matched: boolean,
  now: string,
): Partial<Record<ProvenancedField, Sourced<unknown>>> {
  const sources: Partial<Record<ProvenancedField, Sourced<unknown>>> = {};
  const curated = PROVENANCE_BY_BASIS.curated_community;
  const isCurated = facts !== undefined;

  if (matched) {
    const url = osmSearchUrl(base.name, base.area);
    sources.coordinates = {
      value: base.coordinates,
      provenance: "osm",
      confidence: "verified",
      asOf: base.lastChecked,
      sourceUrl: url,
      note:
        `Matched to the OpenStreetMap element recorded as "${geocodedById.get(base.id)?.match ?? base.name}". ` +
        "The committed snapshot keeps the coordinate and the matched name, not the element id, so the link is a search a human can follow rather than a citation to a specific element.",
    };
    sources.name = {
      value: base.name,
      provenance: "osm",
      confidence: "verified",
      asOf: base.lastChecked,
      sourceUrl: url,
      note: `The name matched an OpenStreetMap element within 3.5 km of the ${base.area} anchor, which is the strongest name check we can make without asking the venue.`,
    };
  }

  if (isCurated && facts) {
    for (const field of CURATED_EXPERIENCE_FIELDS) {
      sources[field] = {
        value: null,
        provenance: curated.provenance,
        confidence: curated.confidence,
        asOf: facts.asOf,
        sourceUrl: null,
        note: facts.reviewerNote,
      };
    }
  }

  const file = commonsFileOf(base.imageUrl);
  if (file) {
    const page = commonsFilePage(file);
    sources.media = {
      value: base.imageUrl,
      provenance: "provider",
      confidence: "community",
      asOf: base.lastChecked || now,
      sourceUrl: page,
      note:
        `Area photograph from Wikimedia Commons, checked against the file at generation time. ` +
        `Credit on record: ${base.imageCredit}. Commons attribution requires naming the author, so open the file page for the photographer and the licence.`,
    };
  }

  return sources;
}

/** The Experience-layer fields a curated record is allowed to vouch for. */
const CURATED_EXPERIENCE_FIELDS: ProvenancedField[] = [
  "duration",
  "price",
  "pricePerPerson",
  "capacity",
  "openingHours",
  "accessibility",
  "indoor",
  "kidFriendly",
  "seasonality",
  "bestTime",
  "diet",
];

/**
 * Turn one frozen v1 record into an `ExperienceV2`, labelled honestly.
 *
 * `now` is a parameter, never a clock read, so two calls with the same arguments
 * produce deep-equal output.
 */
export function enrich(base: Experience, now: string): ExperienceV2 {
  const facts = curatedById.get(base.id);
  const matched = geocodedById.has(base.id);
  const { provenance, confidence } = buildProvenance(basesFor(base, facts, matched));

  const anchor = anchorByArea.get(base.area);
  const durationFromSeed = parseDurationMinutes(base.duration);
  const priceFromSeed = parsePriceInr(base.price);
  const seasonSource = facts?.season ?? null;

  const openingHours = facts
    ? { weekly: { ...facts.openingHours.weekly }, confidence: facts.openingHours.confidence, asOf: facts.asOf }
    : { weekly: {}, confidence: "unverified" as const };

  const availability: Availability = {
    // No provider has sent a booking feed, so no lead time and no booking link.
    leadTimeMinutes: 0,
    soldOutAt: null,
    remainingCapacity: facts?.capacity ?? null,
    bookingUrl: null,
    updatedAt: now,
  };

  const sources = sourcesFor(base, facts, matched, now);

  const record: ExperienceV2 = {
    id: base.id,
    name: base.name,
    area: base.area,
    city: base.city,
    zone: base.zone,
    station: base.station,
    category: base.category,
    description: base.description,

    coordinates: base.coordinates,
    // Recomputed from the record's own geometry, never taken from the v1 string,
    // because that string is a hash. See adapter.ts for the ceiling.
    travelMinutes: anchor ? estimateTravelMinutes(anchor, base.coordinates, "walk") : 1,

    durationMinutes: facts?.durationMinutes ?? durationFromSeed ?? 60,
    priceInr: facts?.priceInr ?? priceFromSeed ?? 0,
    pricePerPersonInr: facts?.pricePerPersonInr ?? null,
    capacity: facts?.capacity ?? null,

    openingHours,
    availability,
    access: facts ? { ...facts.access } : {},
    diets: facts ? [...facts.diets] : [],
    indoor: facts ? facts.indoor : inferIndoor(base.name, base.category),
    kidFriendly: facts?.kidFriendly ?? null,
    season: seasonSource ? { months: [...seasonSource.months], note: seasonSource.note } : null,
    bestTimeOfDay: facts?.bestTimeOfDay ?? "any",

    // No rating or review data exists for any record in this dataset. The
    // Wilson lower bound gets null rather than a fake vote count, which means
    // the rating component contributes zero instead of a smooth fiction.
    ratingSum: facts?.ratingSum ?? null,
    reviewCount: facts?.reviewCount ?? null,
    authenticity: facts?.authenticity ?? null,
    // Learned from an interaction stream we do not have yet.
    providerReliability: null,
    crowdProfile: facts?.crowdProfile ?? null,

    provenance: provenance as FieldProvenance,
    confidence,
    sources,

    imageUrl: base.imageUrl,
    imageCredit: base.imageCredit,
    status: base.status,
    statusTone: base.statusTone,
    updated: base.lastChecked,
  };

  return record;
}

/** The whole dataset, enriched. Same order as `allExperiences`, so ids line up. */
export const anantaRecords: ExperienceV2[] = allExperiences.map((base) =>
  // The dataset snapshot date. Passed in, never read from a clock.
  enrich(base, "2026-09-20"),
);

export const anantaById: ReadonlyMap<string, ExperienceV2> = new Map(
  anantaRecords.map((record) => [record.id, record]),
);

export { resolveProvenance as resolveFieldProvenance };
