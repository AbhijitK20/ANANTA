import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDots, NavigationArrow } from "@phosphor-icons/react/dist/ssr";
import type { EventSeed, Experience } from "@/lib/seed";
import { eventChanges } from "@/lib/events";
import { estimateFromUser, formatDistance } from "@/lib/location";
import { StatusLabel } from "@/components/ui";
import { ChangeBadge } from "@/components/events/change-badge";

/**
 * The two landing card grids.
 *
 * Both cards are server components and both read the v1 seed exactly as the
 * previous revision did. Nothing here fetches, sorts, or derives anything new.
 *
 * The hover lift is `.lift` inside a `.stage-3d` grid, which is the ratified pair
 * from `app/globals.css`, not a `hover:-translate-y-1`. Two reasons, and the
 * second is the one that matters:
 *
 *   1. The global reduced-motion block neutralises `.lift` and the six `.depth-*`
 *      classes by name. A Tailwind translate utility is not on that list, so it
 *      would keep moving for a visitor who asked for no motion.
 *   2. `.lift` lifts toward the viewer in the same perspective the depth scale is
 *      measured in, so the card rises one step on the same staircase as everything
 *      else instead of sliding two pixels on a different axis.
 *
 * `depth-flush` is the honest reading for these cards and not a default. The
 * landing sorts the v1 seed directly, and a v1 record is on file but largely
 * derived, which is exactly what flush means. Per-record depth wants
 * `depthForRecord()` over the v2 record, which is the Explore list's job; reading
 * a second record shape here would be a data change, not a UI pass.
 */

/** One event on the landing strip. The delta badge is the same one `/events` uses. */
export function EventCard({ event }: { event: EventSeed }) {
  const changes = eventChanges(event);

  return (
    <article
      className={`lift flex h-full flex-col border bg-surface ${
        changes.length > 0 ? "border-amber" : "depth-flush border-line"
      }`}
    >
      <div className="border-b border-line">
        <div className="aspect-[4/3] overflow-hidden bg-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={event.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
        {/*
          The credit sits under the photograph, not across it. An overlay needs a
          scrim, and the only scrim colour available is a themed one that inverts
          in the dark theme, so the caption either washes out or needs a literal
          outside the token file. Underneath needs neither.
        */}
        <p className="truncate px-3 py-1.5 text-micro font-semibold text-muted">
          Photo: {event.imageCredit}
        </p>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <StatusLabel tone="blue">{event.timeLabel}</StatusLabel>
          {changes.length > 0 ? (
            <ChangeBadge changes={changes} />
          ) : (
            <CalendarDots size={18} className="shrink-0 text-muted" aria-hidden="true" />
          )}
        </div>

        <h3 className="mt-3 text-[17px] font-bold leading-6 tracking-[-0.02em] text-ink">{event.name}</h3>
        <p className="mt-1 text-[13px] leading-5 text-muted">
          {event.venue} Â· {event.distance}
        </p>

        {changes.length > 0 && (
          <p className="mt-2 text-[13px] leading-5 text-amber">
            Details changed since the last check. Current price: {event.price}.
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="text-body-sm font-semibold text-ink">{event.price}</span>
          <Link
            href={`/events/${event.id}`}
            className="inline-flex items-center gap-1 text-[13px] font-bold text-blue hover:underline"
          >
            Open the event
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/** One place from the nearest-first sort, with the straight-line distance on it. */
export function PlaceCard({ place }: { place: Experience }) {
  const estimate = estimateFromUser(place.coordinates);

  return (
    <article className="lift depth-flush flex h-full flex-col border border-line bg-surface">
      <div className="border-b border-line">
        <div className="aspect-[3/2] overflow-hidden bg-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={place.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
        <p className="truncate px-3 py-1.5 text-micro font-semibold text-muted">
          Photo: {place.imageCredit}
        </p>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-green">
            {place.category}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-muted">
            <NavigationArrow size={13} aria-hidden="true" />
            {formatDistance(estimate.km)}
          </span>
        </div>

        <h3 className="mt-2 text-[15px] font-bold leading-6 tracking-[-0.02em] text-ink">
          <Link href={`/experience/${place.id}`} className="hover:text-blue hover:underline">
            {place.name}
          </Link>
        </h3>
        <p className="mt-1 text-[13px] leading-5 text-muted">
          {place.area} Â· {place.duration}
        </p>

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="text-body-sm font-semibold text-ink">{place.price}</span>
          <Link
            href={`/experience/${place.id}`}
            className="inline-flex items-center gap-1 text-[13px] font-bold text-blue hover:underline"
          >
            Open
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
