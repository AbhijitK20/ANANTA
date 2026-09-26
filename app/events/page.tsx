"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CaretDown,
  Clock,
  MagnifyingGlass,
  MapPin,
  NavigationArrow,
  ShieldCheck,
  WarningCircle,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { evaluateEvents, eventChanges, type EventEvaluation } from "@/lib/events";
import { eventSeed } from "@/lib/seed";
import { ReportButton } from "@/components/report-button";
import { BottomNav, StatusLabel } from "@/components/ui";
import { Footer } from "@/components/footer";
import { ChangeBadge } from "@/components/events/change-badge";
import { eventExpiry, eventRefusal, eventStartGap, eventWindowPassed } from "./event-rejection";
import { NothingReachableState } from "./event-rejection-client";

/**
 * Events, as a feed rather than a stack of bands.
 *
 * The evaluation is unchanged. `evaluateEvents(eventSeed, nowMinutes)` still sorts
 * by `startMinutes`, still splits reachable from excluded, and the search still
 * filters on name, venue, and category. What changed is the shape of the result:
 * one ordered column with a rail down the left, because an event is a point in
 * time and a grid of equal cards throws that away.
 *
 * Two things the previous revision got right and this one keeps:
 *
 *   1. Every "View event" control is a real link to `/events/[id]`, which exists.
 *      It used to be a button with no handler, and the option chosen at the time
 *      was to delete it. An event with a real window is a real constraint input,
 *      and `lib/events.ts` already computes whether one is still reachable from
 *      where the traveller is, which is worth a page.
 *   2. The reason line is a real `Rejection` built by `event-rejection.ts` and
 *      rendered through the engine's own sentence table. RULE 0 forbids a
 *      view-layer rejection string and this is the case it covers.
 *
 * The change-detection badge is the same component the landing strip uses, so a
 * record that moved reads the same on both routes.
 */

const REFERENCE_TIMES = [
  { label: "Now", value: 30 },
  { label: "+30 min", value: 60 },
  { label: "+2 hours", value: 150 },
  { label: "+16 hours", value: 990 },
];

export default function EventsPage() {
  const [query, setQuery] = useState("");
  const [showExcluded, setShowExcluded] = useState(false);
  const [nowMinutes, setNowMinutes] = useState(30);

  const evaluation = useMemo(() => evaluateEvents(eventSeed, nowMinutes), [nowMinutes]);
  const filtered = useMemo(
    () =>
      evaluation.reachable.filter(({ event }) =>
        `${event.name} ${event.venue} ${event.category}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [evaluation, query],
  );

  const reset = () => {
    setQuery("");
    setNowMinutes(30);
  };

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1180px] bg-surface lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-shell lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-bold">
            <ArrowLeft size={18} aria-hidden="true" /> Home
          </a>
          <h1 className="text-[17px] font-bold tracking-[-0.02em]">Happening near me</h1>
          <a href="/explore" className="text-sm font-bold text-blue hover:underline">
            Explore map
          </a>
        </header>

        <section className="px-5 pb-28 pt-10 sm:px-8 lg:px-14 lg:pb-14">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue">
              Mumbai and Navi Mumbai
            </p>
            <h2 className="mt-3 text-[28px] font-bold leading-[34px] tracking-[-0.05em] sm:text-[34px]">
              Events you can realistically reach.
            </h2>
            <p className="mt-4 text-body leading-7 text-muted">
              Demo schedules are checked against a reference time you set, a travel estimate, and the
              event window before anything is shown. Events you cannot reach are listed at the bottom
              with the number that put them there.
            </p>
          </div>

          <div className="mt-8 rounded-card border border-line bg-canvas p-4">
            <div className="flex items-center gap-2 rounded-input border border-line bg-surface px-3 py-1 transition-colors duration-200 focus-within:border-blue">
              <MagnifyingGlass size={19} className="shrink-0 text-muted" aria-hidden="true" />
              <input
                aria-label="Search events"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search art, markets, performances"
                className="min-w-0 flex-1 bg-transparent py-2 text-body-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear the search"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-chip text-muted hover:bg-canvas hover:text-ink"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                Reference time
              </span>
              <div className="inline-flex flex-wrap gap-1 rounded-input border border-line bg-surface p-1">
                {REFERENCE_TIMES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setNowMinutes(option.value)}
                    aria-pressed={nowMinutes === option.value}
                    className={`min-h-[44px] rounded-chip px-3 py-2 text-[13px] font-bold ${
                      nowMinutes === option.value
                        ? "bg-blue text-onAccent"
                        : "text-muted hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-5 text-muted">
              {nowMinutes} minutes after the reference. Every window below is measured from here.
            </p>
          </div>

          <p aria-live="polite" className="mt-8 text-[13px] font-semibold text-muted">
            {evaluation.reachable.length} reachable from where you are,{" "}
            {evaluation.excluded.length} held back with the number that put them there.
          </p>

          {/* `stage-3d` is on the list, never on a card, so `.lift` has a
              perspective to raise toward. The rail is a flex sibling of each card
              rather than an absolutely positioned line, so it stops at the last
              entry without a per-item height calculation. */}
          <ol className="stage-3d mt-4 space-y-4">
            {filtered.map((row, index) => (
              <li key={row.event.id} className="flex gap-4">
                <div aria-hidden="true" className="flex w-4 shrink-0 flex-col items-center">
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full border-2 border-line ${
                      eventChanges(row.event).length > 0 ? "bg-amber" : "bg-blue"
                    }`}
                  />
                  {index < filtered.length - 1 && <span className="w-0.5 flex-1 bg-line" />}
                </div>
                <div className="min-w-0 flex-1">
                  <EventCard row={row} nowMinutes={nowMinutes} />
                </div>
              </li>
            ))}
          </ol>

          {!filtered.length && <NothingReachableState onWiden={reset} />}

          {evaluation.excluded.length > 0 && (
            <section className="mt-10 border-t border-line pt-5">
              <button
                onClick={() => setShowExcluded(!showExcluded)}
                aria-expanded={showExcluded}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left text-sm font-bold"
              >
                <span>
                  Why {evaluation.excluded.length} event
                  {evaluation.excluded.length === 1 ? " was" : "s were"} excluded
                </span>
                <CaretDown
                  size={17}
                  className={`shrink-0 transition-transform duration-200 ${showExcluded ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {showExcluded && (
                <ol className="mt-3 space-y-3">
                  {evaluation.excluded.map((row) => {
                    const refusal = eventRefusal(row, nowMinutes);
                    return (
                      <li key={row.event.id} className="border border-line bg-canvas p-3">
                        <p className="text-body-sm font-bold text-ink">{row.event.name}</p>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-amber">
                          {row.status}
                        </p>
                        {refusal ? (
                          <p className="mt-1 text-[13px] leading-5 text-muted">
                            {refusal.sentence}{" "}
                            <code className="text-[11px]">{refusal.code}</code>
                          </p>
                        ) : (
                          <p className="mt-1 text-[13px] leading-5 text-muted">
                            {eventWindowPassed(row, nowMinutes)}{" "}
                            <a href={`/events/${row.event.id}`} className="font-bold text-blue underline">
                              Open the record
                            </a>
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          )}
        </section>
        <Footer />
        <BottomNav />
      </div>
    </main>
  );
}

function EventCard({ row, nowMinutes }: { row: EventEvaluation; nowMinutes: number }) {
  const { event, status } = row;
  const changes = eventChanges(event);
  const expiry = eventExpiry(event);
  const confirmed =
    event.confidence === "Official organizer confirmation" ||
    event.confidence === "Organizer confirmed" ||
    event.confidence === "Official venue listing";
  const gap = eventStartGap(event, nowMinutes);
  const reached = event.venue.split(",")[0].trim();

  return (
    <article
      className={`lift flex h-full flex-col border bg-surface sm:flex-row ${
        changes.length > 0 ? "border-amber" : "depth-flush border-line"
      }`}
    >
      <div className="shrink-0 border-b border-line sm:w-44 sm:border-b-0 sm:border-r">
        <div className="h-36 overflow-hidden bg-canvas sm:h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={event.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
        {/* Under the photograph rather than across it: an overlay needs a scrim,
            and the only scrim colour available is a themed one that inverts in
            the dark theme. This is a caption, so it goes where a caption goes. */}
        <p className="truncate px-2 py-1.5 text-micro font-semibold text-muted sm:border-t sm:border-line">
          Photo: {event.imageCredit}
        </p>
      </div>

      <div className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel tone={confirmed ? "green" : "amber"}>{event.confidence}</StatusLabel>
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{status}</span>
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            {event.category}
          </span>
          {/* The delta, collapsed. Open it and the before and after of every
              field that moved are both on screen. */}
          <ChangeBadge changes={changes} />
        </div>

        {event.confidence === "Community reported" && (
          <p className="mt-2 text-[13px] leading-5 text-muted">
            From a public event submission in this demo, not an organizer feed. The organizer listing is
            the source of truth.
          </p>
        )}

        <h3 className="mt-3 text-title font-bold tracking-[-0.03em] text-ink">{event.name}</h3>
        <p className="mt-1 text-body-sm text-muted">
          {event.venue} Â· {event.distance}
        </p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-semibold text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock size={14} aria-hidden="true" />
            {event.timeLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin size={14} aria-hidden="true" />
            {event.source}
          </span>
          <span className="inline-flex items-center gap-1">
            <NavigationArrow size={14} aria-hidden="true" />
            Checked {event.updated}
          </span>
        </div>

        <p className="mt-3 text-[13px] leading-5 text-blue">
          {row.reason} Reachable with {Math.max(0, gap - event.travelMinutes)} min to spare against
          the {event.travelMinutes} min estimate.
        </p>
        <p className="mt-1 text-micro text-muted">{expiry.label}</p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-[17px] font-bold text-ink">{event.price}</p>
            <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-muted">
              {confirmed ? (
                <ShieldCheck size={14} className="text-green" aria-hidden="true" />
              ) : (
                <WarningCircle size={14} className="text-amber" aria-hidden="true" />
              )}
              {confirmed ? "Current source confirmed" : "Check before leaving"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {/* A real link to a real route. */}
            <a
              href={`/events/${event.id}`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-input border border-line px-4 py-2 text-[13px] font-bold text-ink hover:border-blue hover:text-blue"
            >
              View event <ArrowRight size={15} aria-hidden="true" />
            </a>
            <a
              href={`/explore?q=${encodeURIComponent(reached)}`}
              className="inline-flex min-h-[44px] items-center gap-1 text-[13px] font-bold text-blue hover:underline"
            >
              Places near {reached}
            </a>
            <ReportButton recordId={event.id} recordTitle={event.name} />
          </div>
        </div>
      </div>
    </article>
  );
}
