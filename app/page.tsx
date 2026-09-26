import Link from "next/link";
import { allExperiences } from "@/lib/data";
import { eventSeed } from "@/lib/seed";
import { demoUserLocation, estimateFromUser } from "@/lib/location";
import { BottomNav, SectionHeading, StateNote } from "@/components/ui";
import { Footer } from "@/components/footer";
import { PlanBadge } from "@/components/plan-badge";
import { ProvenanceLegend } from "@/components/ananta/provenance-badge";
import { HomeHero } from "@/components/home/hero";
import { EventCard, PlaceCard } from "@/components/home/cards";

/**
 * The landing. Data in, sections out, no decisions.
 *
 * The sort, the slices, the seed, and the credibility line are exactly what the
 * previous revision had. This file is now the frame around them: a header, two
 * card grids, the routing note, and the chrome. Every number a visitor can read
 * still comes out of `lib/data`, `lib/seed`, `lib/location`, or
 * `components/ananta/records.ts`, because
 * `lib/ui-guard/hardcoded-numbers.test.ts` fails the build on a count typed into
 * a view layer string.
 *
 * The hero and its two card grids live in `components/home/` because they are the
 * landing's and nothing else renders them. The search bar inside the hero is a
 * client component in its own file, so the catalogue behind the credibility line
 * never reaches the browser.
 */
export default function HomePage() {
  const nearest = [...allExperiences]
    .sort((a, b) => estimateFromUser(a.coordinates).km - estimateFromUser(b.coordinates).km)
    .slice(0, 8);

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1480px] bg-surface lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-shell lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" className="h-9 w-9" />
            <span className="text-lg font-bold tracking-[-0.03em]">Ananta</span>
          </div>
          <nav
            aria-label="Primary"
            className="hidden items-center gap-7 text-sm font-semibold text-muted lg:flex"
          >
            <a className="text-ink" href="/" aria-current="page">
              Discover
            </a>
            <a href="/explore">Explore</a>
            <a href="/events">Events</a>
            <a href="/trips" className="inline-flex items-center gap-1.5">
              Trips <PlanBadge />
            </a>
            <a href="/saved">Saved</a>
            <a href="/profile">Profile</a>
          </nav>
          <Link
            href="/explore?city=Mumbai"
            className="rounded border border-line px-3 py-2 text-sm font-semibold text-ink hover:border-blue hover:text-blue"
          >
            Mumbai
          </Link>
        </header>

        <HomeHero />

        {/* The landing prints a straight-line distance on every card below, so the
            `routing-down` state is rendered rather than written as a disclaimer
            in prose. It is a first-class state, not a bug report. */}
        <div className="px-5 pt-10 sm:px-8 lg:px-14">
          <StateNote state="routing-down" className="max-w-[68ch]">
            <p className="text-xs leading-5 text-muted">
              Every distance on this page comes from{" "}
              <code className="text-[11px] text-ink">estimateFromUser</code> in{" "}
              <code className="text-[11px] text-ink">lib/location.ts</code>: great-circle distance to
              the pin, times a 1.3 street factor, at five minutes per kilometre. The demo position is a
              fixed point in the city, chosen so the walk estimate is reproducible, and it is not your
              location.
            </p>
          </StateNote>
        </div>

        {/* `stage-3d` on the grid and not on the card: the perspective has to be
            on the container for `.lift` to raise a card toward the viewer. The
            contract puts `preserve-3d` on containers only, and so does this. */}
        <section className="border-b border-line px-5 py-10 sm:px-8 lg:px-14 lg:py-12">
          <SectionHeading eyebrow="Starting soon" title="Happening near you" href="/events" />
          <div className="stage-3d mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {eventSeed.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>

        <section className="px-5 py-10 sm:px-8 lg:px-14 lg:py-12">
          <SectionHeading
            eyebrow={`Nearest to ${demoUserLocation.label}`}
            title="Local places worth a look"
            href="/explore"
          />
          <div className="stage-3d mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {nearest.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
          <ProvenanceLegend />
        </section>

        <Footer />
        <BottomNav />
      </div>
    </main>
  );
}
