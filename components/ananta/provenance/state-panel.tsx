import { StateNote } from "@/components/ui";
import { TONE_TEXT, typeScale } from "@/components/ananta/tokens";
import { fieldCount } from "./rows";

/**
 * `abstained` and `partially-unknown`, the two states that are specifically this
 * page's to render.
 *
 * The other seven come from `StateNote` in `components/ui.tsx`, which renders
 * the shared `UI_STATE_COPY` table. Writing a second renderer here would be the
 * same class of bug this round exists to remove, so there is exactly one shape
 * and this file only adds the two blocks that need more than a title and a
 * sentence.
 *
 * `abstained` is the state the rest of the product exists to avoid, and the only
 * way to avoid it honestly is to render it. A field the gate declined to judge
 * because a fact is unknown has to look as considered as a recommendation, or
 * the reader infers that the product is broken rather than careful. The
 * distinction the copy has to carry is "we will not claim this" against "this
 * does not work", and it has to survive a glance.
 */

/**
 * The abstention, itemised.
 *
 * Every field the gate refused to judge is named, so the reader can tell the
 * difference between the engine declining to guess and the engine having
 * nothing. Deliberately a heading rather than a chip strip: this is a decision
 * the product made, and it deserves to read like one.
 */
export function AbstainedPanel({
  fields,
  count,
}: {
  /** Human names for the fields the gate would not judge on. */
  fields: readonly string[];
  count: number;
}) {
  if (count === 0) return null;
  return (
    <section
      className="border border-line bg-canvas p-5"
      aria-labelledby="abstained-heading"
      data-ui-state="abstained"
    >
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Abstention</p>
      <h2 id="abstained-heading" className={`mt-2 ${typeScale.title}`}>
        We will not claim this
      </h2>
      <p className={`mt-2 max-w-[70ch] ${typeScale.body} text-muted`}>
        A fact is unknown, so the gate declined to judge it. This is not a rejection, and it did
        not remove the place from your results. {count === 1 ? "One field" : `${count} fields`} fall
        into that group:
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {fields.map((field) => (
          <li
            key={field}
            className={`rounded-chip border border-dashed border-muted bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${TONE_TEXT.muted}`}
          >
            {field}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A record that is usable but not fully sourced.
 *
 * Deliberately quieter than a warning. A record with three estimated fields and
 * fifteen sourced ones is a good record, and this panel must not make it feel
 * like a compromised one.
 */
export function PartiallyUnknownPanel({ record }: { record: Parameters<typeof fieldCount>[0] }) {
  const count = fieldCount(record);
  if (count.estimated === 0 && count.unknown === 0) return null;
  return (
    <StateNote state="partially-unknown">
      <p className={`${typeScale.meta} text-muted`}>
        {count.estimated} of {count.total} fields are our arithmetic and {count.unknown} have
        nothing on record. None of them decided whether this place appeared in your results.
      </p>
    </StateNote>
  );
}
