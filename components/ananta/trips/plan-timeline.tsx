"use client";

import { Clock, MapPin, NavigationArrow, Trash } from "@phosphor-icons/react/dist/ssr";
import type { DiscoveryContext, Stop, Weights } from "@/lib/engine";
import { typeScale } from "@/components/ananta/tokens";
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

      <ol className="mt-5 space-y-3">
        {stops.map((stop, index) => (
          <li key={stop.record.id}>
            <article className="grid gap-4 border border-line p-5 sm:grid-cols-[132px_1fr_auto] sm:items-start">
              <div>
                <p className={`${typeScale.micro} font-bold uppercase tracking-[0.12em] text-muted`}>
                  Stop {index + 1} of {stops.length}
                </p>
                <p className="mt-1 text-base font-bold text-blue">
                  <Clock size={15} className="mr-1 inline align-[-2px]" aria-hidden="true" />
                  {clockLabel(stop.arriveBy)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {index === 0
                    ? `${stop.travelMinutes} min from ${DEMO_ORIGIN.area}`
                    : `${stop.travelMinutes} min from stop ${index}`}
                </p>
                <p className="mt-1 text-xs text-muted">
                  out by {clockLabel(stop.arriveBy + stop.visitMinutes)}
                </p>
                {index < stops.length - 1 && (
                  <p className="mt-1 text-xs text-muted">
                    +{stop.visitMinutes} min visit, +{stop.bufferMinutes} min buffer
                  </p>
                )}
              </div>

              <div>
                <h4 className="text-lg font-bold">{stop.record.name}</h4>
                <p className="mt-1 text-sm text-muted">
                  <MapPin size={14} className="mr-1 inline align-[-2px]" aria-hidden="true" />
                  {stop.record.area} · {stationLabel(stop.record.station)}
                </p>
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
                  <div className="flex gap-1">
                    <dt>Cost</dt>
                    <dd className="text-ink">{inrLabel(stop.costInr)} for {ctx.partySize}</dd>
                  </div>
                </dl>
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
                <button
                  type="button"
                  onClick={() => onRemove(stop.record.id)}
                  aria-label={`Remove ${stop.record.name} from the plan`}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center justify-self-start rounded border border-line p-2 text-muted hover:border-amber hover:text-amber sm:justify-self-end"
                >
                  <Trash size={18} />
                </button>
              )}
            </article>

            {index < stops.length - 1 && (
              <div className="travel-connector ml-8 py-3 pl-5 text-xs font-semibold text-muted">
                <span aria-hidden="true" className="travel-connector-line" />
                <span aria-hidden="true" className="travel-connector-dot" />
                <TravelLeg minutes={stops[index + 1].travelMinutes} km={stops[index + 1].travelKm} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
