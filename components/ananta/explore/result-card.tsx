"use client";

import Link from "next/link";
import { Train } from "@phosphor-icons/react/dist/ssr";
import { AddToPlanButton } from "@/components/plan-button";
import { ProvenanceBadge } from "@/components/ananta/provenance-badge";
import { typeScale, COMPONENT_LABEL, depth } from "@/components/ananta/tokens";
import { depthForRecord, type DepthReading } from "@/components/ananta/depth";
import { hoursLabel, inrLabel, type RankedRow } from "@/components/ananta/pipeline";
import { stationLabel } from "@/lib/location";
import type { Rejection } from "@/lib/engine";

/**
 * One result, in the order a traveller reads it, standing at the depth its data
 * earned.
 *
 * **Depth here is read, never asserted.** `depthForRecord` derives the class from
 * the record's own per-field confidence plus any gate rejections, so a card
 * cannot claim a standing it has not earned. A `mixed` record, which is roughly
 * 96 percent of the catalogue because most prices are hash-derived, renders
 * `depth-flush` and is never collapsed to verified. The `lifted` override is the
 * one exception and it is positional, not epistemic: the top result is primary
 * right now, which is interface hierarchy, and the contract lists that as a
 * legitimate thing for depth to carry.
 *
 * Content order is unchanged and still matters more than the depth: name and
 * area, then the binding facts with real numbers, then why-this collapsed to two
 * components, then the provenance strip with the estimate label adjacent to the
 * number it qualifies, then add-to-plan.
 *
 * The card is an `article`, not a `button`. It used to be a button wrapping the
 * whole tile, which makes the add-to-plan control a button inside a button:
 * invalid and unlabelled in some browsers. The name is the link instead.
 *
 * `transform` is never set inline. Depth, the lift on hover, and the reduced
 * motion fallback are all class names, so session 1's reduced-motion block can
 * neutralise the movement while the meaning survives as colour and a dashed
 * border.
 */
export function ResultCard({
  row,
  isTop,
  inPlan,
  onTogglePlan,
  onSelect,
  originArea,
  rejections = [],
}: {
  row: RankedRow;
  /** True for exactly one card: the top-ranked result. It alone is lifted. */
  isTop: boolean;
  inPlan: boolean;
  onTogglePlan: (id: string) => void;
  onSelect: (id: string) => void;
  originArea: string;
  /** Blocking rejections, so a refused record would recede. Explore passes none today. */
  rejections?: Rejection[];
}) {
  const place = row.record;
  const reading: DepthReading = depthForRecord(place, rejections);
  const ranked = [...row.components].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
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

  return (
    <article className={`stage-3d lift flex flex-col border border-line bg-white p-4 ${depthClass} ${edgeClass}`}>
      <h3 className="font-bold leading-6">
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

      <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 ${typeScale.meta} font-semibold text-muted`}>
        {isTop && (
          // Depth is never the only channel. Under prefers-reduced-motion the
          // lift is neutralised, so the primary result says so in words and in a
          // border colour, not only in elevation.
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue">
            Top result
          </span>
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
          <ul className="space-y-1">
            {shown.map((component) => (
              <li key={component.id} className={`${typeScale.meta} leading-5`}>
                <span className="font-bold text-blue">{COMPONENT_LABEL[component.id] ?? component.id}: </span>
                <span className="text-muted">{component.sentence}</span>
              </li>
            ))}
          </ul>
          {hidden.length > 0 && (
            <details className="mt-2">
              <summary className={`cursor-pointer ${typeScale.meta} font-bold text-blue`}>
                {hidden.length} more component{hidden.length === 1 ? "" : "s"} scored
              </summary>
              <ul className="mt-2 space-y-1 border-t border-line pt-2">
                {hidden.map((component) => (
                  <li key={component.id} className={`${typeScale.meta} leading-5`}>
                    <span className="font-bold text-blue">{COMPONENT_LABEL[component.id] ?? component.id}: </span>
                    <span className="text-muted">{component.sentence}</span>
                  </li>
                ))}
              </ul>
              <p className={`mt-2 ${typeScale.micro} text-muted`}>
                Objective {row.objective.value.toFixed(3)}. A negative score can still be the best on offer.
              </p>
            </details>
          )}
        </div>
      )}

      <div className="mt-auto pt-4">
        <AddToPlanButton experienceId={place.id} onToggle={onTogglePlan} forced={inPlan} />
      </div>
    </article>
  );
}
