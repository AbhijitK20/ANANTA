import type { ExperienceV2, ProvenancedField } from "@/lib/engine";
import { CONFIDENCE_TONE, FIELD_LABEL, PROVENANCE_TONE } from "@/components/ananta/tokens";

/**
 * The nineteen provenanced fields, read off the shared label table rather than
 * typed out again. `FIELD_LABEL` is keyed by `ProvenancedField`, so its keys
 * are the union, which means a field added to the contract appears here without
 * anyone editing this file.
 */
export const PROVENANCED_FIELDS = Object.keys(FIELD_LABEL) as ProvenancedField[];

/**
 * What a saved item is, visible before any click.
 *
 * A traveller looking at their own list is checking one thing: was I were misled?
 * So the answer cannot be behind a disclosure. Four fields decide whether a
 * visit is worth planning at all, and the strip shows all four with their
 * confidence in plain text:
 *
 *   price, duration, openingHours, rating
 *
 * The tone classes come from `tokens.ts` because that is the single shared
 * vocabulary, and RULE 2 is why this file does not import the tone maps from
 * anywhere else: one definition, so a rejection on /trips and a strip on /saved
 * cannot disagree about what "unverified" looks like.
 *
 * `ponytail:` ceiling. The per-field detail below duplicates the reasoning that
 * `provenance-badge.tsx` already has, which is normally a RULE 0 style mistake.
 * It is here because that component's `field` prop currently types as `never`
 * and no caller can compile against it. See BLOCKERS/8.md. When it compiles,
 * delete `ProvenanceDetail` from this file and import theirs.
 */

/** The four fields that decide whether a saved visit is plannable. */
export const SAVED_STRIP_FIELDS: readonly ProvenancedField[] = [
  "price",
  "duration",
  "openingHours",
  "rating",
];

/** How many of a record's fields carry a non-unverified confidence. */
export function confidenceSplit(record: ExperienceV2): { known: number; total: number } {
  const known = PROVENANCED_FIELDS.filter(
    (field) => (record.confidence[field] ?? "unverified") !== "unverified",
  ).length;
  return { known, total: PROVENANCED_FIELDS.length };
}

export function ProvenanceStrip({ record }: { record: ExperienceV2 }) {
  const { known, total } = confidenceSplit(record);
  return (
    <div className="mt-4 border border-line bg-canvas p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
        {known} of {total} facts on record are known, {total - known} are unverified
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {SAVED_STRIP_FIELDS.map((field) => {
          const confidence = record.confidence[field] ?? "unverified";
          return (
            <li key={field} className="flex items-center gap-1">
              <span
                className={`inline-flex rounded-sm px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${CONFIDENCE_TONE[confidence]}`}
              >
                {FIELD_LABEL[field]}
              </span>
              <span className="text-[11px] font-semibold text-muted">{confidence}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-4 text-muted">
        Estimates are our arithmetic, not a claim by the venue. Open the place for the per-field detail.
      </p>
    </div>
  );
}

/** The full per-field detail, for the traveller who wants the reasoning. */
export function ProvenanceDetail({ record }: { record: ExperienceV2 }) {
  return (
    <details className="mt-3 border border-line">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold">
        Every field and where it came from
      </summary>
      <dl className="space-y-3 border-t border-line p-3">
        {PROVENANCED_FIELDS.map((field) => {
          const provenance = record.provenance[field];
          const confidence = record.confidence[field] ?? "unverified";
          const source = record.sources[field];
          return (
            <div key={field} className="border-b border-dashed border-line pb-3 last:border-b-0 last:pb-0">
              <dt className="flex flex-wrap items-center gap-2 text-sm font-bold">
                {FIELD_LABEL[field]}
                <span
                  className={`rounded-sm px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${PROVENANCE_TONE[provenance]}`}
                >
                  {provenance}
                </span>
                <span
                  className={`rounded-sm px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${CONFIDENCE_TONE[confidence]}`}
                >
                  {confidence}
                </span>
                {source?.asOf ? (
                  <span className="rounded-sm bg-canvas px-2 py-1 text-[11px] font-semibold text-muted">
                    as of {source.asOf}
                  </span>
                ) : null}
              </dt>
              <dd className="mt-1 text-xs leading-5 text-muted">
                {source?.note ?? "No detail recorded for this field."}
                {source?.sourceUrl ? (
                  <a
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 font-bold text-blue"
                  >
                    Open the real source
                  </a>
                ) : (
                  <span className="mt-1 block">No source URL on file. We would rather say that than link to a placeholder.</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}
