import { notFound } from "next/navigation";
import { ArrowLeft, ArrowSquareOut, CheckCircle, MapPin } from "@phosphor-icons/react/dist/ssr";
import { ExperienceMedia } from "@/components/experience-media";
import { AreaHero } from "@/components/experience/area-hero";
import { PlaceActionBar } from "@/components/experience/action-bar";
import { FieldTile } from "@/components/experience/confidence-chip";
import { AvailabilityPicker } from "@/components/availability-picker";
import { BottomNav, StateNote, StatusLabel } from "@/components/ui";
import { Footer } from "@/components/footer";
import { TravelOptions } from "@/components/travel-options";
import { ProvenanceLegend } from "@/components/ananta/provenance-badge";
import { GradedAccess, GradedFacts, ProvenanceStrip } from "@/components/ananta/provenance/graded-facts";
import { AbstainedPanel, PartiallyUnknownPanel } from "@/components/ananta/provenance/state-panel";
import { WhyThisLive } from "@/components/ananta/why-this-live";
import { coordinatesSummary, hoursSummary, priceSummary } from "@/components/ananta/provenance/rows";
import { anantaById } from "@/components/ananta/records";
import { clockLabel, hoursLabel, inrLabel, type EngineInput } from "@/components/ananta/pipeline";
import { typeScale } from "@/components/ananta/tokens";
import { demoUserLocation, estimateFromUser, stationLabel } from "@/lib/location";
import { allExperiences } from "@/lib/data";
import type { Experience } from "@/lib/seed";

/**
 * The place page.
 *
 * Three fixes live here. `allExperiences[0]` used to be the fallback, so
 * `/experience/anything-garbage` returned HTTP 200 rendering Kala Ghoda Art
 * Walk; that is now `notFound()`, backed by a real 404 in
 * `app/experience/not-found.tsx`. The "Share experience" button had no handler;
 * it now shares, and says so when the browser cannot. And the four hardcoded
 * "Why this is recommended" bullets are gone, replaced by the real ranked
 * components from the same objective the ranking used.
 *
 * The fourth thing this page now carries is the graded-facts table, which is the
 * part of the product that answers "can I trust this?". Every row has a value,
 * an honest absence, and a badge for that field alone. A record with real
 * coordinates and a generated price has two different stories and one badge at
 * the top of the page can only tell one of them.
 *
 * What the visual redesign added, and what it did not:
 *
 *  - A hero that says on its face that the photograph is the area and not the
 *    venue. See `components/experience/area-hero.tsx`.
 *  - One sticky bar for the four actions, so the two that change something are
 *    not below the fold. See `components/experience/action-bar.tsx`.
 *  - Four headline facts, each wearing the confidence badge for its own field, so
 *    the trust signal is the first thing a reader meets rather than something
 *    they have to scroll to. See `components/experience/confidence-chip.tsx`.
 *  - Nothing new was claimed. Every value on this page is read from the record
 *    or from the shared summarisers in `ananta/provenance/rows.ts`, so a tile
 *    and its row in the graded table below cannot say two different things about
 *    the same field.
 */

/** About copy is derived only from fields the record actually has. */
function aboutLinesFor(place: Experience): string[] {
  const lines: string[] = [];
  lines.push(`${place.name} sits in ${place.area} (${place.city}), in the ${place.zone} zone. The nearest station on record is ${place.station}.`);
  if (place.bestTime) lines.push(`The record's timing guidance: ${place.bestTime.toLowerCase()}.`);
  if (place.category === "Nightlife") lines.push("This is an evening record; last-check times and schedules should be confirmed with the venue before going.");
  else if (place.category === "Nature") lines.push("An outdoor record: carry water, check the weather, and expect unlit sections after dark where noted.");
  else if (place.category === "Food") lines.push("A food route: counters and cafes on this record are small, so expect queues at peak hours.");
  else if (place.category === "Shopping") lines.push("A market-street record: most stalls are cash-first and hours follow daylight trade.");
  else if (place.category === "Culture") lines.push("A heritage-and-arts record: buildings and lanes here are old; watch for closed sections.");
  else if (place.category === "Workshop") lines.push("A hands-on session with limited seats; booking and timings need confirmation with the operator.");
  else if (place.category === "Family") lines.push("A family-friendly record with open lawns and evening crowds on weekends.");
  else if (place.category === "Adventure") lines.push("An activity record: instructor-led slots and open trails need weather and operator confirmation before you go.");
  else if (place.category === "Recreation") lines.push("A leisure record: gardens, promenades, and clubs are public or membership spaces; hours follow daylight.");
  else if (place.category === "Stay") lines.push("A stay record: nightly demo rates are indicative only, and booking is not live in this prototype.");
  if (place.confidence.startsWith("Location matched on OpenStreetMap")) lines.push("The pin on the map matches this place's OpenStreetMap location; the area photo shows the neighborhood around it.");
  else if (place.confidence.includes("area center")) lines.push(`The pin marks the ${place.area} area center, not the exact venue; treat the map position as approximate.`);
  return lines;
}

/** Fields the gate would not judge, named so the abstention is itemised. */
function abstainedFields(place: Experience): string[] {
  const fields: string[] = [];
  if (!place.bestTime) fields.push("Best time of day");
  if (place.sourceUrl.includes("example.com")) fields.push("Source link");
  if (place.confidence === "Demo data, not live") fields.push("Operator confirmation");
  return fields;
}

export default function ExperiencePage({ params }: { params: { id: string } }) {
  // An unknown id is a 404, not a redirect onto the first record.
  const place = allExperiences.find((item) => item.id === params.id);
  if (!place) notFound();
  const record = anantaById[params.id];
  if (!record) notFound();

  // The same context the Explore page ranks with, so the "why this" panel here
  // cannot disagree with the card the traveller clicked.
  const input: EngineInput = {
    query: "",
    cityId: place.city === "Navi Mumbai" ? "navi-mumbai" : "mumbai",
    city: place.city,
    category: "All",
    zone: "All",
    availableMinutes: 240,
    budgetInr: 1500,
    startTime: "10:00",
    deadline: null,
    rainMode: false,
    freeOnly: false,
    communityOnly: false,
    bestTimeOfDay: "any",
    partySize: 1,
    hasToddler: false,
    hasElderly: false,
    pace: "normal",
    idealStops: 3,
    minStops: 1,
    travelMode: "walk",
    planIds: [],
    originCoordinates: demoUserLocation.coordinates,
    originLabel: demoUserLocation.label,
    originArea: demoUserLocation.area,
  };
  const estimate = estimateFromUser(place.coordinates);
  const soldOutAt = record.availability.soldOutAt;
  const price = record.priceInr === 0 ? "Free" : inrLabel(record.priceInr);

  // The four headline facts are the shared summarisers, not a second rendering
  // of the same fields. A tile and its row in the graded table below therefore
  // cannot disagree, because they are the same call.
  const hours = hoursSummary(record);
  const where = coordinatesSummary(record);
  const ticket = priceSummary(record);

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1180px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/explore" className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeft size={18} /> Back to explore
          </a>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Place detail</p>
        </header>

        <PlaceActionBar place={place} priceLabel={price} />

        <div className="grid lg:grid-cols-[1fr_420px]">
          <section className="p-5 sm:p-8 lg:p-12">
            <AreaHero place={place} />

            <div className="mt-8">
              <h1 className="text-4xl font-bold tracking-[-0.05em]">{place.name}</h1>
              <p className="mt-3 max-w-[62ch] text-base leading-7 text-muted">{place.description}</p>
            </div>

            {/*
              The trust signal, above the fold. Four fields, four badges, and the
              badge beside a number is the badge for that number. A reader who
              stops here still learns which of these four is a person and which
              is our arithmetic.
            */}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FieldTile label="Price" value={ticket.value} record={record} field="price" />
              <FieldTile
                label="Visit length"
                value={hoursLabel(record.durationMinutes)}
                record={record}
                field="duration"
              />
              <FieldTile
                label="Opening hours"
                value={hours.value}
                sub={hours.verdict === "not-recorded" ? undefined : hours.note}
                record={record}
                field="openingHours"
              />
              <FieldTile
                label="Map pin"
                value={where.value}
                sub={where.verdict === "not-recorded" ? where.note : undefined}
                record={record}
                field="coordinates"
              />
            </div>

            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
              <span>
                <MapPin size={14} className="mr-1 inline align-[-2px]" aria-hidden="true" />
                Nearest on record: {stationLabel(place.station)}
              </span>
              <span>Travel estimate from {demoUserLocation.area}: {record.travelMinutes} min</span>
              <StatusLabel tone={place.statusTone}>{place.updated}</StatusLabel>
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              The travel figure is a straight-line estimate scaled by the city congestion multiplier in
              the manifest, not a route from a routing service. {hoursLabel(record.durationMinutes)} is
              the recorded visit length and carries its own badge above.
            </p>

            <ProvenanceStrip record={record} />

            <div className="mt-4 border border-line bg-canvas p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Source and freshness</p>
                <span className="text-xs font-semibold text-muted">Last checked {place.lastChecked}</span>
              </div>
              <p className="mt-2 text-sm font-bold">{place.source}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{place.confidence}</p>
              {place.sourceUrl.includes("example.com") ? (
                <p className="mt-2 text-xs leading-5 text-muted">
                  The record carries a placeholder source URL rather than a real one. The field-level badges
                  above show which facts have a real source behind them.
                </p>
              ) : (
                <a href={place.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-bold text-blue">
                  Open the real source <ArrowSquareOut size={14} />
                </a>
              )}
            </div>

            {/*
              The two states that are specifically this page's to render. Both
              are quiet on purpose: a record with a few estimated fields is a
              good record, and an abstention is the engine being careful rather
              than the engine being broken. The distinction has to be the
              reader's realisation, not a caveat they have to infer.
            */}
            <div className="mt-4 space-y-3">
              {soldOutAt !== null ? (
                <StateNote state="sold-out">
                  <p className={`${typeScale.meta} text-muted`}>
                    Recorded sold out from {soldOutAt}. Everything below is still shown on purpose,
                    because removing a place on a stale feed is worse than an error that is labelled.
                  </p>
                </StateNote>
              ) : null}
              <PartiallyUnknownPanel record={record} />
              <AbstainedPanel fields={abstainedFields(place)} count={abstainedFields(place).length} />
            </div>

            <GradedFacts record={record} />
            <GradedAccess record={record} />

            <section className="mt-8">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">About this place</p>
              <h2 className="mt-2 text-xl font-bold">What to expect</h2>
              <ul className="mt-4 space-y-2.5">
                {aboutLinesFor(place).map((line) => (
                  <li key={line} className="flex gap-3 text-sm leading-6">
                    <MapPin size={17} className="mt-0.5 shrink-0 text-blue" aria-hidden="true" /> {line}
                  </li>
                ))}
              </ul>
            </section>

            <TravelOptions coordinates={place.coordinates} placeName={place.name} />

            <section className="mt-8">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">See it before you go</p>
              <h2 className="mt-2 text-xl font-bold">A local view of the place</h2>
              <ExperienceMedia experienceId={place.id} fallbackTitle={place.mediaTitle} />
            </section>
          </section>

          <aside className="border-t border-line bg-canvas p-5 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
            <div className="flex items-center gap-2 text-sm font-bold text-green">
              <CheckCircle size={19} aria-hidden="true" /> Fit estimate from {demoUserLocation.area}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              {hoursLabel(record.durationMinutes)} visit, {record.travelMinutes} min estimated travel, and{" "}
              {estimate.km.toFixed(1)} km away as the crow flies from {demoUserLocation.area}. Scored against a{" "}
              {inrLabel(input.budgetInr)} budget and a {hoursLabel(input.availableMinutes)} window starting at{" "}
              {clockLabel(Number(input.startTime.slice(0, 2)) * 60 + Number(input.startTime.slice(3)))}.
            </p>

            <div className="mt-5">
              <WhyThisLive record={record} input={input} />
            </div>

            <AvailabilityPicker placeName={place.name} />
            <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-[0.1em] text-amber">
              Demo action, no real booking
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Adding this to a plan stores one id in your browser. There is no checkout and no reserved
              slot, so availability is checked with the venue before you travel.
            </p>

            {/*
              The legend belongs here as well as on Explore. A sceptical reader
              arrives at a record before they arrive at a legend, and the badges
              are meaningless without it. It is a <details>, so it costs no
              vertical space until it is opened.
            */}
            <ProvenanceLegend />
          </aside>
        </div>
        <Footer />
        <BottomNav />
      </div>
    </main>
  );
}
