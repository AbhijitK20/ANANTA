"use client";

import { useEffect, useMemo, useState } from "react";
import { BookmarkSimple, CalendarCheck, CheckCircle, TrendUp } from "@phosphor-icons/react/dist/ssr";
import { BottomNav } from "@/components/ui";
import { Footer } from "@/components/footer";
import type { ExperienceV2 } from "@/lib/engine";
import { depth, depthShadow } from "@/components/ananta/tokens";
import { anantaById, DATASET_SIZE } from "@/components/ananta/records";
import { SAVED_STRIP_FIELDS } from "@/components/ananta/learning/provenance-strip";
import { UiStatePanel } from "@/components/ananta/learning/ui-state";
import {
  availabilityChange,
  forgetAvailability,
  rememberAvailability,
} from "@/components/ananta/learning/availability-snapshot";
import { readSaved, writeSaved } from "@/lib/saved";
import {
  BackLink,
  DashboardFrame,
  SectionHead,
  SheetBar,
  StatGrid,
  StatTile,
} from "@/components/workspace/frame";
import { Notice } from "@/components/workspace/notice";
import { ShortlistCard } from "@/components/saved/shortlist-card";

/**
 * The traveller's own shortlist, laid out as a dashboard rather than a list.
 *
 * The structure is a personal dashboard: a header that says what this is, three
 * counts a reader can act on, then the shortlist as a grid. The counts are the
 * change, because the previous version opened with a paragraph and made the one
 * genuinely useful fact on the page, that something changed since you saved it,
 * something a reader had to hunt for.
 *
 * The honesty rules are unchanged and still outrank the layout:
 *
 *   1. The provenance strip is visible without a click, on every card.
 *   2. Saved is not booked. No payment, no commission, no reservation exists in
 *      this product, and the empty state, every card, and the footer all say so.
 *   3. A change since saving is stated with the record's own timestamp.
 */

export default function SavedPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setIds(readSaved());
      setReady(true);
    };
    sync();
    window.addEventListener("ananta-saved-change", sync);
    return () => window.removeEventListener("ananta-saved-change", sync);
  }, []);

  const { places, missing } = useMemo(() => {
    const found: ExperienceV2[] = [];
    const gone: string[] = [];
    for (const id of ids) {
      const record = anantaById[id];
      if (record) found.push(record);
      else gone.push(id);
    }
    return { places: found, missing: gone };
  }, [ids]);

  // Snapshot what the availability facts looked like, and drop snapshots for
  // anything that left the list, so a re-save compares against a real baseline.
  useEffect(() => {
    if (!ready || places.length === 0) return;
    rememberAvailability(places);
    forgetAvailability(places);
  }, [ready, places]);

  const remove = (id: string) => writeSaved(ids.filter((saved) => saved !== id));

  const changes = places.map((record) => availabilityChange(record, new Date().toISOString()));
  const moved = changes.filter(
    (change) => change.kind === "sold-out" || change.kind === "reopened" || change.kind === "capacity",
  );

  /**
   * How many of the four facts a saved visit actually turns on are known.
   *
   * It is a count of the records in the state, not a count of the catalogue, so
   * it moves with this list rather than with the data. `ProvenanceStrip` prints
   * the same split per card; here it is the page's summary of it.
   */
  const factsKnown = places.reduce(
    (total, record) =>
      total +
      SAVED_STRIP_FIELDS.filter(
        (field) => (record.confidence[field] ?? "unverified") !== "unverified",
      ).length,
    0,
  );
  const factsTotal = places.length * SAVED_STRIP_FIELDS.length;
  /** How many of these places publish a weekly schedule at all. */
  const knownHours = places.filter((record) => record.openingHours.confidence !== "unverified").length;

  return (
    <DashboardFrame>
      <SheetBar>
        <BackLink href="/" label="Home" />
        <h1 className="text-lg font-bold text-ink">Saved</h1>
        <a
          href="/explore"
          className="text-sm font-bold text-blue transition-colors duration-120 hover:text-ink"
        >
          Explore
        </a>
      </SheetBar>

      <section className="px-5 pb-28 pt-8 sm:px-8 lg:px-14 lg:pb-14">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Your shortlist</p>
          <h2 className="mt-3 text-display tracking-[-0.04em] text-ink">Places to revisit.</h2>
          <p className="mt-4 text-lead text-muted">
            {places.length
              ? `${places.length} of ${DATASET_SIZE} places, stored in this browser. Saving a place is a note to yourself. It is not a reservation, it holds no slot, and nothing here has been paid for.`
              : "A saved place is a note to yourself. It is not a reservation, it holds no slot, and there are no payments anywhere in this product."}
          </p>
        </div>

        <div className="mt-8">
          <StatGrid>
            <StatTile
              icon={BookmarkSimple}
              label="Saved"
              value={ready ? places.length : 0}
              note="Stored in this browser only"
            />
            <StatTile
              icon={TrendUp}
              label="Changed since you saved"
              value={moved.length}
              note={
                moved.length
                  ? "The availability fact moved after you saved it"
                  : "Nothing on this list has moved since you saved it"
              }
            />
            <StatTile
              icon={CheckCircle}
              label="Facts on record"
              value={places.length ? `${factsKnown} of ${factsTotal}` : 0}
              note="Price, duration, hours and rating, across this list"
            />
            <StatTile
              icon={CalendarCheck}
              label="Opening hours on record"
              value={knownHours}
              note={
                knownHours === places.length && places.length > 0
                  ? "Every place on this list publishes a schedule"
                  : "A place with no published schedule is carved into the page"
              }
            />
          </StatGrid>
        </div>

        {missing.length > 0 ? (
          <div className="mt-6">
            <UiStatePanel state="broken">
              <p className="mt-3 text-sm leading-6">
                {missing.length} saved id{missing.length === 1 ? "" : "s"} no longer resolve to a place in the
                catalogue, which happens when the dataset is regenerated. The rest of your list is fine.
                Remove {missing.length === 1 ? "that entry" : "those entries"} to clear the warning.
              </p>
            </UiStatePanel>
          </div>
        ) : null}

        {moved.length > 0 ? (
          <div className="mt-6">
            <Notice
              tone="info"
              title={`${moved.length} saved place${moved.length === 1 ? " has" : "s have"} a different availability fact than when you saved ${moved.length === 1 ? "it" : "them"}`}
            >
              <ul className="mt-1 grid gap-1">
                {moved.map((change) => {
                  const record = places.find((place) => place.id === change.id);
                  return (
                    <li key={change.id}>
                      <span className="font-bold text-ink">{record?.name ?? change.id}</span>: {change.sentence}
                    </li>
                  );
                })}
              </ul>
              <a
                href="/trips"
                className="mt-3 inline-flex min-h-[44px] items-center border border-blue px-4 py-2 text-sm font-bold text-blue"
              >
                Re-plan around the change
              </a>
            </Notice>
          </div>
        ) : null}

        <div className="mt-10">
          <SectionHead
            eyebrow="The list"
            title="Every place you saved, with what we actually know"
            description="A card you have not opened is still telling you whether to open it. The strip on each one is the answer, and it is not behind a disclosure."
          />
        </div>

        {!ready ? (
          <div className="mt-6">
            <UiStatePanel state="solving" />
          </div>
        ) : places.length === 0 ? (
          <div className="mt-6">
            <UiStatePanel
              state="nothing-retrieved"
              action={{ href: "/explore", label: "Browse the catalogue" }}
            >
              <p className="mt-3 max-w-[68ch] text-sm leading-6">
                Nothing is saved on this device yet. The catalogue holds {DATASET_SIZE} places across
                Mumbai and Navi Mumbai, and saving one puts it here with its provenance visible so you can
                check whether we were honest about it.
              </p>
            </UiStatePanel>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {places.map((record, index) => {
              const change = changes[index];
              // Depth is status only, never recency and never position in the
              // list. A recency value is a value, and values do not get depth.
              // What decides this is one thing: whether the record publishes a
              // weekly schedule. An unverified-hours record is carved into the
              // page, which is exactly what "we do not know when it is open"
              // should look like, and it also desaturates and goes dashed so
              // depth is never the only channel.
              const hoursKnown = record.openingHours.confidence !== "unverified";
              const depthClass = hoursKnown
                ? `${depth.raised} ${depthShadow.raised}`
                : `${depth.recessed} ${depthShadow.recessed} border-dashed`;
              return (
                <ShortlistCard
                  key={record.id}
                  record={record}
                  change={change}
                  depthClass={depthClass}
                  onRemove={remove}
                />
              );
            })}
          </div>
        )}

        <Notice tone="quiet" title="Where this list lives" className="mt-8 max-w-2xl">
          <p>
            This list is stored in this browser and nowhere else. There is no account, no payment, and
            no reservation behind it. Use the clear control on the{" "}
            <a href="/profile" className="font-bold text-blue">
              profile page
            </a>{" "}
            to remove all of it.
          </p>
        </Notice>
      </section>
      <Footer />
      <BottomNav />
    </DashboardFrame>
  );
}
