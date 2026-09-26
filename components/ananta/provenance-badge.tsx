import type { Confidence, ExperienceV2, Provenance, ProvenancedField } from "@/lib/engine";
import { ACCESS_NEEDS, PROVENANCE_VALUES } from "@/lib/engine";

/**
 * Provenance, per field, never per record.
 *
 * `factory.ts` writes one `confidence` sentence for the whole record, so a
 * record can claim a location matched on OpenStreetMap while every one of its
 * prices is a hash. "Price: inferred, low confidence" is a different claim from
 * "Coordinates: OSM, verified", and the traveller is the one who has to be able
 * to tell them apart.
 */

export const FIELD_LABEL: Record<ProvenancedField, string> = {
  name: "Name",
  coordinates: "Coordinates",
  address: "Address",
  category: "Category",
  duration: "Duration",
  price: "Price",
  capacity: "Capacity",
  openingHours: "Opening hours",
  accessibility: "Accessibility",
  indoor: "Indoor or outdoor",
  kidFriendly: "Suitable for a child",
  booking: "Booking",
  seasonality: "Season",
  bestTime: "Best time of day",
  diet: "Diet options",
  rating: "Rating",
  reviewCount: "Review count",
  media: "Photos and video",
  pricePerPerson: "Price per person",
};

const PROVENANCE_TONE: Record<Provenance, string> = {
  curated: "bg-blueSoft text-blue",
  provider: "bg-blueSoft text-blue",
  osm: "bg-greenSoft text-green",
  inferred: "bg-amberSoft text-amber",
  derived: "bg-canvas text-muted",
};

const CONFIDENCE_TONE: Record<Confidence, string> = {
  verified: "bg-greenSoft text-green",
  community: "bg-blueSoft text-blue",
  estimate: "bg-amberSoft text-amber",
  unverified: "bg-canvas text-muted",
};

const PROVENANCE_MEANING: Record<Provenance, string> = {
  curated: "Hand-entered on the record. Checked by a person, not by a formula.",
  provider: "Supplied by the venue or the operator, not by us.",
  osm: "Matched to the place's OpenStreetMap feature.",
  inferred: "Filled in by a deterministic rule. It is a labelled estimate, not a listed fact.",
  derived: "Computed from other fields on the record rather than supplied on its own.",
};

const CONFIDENCE_MEANING: Record<Confidence, string> = {
  verified: "Checked against its source.",
  community: "Reported by a resident, a visitor, or a community submission.",
  estimate: "A modelled value. Treat it as a range, not a number.",
  unverified: "Nothing is on record. The product will not guess, and the gate will refuse where it matters.",
};

const ACCESS_LABEL: Record<(typeof ACCESS_NEEDS)[number], string> = {
  step_free: "Step-free route",
  stroller_ok: "Stroller friendly",
  accessible_restroom: "Accessible restroom",
  seating_available: "Seating for the visit",
  low_walking: "Low walking",
  quiet_space: "Quiet space",
  service_animal_ok: "Service animals welcome",
};

export function accessLabel(need: string): string {
  return ACCESS_LABEL[need as (typeof ACCESS_NEEDS)[number]] ?? need.replace(/_/g, " ");
}

export function confidenceTone(confidence: Confidence): string {
  return CONFIDENCE_TONE[confidence];
}

/** A per-field badge. The note in the popover is the sentence, not a label. */
export function ProvenanceBadge({
  record,
  field,
  prefix,
}: {
  record: ExperienceV2;
  field: ProvenancedField;
  prefix?: string;
}) {
  const source = record.sources[field];
  const provenance = record.provenance[field];
  const confidence = record.confidence[field] ?? "unverified";
  return (
    <details className="group inline-block align-top">
      <summary
        className={`inline-flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${PROVENANCE_TONE[provenance]}`}
      >
        {prefix ? `${prefix}: ` : ""}
        {FIELD_LABEL[field]}
        <span className="font-semibold normal-case tracking-normal opacity-80">{provenance}</span>
      </summary>
      <div className="mt-2 max-w-[320px] border border-line bg-white p-3 text-xs leading-5 text-muted shadow-card">
        <p className="font-bold text-ink">{FIELD_LABEL[field]}</p>
        <p className="mt-1">{source?.note ?? "No detail recorded for this field."}</p>
        <p className="mt-2 flex flex-wrap gap-1.5">
          <span className={`rounded px-1.5 py-0.5 font-bold ${PROVENANCE_TONE[provenance]}`}>{provenance}</span>
          <span className={`rounded px-1.5 py-0.5 font-bold ${CONFIDENCE_TONE[confidence]}`}>{confidence}</span>
          {source?.asOf && <span className="rounded bg-canvas px-1.5 py-0.5">as of {source.asOf}</span>}
        </p>
        {source?.sourceUrl ? (
          <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-bold text-blue">
            Open the real source
          </a>
        ) : (
          <p className="mt-2">No source URL on file. We would rather say that than link to a placeholder.</p>
        )}
      </div>
    </details>
  );
}

/** The detail-page block: every field that carries provenance, all of them. */
export function ProvenanceTable({ record }: { record: ExperienceV2 }) {
  const fields = Object.keys(FIELD_LABEL) as ProvenancedField[];
  const unverified = fields.filter((field) => (record.confidence[field] ?? "unverified") === "unverified");
  return (
    <section className="mt-6 border border-line bg-[#fbfcfd] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Where each fact came from</p>
      <p className="mt-2 text-sm leading-6 text-muted">
        {fields.length} fields, each with its own provenance. {unverified.length} of them have nothing on
        record, and the product refuses to guess those.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {fields.map((field) => (
          <ProvenanceBadge key={field} record={record} field={field} />
        ))}
      </div>
    </section>
  );
}

/** Accessibility metadata, or an honest statement that none is on record. */
export function AccessFacts({ record }: { record: ExperienceV2 }) {
  const recorded = ACCESS_NEEDS.filter((need) => record.access[need] !== undefined);
  return (
    <section className="mt-6 border border-line p-5">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Accessibility</p>
      {recorded.length ? (
        <ul className="mt-3 space-y-2">
          {recorded.map((need) => (
            <li key={need} className="flex items-center gap-2 text-sm">
              <span className={record.access[need] ? "text-green" : "text-amber"}>{record.access[need] ? "Yes" : "No"}</span>
              {accessLabel(need)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted">
          No step-free route, restroom, seating, or quiet-space fact is on record for this place. The gate
          raises that as an unverified fact rather than a refusal, so nothing here is a claim in either
          direction. Reporting a correction puts it in the operations queue.
        </p>
      )}
    </section>
  );
}

/**
 * The legend. The four record-level status tiers are kept verbatim because they
 * were already good, and the per-field vocabulary is added underneath them.
 */
export function ProvenanceLegend() {
  const statusTiers = [
    { label: "Verified / OSM-matched", tone: "bg-greenSoft text-green", meaning: "Checked against its source, or the pin matches the place's OpenStreetMap feature." },
    { label: "Curated / Community", tone: "bg-blueSoft text-blue", meaning: "Hand-entered demo record, or reported by a public community submission." },
    { label: "Awaiting confirmation", tone: "bg-amberSoft text-amber", meaning: "Operational facts (hours, price) still need a check before you rely on them." },
    { label: "Area-center pin", tone: "bg-canvas text-muted", meaning: "The map pin marks the neighborhood center, not the exact venue." },
  ] as const;
  return (
    <details className="mt-5 border border-line bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold">
        What the confidence and provenance labels mean
      </summary>
      <div className="space-y-5 border-t border-line px-4 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">On the status label</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {statusTiers.map((tier) => (
              <div key={tier.label}>
                <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${tier.tone}`}>
                  {tier.label}
                </span>
                <p className="mt-1.5 text-xs leading-5 text-muted">{tier.meaning}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">On a per-field badge</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {PROVENANCE_VALUES.map((value) => (
              <div key={value}>
                <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${PROVENANCE_TONE[value]}`}>
                  {value}
                </span>
                <p className="mt-1.5 text-xs leading-5 text-muted">{PROVENANCE_MEANING[value]}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">On the confidence chip</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {(Object.keys(CONFIDENCE_MEANING) as Confidence[]).map((value) => (
              <div key={value}>
                <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${CONFIDENCE_TONE[value]}`}>
                  {value}
                </span>
                <p className="mt-1.5 text-xs leading-5 text-muted">{CONFIDENCE_MEANING[value]}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
