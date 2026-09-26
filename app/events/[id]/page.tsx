import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MapPin, NavigationArrow, ShieldCheck, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { eventSeed } from "@/lib/seed";
import { eventChanges, eventStatus, evaluateEvents, type EventStatus } from "@/lib/events";
import { BottomNav, StatusLabel } from "@/components/ui";
import { Footer } from "@/components/footer";
import { ReportButton } from "@/components/report-button";
import { AvailabilityPicker } from "@/components/availability-picker";
import { typeScale } from "@/components/ananta/tokens";
import { eventExpiry, eventRefusal, eventStartGap, eventWindowPassed } from "../event-rejection";

/**
 * `/events/[id]`, which is the route the dead "View event" buttons were
 * pretending to point at. An event with a real window is a real constraint
 * input: this page states the window, the travel estimate, whether the slot is
 * still reachable from the reference time, and what changed since the last
 * snapshot.
 *
 * Two things it deliberately does not do. It does not invent a booking, because
 * `MASTERPLAN.md` section 9 is explicit that the provider side is requests and
 * not transactions. And it does not call `Date.now()`: every time on the page
 * is a field on the record, read through a reference time the traveller sets
 * with the query string, so the page is byte identical across runs.
 */

const REFERENCE_DEFAULT = 30;

export default function EventDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { at?: string };
}) {
  const event = eventSeed.find((row) => row.id === params.id);
  if (!event) notFound();

  const parsed = Number(searchParams.at);
  const nowMinutes = Number.isFinite(parsed) && parsed >= 0 ? parsed : REFERENCE_DEFAULT;
  const status: EventStatus = eventStatus(event, nowMinutes);
  const reachable = status !== "Already ended" && status !== "Cannot reach in time";
  const evaluation = evaluateEvents([event], nowMinutes).reachable[0] ?? evaluateEvents([event], nowMinutes).excluded[0];
  const refusal = eventRefusal(
    { event, status, reachable, reason: "" },
    nowMinutes,
  );
  const changes = eventChanges(event);
  const expiry = eventExpiry(event);
  const gap = eventStartGap(event, nowMinutes);
  const confirmed =
    event.confidence === "Official organizer confirmation" ||
    event.confidence === "Organizer confirmed" ||
    event.confidence === "Official venue listing";

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1180px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/events" className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeft size={18} /> All events
          </a>
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Event record</span>
          <a href="/explore" className="text-sm font-bold text-blue">Explore</a>
        </header>

        <div className="grid lg:grid-cols-[1fr_400px]">
          <section className="p-5 sm:p-8 lg:p-12">
            <div className="relative h-56 border border-line sm:h-72">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <StatusLabel tone={confirmed ? "green" : "amber"}>{event.confidence}</StatusLabel>
                <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-white">
                  {event.category} · {event.venue}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] font-semibold text-muted">
              Photo: {event.imageCredit}. It shows the venue surroundings, not tonight&apos;s operations.
            </p>

            <h1 className="mt-8 text-4xl font-bold tracking-[-0.05em]">{event.name}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <StatusLabel tone={reachable ? "green" : "amber"}>{status}</StatusLabel>
              <span className="text-lg font-bold">{event.price}</span>
            </div>

            {changes.length > 0 && (
              <div className="mt-6 border border-amber bg-amberSoft/40 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-amber">
                  Changed since the last snapshot
                </p>
                <ul className="mt-2 space-y-1 text-sm leading-6">
                  {changes.map((change) => (
                    <li key={change.field}>
                      <span className="font-bold">{change.field}:</span> was {change.from}, now {change.to}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3 border-y border-line py-5 text-sm sm:grid-cols-4">
              <div>
                <p className="text-muted">Listed slot</p>
                <p className="mt-1 font-bold">{event.timeLabel}</p>
              </div>
              <div>
                <p className="text-muted">Travel estimate</p>
                <p className="mt-1 font-bold">{event.travelMinutes} min</p>
              </div>
              <div>
                <p className="text-muted">Your distance</p>
                <p className="mt-1 font-bold">{event.distance}</p>
              </div>
              <div>
                <p className="text-muted">Checked</p>
                <p className="mt-1 font-bold">{event.updated}</p>
              </div>
            </div>

            <section className="mt-6">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Can you reach it</p>
              <p className={`mt-2 ${typeScale.body}`}>
                {reachable
                  ? `The slot is ${gap} min after the reference time and the estimate is ${event.travelMinutes} min, so there is ${Math.max(0, gap - event.travelMinutes)} min of slack.`
                  : refusal?.sentence ?? eventWindowPassed({ event, status, reachable, reason: "" }, nowMinutes)}
              </p>
              {refusal && (
                <p className="mt-2 text-xs text-muted">
                  Built by the engine&apos;s sentence table, not a hand-written string. Code{" "}
                  <code className="text-ink">{refusal.code}</code>,{" "}
                  {refusal.shortfall === null
                    ? "no shortfall recorded"
                    : `${Math.round(refusal.shortfall * 10) / 10} min short`}
                  .
                </p>
              )}
              <p className="mt-2 text-xs leading-5 text-muted">{expiry.label}</p>
              {evaluation && <p className="mt-1 text-xs leading-5 text-muted">{evaluation.reason}</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                {[30, 60, 150, 990].map((minutes) => (
                  <a
                    key={minutes}
                    href={`/events/${event.id}?at=${minutes}`}
                    aria-current={minutes === nowMinutes ? "true" : undefined}
                    className={`inline-flex min-h-[44px] items-center border px-3 py-2 text-xs font-bold ${minutes === nowMinutes ? "border-blue bg-blue text-white" : "border-line bg-white"}`}
                  >
                    Reference {minutes} min
                  </a>
                ))}
              </div>
            </section>

            <section className="mt-8">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Before you go</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
                <li className="flex gap-3">
                  <Clock size={17} className="mt-0.5 shrink-0 text-blue" />
                  The window and the price are demo fields on this record, not a live organizer feed.
                </li>
                <li className="flex gap-3">
                  <MapPin size={17} className="mt-0.5 shrink-0 text-blue" />
                  {event.venue}. The travel figure is a straight-line estimate at the city congestion
                  multiplier, not a live route.
                </li>
                <li className="flex gap-3">
                  <NavigationArrow size={17} className="mt-0.5 shrink-0 text-blue" />
                  There is no ticket or booking here. Check the organizer listing directly before you
                  travel.
                </li>
              </ul>
            </section>
          </section>

          <aside className="border-t border-line bg-[#fbfcfd] p-5 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
            <div className="flex items-center gap-2 text-sm font-bold text-green">
              {confirmed ? <ShieldCheck size={19} /> : <WarningCircle size={19} className="text-amber" />}
              {confirmed ? "Source confirmed" : "Check before leaving"}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              {event.source} is the recorded source for this event. Anything that says otherwise is a
              different record.
            </p>

            <AvailabilityPicker placeName={event.name} />

            <div className="mt-5 text-center">
              <ReportButton recordId={event.id} recordTitle={event.name} />
            </div>
          </aside>
        </div>
        <Footer />
        <BottomNav />
      </div>
    </main>
  );
}
