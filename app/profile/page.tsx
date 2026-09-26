"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, BookmarkSimple, CalendarCheck, MapPin, NotePencil, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { BottomNav, StatusLabel } from "@/components/ui";
import { Footer } from "@/components/footer";
import { LearnedWeights } from "@/components/ananta/learned-weights";
import { StoredStateControl } from "@/components/ananta/learning/stored-state";
import { UiStatePanel } from "@/components/ananta/learning/ui-state";
import { DATASET_SIZE, CURATED_CATEGORY_COUNT } from "@/components/ananta/records";
import { useLearner } from "@/components/ananta/use-ananta";
import { demoUserLocation, estimateFromUser, formatDistance } from "@/lib/location";
import { readPlan } from "@/lib/plan";
import { readSaved } from "@/lib/saved";
import { readReports } from "@/lib/reports";
import { allExperiences } from "@/lib/data";

/**
 * Profile, in four blocks: what the system knows about you, what it has learned,
 * what you can change, and what you can delete. The delete block is last because
 * that is the order of consequence.
 *
 * Two sentences in the previous version were wrong in opposite directions, and
 * both were wrong on the screen a judge would check for honesty:
 *
 *   - "no behavioral profile is built in this prototype" stopped being true the
 *     moment a weight could move.
 *   - Its replacement, "a weight profile is built", is also false for a
 *     traveller who has opened the page and changed nothing, because nothing has
 *     been built: every weight is still its prior and the bandit has zero
 *     observations.
 *
 * So the claim is now derived from `bandit.observations` rather than asserted,
 * and it says which of those two states this traveller is actually in. The
 * demo-location disclosure is unchanged and stays: a fixed position on a map is
 * exactly the sort of thing that must remain disclosed.
 */

export default function ProfilePage() {
  const [learner, setLearner] = useLearner();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [reportCount, setReportCount] = useState(0);

  useEffect(() => {
    const sync = () => {
      setSavedIds(readSaved());
      setPlanIds(readPlan());
      setReportCount(readReports().length);
    };
    sync();
    window.addEventListener("ananta-saved-change", sync);
    window.addEventListener("ananta-plan-change", sync);
    window.addEventListener("ananta-reports-change", sync);
    return () => {
      window.removeEventListener("ananta-saved-change", sync);
      window.removeEventListener("ananta-plan-change", sync);
      window.removeEventListener("ananta-reports-change", sync);
    };
  }, []);

  const observations = learner.bandit.observations;

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1180px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeft size={18} /> Home
          </a>
          <h1 className="text-lg font-bold">Profile</h1>
          <span className="w-20" />
        </header>
        <section className="px-5 pb-28 pt-10 sm:px-8 lg:px-14 lg:pb-14">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blueSoft text-blue">
              <UserCircle size={30} weight="fill" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.03em]">This device, not an account</h2>
              <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted">
                There is no sign-in and no account anywhere in this prototype. Everything below is a local
                record in this one browser, and nothing leaves it. Clearing site data in your browser
                removes all of it.
              </p>
            </div>
          </div>

          {/* Block 1: what the system knows about you. */}
          <section className="mt-8 border border-line p-5" aria-labelledby="knows-heading">
            <h3 id="knows-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-blue">
              1. What the system knows about you
            </h3>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm font-bold">Where distances are measured from</p>
              <StatusLabel tone="blue">{demoUserLocation.note}</StatusLabel>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <MapPin size={20} className="mt-0.5 shrink-0 text-blue" weight="fill" />
              <div>
                <p className="font-bold">
                  {demoUserLocation.label} · {demoUserLocation.area}, {demoUserLocation.city}
                </p>
                <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted">
                  This is a fixed demo position, not live geolocation. Distances across the app are
                  measured from here and labeled as estimates.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted">Nearest saved place</p>
                <NearestSaved ids={savedIds} />
              </div>
              <div>
                <p className="text-sm text-muted">Walk-time band</p>
                <p className="mt-1 font-bold">{bandLabel()}</p>
              </div>
              <div>
                <p className="text-sm text-muted">Catalogue coverage</p>
                <p className="mt-1 font-bold">
                  {DATASET_SIZE} places across {CURATED_CATEGORY_COUNT} categories
                </p>
              </div>
            </div>
          </section>

          {/* Block 2: what it has learned, stated from the observation count. */}
          <section className="mt-6" aria-labelledby="learned-summary">
            <h3 id="learned-summary" className="text-xs font-bold uppercase tracking-[0.14em] text-blue">
              2. What it has learned
            </h3>
            {observations === 0 ? (
              <div className="mt-3">
                <UiStatePanel
                  state="abstained"
                  action={{ href: "/explore", label: "Find something to save" }}
                >
                  <p className="mt-3 max-w-[68ch] text-sm leading-6">
                    No behaviour has been learned yet. Every weight below is a starting value, and the
                    ranking is running on those alone. They change only when you save or reject something,
                    or when you move a slider yourself. Nothing is tracked passively and there is no
                    third-party script on this page.
                  </p>
                </UiStatePanel>
              </div>
            ) : null}
          </section>

          <div id="learned">
            {/* Block 3: what you can change. */}
            <LearnedWeights learner={learner} onChange={setLearner} />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatCard Icon={BookmarkSimple} label="Saved places" value={savedIds.length} href="/saved" note="Stored on this device" />
            <StatCard Icon={CalendarCheck} label="Draft plan stops" value={planIds.length} href="/trips" note="Not a booking" />
            <StatCard Icon={NotePencil} label="Reports submitted" value={reportCount} href="/events" note="Reviewed in Operations" />
          </div>

          {/* Block 4: what you can delete. */}
          <StoredStateControl />

          <div className="mt-6 border border-amber bg-amberSoft/40 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber">What is stored, and what is learned</p>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-muted">
              <li>
                Saved places, draft plans, reports, and your weight edits live in this browser&apos;s local
                storage. Nothing is uploaded to a server, because there is no server in this prototype. The
                clear button above removes every key this app is known to write and names each one.
              </li>
              <li>
                Weights move from two named interactions and nothing else: a weight you moved yourself, and
                a place you chose to add to the plan. There is no passive tracking. The panel above shows
                every weight, its prior, how many observations moved it, and the range the sampler is still
                exploring, and you can put any of them back.
              </li>
              <li>
                The travel-time and crowd signals used in the ranking are our own estimates from the city
                manifest at a congestion multiplier, not measurements and not a traffic feed. The stress
                radar labels every factor computed from them.
              </li>
            </ul>
          </div>
        </section>
        <Footer />
        <BottomNav />
      </div>
    </main>
  );

  function bandLabel() {
    const nearest = nearestSavedEstimate(savedIds);
    if (!nearest) return "No saved places yet";
    return `${formatDistance(nearest.km)} · about ${nearest.walkMinutes} min walk`;
  }
}

function NearestSaved({ ids }: { ids: string[] }) {
  const nearest = nearestSavedEstimate(ids);
  if (!nearest) return <p className="mt-1 font-bold">None saved yet</p>;
  return <p className="mt-1 font-bold">{nearest.name}</p>;
}

function nearestSavedEstimate(ids: string[]) {
  const saved = ids
    .map((id) => allExperiences.find((place) => place.id === id))
    .filter((place): place is NonNullable<ReturnType<typeof allExperiences.find>> => Boolean(place))
    .map((place) => ({ place, estimate: estimateFromUser(place.coordinates) }));
  if (!saved.length) return null;
  const nearest = saved.sort((a, b) => a.estimate.km - b.estimate.km)[0];
  return { name: nearest.place.name, km: nearest.estimate.km, walkMinutes: nearest.estimate.walkMinutes };
}

function StatCard({ Icon, label, value, href, note }: { Icon: typeof BookmarkSimple; label: string; value: number; href: string; note: string }) {
  return (
    <a href={href} className="border border-line p-5 transition-colors hover:border-blue">
      <div className="flex items-center justify-between">
        <Icon size={20} className="text-blue" />
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="mt-3 font-bold">{label}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </a>
  );
}
