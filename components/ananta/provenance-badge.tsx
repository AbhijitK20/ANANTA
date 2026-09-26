import type { AccessNeed, Confidence, ExperienceV2, Provenance, ProvenancedField } from "@/lib/engine";
import { ACCESS_NEEDS, PROVENANCE_VALUES } from "@/lib/engine";
import {
  CONFIDENCE_TONE,
  FIELD_LABEL,
  KNOWLEDGE_LEGEND,
  PROVENANCE_TONE,
  mixedChip,
  typeScale,
} from "@/components/ananta/tokens";
import { fieldCount } from "@/components/ananta/provenance/rows";

/**
 * Provenance, per field, never per record.
 *
 * `factory.ts` writes one `confidence` sentence for the whole record, so a
 * record can claim a location matched on OpenStreetMap while every one of its
 * prices is a hash. "Price: inferred, low confidence" is a different claim from
 * "Coordinates: OSM, verified", and the traveller is the one who has to be able
 * to tell them apart.
 *
 * The tone maps are no longer declared here. `CONFIDENCE_TONE` used to exist
 * twice, once in this file and once in `why-not-that.tsx`, and two definitions
 * of one visual language drift until a badge and a rejection disagree about
 * what "unverified" looks like. Both now read `components/ananta/tokens.ts`,
 * which is the single owner. `FIELD_LABEL` and `PROVENANCE_TONE` moved there for
 * the same reason and are re-exported below so the one existing importer keeps
 * working while sessions cut over.
 */

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

const ACCESS_LABEL: Record<AccessNeed, string> = {
  step_free: "Step-free route",
  stroller_ok: "Stroller friendly",
  accessible_restroom: "Accessible restroom",
  seating_available: "Seating for the visit",
  low_walking: "Low walking",
  quiet_space: "Quiet space",
  service_animal_ok: "Service animals welcome",
};

export function accessLabel(need: string): string {
  return ACCESS_LABEL[need as AccessNeed] ?? need.replace(/_/g, " ");
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
        className={`inline-flex cursor-pointer list-none items-center gap-1 rounded-chip px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${PROVENANCE_TONE[provenance]}`}
      >
        {prefix ? `${prefix}: ` : ""}
        {FIELD_LABEL[field]}
        <span className="font-semibold normal-case tracking-normal opacity-80">{provenance}</span>
      </summary>
      <div className={`mt-2 max-w-[70ch] border border-line bg-white p-3 ${typeScale.meta} text-muted shadow-card`}>
        <p className="font-bold text-ink">{FIELD_LABEL[field]}</p>
        <p className="mt-1">{source?.note ?? "No detail recorded for this field."}</p>
        <p className="mt-2 flex flex-wrap gap-1.5">
          <span className={`rounded-chip border px-1.5 py-0.5 font-bold ${PROVENANCE_TONE[provenance]}`}>
            {provenance}
          </span>
          <span className={`rounded-chip border px-1.5 py-0.5 font-bold ${CONFIDENCE_TONE[confidence]}`}>
            {confidence}
          </span>
          {source?.asOf ? (
            <span className="rounded-chip border border-line bg-canvas px-1.5 py-0.5">as of {source.asOf}</span>
          ) : null}
        </p>
        {source?.sourceUrl ? (
          <a
            href={source.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block font-bold text-blue"
          >
            Open the real source
          </a>
        ) : (
          <p className="mt-2">
            No source URL on file. We would rather say that than link to a placeholder.
          </p>
        )}
      </div>
    </details>
  );
}

/** The detail-page block: every field that carries provenance, all of them. */
export function ProvenanceTable({ record }: { record: ExperienceV2 }) {
  const fields = Object.keys(FIELD_LABEL) as ProvenancedField[];
  const count = fieldCount(record);
  return (
    <section className="mt-6 border border-line bg-canvas p-5">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Where each fact came from</p>
      <p className={`mt-2 max-w-[70ch] ${typeScale.body} text-muted`}>
        {count.total} fields, each with its own provenance and its own source or its own
        admission that there is no source. {count.unknown} of them have nothing on record, and
        the product refuses to guess those.
      </p>
      {/*
        The mixed chip, and the rule it exists for: a record with real
        coordinates and a generated price is partly sourced, never "verified".
        Collapsing it to one state is how the catalogue summarised itself as
        verified while roughly 96 percent of its values were arithmetic.
      */}
      {count.mixed ? (
        <p className={`mt-3 ${typeScale.meta} text-muted`}>
          <span
            className={`mr-2 inline-flex items-center rounded-chip border px-2 py-0.5 font-bold uppercase tracking-[0.06em] ${mixedChip(count.verified, count.total)}`}
          >
            {count.verified} of {count.total} fields verified
          </span>
          {count.estimated} are our arithmetic, {count.unknown} are unknown. A single verdict
          would misdescribe this record.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {fields.map((field) => (
          <ProvenanceBadge key={field} record={record} field={field} />
        ))}
      </div>
    </section>
  );
}

/**
 * Accessibility metadata, or an honest statement that none is on record.
 *
 * Superseded on the detail page by `GradedAccess`, which lists all seven needs
 * instead of only the recorded ones. Kept because it is the compact form the
 * map card and the explore list want, where seven rows would be too tall.
 */
export function AccessFacts({ record }: { record: ExperienceV2 }) {
  const recorded = ACCESS_NEEDS.filter((need) => record.access[need] !== undefined);
  return (
    <section className="mt-6 border border-line p-5">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Accessibility</p>
      {recorded.length ? (
        <ul className="mt-3 space-y-2">
          {recorded.map((need) => (
            <li key={need} className="flex items-center gap-2 text-sm">
              <span className={record.access[need] ? "text-green" : "text-amber"}>
                {record.access[need] ? "Yes" : "No"}
              </span>
              {accessLabel(need)}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`mt-2 ${typeScale.body} text-muted`}>
          No step-free route, restroom, seating, or quiet-space fact is on record for this place.
          The gate raises that as an unverified fact rather than a refusal, so nothing here is a
          claim in either direction. Reporting a correction puts it in the operations queue.
        </p>
      )}
    </section>
  );
}

/**
 * The legend. The four record-level status tiers are kept verbatim because they
 * were already good, and the per-field vocabulary is added underneath them from
 * the shared token map, so this block and the chips it explains cannot drift.
 *
 * Reachable from the detail page as well as from Explore, because a sceptical
 * reader lands on a record before they land on a legend.
 */
export function ProvenanceLegend() {
  const statusTiers = [
    { label: "Verified / OSM-matched", tone: "bg-greenSoft text-green border border-green", meaning: "Checked against its source, or the pin matches the place's OpenStreetMap feature." },
    { label: "Curated / Community", tone: "bg-blueSoft text-blue border border-blue", meaning: "Hand-entered demo record, or reported by a public community submission." },
    { label: "Awaiting confirmation", tone: "bg-amberSoft text-amber border border-amber", meaning: "Operational facts (hours, price) still need a check before you rely on them." },
    { label: "Area-center pin", tone: "bg-canvas text-muted border border-dashed border-muted", meaning: "The map pin marks the neighborhood center, not the exact venue." },
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
                <span className={`inline-flex rounded-chip border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${tier.tone}`}>
                  {tier.label}
                </span>
                <p className={`mt-1.5 ${typeScale.meta} text-muted`}>{tier.meaning}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">On a per-field badge</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {PROVENANCE_VALUES.map((value) => (
              <div key={value}>
                <span className={`inline-flex rounded-chip border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${PROVENANCE_TONE[value]}`}>
                  {value}
                </span>
                <p className={`mt-1.5 ${typeScale.meta} text-muted`}>{PROVENANCE_MEANING[value]}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">On the confidence chip</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {KNOWLEDGE_LEGEND.map((entry) => (
              <div key={entry.state}>
                <span className={`inline-flex rounded-chip border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${CONFIDENCE_TONE[entry.state]}`}>
                  {entry.label}
                </span>
                <p className={`mt-1.5 ${typeScale.meta} text-muted`}>{entry.meaning}</p>
              </div>
            ))}
          </div>
          <p className={`mt-3 max-w-[70ch] ${typeScale.meta} text-muted`}>
            {CONFIDENCE_MEANING.unverified} A dashed border is the shape for &quot;we do not know&quot;. It
            is never a warning, and it is never a no.
          </p>
        </div>
      </div>
    </details>
  );
}

export { FIELD_LABEL, PROVENANCE_TONE, CONFIDENCE_TONE, KNOWLEDGE_LEGEND, mixedChip, fieldCount };
