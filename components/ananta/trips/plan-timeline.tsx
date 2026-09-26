"use client";

import { Clock, MapPin, NavigationArrow, Trash } from "@phosphor-icons/react/dist/ssr";
import type { DiscoveryContext, Stop, Weights } from "@/lib/engine";
import { typeScale } from "@/components/ananta/tokens";
import { fieldCount } from "@/components/ananta/provenance/rows";
import { PLAN_BUFFER_MINUTES, clockLabel, inrLabel, stopComponents } from "@/components/ananta/pipeline";
import { WhyThis } from "@/components/ananta/why-this";
import { stationLabel } from "@/lib/location";
import { DEMO_ORIGIN } from "@/components/ananta/use-ananta";

/**
 * The plan timeline, with a clock that means something.
 *
 * The version this replaces printed ``${index + 1}:15 PM`` for every stop past the
 * first. It did not read `availableMinutes`, did not read the deadline, did not sum
 * any previous duration, and was identical for every plan in the product. It was
 * the single worst honesty defect in the repository.
 *
 * What is here instead is a real clock and a stated basis for it:
 *
 *  - `Stop.arriveBy` is minutes from local midnight, and the engine's `buildStops`
 *    starts that clock at `localMinutesOfDay(ctx.now)`, which is the start time the
 *    traveller typed. So `arriveBy` is already a wall-clock minute and the label is
 *    `clockLabel(stop.arriveBy)`. Adding the start time again, which the previous
 *    version did, printed a time later than the day it belongs to.
 *  - The start time is passed in and printed above the list, because a clock is only
 *    honest if the reader knows what it is relative to.
 *  - Every duration on the card is a real field: `travelMinutes` from the injected
 *    matrix, `visitMinutes` from the record, `bufferMinutes` from the shared
 *    `DEFAULT_BUFFER_MINUTES` that session 3 owns.
 *
 * There is no "Selected because it matches the current interest and sits inside the
 * available plan area". No interest model ran and no area check ran. The per-stop
 * reason is session 7's `WhyThis`, driven by the components the objective produced.
 *
 * The itinerary shape is three columns on a wide screen and one column on a phone:
 * the clock in a right-aligned gutter, a vertical rule, then the stop. The rule is
 * the existing `.travel-connector` line and dot rather than a new animation,
 * because `spatial-primitives.test.ts` allows exactly one keyframe block in this
 * repository and it is already spent on that dot.
 *
 * Each stop carries its own three-part duration bar, so a reader can see that stop
 * one costs an hour of walking and stop three costs none, without adding numbers up.
 * The bar is `aria-hidden` and the same three numbers are in the definition list
 * beside it, because a length on a track is not something a screen reader can read.
 *
 * ponytail: this renders the sequence and the reasons, and it does not try to be a
 * gantt chart. Below about 480px the clock column stacks above the card rather than
 * squeezing, because a truncated arrival time is worse than a wrapped one.
 */

function TravelLeg({ minutes, km }: { minutes: number; km: number }) {
  return (
    <span>
      <NavigationArrow size={14} className="mr-1 inline align-[-2px]" aria-hidden="true" />
      {minutes} min, {km.toFixed(2)} km estimated
    </span>
  );
}

/** `leg`, `visit`, `buffer` as one proportional bar, sized off this stop's own total. */
function StopShape({ stop, isLast }: { stop: Stop; isLast: boolean }) {
  const parts = [
    { key: "Getting there", minutes: stop.travelMinutes, tone: "bg-green" },
    { key: "Visit", minutes: stop.visitMinutes, tone: "bg-blue" },
    ...(isLast ? [] : [{ key: "Buffer", minutes: stop.bufferMinutes, tone: "bg-amber" }]),
  ];
  const total = parts.reduce((sum, part) => sum + part.minutes, 0) || 1;
  return (
    <div aria-hidden="true" className="mt-3 flex h-2 w-full overflow-hidden rounded-sm bg-canvas">
      {parts.map((part) => (
        <div
          key={part.key}
          className={`h-full ${part.tone}`}
          style={{ width: `${(part.minutes / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function PlanTimeline({
  stops,
  ctx,
  weights,
  startTimeLabel,
  onRemove,
}: {
  stops: readonly Stop[];
  ctx: DiscoveryContext;
  weights: Weights;
  /** `HH:MM` exactly as the traveller typed it, printed so the clock has a stated basis. */
  startTimeLabel: string;
  onRemove?: (id: string) => void;
}) {
  const finish = stops.length ? clockLabel(stops[stops.length - 1].arriveBy + stops[stops.length - 1].visitMinutes) : null;
  const span = stops.length
    ? stops[stops.length - 1].arriveBy + stops[stops.length - 1].visitMinutes - stops[0].arriveBy
    : 0;

  return (
    <section aria-labelledby="timeline-heading">
      <p className={`${typeScale.micro} font-bold uppercase tracking-[0.14em] text-blue`}>
        Packed order
      </p>
      <h3 id="timeline-heading" className={`mt-2 ${typeScale.title}`}>
        A workable sequence
      </h3>
      <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted">
        Every clock below starts at <span className="font-bold text-ink">{startTimeLabel}</span>, the
        start time you set, and adds the estimated travel, the recorded visit duration and{" "}
        {PLAN_BUFFER_MINUTES} minutes of buffer for every stop but the last. The last stop is walked out
        of, so it carries no onward buffer. Travel is a straight-line estimate at the manifest congestion
        multiplier, not live routing, and nothing here is a booking or a live availability claim.
      </p>
      <p className="mt-2 text-xs font-semibold text-muted">
        {stops.length} stop{stops.length === 1 ? "" : "s"} · first arrival {clockLabel(stops[0].arriveBy)} ·{" "}
        {finish ? `back out at ${finish}` : "no stops"} ·{" "}
        {span >= 60 ? `${Math.floor(span / 60)} h ${span % 60} min` : `${span} min`} door to door
      </p>

      <ol className="mt-5 space-y-1">
        {stops.map((stop, index) => {
          const known = fieldCount(stop.record);
          return (
            <li key={stop.record.id}>
              <article className="grid gap-3 sm:grid-cols-[118px_1fr] sm:gap-5">
                <div className="sm:border-r sm:border-line sm:pr-4 sm:text-right">
                  <p className={`${typeScale.micro} font-bold uppercase tracking-[0.12em] text-muted`}>
                    Stop {index + 1} of {stops.length}
                  </p>
                  <p className="mt-1 text-lg font-bold leading-6 text-blue">
                    <Clock size={15} className="mr-1 inline align-[-2px]" aria-hidden="true" />
                    {clockLabel(stop.arriveBy)}
                  </p>
                  <p className="text-xs leading-5 text-muted">
                    out by {clockLabel(stop.arriveBy + stop.visitMinutes)}
                  </p>
                  <p className="text-xs leading-5 text-muted">
                    {index === 0
                      ? `${stop.travelMinutes} min from ${DEMO_ORIGIN.area}`
                      : `${stop.travelMinutes} min from stop ${index}`}
                  </p>
                </div>

                <div className="border border-line bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-lg font-bold leading-6">
                        <a href={`/experience/${stop.record.id}`} className="hover:text-blue">
                          {stop.record.name}
                        </a>
                      </h4>
                      <p className="mt-1 text-sm text-muted">
                        <MapPin size={14} className="mr-1 inline align-[-2px]" aria-hidden="true" />
                        {stop.record.area} · {stationLabel(stop.record.station)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-chip border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${
                        known.mixed ? "border-line bg-canvas text-muted" : "border-green bg-greenSoft text-green"
                      }`}
                    >
                      {known.mixed ? `${known.verified} of ${known.total} fields verified` : "All fields sourced"}
                    </span>
                  </div>

                  <StopShape stop={stop} isLast={index === stops.length - 1} />

                  <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-muted">
                    <div className="flex gap-1">
                      <dt>Visit</dt>
                      <dd className="text-ink">{stop.visitMinutes} min</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Leg</dt>
                      <dd className="text-ink">
                        <TravelLeg minutes={stop.travelMinutes} km={stop.travelKm} />
                      </dd>
                    </div>
                    {index < stops.length - 1 && (
                      <div className="flex gap-1">
                        <dt>Buffer</dt>
                        <dd className="text-ink">{stop.bufferMinutes} min</dd>
                      </div>
                    )}
                    <div className="flex gap-1">
                      <dt>Cost</dt>
                      <dd className="text-ink">{inrLabel(stop.costInr)} for {ctx.partySize}</dd>
                    </div>
                  </dl>
                  <p className={`mt-1 ${typeScale.meta} text-muted`}>
                    The bar above runs getting there, the visit, then the buffer, in that order, and the
                    last stop carries no onward buffer.
                  </p>

                  {known.mixed && (
                    <p className={`mt-2 ${typeScale.meta} text-muted`}>
                      {known.estimated} of those are our arithmetic and {known.unknown} have nothing on
                      record. Both are labelled field by field on the place page, and an unverified field
                      is never scored as though it were known.
                    </p>
                  )}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-bold text-blue">
                      Why this stop, ranked
                    </summary>
                    <div className="mt-3">
                      <WhyThis
                        components={stopComponents(stop, ctx, weights)}
                        title={`Why ${stop.record.name}`}
                        limit={4}
                        note="Ranked by magnitude, largest contribution first. Each line is a number the objective actually produced."
                      />
                    </div>
                  </details>
                </div>

                {onRemove && (
                  <div className="sm:col-start-2">
                    <button
                      type="button"
                      onClick={() => onRemove(stop.record.id)}
                      aria-label={`Remove ${stop.record.name} from the plan`}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded border border-line px-3 py-2 text-xs font-bold text-muted hover:border-amber hover:text-amber"
                    >
                      <Trash size={16} aria-hidden="true" /> Remove this stop
                    </button>
                  </div>
                )}
              </article>

              {index < stops.length - 1 && (
                <div className="grid sm:grid-cols-[118px_1fr] sm:gap-5">
                  <div aria-hidden="true" className="hidden sm:block" />
                  <div className="travel-connector ml-2 py-3 pl-6 text-xs font-semibold text-muted">
                    <span aria-hidden="true" className="travel-connector-line" />
                    <span aria-hidden="true" className="travel-connector-dot" />
                    On to stop {index + 2}.{" "}
                    <TravelLeg minutes={stops[index + 1].travelMinutes} km={stops[index + 1].travelKm} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
