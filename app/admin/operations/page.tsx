"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock,
  Eye,
  Flag,
  MagnifyingGlass,
  PlayCircle,
  RocketLaunch,
  ShieldCheck,
  ShieldWarning,
  Sparkle,
  Warning,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { StatusLabel } from "@/components/ui";
import {
  operationSeed,
  publishableSubmissions,
  publishSubmission,
  readOperations,
  readStaleIds,
  setStale,
  writeOperations,
  writeStaleIds,
  type OperationRecord,
} from "@/lib/operations";
import { readReports } from "@/lib/reports";
import { eventChanges } from "@/lib/events";
import { eventSeed } from "@/lib/seed";
import { applyMediaAction, mediaSeedRecords, readMediaRecords, writeMediaRecords, type MediaRecord } from "@/lib/media-store";
import { hiddenGemCandidates } from "@/lib/hidden-gems";
import {
  clearDemandRows,
  readDemandRows,
  readProviderListings,
  recordDemandRows,
  setListingAvailability,
  writeProviderListings,
  type DemandRow,
} from "@/lib/provider";
import { unmetDemandFromRows } from "@/lib/eval/unmet-demand";
import { getCityManifest } from "@/lib/engine/contracts";
import { buildContext } from "@/lib/engine/replan";
import type { ContextInput } from "@/lib/engine/replan";
import { anantaRecords } from "@/lib/data/ananta/records";
import { SCENARIOS } from "@/lib/eval/scenarios";
import { shortlist } from "@/lib/eval/harness";

/**
 * The operator's queue.
 *
 * The change that matters most here is the publish action. This page used to
 * offer only "Verify" and "Mark stale", both of which set a status string that
 * nothing in discovery ever read, so an operator could verify a thousand records
 * and not one traveller-facing signal would change. Publishing now moves the
 * listing into the discoverable catalogue through `publishListing` in
 * `lib/provider.ts`, and the demand feed below is built from the real gate.
 *
 * The demand feed also has a scan button. The flywheel had no data source at all:
 * the array it depends on was computed in memory in Explore and thrown away on
 * navigation, so a provider had nothing to read. The scan runs the real
 * retrieve and the real gate over the real catalogue and persists the stream, so
 * every number below is a refusal the engine actually produced.
 *
 * There is no authentication on this page and there is no backend. It mutates
 * `localStorage` on the visitor's own device. That is a scope decision, stated
 * here in the open rather than implied away.
 */

function todayStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function OperationsPage() {
  const [records, setRecords] = useState(operationSeed);
  const [mediaRecords, setMediaRecords] = useState<MediaRecord[]>([]);
  const [query, setQuery] = useState("");
  const [staleIds, setStaleIds] = useState<string[]>([]);
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [today] = useState(todayStamp);
  const gemCandidates = useMemo(() => hiddenGemCandidates(), []);

  const syncRows = useCallback(() => setRows(readDemandRows()), []);

  useEffect(() => {
    const sync = () => {
      const reports = readReports().map((report) => ({ id: `op-${report.id}`, kind: "experience" as const, title: report.recordTitle, area: "Traveler report", source: report.reason, status: "Needs review" as const, detail: report.note || "Incorrect information report", lastChecked: report.submittedAt }));
      const stored = readOperations().filter((record) => !reports.some((report) => record.id === report.id));
      // Derived from event snapshots; admin status persists because verify/stale writes the full array back.
      const changeRecords = eventSeed.filter((event) => eventChanges(event).length > 0).map((event) => {
        const id = `op-eventchange-${event.id}`;
        const persisted = stored.find((record) => record.id === id);
        return persisted ?? { id, kind: "event" as const, title: event.name, area: "Automated check", source: "Change detection", status: "Needs review" as const, detail: `Detected changes: ${eventChanges(event).map((change) => change.field.toLowerCase()).join(", ")}`, lastChecked: "Automated" };
      });
      setRecords([...reports, ...changeRecords, ...stored.filter((record) => !record.id.startsWith("op-eventchange-"))]);
      setStaleIds(readStaleIds());
    };
    const syncMedia = () => setMediaRecords(readMediaRecords());
    sync();
    syncMedia();
    syncRows();
    window.addEventListener("ananta-reports-change", sync);
    window.addEventListener("ananta-operations-change", sync);
    window.addEventListener("ananta-media-change", syncMedia);
    window.addEventListener("ananta-demand-change", syncRows);
    return () => {
      window.removeEventListener("ananta-reports-change", sync);
      window.removeEventListener("ananta-operations-change", sync);
      window.removeEventListener("ananta-media-change", syncMedia);
      window.removeEventListener("ananta-demand-change", syncRows);
    };
  }, [syncRows]);

  const filtered = useMemo(() => records.filter((record) => `${record.title} ${record.area} ${record.kind} ${record.status}`.toLowerCase().includes(query.toLowerCase())), [records, query]);
  const filteredMedia = useMemo(() => mediaRecords.filter((record) => `media ${record.title} ${record.platform} ${record.state}`.toLowerCase().includes(query.toLowerCase())), [mediaRecords, query]);
  const filteredGems = useMemo(() => gemCandidates.filter((candidate) => `hidden gem ${candidate.name} ${candidate.zone} ${candidate.confidence}`.toLowerCase().includes(query.toLowerCase())), [gemCandidates, query]);
  const submissions = useMemo(() => publishableSubmissions(records), [records]);
  const demand = useMemo(() => unmetDemandFromRows(rows), [rows]);

  const updateStatus = (id: string, status: OperationRecord["status"]) =>
    setRecords((current) => {
      const next = current.map((record) => (record.id === id ? { ...record, status, lastChecked: "Just now" } : record));
      writeOperations(next);
      return next;
    });

  const actOnMedia = (id: string, action: Parameters<typeof applyMediaAction>[2]) =>
    setMediaRecords((current) => {
      const next = applyMediaAction(current, id, action);
      writeMediaRecords(next);
      return next;
    });

  /**
   * Publish a submission. The listing moves to Published, the operations row
   * moves to Published, and `applyPublishedListings` in `lib/provider.ts` is
   * what discovery reads, so the record reaches Explore.
   */
  const publish = (record: OperationRecord) => {
    if (!record.listingId) return;
    const listings = readProviderListings();
    const next = listings.map((listing) =>
      listing.id === record.listingId
        ? { ...listing, status: "Published" as const, publishedAt: today, updatedAt: today, updated: "Just now", verified: true }
        : listing,
    );
    writeProviderListings(next);
    const nextOps = publishSubmission(records, record.id, today);
    writeOperations(nextOps);
    setRecords(nextOps);
  };

  /** Close a listing from the queue. This one genuinely reaches the gate. */
  const closeListing = (record: OperationRecord) => {
    if (!record.listingId) return;
    const next = setListingAvailability(readProviderListings(), record.listingId, "Closed", today);
    writeProviderListings(next);
    updateStatus(record.id, "Stale");
  };

  /**
   * Stale now means what the label says. A stale mark writes an id into the
   * stale set, and `applyStaleMarks` in `lib/operations.ts` is what turns that
   * into `statusTone: "amber"` on the real record. Amber is what the gate and
   * the travel options already treat as weather or season dependent, so a stale
   * record leaves a rain-sensitive plan and carries a visible doubt on one that
   * is not.
   */
  const markStale = (record: OperationRecord) => {
    setStaleIds((current) => setStale(current, record.id, !current.includes(record.id)));
    updateStatus(record.id, staleIds.includes(record.id) ? "Verified" : "Stale");
  };

  /**
   * Run the real gate over the real catalogue and persist the refusals. This is
   * the missing data source for the provider flywheel: without it the demand
   * feed has nothing to read, because nothing anywhere used to log a search.
   *
   * The contexts are the shipped eval scenarios, so the demand an operator sees
   * is the same demand the section 9 report measured, from the same gate.
   */
  const scanDemand = async () => {
    setScanning(true);
    try {
      // Yield once so the button's pending state paints before the gate runs.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const cityIds = [...new Set(SCENARIOS.map((scenario) => scenario.context.cityId ?? "mumbai"))].sort();
      let refused = 0;
      let considered = 0;
      for (const cityId of cityIds) {
        const city = getCityManifest(cityId);
        const catalogue = anantaRecords.filter((record) => record.city === city.displayName);
        const position = new Map(catalogue.map((record) => [record.id, record]));
        for (const scenario of SCENARIOS) {
          if ((scenario.context.cityId ?? "mumbai") !== cityId) continue;
          const input = { ...scenario.context } as Record<string, unknown>;
          delete input.cityId;
          const ctx = buildContext({ ...input, city } as ContextInput, city);
          const short = shortlist(ctx, catalogue);
          considered += short.considered;
          refused += short.stream.length;
          recordDemandRows(
            short.stream,
            {
              area: (id) => position.get(id)?.area ?? "Unknown area",
              query: ctx.query,
              interest: strongestInterest(ctx.profile.interests),
            },
            ctx.now,
          );
        }
      }
      setRows(readDemandRows());
      setScanNote(
        `Scanned ${SCENARIOS.length} traveller contexts over ${anantaRecords.length} records. ${considered} reached the gate, ${refused} were refused and are now in the feed.`,
      );
    } catch (error) {
      setScanNote("The scan failed: " + String(error));
    } finally {
      setScanning(false);
    }
  };

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1320px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeft size={18} /> Ananta
          </a>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Operations</p>
            <h1 className="mt-1 text-lg font-bold">Data review queue</h1>
          </div>
        </header>
        <section className="px-5 pb-12 pt-10 sm:px-8 lg:px-14">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Source and freshness</p>
            <h2 className="mt-3 text-4xl font-bold tracking-[-0.05em]">Keep local information trustworthy.</h2>
            <p className="mt-4 leading-7 text-muted">
              Review events, experiences, submissions, and media before they influence traveller
              recommendations. Publishing a submission is the only action on this page that changes
              what a traveller sees, and it is the one that used to be missing.
            </p>
          </div>
          <p className="mt-5 flex max-w-2xl items-start gap-2 border border-line bg-[#fbfcfd] p-3 text-xs leading-5 text-muted">
            <ShieldWarning size={16} className="mt-0.5 shrink-0 text-amber" />
            <span>
              No accounts, no roles, no server. Every button here writes this browser&apos;s
              storage and any visitor can press them. This is a local demo surface by decision, and
              it is not safe to expose on a public URL as it stands.
            </span>
          </p>
          <div className="mt-8 flex items-center gap-3 border-b border-line pb-5">
            <MagnifyingGlass size={20} className="text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the review queue"
              aria-label="Search data review queue"
              className="w-full bg-transparent text-sm font-semibold outline-none"
            />
          </div>

          <h2 className="mt-10 text-xl font-bold tracking-[-0.02em]">Provider submissions</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            A submitted listing is invisible to travellers until it is published here. Publishing is
            what inserts it into the discoverable catalogue, so an operator pressing it is what
            completes the provider loop rather than completing a queue.
          </p>
          <div className="mt-4 grid gap-4">
            {submissions.length === 0 && (
              <p className="border border-line bg-canvas p-5 text-sm text-muted">
                Nothing waiting to be published. Submissions made on the provider page land here.
              </p>
            )}
            {submissions.map((record) => (
              <article key={record.id} className="border border-line p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusLabel tone="blue">{record.status}</StatusLabel>
                      <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                        {record.kind}
                      </span>
                    </div>
                    <h3 className="mt-4 text-xl font-bold">{record.title}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {record.area} · {record.detail}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Source</p>
                    <p className="mt-1 text-sm font-semibold">{record.source}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <p className="text-xs leading-5 text-muted">
                    Publishing marks the listing verified and puts it in Explore. It will carry
                    unverified opening hours, so the gate may still refuse it and will say so. That
                    is the honest outcome: the provider published a place, not a schedule.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => publish(record)}
                      className="inline-flex items-center gap-1 rounded-lg bg-green px-3 py-2 text-xs font-bold text-white"
                    >
                      <RocketLaunch size={15} /> Publish
                    </button>
                    <button
                      onClick={() => closeListing(record)}
                      className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold"
                    >
                      <Eye size={15} /> Mark closed
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <h2 className="mt-10 text-xl font-bold tracking-[-0.02em]">Unmet demand</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Built from the rejection stream the feasibility gate writes, not from a count of saves and
            not from a floor under that count. The scan runs the real retrieve and the real gate over
            the real catalogue using the same traveller contexts the eval report measures.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={scanDemand}
              disabled={scanning}
              className="inline-flex items-center gap-2 rounded-lg bg-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              <PlayCircle size={17} /> {scanning ? "Scanning..." : "Scan refusals from the live gate"}
            </button>
            <button
              onClick={() => {
                clearDemandRows();
                setRows([]);
                setScanNote("Cleared. The feed is empty because nothing has been recorded, not because the numbers are hidden.");
              }}
              className="rounded-lg border border-line px-4 py-2 text-sm font-bold"
            >
              Clear the feed
            </button>
          </div>
          {scanNote && <p className="mt-3 text-sm leading-6 text-muted">{scanNote}</p>}
          <div className="mt-4 grid gap-3">
            {demand.length === 0 && (
              <p className="border border-line bg-canvas p-5 text-sm text-muted">
                Nothing recorded yet. Run the scan, or use the provider page, and real refusals appear
                here.
              </p>
            )}
            {demand.map((item) => (
              <article key={item.id} className="border border-line p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <StatusLabel tone={item.actionableFor.length ? "amber" : "blue"}>{item.area}</StatusLabel>
                    <h3 className="mt-3 text-lg font-bold">{item.query || "A general search in this area"}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {item.demandCount} traveller{item.demandCount === 1 ? "" : "s"} wanted this and
                      could not get it. First seen {item.firstSeenAt}, last seen {item.lastSeenAt}.
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                      The one thing that blocked it
                    </p>
                    <p className="mt-1 max-w-xs text-sm font-semibold text-ink">
                      {item.dominantRejection.sentence}
                    </p>
                  </div>
                </div>
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                    Full distribution
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {item.rejectionMix.map((entry) => (
                      <li key={entry.code} className="rounded bg-canvas px-2 py-1 text-xs font-semibold text-muted">
                        {entry.code.replace(/_/g, " ")} x{entry.count}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="mt-3 text-xs text-muted">
                  {actionabilitySentence(item.actionableFor.length)}
                </p>
              </article>
            ))}
          </div>

          <h2 className="mt-10 text-xl font-bold tracking-[-0.02em]">Records and reports</h2>
          <div className="mt-4 grid gap-4">
            {filtered.map((record) => (
              <ReviewCard
                key={record.id}
                record={record}
                stale={staleIds.includes(record.id)}
                onStatusChange={updateStatus}
                onStaleToggle={markStale}
              />
            ))}
          </div>
          {!filtered.length && (
            <div className="mt-4 border border-line bg-canvas p-8">
              <h3 className="text-xl font-bold">No records match this search</h3>
              <p className="mt-2 text-muted">Try the name, area, record type, or review status.</p>
            </div>
          )}

          <h2 className="mt-10 text-xl font-bold tracking-[-0.02em]">External media verification</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Approve, reject, or stale-mark external videos. Only approved media ever appears on an
            experience page, and approval always stays traceable.
          </p>
          <div className="mt-4 grid gap-4">
            {filteredMedia.map((record) => (
              <MediaReviewCard key={record.id} record={record} onAction={actOnMedia} />
            ))}
          </div>
          {!filteredMedia.length && (
            <div className="mt-4 border border-line bg-canvas p-5">
              <p className="text-sm text-muted">No media records match this search.</p>
            </div>
          )}

          <h2 className="mt-10 text-xl font-bold tracking-[-0.02em]">Hidden gem candidates</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Residents and community sources proposed these. Each candidate carries its source, safety
            flags, and verification history. Low popularity alone never qualifies a place as a hidden
            gem.
          </p>
          <div className="mt-4 grid gap-4">
            {filteredGems.map((candidate) => (
              <HiddenGemCard key={candidate.name} candidate={candidate} />
            ))}
          </div>
          {!filteredGems.length && (
            <div className="mt-4 border border-line bg-canvas p-5">
              <p className="text-sm text-muted">No candidates match this search.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/**
 * How many providers could act, in a sentence. Zero gets its own wording rather
 * than "0 providers could act on this", which reads like a bug and is the most
 * important fact on the card.
 */
function actionabilitySentence(count: number): string {
  if (count === 0) {
    return "No provider can act on this from the catalogue. The blocker is weather, season, distance, or the traveller's own party.";
  }
  return count === 1
    ? "1 provider in this area could act on this."
    : count + " providers in this area could act on this.";
}

/** The interest name a traveller weighted highest, or an empty string. */
function strongestInterest(interests: Record<string, number>): string {
  let best = "";
  let bestScore = -Infinity;
  for (const key of Object.keys(interests).sort()) {
    const score = interests[key];
    if (typeof score === "number" && Number.isFinite(score) && score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

function ReviewCard({
  record,
  stale,
  onStatusChange,
  onStaleToggle,
}: {
  record: OperationRecord;
  stale: boolean;
  onStatusChange: (id: string, status: OperationRecord["status"]) => void;
  onStaleToggle: (record: OperationRecord) => void;
}) {
  const isVerified = record.status === "Verified";
  const isStale = record.status === "Stale" || stale;
  const state = stale ? "Stale" : record.status;
  return (
    <article className="border border-line p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusLabel tone={isVerified ? "green" : isStale ? "amber" : "blue"}>{state}</StatusLabel>
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{record.kind}</span>
          </div>
          <h3 className="mt-4 text-xl font-bold">{record.title}</h3>
          <p className="mt-1 text-sm text-muted">
            {record.area} · {record.detail}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Source</p>
          <p className="mt-1 text-sm font-semibold">{record.source}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted">
          <span>
            <Clock size={14} className="mr-1 inline" />Last checked: {record.lastChecked}
          </span>
          <span>
            {isVerified ? (
              <ShieldCheck size={14} className="mr-1 inline text-green" />
            ) : isStale ? (
              <Warning size={14} className="mr-1 inline text-amber" />
            ) : (
              <Flag size={14} className="mr-1 inline text-blue" />
            )}
            {isVerified
              ? "Facts checked against the source"
              : isStale
                ? "Stale: excluded from ranking and carries a visible doubt until rechecked"
                : "Review before publishing"}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onStatusChange(record.id, "Verified")}
            className="inline-flex items-center gap-1 rounded-lg bg-blue px-3 py-2 text-xs font-bold text-white"
          >
            <Check size={15} /> Verify
          </button>
          <button
            onClick={() => onStaleToggle(record)}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold"
          >
            <Eye size={15} /> {stale ? "Clear stale" : "Mark stale"}
          </button>
        </div>
      </div>
    </article>
  );
}

function MediaReviewCard({
  record,
  onAction,
}: {
  record: MediaRecord;
  onAction: (id: string, action: Parameters<typeof applyMediaAction>[2]) => void;
}) {
  const stateTone = record.state === "Approved" ? "green" : record.state === "Archived" ? "amber" : "blue";
  return (
    <article className="border border-line p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <StatusLabel tone={stateTone}>{record.state}</StatusLabel>
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
              {record.platform} · {record.mediaType} · {record.publishedAt}
            </span>
          </div>
          <h3 className="mt-4 text-xl font-bold">{record.title}</h3>
          <p className="mt-1 text-sm text-muted">
            {record.creator} · {record.experienceId}
          </p>
          <p className="mt-2 max-w-xl text-xs leading-5 text-muted">{record.note}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">External link</p>
          <a
            href={record.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-blue"
          >
            {record.platform === "youtube" ? "Open on YouTube" : "Open on Instagram"}
            <PlayCircle size={15} />
          </a>
        </div>
      </div>
      <div className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted">
          <span>
            <Clock size={14} className="mr-1 inline" />Last checked: {record.lastChecked}
          </span>
          <span>
            History: {record.history.length ? record.history.map((entry) => `${entry.action} (${entry.at})`).join(" · ") : "No actions yet"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {record.state !== "Approved" && (
            <button onClick={() => onAction(record.id, "Approved")} className="inline-flex items-center gap-1 rounded-lg bg-blue px-3 py-2 text-xs font-bold text-white">
              <Check size={15} /> Approve
            </button>
          )}
          {record.state !== "Archived" && (
            <button onClick={() => onAction(record.id, "Rejected")} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold">
              <X size={15} /> Reject
            </button>
          )}
          {record.state === "Approved" && (
            <button onClick={() => onAction(record.id, "Archived")} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold">
              <Eye size={15} /> Archive
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function HiddenGemCard({ candidate }: { candidate: ReturnType<typeof hiddenGemCandidates>[number] }) {
  return (
    <article className="border border-line p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <StatusLabel tone="blue">{candidate.confidence}</StatusLabel>
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{candidate.zone}</span>
            <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.1em] text-blue">
              <Sparkle size={13} /> Hidden gem candidate
            </span>
          </div>
          <h3 className="mt-4 text-xl font-bold">{candidate.name}</h3>
          <p className="mt-1 text-sm text-muted">
            {candidate.area} · {candidate.detail}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {candidate.safetyFlags.map((flag) => (
              <span key={flag.field} className="inline-flex items-center gap-1 rounded bg-amberSoft px-2 py-1 text-xs font-semibold text-amber">
                <Warning size={12} />
                {flag.field}: {flag.flag}
              </span>
            ))}
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Source</p>
          <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm font-semibold text-blue">
            {candidate.source}
          </a>
        </div>
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Verification history</p>
        <ol className="mt-2 space-y-1 text-sm leading-6 text-muted">
          {candidate.verificationHistory.map((entry) => (
            <li key={`${entry.state}-${entry.at}`}>
              {entry.state} · {entry.at}
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}
