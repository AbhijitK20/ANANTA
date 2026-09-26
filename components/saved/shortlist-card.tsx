import { ArrowRight, BookmarkSimple, Warning } from "@phosphor-icons/react/dist/ssr";
import { StatusLabel } from "@/components/ui";
import type { ExperienceV2 } from "@/lib/engine";
import { ProvenanceDetail, ProvenanceStrip } from "@/components/ananta/learning/provenance-strip";
import type { AvailabilityChange } from "@/components/ananta/learning/availability-snapshot";

/**
 * One place on the traveller's own shortlist.
 *
 * This is the most personal card in the product, so the honesty bar is highest
 * here and the layout follows from that rather than from a card template.
 *
 * Three things it has to get right, and all three were previously competing for
 * the same few lines of a card:
 *
 *   1. **The provenance strip is visible without a click.** A traveller looking
 *      at their own list is checking whether they were misled, and an answer
 *      behind a disclosure is not an answer. So the strip sits above the fold of
 *      the card and the per-field detail folds away underneath it.
 *   2. **Saved is not booked.** There are no payments, no commissions and no
 *      reservations anywhere in this product, so nothing on this card may imply
 *      one. The change sentence under the strip says so on every card, not only
 *      the empty state.
 *   3. **A change since saving is stated with the record's own timestamp**,
 *      because that is the single most useful thing this page could tell someone.
 *
 * The depth classes arrive as a prop rather than being decided here. That is
 * deliberate: depth on this screen is a claim about what the system knows, and
 * the claim belongs with the rest of the reasoning in `app/saved/page.tsx`.
 */
export function ShortlistCard({
  record,
  change,
  depthClass,
  onRemove,
}: {
  record: ExperienceV2;
  change: AvailabilityChange;
  /** `raised` or `recessed` plus its shadow and, when recessed, a dashed edge. */
  depthClass: string;
  onRemove: (id: string) => void;
}) {
  const soldOut = change.kind === "sold-out";

  return (
    <article className={`flex flex-col rounded-card border border-line bg-white p-5 ${depthClass}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel tone={record.statusTone}>{record.status}</StatusLabel>
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
            {record.category}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onRemove(record.id)}
          aria-label={`Remove ${record.name} from your saved list`}
          className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-blue transition-colors duration-120 hover:bg-blueSoft"
        >
          <BookmarkSimple size={20} weight="fill" />
        </button>
      </header>

      {soldOut ? (
        <p className="mt-4 flex items-start gap-2 border border-amber bg-amberSoft p-3 text-sm leading-6 text-amber">
          <Warning size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-bold">Sold out</span> since you saved this, marked at{" "}
            {record.availability.soldOutAt}. Saving it did not hold anything.
          </span>
        </p>
      ) : null}

      <h3 className="mt-4 text-title text-ink">
        <a href={`/experience/${record.id}`} className="transition-colors duration-120 hover:text-blue">
          {record.name}
        </a>
      </h3>
      <p className="mt-1.5 text-sm text-muted">
        {record.area} &middot; {record.station}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-3 text-sm">
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted">Time needed</dt>
          <dd className="mt-1 font-semibold text-ink">{record.durationMinutes} min</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted">Last checked</dt>
          <dd className="mt-1 font-semibold text-ink">{record.updated}</dd>
        </div>
      </dl>

      <ProvenanceStrip record={record} />

      <p className="mt-3 text-xs leading-5 text-muted">{change.sentence}</p>

      <ProvenanceDetail record={record} />

      <div className="mt-auto pt-5">
        <a
          href={`/experience/${record.id}`}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold text-blue"
        >
          View details <ArrowRight size={15} aria-hidden="true" />
          <span className="sr-only">for {record.name}</span>
        </a>
      </div>
    </article>
  );
}
