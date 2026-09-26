import { notFound } from "next/navigation";
import { ArrowLeft, ArrowSquareOut, CheckCircle, MapPin, PlayCircle } from "@phosphor-icons/react/dist/ssr";
import { ExperienceMedia } from "@/components/experience-media";
import { AvailabilityPicker } from "@/components/availability-picker";
import { AddToPlanButton } from "@/components/plan-button";
import { ReportButton } from "@/components/report-button";
import { SaveButton } from "@/components/save-button";
import { ShareButton } from "@/components/share-button";
import { BottomNav, StatusLabel } from "@/components/ui";
import { Footer } from "@/components/footer";
import { TravelOptions } from "@/components/travel-options";
import { AccessFacts, ProvenanceBadge, ProvenanceTable } from "@/components/ananta/provenance-badge";
import { WhyThisLive } from "@/components/ananta/why-this-live";
import { anantaById } from "@/components/ananta/records";
import { clockLabel, hoursLabel, inrLabel, type EngineInput } from "@/components/ananta/pipeline";
import { demoUserLocation, estimateFromUser, stationLabel } from "@/lib/location";
import { allExperiences } from "@/lib/data";

/**
 * The place page.
 *
 * Three fixes live here. `allExperiences[0]` used to be the fallback, so
 * `/experience/anything-garbage` returned HTTP 200 rendering Kala Ghoda Art
 * Walk; that is now `notFound()`. The "Share experience" button had no handler;
 * it now shares, and says so when the browser cannot. And the four hardcoded
 * "Why this is recommended" bullets are gone, replaced by the real ranked
 * components from the same objective the ranking used, plus the per-field
 * provenance for every fact on the page.
 */

/** About copy is derived only from fields the record actually has. */
function aboutLinesFor(place: (typeof allExperiences)[number]): string[] {
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

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1180px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/explore" className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeft size={18} /> Back to explore
          </a>
          <div className="flex items-center gap-2">
            <SaveButton experienceId={place.id} />
            <ShareButton title={place.name} />
          </div>
        </header>
        <div className="grid lg:grid-cols-[1fr_420px]">
          <section className="p-5 sm:p-8 lg:p-12">
            <div className="relative h-64 border border-line sm:h-80">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={place.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <StatusLabel tone={place.statusTone}>{place.status}</StatusLabel>
                <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-white">
                  {place.category} · {place.area}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] font-semibold text-muted">
              Area photo: {place.imageCredit}. It shows the neighborhood, not the venue itself.
            </p>

            <div className="mt-8 flex items-start justify-between gap-6">
              <div>
                <h1 className="text-4xl font-bold tracking-[-0.05em]">{place.name}</h1>
                <p className="mt-3 text-base leading-7 text-muted">{place.description}</p>
              </div>
              <span className="shrink-0 text-xl font-bold">
                {record.priceInr === 0 ? "Free" : inrLabel(record.priceInr)}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <ProvenanceBadge record={record} field="price" />
              <ProvenanceBadge record={record} field="duration" />
              <ProvenanceBadge record={record} field="coordinates" />
              <ProvenanceBadge record={record} field="openingHours" />
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3 border-y border-line py-5 text-sm sm:grid-cols-4">
              <div>
                <p className="text-muted">Duration</p>
                <p className="mt-1 font-bold">{place.duration}</p>
              </div>
              <div>
                <p className="text-muted">Travel estimate</p>
                <p className="mt-1 font-bold">{record.travelMinutes} min estimate</p>
              </div>
              <div>
                <p className="text-muted">Nearest</p>
                <p className="mt-1 font-bold">{stationLabel(place.station)}</p>
              </div>
              <div>
                <p className="text-muted">Data state</p>
                <p className="mt-1 font-bold">{place.updated}</p>
              </div>
            </div>

            <div className="mt-4 border border-line bg-[#fbfcfd] p-4 text-sm">
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

            <ProvenanceTable record={record} />
            <AccessFacts record={record} />

            <section className="mt-8">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">About this place</p>
              <h2 className="mt-2 text-xl font-bold">What to expect</h2>
              <ul className="mt-4 space-y-2.5">
                {aboutLinesFor(place).map((line) => (
                  <li key={line} className="flex gap-3 text-sm leading-6">
                    <MapPin size={17} className="mt-0.5 shrink-0 text-blue" /> {line}
                  </li>
                ))}
              </ul>
            </section>

            <TravelOptions coordinates={place.coordinates} placeName={place.name} />

            <section className="mt-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">See it before you go</p>
                  <h2 className="mt-2 text-xl font-bold">A local view of the place</h2>
                </div>
                <PlayCircle size={25} className="text-blue" />
              </div>
              <ExperienceMedia experienceId={place.id} fallbackTitle={place.mediaTitle} />
              <p className="mt-3 text-xs leading-5 text-muted">
                Videos show atmosphere only. Current hours, price, and availability come from structured records.
              </p>
            </section>
          </section>

          <aside className="border-t border-line bg-[#fbfcfd] p-5 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
            <div className="flex items-center gap-2 text-sm font-bold text-green">
              <CheckCircle size={19} /> Fit estimate from {demoUserLocation.area}
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
            <AddToPlanButton experienceId={place.id} block />
            <p className="mt-2 text-center text-[11px] font-bold uppercase tracking-[0.1em] text-amber">
              Demo action, no real booking
            </p>
            <p className="mt-1 text-center text-xs leading-5 text-muted">
              Booking is not live in this prototype. Availability will be checked before confirmation.
            </p>
            <div className="mt-5 text-center">
              <ReportButton recordId={place.id} recordTitle={place.name} />
            </div>
          </aside>
        </div>
        <Footer />
        <BottomNav />
      </div>
    </main>
  );
}


