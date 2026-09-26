import type { ExperienceV2 } from "@/lib/engine";
import {
  CONFIDENCE_TONE,
  FIELD_LABEL,
  PROVENANCE_TONE,
  TONE_TEXT,
  typeScale,
} from "@/components/ananta/tokens";
import { ProvenanceBadge, accessLabel } from "@/components/ananta/provenance-badge";
import {
  ABSENT_LABEL,
  accessRecordedCount,
  accessRows,
  absenceCount,
  fieldCount,
  gradedRows,
  verdictOf,
  type GradedRow,
  type Verdict,
} from "./rows";

/**
 * The graded-facts table. This is the product.
 *
 * One row per field, and on every row a badge for that field and not for the
 * record. A record with OpenStreetMap coordinates and a hash-derived price has
 * two different stories to tell, and a single badge at the top of the page can
 * only tell one of them.
 *
 * The absence row is the one that matters. It reads as a designed answer, not as
 * a failure: a dashed chip, the words "Not recorded", and a sentence saying what
 * the product will not do with the gap. See `SESSION/UI-UX-DESIGN.md` section 4,
 * which is entirely about getting this one row right.
 */

const VERDICT_TONE: Record<Verdict, string> = {
  yes: "text-green",
  no: "text-amber",
  "not-recorded": "text-muted",
};

function ValueCell({ row }: { row: GradedRow }) {
  const absence = verdictOf(row) === "not-recorded";
  return (
    <div className="min-w-0">
      <p
        className={`${typeScale.body} font-semibold ${absence ? "text-muted italic" : "text-ink"}`}
      >
        {row.value}
      </p>
      {row.note ? <p className={`mt-1 ${typeScale.meta} ${TONE_TEXT.muted}`}>{row.note}</p> : null}
    </div>
  );
}

/** One field, one badge. No exceptions, including for the absent ones. */
function GradedRowItem({ record, row }: { record: ExperienceV2; row: GradedRow }) {
  return (
    <div className="grid gap-2 border-t border-line py-4 sm:grid-cols-[180px_1fr_auto] sm:items-start sm:gap-4">
      <dt className={`${typeScale.meta} font-bold uppercase tracking-[0.08em] text-muted`}>
        {FIELD_LABEL[row.field]}
      </dt>
      <dd className="m-0 min-w-0">
        <ValueCell row={row} />
      </dd>
      <dd className="m-0 shrink-0">
        <ProvenanceBadge record={record} field={row.field} />
      </dd>
    </div>
  );
}

/** The mixed chip. A partly verified record never reads as verified. */
export function MixedFieldChip({ record }: { record: ExperienceV2 }) {
  const count = fieldCount(record);
  if (!count.mixed) {
    return (
      <p className={`${typeScale.meta} ${TONE_TEXT.green}`}>
        All {count.total} fields on this record are matched to a source we can name.
      </p>
    );
  }
  return (
    <p className={`${typeScale.meta} text-muted`}>
      <span
        className={`mr-2 inline-flex items-center rounded-chip border border-line bg-canvas px-2 py-0.5 font-bold uppercase tracking-[0.06em] ${VERDICT_TONE["not-recorded"]}`}
      >
        {count.verified} of {count.total} fields verified
      </span>
      {count.estimated > 0 ? `${count.estimated} are our arithmetic. ` : ""}
      {count.unknown > 0 ? `${count.unknown} have nothing on record. ` : ""}
      Nothing here is presented as more solid than it is.
    </p>
  );
}

export function GradedFacts({ record }: { record: ExperienceV2 }) {
  const rows = gradedRows(record);
  const absences = absenceCount(record);

  return (
    <section className="mt-8 border border-line bg-white" aria-labelledby="graded-facts-heading">
      <div className="border-b border-line p-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">The graded facts</p>
        <h2 id="graded-facts-heading" className={`mt-2 ${typeScale.title}`}>
          What we know, and how we know it
        </h2>
        <p className={`mt-2 max-w-[70ch] ${typeScale.body} text-muted`}>
          Every row carries its own source. Where a fact is missing the row says so in
          those words rather than leaving a gap for you to read as good news.
        </p>
        <div className="mt-3">
          <MixedFieldChip record={record} />
        </div>
      </div>

      <dl className="px-5 pb-2">
        {rows.map((row) => (
          <GradedRowItem key={row.field} record={record} row={row} />
        ))}
      </dl>

      <p className={`border-t border-line px-5 py-4 ${typeScale.meta} text-muted`}>
        {absences} of {rows.length} rows are recorded as {ABSENT_LABEL.toLowerCase()}. They did
        not decide anything on this page, and the gate refused to plan around them.
      </p>
    </section>
  );
}

/**
 * Accessibility, all seven needs, always.
 *
 * The previous version listed only the needs somebody had recorded, so the
 * absence of a fact was invisible. A traveller planning around an older
 * relative needs to read "not recorded" as "we do not know", and that is only
 * possible if the row is on the page.
 */
export function GradedAccess({ record }: { record: ExperienceV2 }) {
  const rows = accessRows(record, accessLabel);
  const recorded = accessRecordedCount(record);

  return (
    <section className="mt-8 border border-line bg-white" aria-labelledby="graded-access-heading">
      <div className="border-b border-line p-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Accessibility</p>
        <h2 id="graded-access-heading" className={`mt-2 ${typeScale.title}`}>
          Seven things a planner may need
        </h2>
        <p className={`mt-2 max-w-[70ch] ${typeScale.body} text-muted`}>
          All seven are listed whether or not anyone has answered them. A blank here
          would read as a no, and a no is a claim about a building.
        </p>
        <div className="mt-3">
          <ProvenanceBadge record={record} field="accessibility" />
        </div>
      </div>

      <ul className="px-5 pb-2">
        {rows.map((row) => {
          const absence = row.verdict === "not-recorded";
          return (
            <li
              key={row.need}
              className="grid gap-1 border-t border-line py-3 sm:grid-cols-[180px_1fr] sm:gap-4"
            >
              <span className={`${typeScale.meta} font-bold uppercase tracking-[0.08em] text-muted`}>
                {row.label}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-chip border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${
                    absence
                      ? CONFIDENCE_TONE.unverified
                      : row.verdict === "yes"
                        ? CONFIDENCE_TONE.verified
                        : CONFIDENCE_TONE.estimate
                  }`}
                >
                  {absence ? ABSENT_LABEL : row.verdict === "yes" ? "Yes" : "No"}
                </span>
                {absence ? (
                  <span className={`${typeScale.meta} text-muted`}>
                    Nobody has recorded this. It is not a no.
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      <p className={`border-t border-line px-5 py-4 ${typeScale.meta} text-muted`}>
        {recorded === 0
          ? "Nothing about this building's access is on record. Reporting a correction puts it in the review queue."
          : `${recorded} of ${rows.length} needs are on record. The rest are unknown rather than negative.`}
      </p>
    </section>
  );
}

/** The per-field badge strip, one badge per field, kept from the old page. */
export function ProvenanceStrip({ record }: { record: ExperienceV2 }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {(["price", "duration", "coordinates", "openingHours"] as const).map((field) => (
        <ProvenanceBadge key={field} record={record} field={field} />
      ))}
    </div>
  );
}

export { PROVENANCE_TONE, CONFIDENCE_TONE };
