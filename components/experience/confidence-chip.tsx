import type { Confidence, ExperienceV2, ProvenancedField } from "@/lib/engine";
import { Calculator, Question, SealCheck, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { CONFIDENCE_TONE, FIELD_LABEL, KNOWLEDGE_LEGEND, PROVENANCE_TONE, typeScale } from "@/components/ananta/tokens";

/**
 * The per-field badge, keyed on confidence rather than on provenance.
 *
 * `provenance-badge.tsx` already exists and is used by Explore, so it is not
 * replaced and it is not edited. This is a second reading of the same record for
 * one job: the detail page's trust signal. The two axes are independent and the
 * contracts say they must be rendered separately. A traveller needs to know two
 * different things about a price:
 *
 *   provenance  where the value came from: curated, provider, osm, inferred, derived
 *   confidence  how much to trust it:    verified, community, estimate, unverified
 *
 * `records.ts` writes a hand-entered price as `curated` + `community`, and a
 * hash-derived price as `inferred` + `estimate`. A badge keyed only on
 * provenance would call both of them `curated`-looking and `inferred`-looking
 * and never say that one of them is a person and the other is arithmetic.
 *
 * **The four states get four icons, not four greys.** Colour alone is not an
 * accessible encoding, and these four states carry the whole product argument, so
 * each is also a distinct glyph: a seal for verified, people for community, a
 * calculator for estimate, a question mark for unverified. The tone itself comes
 * from `CONFIDENCE_TONE` in `components/ananta/tokens.ts`, which is the single
 * owner of the four shapes, so this file cannot drift from the legend that
 * explains it or from a badge on any other screen.
 *
 * No new colours are defined here. Nothing in this file is a hex value.
 */

const CONFIDENCE_ICON: Record<Confidence, typeof SealCheck> = {
  verified: SealCheck,
  community: UsersThree,
  estimate: Calculator,
  unverified: Question,
};

/**
 * The meaning and the label, read from the shared legend rather than written a
 * second time. `KNOWLEDGE_LEGEND` is the table `ProvenanceLegend` renders, so a
 * badge on this page and the legend that explains it cannot disagree.
 */
const LEGEND = new Map(KNOWLEDGE_LEGEND.map((entry) => [entry.state, entry]));
const legendOf = (state: Confidence) => LEGEND.get(state) ?? KNOWLEDGE_LEGEND[3];

/**
 * One field, one badge. The chip carries the word, the icon and the tone; the
 * disclosure underneath carries the sentence, the provenance, the date and the
 * source, so the badge is a summary a reader can trust rather than a decoration.
 */
export function ConfidenceChip({
  record,
  field,
  prefix,
}: {
  record: ExperienceV2;
  field: ProvenancedField;
  /** Prefixes the field label, for a row that already names something else. */
  prefix?: string;
}) {
  const confidence = record.confidence[field] ?? "unverified";
  const provenance = record.provenance[field];
  const source = record.sources[field];
  const Icon = CONFIDENCE_ICON[confidence];
  const legend = legendOf(confidence);

  return (
    <details className="group inline-block align-top">
      <summary
        className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded-chip px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${CONFIDENCE_TONE[confidence]}`}
      >
        <Icon size={13} weight="bold" aria-hidden="true" />
        {prefix ? `${prefix}: ` : ""}
        {legend.label}
        <span className="font-semibold normal-case tracking-normal opacity-80">{FIELD_LABEL[field]}</span>
      </summary>
      <div className={`mt-2 max-w-[70ch] border border-line bg-white p-3 ${typeScale.meta} text-muted shadow-card`}>
        <p className="font-bold text-ink">
          {FIELD_LABEL[field]}: {legend.label.toLowerCase()}
        </p>
        <p className="mt-1">{source?.note ?? "No detail recorded for this field."}</p>
        <p className="mt-2">{legend.meaning}</p>
        <p className="mt-2 flex flex-wrap gap-1.5">
          <span className={`rounded-chip border px-1.5 py-0.5 font-bold ${PROVENANCE_TONE[provenance]}`}>
            {provenance}
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
          <p className="mt-2">No source URL on file. We would rather say that than link to a placeholder.</p>
        )}
      </div>
    </details>
  );
}

/**
 * One headline fact, with its own badge.
 *
 * Four of these sit under the title, which is where a planner looks first. Each
 * one names a field the record actually carries, so the badge beside it is a
 * real claim about that number rather than a record-level verdict that cannot
 * tell a matched pin from a generated price.
 */
export function FieldTile({
  label,
  value,
  sub,
  record,
  field,
}: {
  label: string;
  value: string;
  /** A second line, only where the value cannot say it alone. */
  sub?: string;
  record: ExperienceV2;
  field: ProvenancedField;
}) {
  return (
    <div className="border border-line bg-white p-4">
      <p className={`${typeScale.micro} font-bold uppercase tracking-[0.1em] text-muted`}>{label}</p>
      <p className="mt-1.5 text-lg font-bold leading-6">{value}</p>
      {sub ? <p className={`mt-1 ${typeScale.meta} text-muted`}>{sub}</p> : null}
      <div className="mt-3">
        <ConfidenceChip record={record} field={field} />
      </div>
    </div>
  );
}
