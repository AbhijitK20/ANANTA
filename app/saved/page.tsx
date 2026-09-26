"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookmarkSimple, Clock, MapPin, Warning } from "@phosphor-icons/react/dist/ssr";
import { BottomNav, StatusLabel } from "@/components/ui";
import { Footer } from "@/components/footer";
import type { ExperienceV2 } from "@/lib/engine";
import { depth, depthShadow } from "@/components/ananta/tokens";
import { anantaById, DATASET_SIZE } from "@/components/ananta/records";
import { ProvenanceDetail, ProvenanceStrip } from "@/components/ananta/learning/provenance-strip";
import { UiStatePanel } from "@/components/ananta/learning/ui-state";
import {
  availabilityChange,
  forgetAvailability,
  rememberAvailability,
} from "@/components/ananta/learning/availability-snapshot";
import { readSaved, writeSaved } from "@/lib/saved";

/**
 * The traveller's own shortlist, which is the most personal screen in the
 * product, so the honesty bar is highest here.
 *
 * Three things this screen has to get right, and all three were missing:
 *
 *   1. The provenance strip is visible without a click. A traveller looking at
 *      their own list is checking whether they were misled, and an answer
 *      behind a disclosure is not an answer.
 *   2. Saved is not booked. There are no payments, no commissions, and no
 *      reservations anywhere in this product, so nothing on this page may
 *      imply one. The empty state says it, and every item says it.
 *   3. If the availability facts changed since the item was saved, that is
 *      stated with the record's own timestamp, because it is the single most
 *      useful thing this page could tell someone.
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
  const moved = changes.filter((change) => change.kind === "sold-out" || change.kind === "reopened" || change.kind === "capacity");

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1180px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeft size={18} /> Home
          </a>
          <h1 className="text-lg font-bold">Saved</h1>
          <a href="/explore" className="text-sm font-bold text-blue">
            Explore
          </a>
        </header>

        <section className="px-5 pb-28 pt-10 sm:px-8 lg:px-14 lg:pb-14">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Your shortlist</p>
          <h2 className="mt-3 text-4xl font-bold tracking-[-0.05em]">Places to revisit.</h2>
          <p className="mt-4 max-w-[68ch] leading-7 text-muted">
            {places.length
              ? `${places.length} of ${DATASET_SIZE} places, stored in this browser. Saving a place is a note to yourself. It is not a reservation, it holds no slot, and nothing here has been paid for.`
              : "A saved place is a note to yourself. It is not a reservation, it holds no slot, and there are no payments anywhere in this product."}
          </p>

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
            <div className="mt-6 border border-amber bg-amberSoft/40 p-4" role="status">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-amber">
                {moved.length} saved place{moved.length === 1 ? " has" : "s have"} a different availability fact
                than when you saved {moved.length === 1 ? "it" : "them"}
              </p>
              <ul className="mt-2 space-y-1 text-sm leading-6">
                {moved.map((change) => {
                  const record = places.find((place) => place.id === change.id);
                  return (
                    <li key={change.id}>
                      <span className="font-bold">{record?.name ?? change.id}</span>: {change.sentence}
                    </li>
                  );
                })}
              </ul>
              <a href="/trips" className="mt-3 inline-flex min-h-[44px] items-center border border-amber bg-white px-4 py-2 text-sm font-bold text-amber">
                Re-plan around the change
              </a>
            </div>
          ) : null}

          {!ready ? (
            <div className="mt-8">
              <UiStatePanel state="solving" />
            </div>
          ) : places.length === 0 ? (
            <div className="mt-8">
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
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {places.map((record, index) => {
                  const change = changes[index];
                  const isSoldOut = change?.kind === "sold-out";
                  // Depth is status only, never recency and never position in the
                  // list. A recency value is a value, and values do not get depth.
                  // What decides this is one thing: whether the record publishes a
                  // weekly schedule. An unverified-hours record is carved into the
                  // page, which is exactly what "we do not know when it is open"
                  // should look like, and it also desaturates and goes dashed so
                  // depth is never the only channel.
                  const hoursKnown = record.openingHours.confidence !== "unverified";
                  return (
                    <article
                      key={record.id}
                      className={`flex flex-col border border-line p-5 ${
                        hoursKnown
                          ? `${depth.raised} ${depthShadow.raised}`
                          : `${depth.recessed} ${depthShadow.recessed} border-dashed`
                      }`}
                    >
                    <div className="flex items-start justify-between gap-3">
                      <StatusLabel tone={record.statusTone}>{record.status}</StatusLabel>
                      <button
                        type="button"
                        onClick={() => remove(record.id)}
                        aria-label={`Remove ${record.name} from your saved list`}
                        className="min-h-[44px] min-w-[44px] text-blue"
                      >
                        <BookmarkSimple size={20} weight="fill" />
                      </button>
                    </div>

                    {isSoldOut ? (
                      <p className="mt-4 flex items-start gap-2 border border-amber bg-amberSoft/50 p-3 text-sm leading-6 text-amber">
                        <Warning size={16} className="mt-0.5 shrink-0" />
                        <span>
                          <span className="font-bold">Sold out</span> since you saved this, marked at{" "}
                          {record.availability.soldOutAt}. Saving it did not hold anything.
                        </span>
                      </p>
                    ) : null}

                    <h3 className="mt-4 text-xl font-bold">{record.name}</h3>
                    <p className="mt-2 text-sm text-muted">
                      {record.area} · {record.category}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted">
                      <span>
                        <Clock size={14} className="mr-1 inline" aria-hidden="true" />
                        {record.durationMinutes} min
                      </span>
                      <span>
                        <MapPin size={14} className="mr-1 inline" aria-hidden="true" />
                        {record.station}
                      </span>
                      <span>checked {record.updated}</span>
                    </div>

                    <ProvenanceStrip record={record} />

                    <p className="mt-3 text-xs leading-5 text-muted">{change?.sentence}</p>

                    <ProvenanceDetail record={record} />

                    <a
                      href={`/experience/${record.id}`}
                      className="mt-5 inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-blue"
                    >
                      View details <ArrowRight size={16} aria-hidden="true" />
                      <span className="sr-only">for {record.name}</span>
                    </a>
                  </article>
                );
              })}
            </div>
          )}

          <p className="mt-8 max-w-[68ch] border border-line bg-canvas p-4 text-xs leading-5 text-muted">
            This list is stored in this browser and nowhere else. There is no account, no payment, and no
            reservation behind it. Use the clear control on the{" "}
            <a href="/profile" className="font-bold text-blue">
              profile page
            </a>{" "}
            to remove all of it.
          </p>
        </section>
        <Footer />
        <BottomNav />
      </div>
    </main>
  );
}
