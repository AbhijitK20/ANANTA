"use client";

import Link from "next/link";
import { CaretDown, Train } from "@phosphor-icons/react/dist/ssr";
import { AddToPlanButton } from "@/components/plan-button";
import { ProvenanceBadge } from "@/components/ananta/provenance-badge";
import { COMPONENT_LABEL, typeScale, depth } from "@/components/ananta/tokens";
import { depthForRecord, type DepthReading } from "@/components/ananta/depth";
import { hoursLabel, inrLabel, type RankedRow } from "@/components/ananta/pipeline";
import { stationLabel } from "@/lib/location";

/**
 * One result, in the order a traveller reads it, standing at the depth its data
 * earned.
 *
 * **Depth here is read, never asserted.** `depthForRecord` derives the class from
 * the record's own per-field confidence, so a card cannot claim a standing it has
 * not earned. A `mixed` record, which is roughly 96 percent of the catalogue
 * because most prices are hash-derived, renders `depth-flush` and is never
 * collapsed to verified. The `lifted` override is the one exception and it is
 * positional, not epistemic: the top result is primary right now, which is
 * interface hierarchy, and the contract lists that as a legitimate thing for
 * depth to carry. Exactly one card is lifted.
 *
 * Content order is unchanged and still matters more than the depth: rank, name
 * and area, then the binding facts with real numbers, then the price with the
 * label that qualifies it adjacent rather than in a footer, then why this
 * matched, then what we do not know, then add to plan.
 *
 * The card is an `article`, not a `button`. It used to be a button wrapping the
 * whole tile, which makes the add-to-plan control a button inside a button:
 * invalid and unlabelled in some browsers. The name is the link instead.
 *
 * `transform` is never set inline. Depth, the lift on hover, and the reduced
 * motion fallback are all class names, so the reduced-motion block can
 * neutralise the movement while the meaning survives as colour, border and the
 * rank number.
 */
export function ResultCard({
  row,
  rank,
  isTop,
  inPlan,
  onTogglePlan,
  onSelect,
  originArea,
}: {
  row: RankedRow;
  /** One-based position in the current sort. Printed, so rank is a fact. */
  rank: number;
  /** True for exactly one card: the top-ranked result. It alone is lifted. */
  isTop: boolean;
  inPlan: boolean;
  onTogglePlan: (id: string) => void;
  onSelect: (id: string) => void;
  originArea: string;
}) {
  const place = row.record;
  const reading: DepthReading = depthForRecord(place);
  const ranked = [...row.components].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution) || a.id.localeCompare(b.id),
  );
  const shown = ranked.slice(0, 2);
  const hidden = ranked.slice(2);
  const price = place.priceInr === 0 ? "Free" : inrLabel(place.priceInr);
  // The top result lifts. Everything else keeps the depth its data earned.
  const depthClass = isTop ? depth.lifted : reading.depthClass;
  // Depth is never the only channel. A recessed card is desaturated by the
  // class; it also takes a dashed edge, so a reader who cannot perceive depth
  // reads the same "we do not know this" from the border alone. A mixed card is
  // flush, not recessed, and is dashed for the same redundancy.
  const edgeClass = isTop
    ? "border-blue"
    : reading.depthClass === depth.recessed || reading.mixed
      ? "border-dashed border-line"
      : "";
  const objective = row.objective.value;

  return (
    <article
      className={`stage-3d lift flex flex-col rounded border border-line bg-white p-4 ${depthClass} ${edgeClass}`}
    >
      <div className="flex items-start gap-2.5">
        {/* The rank is a number, not a decoration, and it is the one channel
            that survives when every depth transform is neutralised. */}
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-6 min-w-[1.75rem] items-center justify-center rounded px-1 text-[11px] font-bold ${
            isTop ? "bg-blue text-white" : "border border-line bg-canvas text-muted"
          }`}
        >
          {rank}
        </span>
        <div className="min-w-0">
          {/* The rank is read out as well as shown. The badge itself is
              aria-hidden, because a number in a coloured box is not announced
              on its own and the position is the point of the box. */}
          <h3 className="font-bold leading-6">
            <span className="sr-only">{`Rank ${rank}. `}</span>
            <Link
              href={`/experience/${place.id}`}
              onClick={() => onSelect(place.id)}
              className="hover:text-blue hover:underline"
            >
              {place.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {place.area} · {place.category}
          </p>
        </div>
      </div>

      <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 ${typeScale.meta} font-semibold text-muted`}>
        {isTop && (
          // Depth is never the only channel. Under prefers-reduced-motion the
          // lift is neutralised, so the primary result says so in words and in a
          // filled rank badge, not only in elevation.
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue">Top result</span>
        )}
        <span>{hoursLabel(place.durationMinutes)} visit</span>
        <span>
          {row.travelMinutes} min from {originArea}
        </span>
        <span className="inline-flex items-center">
          <Train size={14} className="mr-1" aria-hidden />
          {stationLabel(place.station)}
        </span>
        <span className="text-ink">{place.status}</span>
        {place.availability.soldOutAt && (
          <span className={`${typeScale.micro} font-bold text-amber`}>
            Sold out as of {place.availability.soldOutAt.slice(0, 10)}
          </span>
        )}
      </div>

      {/* The number and the label that qualifies it, in one line. */}
      <p className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-base font-bold text-ink">{price}</span>
        <ProvenanceBadge record={place} field="price" prefix="Price" />
      </p>

      {shown.length > 0 && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue">Why this matched</h4>
            <span className={`${typeScale.micro} text-muted`}>
              Objective {objective.toFixed(3)}
            </span>
          </div>
          <ul className="mt-1.5 space-y-1">
            {shown.map((component) => (
              <li key={component.id} className={`${typeScale.meta} leading-5`}>
                <span className="font-bold text-ink">{COMPONENT_LABEL[component.id] ?? component.id}: </span>
                <span className="text-muted">{component.sentence}</span>
              </li>
            ))}
          </ul>
          {hidden.length > 0 && (
            <details className="group mt-2">
              <summary className={`flex cursor-pointer items-center gap-1 ${typeScale.meta} font-bold text-blue`}>
                {hidden.length} more component{hidden.length === 1 ? "" : "s"} scored
                <CaretDown size={12} aria-hidden="true" className="group-open:rotate-180" />
              </summary>
              <ul className="mt-2 space-y-1 border-t border-line pt-2">
                {hidden.map((component) => (
                  <li key={component.id} className={`${typeScale.meta} leading-5`}>
                    <span className="font-bold text-ink">{COMPONENT_LABEL[component.id] ?? component.id}: </span>
                    <span className="text-muted">{component.sentence}</span>
                  </li>
                ))}
              </ul>
              <p className={`mt-2 ${typeScale.micro} text-muted`}>
                Objective {objective.toFixed(3)}. A negative score can still be the best on offer.
              </p>
            </details>
          )}
        </div>
      )}

      {row.advisory.length > 0 && (
        <div className="mt-3 border-t border-dashed border-line pt-3">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            What we do not know yet
          </h4>
          <ul className="mt-1.5 space-y-1">
            {row.advisory.map((item, index) => (
              <li key={`${item.code}-${index}`} className={`${typeScale.meta} leading-5 text-muted`}>
                {item.sentence} <code className="text-[10px]">{item.code}</code>
              </li>
            ))}
          </ul>
          <p className={`mt-1.5 ${typeScale.micro} text-muted`}>
            None of these refused this place. They are what we could not verify.
          </p>
        </div>
      )}

      <div className="mt-auto pt-4">
        <AddToPlanButton experienceId={place.id} onToggle={onTogglePlan} forced={inPlan} />
      </div>
    </article>
  );
}
