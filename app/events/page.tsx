"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDots, CaretDown, Clock, MapPin, NavigationArrow, ShieldCheck, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { evaluateEvents, eventChanges, type EventEvaluation } from "@/lib/events";
import { eventSeed, type EventSeed } from "@/lib/seed";
import { ReportButton } from "@/components/report-button";
import { BottomNav, StatusLabel } from "@/components/ui";
import { Footer } from "@/components/footer";
import { typeScale } from "@/components/ananta/tokens";
import { eventExpiry, eventRefusal, eventStartGap, eventWindowPassed } from "./event-rejection";
import { NothingReachableState } from "./event-rejection-client";

/**
 * Events, and the two defects the brief named.
 *
 * Every "View event" button used to be a dead control, because there was no
 * `/events/[id]` route. Option one of the three in the brief was to delete the
 * button and make the card informational. That was rejected: an event with a real
 * time window is a real constraint input, and `lib/events.ts` already computes
 * whether one is still reachable from the traveller's position, which is
 * information worth a page. So the route exists now, at `/events/[id]`.
 *
 * The reason line on each card is no longer `lib/events.ts`'s hand-written
 * prose. It is a real `Rejection` built by `event-rejection.ts` and rendered
 * through the engine's own sentence table, because RULE 0 forbids a view-layer
 * rejection string and this was exactly the case it covers.
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
      <div className="mx-auto min-h-screen max-w-[1180px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeft size={18} /> Home
          </a>
          <h1 className="text-lg font-bold">Happening near me</h1>
          <a href="/explore" className="text-sm font-bold text-blue">Explore map</a>
        </header>

        <section className="px-5 pb-28 pt-10 sm:px-8 lg:px-14 lg:pb-14">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Mumbai and Navi Mumbai</p>
            <h2 className="mt-3 text-4xl font-bold tracking-[-0.05em]">Events you can realistically reach.</h2>
            <p className="mt-4 leading-7 text-muted">
              Demo schedules are checked against a reference time you set, a travel estimate, and the event
              window before anything is shown. Events you cannot reach are listed at the bottom with the
              number that put them there.
            </p>
          </div>

          <div className="mt-8 flex items-center gap-3 border-b border-line pb-5">
            <CalendarDots size={20} className="shrink-0 text-blue" />
            <input
              aria-label="Search events"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search art, markets, performances"
              className="w-full bg-transparent text-sm font-semibold outline-none"
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
            <span>Reference time:</span>
            {REFERENCE_TIMES.map((option) => (
              <button
                key={option.value}
                onClick={() => setNowMinutes(option.value)}
                aria-pressed={nowMinutes === option.value}
                className={`min-h-[44px] rounded-lg border px-3 py-2 ${nowMinutes === option.value ? "border-blue bg-blue text-white" : "border-line bg-white"}`}
              >
                {option.label}
              </button>
            ))}
            <span className="ml-1 font-normal">
              {nowMinutes} minutes after the reference. Every window below is measured from here.
            </span>
          </div>

          <div className="mt-6 grid gap-4">
            {filtered.map((row) => (
              <EventCard key={row.event.id} row={row} nowMinutes={nowMinutes} />
            ))}
          </div>

          {!filtered.length && <NothingReachableState onWiden={reset} />}

          {evaluation.excluded.length > 0 && (
            <section className="mt-8 border-t border-line pt-5">
              <button
                onClick={() => setShowExcluded(!showExcluded)}
                aria-expanded={showExcluded}
                className="flex min-h-[44px] w-full items-center justify-between text-left text-sm font-bold"
              >
                <span>
                  Why {evaluation.excluded.length} event{evaluation.excluded.length === 1 ? " was" : "s were"} excluded
                </span>
                <CaretDown size={17} className={showExcluded ? "rotate-180" : ""} />
              </button>
              {showExcluded && (
                <div className="mt-3 space-y-3">
                  {evaluation.excluded.map((row) => {
                    const refusal = eventRefusal(row, nowMinutes);
                    return (
                      <div key={row.event.id} className="bg-canvas p-3">
                        <p className="text-sm font-bold">{row.event.name}</p>
                        <p className="mt-1 text-xs font-semibold text-amber">{row.status}</p>
                        {refusal ? (
                          <p className="mt-1 text-xs leading-5 text-muted">
                            {refusal.sentence}{" "}
                            <code className="text-[10px]">{refusal.code}</code>
                          </p>
                        ) : (
                          <p className="mt-1 text-xs leading-5 text-muted">
                            {eventWindowPassed(row, nowMinutes)}{" "}
                            <a href={`/events/${row.event.id}`} className="font-bold text-blue underline">
                              Open the record
                            </a>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
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
    <article className={`grid gap-5 border p-5 sm:grid-cols-[160px_1fr_auto] sm:items-center ${changes.length ? "border-amber bg-amberSoft/40" : "border-line"}`}>
      {changes.length > 0 && (
        <div className="border border-amber bg-white p-3 sm:col-span-3">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-amber">
            This record changed since the last snapshot
          </p>
          <ul className="mt-2 space-y-1 text-sm leading-6">
            {changes.map((change) => (
              <li key={change.field}>
                <span className="font-bold">{change.field}:</span> was {change.from}, now {change.to}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-5 text-muted">
            The world moved and the record moved with it. Re-check the source before planning around this.
          </p>
        </div>
      )}

      <div className="relative h-28 overflow-hidden border border-line bg-[#dfe8e5] sm:h-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={event.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        <span className="absolute bottom-1 left-1 right-1 truncate text-[9px] font-semibold text-white drop-shadow">
          Photo: {event.imageCredit}
        </span>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusLabel tone={confirmed ? "green" : "amber"}>{event.confidence}</StatusLabel>
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{status}</span>
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{event.category}</span>
        </div>
        {event.confidence === "Community reported" && (
          <p className="mt-2 text-xs leading-5 text-muted">
            From a public event submission in this demo, not an organizer feed. The organizer listing is
            the source of truth.
          </p>
        )}
        <h3 className="mt-4 text-xl font-bold tracking-[-0.02em]">{event.name}</h3>
        <p className="mt-2 text-sm text-muted">{event.venue} · {event.distance}</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted">
          <span><Clock size={14} className="mr-1 inline" />{event.timeLabel}</span>
          <span><MapPin size={14} className="mr-1 inline" />{event.source}</span>
          <span><NavigationArrow size={14} className="mr-1 inline" />Checked {event.updated}</span>
        </div>
        <p className="mt-3 text-xs leading-5 text-blue">
          {row.reason} Reachable with {Math.max(0, gap - event.travelMinutes)} min to spare against the{" "}
          {event.travelMinutes} min estimate.
        </p>
        <p className="mt-1 text-[11px] leading-5 text-muted">{expiry.label}</p>
      </div>

      <div className="sm:text-right">
        <p className="text-lg font-bold">{event.price}</p>
        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-muted sm:justify-end">
          {confirmed ? <ShieldCheck size={14} className="text-green" /> : <WarningCircle size={14} className="text-amber" />}
          {confirmed ? "Current source confirmed" : "Check before leaving"}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 sm:justify-end">
          {/* A real link to a real route. The old control did nothing at all. */}
          <a
            href={`/events/${event.id}`}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-bold text-ink hover:border-blue hover:text-blue"
          >
            View event <ArrowRight size={15} />
          </a>
          <a
            href={`/explore?q=${encodeURIComponent(reached)}`}
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-blue"
          >
            Places near {reached}
          </a>
          <ReportButton recordId={event.id} recordTitle={event.name} />
        </div>
      </div>
    </article>
  );
}

