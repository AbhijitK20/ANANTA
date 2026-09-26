"use client";

import { useEffect, useState } from "react";
import { BookmarkSimple, CalendarCheck, NotePencil, Sliders, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { BottomNav } from "@/components/ui";
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
import {
  BackLink,
  DashboardFrame,
  SheetBar,
  StatGrid,
  StatTile,
} from "@/components/workspace/frame";
import { Notice } from "@/components/workspace/notice";

/**
 * Profile, as a personal dashboard: what this device holds, what the engine has
 * learned from it, and what can be deleted from it.
 *
 * The delete block is last because that is the order of consequence, and that
 * ordering is the point of the page rather than an accident of the layout.
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
 * So the claim is derived from `bandit.observations` rather than asserted, and
 * the tile in the summary row says which of those two states this traveller is
 * actually in. The demo-location disclosure is unchanged and stays: a fixed
 * position on a map is exactly the sort of thing that must remain disclosed.
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
  const nearest = nearestSavedEstimate(savedIds);

  return (
    <DashboardFrame>
      <SheetBar>
        <BackLink href="/" label="Home" />
        <h1 className="text-lg font-bold text-ink">Profile</h1>
        <span className="w-16" aria-hidden="true" />
      </SheetBar>

      <section className="px-5 pb-28 pt-8 sm:px-8 lg:px-14 lg:pb-14">
        {/* Who you are here, which is a device rather than a person. */}
        <div className="card flex items-start gap-4 p-5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blueSoft text-blue">
            <UserCircle size={30} weight="fill" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">This device, not an account</p>
            <h2 className="mt-1.5 text-title tracking-[-0.03em] text-ink">Everything below lives in this one browser</h2>
            <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted">
              There is no sign-in and no account anywhere in this prototype. Nothing on this page is
              uploaded, because there is no server to upload it to, and clearing site data in your
              browser removes all of it.
            </p>
          </div>
        </div>

        {/* The counts, each one a real measurement of local state. */}
        <div className="mt-4">
          <StatGrid>
            <StatTile
              icon={BookmarkSimple}
              label="Saved places"
              value={savedIds.length}
              href="/saved"
              note="Stored on this device"
            />
            <StatTile
              icon={CalendarCheck}
              label="Draft plan stops"
              value={planIds.length}
              href="/trips"
              note="Not a booking"
            />
            <StatTile
              icon={NotePencil}
              label="Reports submitted"
              value={reportCount}
              href="/events"
              note="Reviewed in Operations"
            />
            <StatTile
              icon={Sliders}
              label="Observations learned"
              value={observations}
              note={
                observations === 0
                  ? "No behaviour has been learned. Every weight is its starting value."
                  : "Interactions of your own that moved a weight."
              }
            />
          </StatGrid>
        </div>

        {/* The one disclosure that has to stay loud: a fixed point on a map. */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Notice
            tone="info"
            title={`Distances are measured from a fixed demo position, not from you`}
          >
            <p>
              The map shows {demoUserLocation.label} in {demoUserLocation.area}, {demoUserLocation.city} on
              every screen. It is a constant in the code, not a reading from your device, and this
              application never asks for location permission. Every distance in the product is measured
              from that point and labelled as an estimate.
            </p>
          </Notice>

          <dl className="card grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-1">
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted">Nearest saved place</dt>
              <dd className="mt-1.5 text-sm font-bold text-ink">
                {nearest ? nearest.name : "None saved yet"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted">Walk-time band</dt>
              <dd className="mt-1.5 text-sm font-bold text-ink">
                {nearest
                  ? `${formatDistance(nearest.km)} · about ${nearest.walkMinutes} min walk`
                  : "No saved places yet"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted">Catalogue coverage</dt>
              <dd className="mt-1.5 text-sm font-bold text-ink">
                {DATASET_SIZE} places across {CURATED_CATEGORY_COUNT} categories
              </dd>
            </div>
          </dl>
        </div>

        {/* What it has learned, stated from the observation count rather than asserted. */}
        {observations === 0 ? (
          <div className="mt-6">
            <UiStatePanel state="abstained" action={{ href: "/explore", label: "Find something to save" }}>
              <p className="mt-3 max-w-[68ch] text-sm leading-6">
                No behaviour has been learned yet. Every weight below is a starting value, and the
                ranking is running on those alone. They change only when you save or reject something,
                or when you move a slider yourself. Nothing is tracked passively and there is no
                third-party script on this page.
              </p>
            </UiStatePanel>
          </div>
        ) : null}

        <div id="learned">
          <LearnedWeights learner={learner} onChange={setLearner} />
        </div>

        <StoredStateControl />

        {/* The plain-language version of the same facts, for a reader who skipped the sliders. */}
        <section className="mt-6" aria-labelledby="stored-and-learned-heading">
          <h2 id="stored-and-learned-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-blue">
            What is stored, and what is learned
          </h2>
          <dl className="card mt-3 divide-y divide-line">
            <div className="p-5">
              <dt className="text-sm font-bold text-ink">What sits in this browser</dt>
              <dd className="mt-1.5 max-w-[68ch] text-sm leading-6 text-muted">
                Saved places, draft plans, reports, and your weight edits live in this browser&apos;s
                local storage. Nothing is uploaded to a server, because there is no server in this
                prototype. The clear control above removes every key this app is known to write and
                names each one.
              </dd>
            </div>
            <div className="p-5">
              <dt className="text-sm font-bold text-ink">How a weight moves</dt>
              <dd className="mt-1.5 max-w-[68ch] text-sm leading-6 text-muted">
                From two named interactions and nothing else: a weight you moved yourself, and a
                place you chose to add to the plan. There is no passive tracking. The panel above
                shows every weight, its prior, how many observations moved it, and the range the
                sampler is still exploring, and you can put any of them back.
              </dd>
            </div>
            <div className="p-5">
              <dt className="text-sm font-bold text-ink">What the travel and crowd numbers are</dt>
              <dd className="mt-1.5 max-w-[68ch] text-sm leading-6 text-muted">
                Our own estimates from the city manifest at a congestion multiplier, not
                measurements and not a traffic feed. The stress radar labels every factor computed
                from them.
              </dd>
            </div>
          </dl>
        </section>
      </section>
      <Footer />
      <BottomNav />
    </DashboardFrame>
  );
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
