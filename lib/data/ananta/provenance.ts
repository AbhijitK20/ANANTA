import type {
  Confidence,
  ExperienceV2,
  FieldConfidence,
  FieldProvenance,
  Provenance,
  ProvenancedField,
  Sourced,
} from "@/lib/engine/contracts";

/**
 * Where a value actually came from, and the rules that turn that into a
 * provenance and a confidence.
 *
 * The point of this file is one rule. A value produced by `hash(id) % band`, by
 * a per-category template, or by jittering an area anchor is an ESTIMATE. It is
 * never `curated`. The current dataset labelled 1,064 records "Curated record"
 * while every price, duration, and travel time on them was a hash, and that one
 * mislabelling is the difference between a dataset and a fabrication. So the
 * mapping from basis to provenance lives here, by rule, once, and `enrich` calls
 * it rather than deciding per record.
 *
 * Order of authority, strongest first:
 *
 *   1. Hand authored by a person from local knowledge, cross-checked. `curated`.
 *   2. Submitted by a provider through the form, with a real URL. `provider`.
 *   3. Matched to an OSM element. `osm`, and only for the fields OSM carries.
 *   4. Computed from facts we already have, such as two coordinates. `derived`.
 *   5. Produced by a hash, a template, or an area anchor jitter. `inferred`.
 *
 * `unverified` is a load-bearing confidence, not a softer `estimate`. It is what
 * makes `hours_unverified` a meaningful rejection instead of a guess, so an
 * absent value resolves to `unverified` and never to `estimate`.
 */

/** How a single field's value came to exist. */
export type Basis =
  /** A person wrote it from local knowledge and checked it. */
  | "curated_verified"
  /** A person wrote it from local knowledge. Not confirmed with the venue. */
  | "curated_community"
  /** A provider sent it through the form. Needs a real URL to be useful. */
  | "provider_submitted"
  /** Matched to an OpenStreetMap element during the batch geocode run. */
  | "osm_match"
  /** Haversine and the routing fallback arithmetic, computed offline. */
  | "geometry_derived"
  /** `hash(id) % band`, a per-category template, or an area anchor jitter. */
  | "hash_inferred"
  /** Deliberately unknown. Published as null, empty, or unverified on purpose. */
  | "absent";

/**
 * The only fields OpenStreetMap actually carries. Matching an OSM element
 * proves a name, a category and a coordinate. It proves nothing about a price,
 * a duration, a step-free entrance, or a vegetarian option, so an `osm_match`
 * basis on any other field is a data bug and this throws rather than letting it
 * through to the UI as a verified fact.
 */
const OSM_CARRIED_FIELDS: ReadonlySet<ProvenancedField> = new Set<ProvenancedField>([
  "name",
  "category",
  "coordinates",
]);

/** The one place a basis becomes a provenance and a confidence. */
export const PROVENANCE_BY_BASIS: Record<Basis, { provenance: Provenance; confidence: Confidence }> = {
  curated_verified: { provenance: "curated", confidence: "verified" },
  curated_community: { provenance: "curated", confidence: "community" },
  provider_submitted: { provenance: "provider", confidence: "community" },
  osm_match: { provenance: "osm", confidence: "verified" },
  geometry_derived: { provenance: "derived", confidence: "estimate" },
  hash_inferred: { provenance: "inferred", confidence: "estimate" },
  absent: { provenance: "inferred", confidence: "unverified" },
};

export function resolveProvenance(field: ProvenancedField, basis: Basis): { provenance: Provenance; confidence: Confidence } {
  if (basis === "osm_match" && !OSM_CARRIED_FIELDS.has(field)) {
    throw new Error(
      `Refusing to call ${field} an OpenStreetMap fact. OSM carries a name, a category and a coordinate. ` +
        `It does not carry ${field}, so a match on an OSM element cannot verify it.`,
    );
  }
  return PROVENANCE_BY_BASIS[basis];
}

/**
 * How much to believe an inferred or derived number, 0 to 1. Nothing in this
 * dataset scores above 0.6 unless a person checked it. The `Provenance` union has
 * no `unknown` member, so a deliberately absent field lands on `inferred` +
 * `unverified`; the note is what tells the truth. Logged as a session 8 blocker.
 */
export const BASIS_SCORE: Partial<Record<Basis, number>> = {
  geometry_derived: 0.45,
  hash_inferred: 0.2,
  absent: 0,
};

/**
 * One honest sentence per basis, reused across all 1,100 records so the strings
 * are shared rather than allocated 19 times per record. No em dashes.
 */
const BASIS_NOTE: Record<Basis, string> = {
  curated_verified: "Written by a person from local knowledge and cross-checked.",
  curated_community: "Written by a person from local knowledge. Not confirmed with the venue, so treat it as a good guide rather than a fact.",
  provider_submitted: "Sent to us through the provider form. The submission carried no working link, so there is nothing to cite.",
  osm_match: "Matched to a named OpenStreetMap element during the monthly geocode run. The snapshot keeps the coordinates, not the element id, so the link below is a search rather than a citation.",
  geometry_derived: "Computed from this record's own coordinates using the same straight-line arithmetic as the offline routing fallback. It is an estimate of distance, not a measured route.",
  hash_inferred: "Picked by a hash of the record id from a fixed band. It is an order-of-magnitude guess produced for layout, and it is not a claim by anybody.",
  absent: "Unknown, and left that way on purpose. We publish no value rather than a plausible one, so the planner can refuse instead of guessing.",
};

/**
 * Field-specific overrides where the generic sentence would be vague. Anything
 * not listed here uses the basis note, which is already specific about the
 * method, which is the part that matters.
 */
const FIELD_NOTE: Partial<Record<ProvenancedField, string>> = {
  address: "We store no street address for any record. The area and the nearest station are known; the door is not, so this stays empty.",
  capacity: "No capacity figure for this record. The gate needs one to enforce a group size, so it should abstain rather than assume everyone fits.",
  rating: "No rating exists for this record anywhere in our sources, so the Bayesian smoothing has nothing to smooth. The score stays empty rather than becoming a default.",
  reviewCount: "No review count exists for this record, which is the same gap as the rating and for the same reason.",
  openingHours: "No opening hours for this record. We publish no schedule rather than an invented one, so the gate can refuse on an unverified opening claim.",
  bestTime: "No time-of-day guidance for this record. Any is not the same as any time: it means we have no opinion, and the engine must not read it as permission to come at 3am.",
  indoor: "Indoor or outdoor is worked out from the category and the matched map name, not from the venue. It is a reasonable guess and it is still a guess.",
  diet: "No diet information for this record. An empty list means we have not asked, which is not the same as the venue having no options.",
  kidFriendly: "No child-suitability figure for this record. An empty answer means unasked, not unsuitable.",
  booking: "No booking link for this record. The venue either does not take bookings or has not sent us one, and we do not guess at either.",
  seasonality: "No season window for this record, so the engine cannot reason about a seasonal mismatch and should not claim it can.",
  accessibility: "No accessibility information for this record. Every access need therefore has to be treated as unknown rather than satisfied, which is why the gate is allowed to refuse here.",
  media: "Area photograph from Wikimedia Commons, verified against the file at generation time. The credit is the photographer named on the Commons file page, and the licence is theirs to check.",
  price: "No price for this record. Venues change prices constantly and none of them told us, so the honest answer is that we do not know.",
  pricePerPerson: "No per-person price for this record. Entry and cover charges are set per venue and change without notice, so we do not publish a figure.",
  duration: "No duration for this record. How long a visit takes depends on who is looking and how fast they walk, so we refuse to state one.",
  coordinates: "The area centre jittered by a fixed offset, not the venue. It places the record in roughly the right spot on a map and is honest about being an approximation.",
  name: "The name as authored in the place list. A person typed it from local knowledge, and nobody has confirmed the spelling or the trading name with the venue.",
  category: "The category as authored in the place list. It is a human classification of the name, made when the record was written, and it is never produced by a hash.",
};

/** Shared, so 1,100 records point at one string per field rather than 21,000 copies. */
const NOTE_CACHE = new Map<string, string>();
function noteFor(field: ProvenancedField, basis: Basis): string {
  const key = field + "|" + basis;
  const hit = NOTE_CACHE.get(key);
  if (hit !== undefined) return hit;
  const note = FIELD_NOTE[field] ?? BASIS_NOTE[basis];
  NOTE_CACHE.set(key, note);
  return note;
}

/** Every provenanced field, in the order the UI walks them. */
export const PROVENANCED_FIELDS: readonly ProvenancedField[] = [
  "name",
  "coordinates",
  "address",
  "category",
  "duration",
  "price",
  "pricePerPerson",
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
];

/**
 * Build the full provenance and confidence maps from a per-field basis map.
 * `bases` must have an entry for all 19 fields, which is what makes a missing
 * entry a test failure rather than a silent undefined.
 */
export function buildProvenance(
  bases: Record<ProvenancedField, Basis>,
): { provenance: FieldProvenance; confidence: FieldConfidence } {
  const provenance = {} as FieldProvenance;
  const confidence: FieldConfidence = {};
  for (const field of PROVENANCED_FIELDS) {
    const basis = bases[field];
    const resolved = PROVENANCE_BY_BASIS[basis];
    provenance[field] = resolved.provenance;
    confidence[field] = resolved.confidence;
  }
  return { provenance, confidence };
}

/** The live value of one field, for the provenance popover. */
export function valueOf(record: ExperienceV2, field: ProvenancedField): unknown {
  switch (field) {
    case "name": return record.name;
    case "coordinates": return record.coordinates;
    case "address": return null;
    case "category": return record.category;
    case "duration": return record.durationMinutes;
    case "price": return record.priceInr;
    case "pricePerPerson": return record.pricePerPersonInr;
    case "capacity": return record.capacity;
    case "openingHours": return record.openingHours;
    case "accessibility": return record.access;
    case "indoor": return record.indoor;
    case "kidFriendly": return record.kidFriendly;
    case "booking": return record.availability.bookingUrl;
    case "seasonality": return record.season;
    case "bestTime": return record.bestTimeOfDay;
    case "diet": return record.diets;
    case "rating": return record.ratingSum;
    case "reviewCount": return record.reviewCount;
    case "media": return record.imageUrl;
    default: return null;
  }
}

/**
 * Per-field source detail for the provenance popover.
 *
 * `record.sources` carries the fields that have a real, citable source: an OSM
 * match, a provider submission, a Commons file, or a curated reviewer note.
 * Fields with no source are synthesised here from the record's own provenance
 * map, so a field can never come back null just because nobody wrote a note.
 */
export function fieldSource(record: ExperienceV2, field: ProvenancedField): Sourced<unknown> | null {
  const stored = record.sources[field];
  if (stored) return stored;
  const provenance = record.provenance[field];
  const confidence = record.confidence[field] ?? "unverified";
  if (!provenance) return null;
  const basis = basisFor(provenance, confidence);
  const out: Sourced<unknown> = {
    value: valueOf(record, field),
    provenance,
    confidence,
    sourceUrl: null,
    note: noteFor(field, basis),
  };
  const score = BASIS_SCORE[basis];
  if (score !== undefined && score > 0) out.score = score;
  if (provenance === "inferred") out.asOf = record.updated;
  return out;
}

/**
 * Recover the basis from a record, so a synthesised note is the same note the
 * record would have carried at build time. `records.ts` writes the basis into
 * `sources[field].note` only for fields that have a real source, so this
 * inverts the resolution to pick the matching generic note.
 */
function basisFor(provenance: Provenance, confidence: Confidence): Basis {
  switch (provenance) {
    case "curated": return confidence === "verified" ? "curated_verified" : "curated_community";
    case "provider": return "provider_submitted";
    case "osm": return "osm_match";
    case "derived": return "geometry_derived";
    default: return confidence === "unverified" ? "absent" : "hash_inferred";
  }
}
