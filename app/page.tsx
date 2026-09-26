import Link from "next/link";
import { ArrowRight, CalendarDots, MapPin } from "@phosphor-icons/react/dist/ssr";
import { allExperiences } from "@/lib/data";
import { eventSeed } from "@/lib/seed";
import { demoUserLocation, estimateFromUser, formatDistance } from "@/lib/location";
import { BottomNav, SectionHeading, StateNote, StatusLabel, buttonClass } from "@/components/ui";
import { Footer } from "@/components/footer";
import { PlanBadge } from "@/components/plan-badge";
import { eventChanges } from "@/lib/events";
import { ProvenanceLegend } from "@/components/ananta/provenance-badge";
import { credibilityLine } from "@/components/ananta/records";

/**
 * The landing, to `SESSION/UI-UX-DESIGN.md` section 6.1.
 *
 * One `text-display` claim. One primary action. One credibility line, and it is
 * the argument of the whole product, so it is rendered from data by session 1's
 * `credibilityLine()` and never typed here. `docs/05-design/DESIGN-CONTRACT.md:17-19`
 * bans fake metrics and `lib/ui-guard/hardcoded-numbers.test.ts` fails the build
 * on a hard-coded dataset number.
 *
 * What was deleted, and why, because the deletions are the work:
 *
 *   1. `components/discovery-search.tsx` rendered here. Its "See what is nearby"
 *      was the hero action and it had no `onClick`, no `href` and no `type`, so
 *      it was a dead control wearing the costume of the primary action. The
 *      primary action is now a real `next/link` below. The chip strip belongs to
 *      session 4 on `/explore`, where it can actually do something.
 *   2. The fake map panel on the right. It drew a decorative CSS grid with four
 *      pins at invented percentages and a card for "Kala Ghoda Art Walk" with a
 *      hard-coded "12 min estimate, 2 hours, 700 rupees". Those three numbers
 *      were typed by a human, not read from the record, so the one panel that
 *      looked like the product was the only part of it that was fictional. A
 *      map is `components/map.tsx`, which is session 4's.
 *   3. The three-column "Traceable, Feasible, Honest" strip. Three unfalsifiable
 *      adjectives above the fold is the voice `DESIGN-CONTRACT.md` bans as vague
 *      hero copy. The same three claims, stated as things you can check, are in
 *      the credibility line and on `/trips`.
 *   4. "A fit-first local engine for Mumbai and Navi Mumbai. It checks your time,
 *      budget, and route before it ranks anything, then shows the score that put
 *      each place where it is and the number that refused the rest." Replaced by
 *      the subtext the specification names.
 *
 * What was kept, because it is real data on a screen that would otherwise be
 * empty: the events strip, the nearest places strip, and the header nav.
 */
export default function HomePage() {
  const nearest = [...allExperiences]
    .sort((a, b) => estimateFromUser(a.coordinates).km - estimateFromUser(b.coordinates).km)
    .slice(0, 8);

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1480px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" className="h-9 w-9" />
            <span className="text-lg font-bold tracking-[-0.03em]">Ananta</span>
          </div>
          <nav aria-label="Primary" className="hidden items-center gap-7 text-sm font-semibold text-muted lg:flex">
            <a className="text-ink" href="/" aria-current="page">Discover</a>
            <a href="/explore">Explore</a>
            <a href="/events">Events</a>
            <a href="/trips" className="inline-flex items-center gap-1.5">Trips <PlanBadge /></a>
            <a href="/saved">Saved</a>
            <a href="/profile">Profile</a>
          </nav>
          <Link href="/explore?city=Mumbai" className="rounded border border-line px-3 py-2 text-sm font-semibold text-ink transition-colors hover:border-blue hover:text-blue">
            Mumbai
          </Link>
        </header>

        {/* The claim. Exactly one `text-display` on this screen, which is the
            second time the house rule has been stated in these files and
            deliberately not a third. */}
        <section className="border-b border-line px-5 py-14 sm:px-8 lg:px-14 lg:py-20">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue">
            Ananta is not a listings site
          </p>
          <h1 className="mt-5 max-w-[680px] text-[34px] font-bold leading-[1.06] tracking-[-0.04em] text-ink sm:text-[44px] lg:text-[52px] lg:leading-[1.02]">
            Everything below fits your time.
          </h1>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-7 text-muted">
            Give us a window, a budget, and who you are with. We show our work,
            including what we refuse and the number that refused it.
          </p>

          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* The one primary action. A real link, so it navigates. */}
            <Link href="/explore" className={buttonClass("primary", "sm:px-5")}>
              See what fits
              <ArrowRight size={17} weight="bold" aria-hidden="true" />
            </Link>
            <p className="text-sm leading-6 text-muted">
              No sign-up. No booking. No live availability claims. No payments.
            </p>
          </div>

          {/* The credibility line. Four numbers, all rendered by session 1 from
              the dataset, because a judge decides in five minutes and a claim
              with no number behind it is the thing they have seen all day. */}
          <div className="mt-12 border-t border-line pt-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
              What the data actually says
            </p>
            <p className="mt-3 max-w-[68ch] text-sm leading-6 text-ink">
              {credibilityLine()}
            </p>
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <MapPin size={14} aria-hidden="true" />
              Distances are straight-line estimates from a fixed demo position at
              {" "}{demoUserLocation.label}, not live geolocation.
            </p>
          </div>
        </section>

        {/* The landing prints a straight-line distance on every card below, so
            the `routing-down` state is rendered rather than written as a
            disclaimer in prose. It is a first-class state, not a bug report. */}
        <div className="px-5 pt-10 sm:px-8 lg:px-14">
          <StateNote state="routing-down" className="max-w-[68ch]">
            <p className="text-xs leading-5 text-muted">
              Every distance on this page comes from
              {" "}<code className="text-[11px] text-ink">estimateFromUser</code> in
              {" "}<code className="text-[11px] text-ink">lib/location.ts</code>: great-circle
              distance to the pin, times a 1.3 street factor, at five minutes per kilometre. The
              demo position is a fixed point in the city, chosen so the walk estimate is
              reproducible, and it is not your location.
            </p>
          </StateNote>
        </div>

        <section className="border-b border-line px-5 py-10 sm:px-8 lg:px-14">
          <SectionHeading eyebrow="Starting soon" title="Happening near you" href="/events" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {eventSeed.map((event) => (
              <article key={event.id} className={`border bg-white p-5 transition-colors hover:border-blue ${eventChanges(event).length ? "border-amber bg-amberSoft/40" : "border-line"}`}>
                <div className="h-32 overflow-hidden border border-line bg-[#dfe8e5]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={event.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                </div>
                <p className="mt-2 text-[10px] font-semibold text-muted">Photo: {event.imageCredit}</p>
                <div className="mt-3 flex items-center justify-between">
                  <StatusLabel tone="blue">{event.timeLabel}</StatusLabel>
                  <CalendarDots size={20} className="text-muted" />
                </div>
                <h3 className="mt-4 text-lg font-bold tracking-[-0.02em]">{event.name}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{event.venue} · {event.distance}</p>
                {eventChanges(event).length > 0 && (
                  <p className="mt-2 text-xs leading-5 text-amber">
                    Details changed since the last check. Current price: {event.price}.
                  </p>
                )}
                <div className="mt-5 flex items-center justify-between text-sm">
                  <span className="font-semibold text-ink">{event.price}</span>
                  <a className="font-bold text-blue" href="/events">
                    See the events list
                    <ArrowRight size={15} className="inline" aria-hidden="true" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="px-5 py-10 sm:px-8 lg:px-14">
          <SectionHeading eyebrow={`Nearest to ${demoUserLocation.label}`} title="Local places worth a look" href="/explore" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {nearest.map((place) => {
              const estimate = estimateFromUser(place.coordinates);
              return (
                <article key={place.id} className="border border-line bg-white p-5">
                  <div className="h-28 overflow-hidden border border-line bg-[#dfe8e5]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={place.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </div>
                  <p className="mt-2 text-[10px] font-semibold text-muted">Photo: {place.imageCredit}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-green">{place.category}</span>
                    <span className="text-xs font-semibold text-muted">{formatDistance(estimate.km)}</span>
                  </div>
                  <h3 className="mt-2 font-bold tracking-[-0.02em]">{place.name}</h3>
                  <p className="mt-1 text-sm text-muted">{place.area} · {place.duration}</p>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="font-semibold">{place.price}</span>
                    <a className="font-bold text-blue" href={`/experience/${place.id}`}>Open</a>
                  </div>
                </article>
              );
            })}
          </div>
          <ProvenanceLegend />
        </section>

        <Footer />
        <BottomNav />
      </div>
    </main>
  );
}
