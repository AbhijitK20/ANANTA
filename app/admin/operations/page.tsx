"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Eye,
  Flag,
  MagnifyingGlass,
  PlayCircle,
  RocketLaunch,
  ShieldCheck,
  Sparkle,
  Warning,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { StatusLabel } from "@/components/ui";
import { LocalDemoNotice } from "@/components/ananta/provider/local-demo-notice";
import { UnmetDemandFeed } from "@/components/ananta/provider/unmet-demand-feed";
import {
  operationSeed,
  publishableSubmissions,
  publishSubmission,
  readOperations,
  readStaleIds,
  setStale,
  writeOperations,
  type OperationRecord,
} from "@/lib/operations";
import { readReports } from "@/lib/reports";
import { eventChanges } from "@/lib/events";
import { eventSeed } from "@/lib/seed";
import { applyMediaAction, readMediaRecords, writeMediaRecords, type MediaRecord } from "@/lib/media-store";
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
import { CellFact, DataTable, TableAction, type TableRow } from "@/components/workspace/data-table";
import { BackLink, DashboardFrame, SectionHead, SheetBar, StatGrid, StatTile } from "@/components/workspace/frame";

/**
 * The operator's queue, as a dashboard of five tables.
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
 * `localStorage` on the visitor's own device. That is a scope decision, and it
 * is stated at the top of the page as a scope note rather than left implied.
 */

function todayStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * One search across all five queues, and nothing else.
 *
 * Module scope on purpose: a helper defined inside the component would become a
 * reactive dependency of every `useMemo` that calls it, and the search box would
 * then re-filter the whole queue on every keystroke for no reason.
 */
function matches(needle: string, ...fields: string[]): boolean {
  return `${fields.join(" ")}`.toLowerCase().includes(needle);
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

  const needle = query.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      needle
        ? records.filter((record) => matches(needle, record.title, record.area, record.kind, record.status))
        : records,
    [records, needle],
  );
  const filteredMedia = useMemo(
    () =>
      needle
        ? mediaRecords.filter((record) => matches(needle, "media", record.title, record.platform, record.state))
        : mediaRecords,
    [mediaRecords, needle],
  );
  const filteredGems = useMemo(
    () =>
      needle
        ? gemCandidates.filter((candidate) => matches(needle, "hidden gem", candidate.name, candidate.zone, candidate.confidence))
        : gemCandidates,
    [gemCandidates, needle],
  );
  const submissions = useMemo(() => publishableSubmissions(records), [records]);
  const demand = useMemo(() => unmetDemandFromRows(rows), [rows]);
  const pending = useMemo(
    () => records.filter((record) => record.status === "Needs review").length,
    [records],
  );
  const mediaToReview = useMemo(
    () => mediaRecords.filter((record) => record.state === "Needs review").length,
    [mediaRecords],
  );

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
   * Stale means what the label says, and the label is honest about the one step
   * that is not mine.
   *
   * `setStale` writes the id into `ananta-stale-ids`, and `applyStaleMarks` in
   * `lib/operations.ts` is the pure function that turns that set into
   * `statusTone: "amber"` on the real record. Amber is what the gate and the
   * travel options already treat as weather or season dependent, so a stale
   * record leaves a rain-sensitive plan and carries a visible doubt on one that
   * is not.
   *
   * `applyStaleMarks` has no caller yet, because the file that builds the
   * catalogue Explore indexes belongs to another session. The exact one-line
   * fix is in `UI-UX-Fix-Prompts/BLOCKERS/10.md`. The table below therefore
   * says plainly that the mark is recorded and where it takes effect, rather
   * than claiming a ranking change the code does not yet perform.
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

  /** Submissions. Publishing is the only row action that reaches a traveller. */
  const submissionRows: TableRow[] = submissions.map((record) => ({
    id: record.id,
    cells: [
      <div key="Submission" className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel tone="blue">{record.status}</StatusLabel>
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{record.kind}</span>
        </div>
        <p className="mt-2 text-sm font-bold text-ink">{record.title}</p>
        <p className="mt-1 max-w-[52ch] text-xs leading-5 text-muted">{record.detail}</p>
      </div>,
      <CellFact key="Area" label="Area">
        {record.area}
      </CellFact>,
      <CellFact key="Source" label="Source">
        {record.source}
      </CellFact>,
    ],
    actions: (
      <>
        <TableAction tone="confirm" onClick={() => publish(record)}>
          <RocketLaunch size={15} aria-hidden="true" /> Publish
        </TableAction>
        <TableAction onClick={() => closeListing(record)}>
          <Eye size={15} aria-hidden="true" /> Mark closed
        </TableAction>
      </>
    ),
  }));

  /** Records and reports. Verify sets a status; stale is the one with a mark. */
  const recordRows: TableRow[] = filtered.map((record) => {
    const stale = staleIds.includes(record.id);
    const isVerified = record.status === "Verified";
    const isStale = record.status === "Stale" || stale;
    return {
      id: record.id,
      cells: [
        <div key="Record" className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusLabel tone={isVerified ? "green" : isStale ? "amber" : "blue"}>
              {stale ? "Stale" : record.status}
            </StatusLabel>
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{record.kind}</span>
          </div>
          <p className="mt-2 text-sm font-bold text-ink">{record.title}</p>
          <p className="mt-1 max-w-[52ch] text-xs leading-5 text-muted">{record.detail}</p>
        </div>,
        <CellFact key="Area" label="Area">
          {record.area}
        </CellFact>,
        <CellFact key="Source" label="Source">
          {record.source}
        </CellFact>,
        <CellFact key="Last checked" label="Last checked">
          <span className="inline-flex items-center gap-1.5">
            {isVerified ? (
              <ShieldCheck size={14} className="text-green" aria-hidden="true" />
            ) : isStale ? (
              <Warning size={14} className="text-amber" aria-hidden="true" />
            ) : (
              <Flag size={14} className="text-blue" aria-hidden="true" />
            )}
            {record.lastChecked}
          </span>
          <span className="mt-1 block text-xs font-normal leading-5 text-muted">
            {isVerified
              ? "Facts checked against the source"
              : isStale
                ? "Marked stale. Excluded from ranking and shown with a visible doubt once the catalogue merge lands, which is tracked in BLOCKERS/10.md"
                : "Review before publishing"}
          </span>
        </CellFact>,
      ],
      actions: (
        <>
          <TableAction tone="primary" onClick={() => updateStatus(record.id, "Verified")}>
            <Check size={15} aria-hidden="true" /> Verify
          </TableAction>
          <TableAction onClick={() => markStale(record)}>
            <Eye size={15} aria-hidden="true" /> {stale ? "Clear stale" : "Mark stale"}
          </TableAction>
        </>
      ),
    };
  });

  /** Media. Only approved media ever reaches an experience page. */
  const mediaRows: TableRow[] = filteredMedia.map((record) => ({
    id: record.id,
    cells: [
      <div key="Media" className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel
            tone={record.state === "Approved" ? "green" : record.state === "Archived" ? "amber" : "blue"}
          >
            {record.state}
          </StatusLabel>
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
            {record.platform} &middot; {record.mediaType}
          </span>
        </div>
        <p className="mt-2 text-sm font-bold text-ink">{record.title}</p>
        <p className="mt-0.5 text-xs text-muted">
          {record.creator} &middot; {record.experienceId}
        </p>
        <p className="mt-1 max-w-[52ch] text-xs leading-5 text-muted">{record.note}</p>
      </div>,
      <CellFact key="Published" label="Published">
        {record.publishedAt}
      </CellFact>,
      <CellFact key="External link" label="External link">
        <a
          href={record.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-blue"
        >
          {record.platform === "youtube" ? "Open on YouTube" : "Open on Instagram"}
          <PlayCircle size={14} aria-hidden="true" />
        </a>
      </CellFact>,
      <CellFact key="History" label="History">
        {record.history.length
          ? record.history.map((entry) => `${entry.action} (${entry.at})`).join(" · ")
          : "No actions yet"}
      </CellFact>,
    ],
    actions: (
      <>
        {record.state !== "Approved" ? (
          <TableAction tone="confirm" onClick={() => actOnMedia(record.id, "Approved")}>
            <Check size={15} aria-hidden="true" /> Approve
          </TableAction>
        ) : null}
        {record.state !== "Archived" ? (
          <TableAction onClick={() => actOnMedia(record.id, "Rejected")}>
            <X size={15} aria-hidden="true" /> Reject
          </TableAction>
        ) : null}
        {record.state === "Approved" ? (
          <TableAction onClick={() => actOnMedia(record.id, "Archived")}>
            <Eye size={15} aria-hidden="true" /> Archive
          </TableAction>
        ) : null}
      </>
    ),
  }));

  /**
   * Hidden gem candidates. Low popularity alone never qualifies a place, so the
   * safety flags and the source stay on the same row as the confidence.
   */
  const gemRows: TableRow[] = filteredGems.map((candidate) => ({
    id: candidate.id,
    cells: [
      <div key="Candidate" className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel tone="blue">{candidate.confidence}</StatusLabel>
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.08em] text-blue">
            <Sparkle size={13} aria-hidden="true" /> Hidden gem candidate
          </span>
        </div>
        <p className="mt-2 text-sm font-bold text-ink">{candidate.name}</p>
        <p className="mt-1 max-w-[52ch] text-xs leading-5 text-muted">{candidate.detail}</p>
        {candidate.safetyFlags.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {candidate.safetyFlags.map((flag) => (
              <li
                key={flag.field}
                className="chip gap-1 bg-amberSoft text-amber"
              >
                <Warning size={12} aria-hidden="true" />
                {flag.field}: {flag.flag}
              </li>
            ))}
          </ul>
        ) : null}
      </div>,
      <CellFact key="Zone" label="Zone">
        {candidate.zone} &middot; {candidate.area}
      </CellFact>,
      <CellFact key="Source" label="Source">
        <a
          href={candidate.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue"
        >
          {candidate.source}
        </a>
      </CellFact>,
      <CellFact key="Verification history" label="Verification history">
        {candidate.verificationHistory.map((entry) => `${entry.state} (${entry.at})`).join(" · ")}
      </CellFact>,
    ],
  }));

  return (
    <DashboardFrame width="workspace">
      <SheetBar>
        <BackLink href="/" label="Ananta" />
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Operations</p>
          <h1 className="mt-1 text-lg font-bold text-ink">Data review queue</h1>
        </div>
      </SheetBar>

      <section className="px-5 pb-12 pt-8 sm:px-8 lg:px-14">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Source and freshness</p>
          <h2 className="mt-3 text-display tracking-[-0.04em] text-ink">Keep local information trustworthy.</h2>
          <p className="mt-4 text-lead text-muted">
            Review events, experiences, submissions and media before they influence traveller
            recommendations. Publishing a submission is the only action here that puts something
            new in front of a traveller.
          </p>
        </div>

        <div className="mt-6 max-w-2xl">
          <LocalDemoNotice variant="admin" />
        </div>

        <div className="mt-4">
          <StatGrid>
            <StatTile
              icon={Flag}
              label="Awaiting review"
              value={pending}
              note={`${records.length} record${records.length === 1 ? "" : "s"} in the queue`}
            />
            <StatTile
              icon={RocketLaunch}
              label="Publishable submissions"
              value={submissions.length}
              note="Publishing is what puts a new place into Explore"
            />
            <StatTile
              icon={PlayCircle}
              label="Media to approve"
              value={mediaToReview}
              note={`${mediaRecords.length} media record${mediaRecords.length === 1 ? "" : "s"} on file`}
            />
            <StatTile
              icon={Sparkle}
              label="Gem candidates"
              value={gemCandidates.length}
              note="Low popularity alone never qualifies a place"
            />
          </StatGrid>
        </div>

        <div className="card mt-4 flex items-center gap-3 p-3">
          <MagnifyingGlass size={18} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search every queue on this page"
            aria-label="Search the review queue"
            className="min-h-[36px] w-full bg-transparent text-sm font-semibold text-ink"
          />
          {query ? (
            <TableAction onClick={() => setQuery("")}>
              <X size={14} aria-hidden="true" /> Clear
            </TableAction>
          ) : null}
        </div>

        <div className="mt-8 grid gap-6">
          <DataTable
            label="Provider submissions"
            note="A submitted listing is invisible to travellers until it is published here. Publishing marks it verified and puts it in Explore, carrying unverified opening hours, so the gate may still refuse it and will say so. That is the honest outcome: the provider published a place, not a schedule."
            columns={[{ head: "Submission" }, { head: "Area", secondary: true }, { head: "Source", secondary: true }]}
            rows={submissionRows}
            empty={
              <p className="text-sm leading-6 text-muted">
                Nothing is waiting to be published. A submission made on the provider page appears
                here within a second, and publishing it is the step that puts it in front of a
                traveller.
              </p>
            }
          />

          <section aria-labelledby="demand-heading">
            <SectionHead
              id="demand-heading"
              eyebrow="Unmet demand"
              title="The unmet demand queue"
              description="Built from the rejection stream the feasibility gate writes, not from a count of saves and not from a floor under that count. The scan runs the real retrieve and the real gate over the real catalogue using the same traveller contexts the eval report measures."
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <TableAction
                tone="primary"
                onClick={scanDemand}
                disabled={scanning}
                className="min-h-[44px] px-4 py-2 text-sm"
              >
                <MagnifyingGlass size={16} aria-hidden="true" />
                {scanning ? "Scanning the gate" : "Scan refusals from the gate on this device"}
              </TableAction>
              <TableAction
                onClick={() => {
                  clearDemandRows();
                  setRows([]);
                  setScanNote("Cleared. The feed is empty because nothing has been recorded, not because the numbers are hidden.");
                }}
                className="min-h-[44px] px-4 py-2 text-sm"
              >
                Clear the feed
              </TableAction>
              {scanNote ? (
                <p className="w-full text-sm leading-6 text-muted" role="status" aria-live="polite">
                  {scanNote}
                </p>
              ) : null}
            </div>
            <div className="mt-4">
              {/* The same component the provider page renders, so an operator and a
                  provider are reading one number rather than two. The provider page
                  is where the feed earns its keep; here it is the operator's view of
                  what the catalogue is refusing and why. */}
              <UnmetDemandFeed
                demand={demand}
                totalRows={rows.length}
                scanning={scanning}
                onRunScan={scanDemand}
              />
            </div>
          </section>

          <DataTable
            label="Records and reports"
            note={
              needle
                ? `${filtered.length} of ${records.length} records match "${query}".`
                : `${records.length} record${records.length === 1 ? "" : "s"} in the queue.`
            }
            columns={[
              { head: "Record" },
              { head: "Area", secondary: true },
              { head: "Source", secondary: true },
              { head: "Last checked", secondary: true },
            ]}
            rows={recordRows}
            empty={
              <p className="text-sm leading-6 text-muted">
                {records.length} record{records.length === 1 ? " is" : "s are"} in the queue, and
                none match &quot;{query}&quot;. Clearing the search box shows all of them again.
              </p>
            }
          />

          <DataTable
            label="External media verification"
            note="Approve, reject, or stale-mark external videos. Only approved media ever appears on an experience page, and approval always stays traceable."
            columns={[
              { head: "Media" },
              { head: "Published", secondary: true },
              { head: "External link", secondary: true },
              { head: "History", secondary: true },
            ]}
            rows={mediaRows}
            empty={<p className="text-sm leading-6 text-muted">No media records match this search.</p>}
          />

          <DataTable
            label="Hidden gem candidates"
            note="Residents and community sources proposed these. Each candidate carries its source, safety flags, and verification history."
            columns={[
              { head: "Candidate" },
              { head: "Zone", secondary: true },
              { head: "Source", secondary: true },
              { head: "Verification history", secondary: true },
            ]}
            rows={gemRows}
            empty={<p className="text-sm leading-6 text-muted">No candidates match this search.</p>}
          />
        </div>
      </section>
    </DashboardFrame>
  );
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
