"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clock, Eye, Flag, MagnifyingGlass, PlayCircle, ShieldCheck, Sparkle, Warning, X } from "@phosphor-icons/react/dist/ssr";
import { StatusLabel } from "@/components/ui";
import { operationSeed, readOperations, type OperationRecord, writeOperations } from "@/lib/operations";
import { readReports } from "@/lib/reports";
import { eventChanges } from "@/lib/events";
import { eventSeed } from "@/lib/seed";
import { applyMediaAction, mediaSeedRecords, readMediaRecords, writeMediaRecords, type MediaRecord } from "@/lib/media-store";
import { hiddenGemCandidates } from "@/lib/hidden-gems";

export default function OperationsPage() {
  const [records, setRecords] = useState(operationSeed);
  const [mediaRecords, setMediaRecords] = useState<MediaRecord[]>([]);
  const [query, setQuery] = useState("");
  const gemCandidates = useMemo(() => hiddenGemCandidates(), []);

  useEffect(() => {
    const sync = () => {
      const reports = readReports().map((report) => ({ id: `op-${report.id}`, kind: "experience" as const, title: report.recordTitle, area: "Traveler report", source: report.reason, status: "Needs review" as const, detail: report.note || "Incorrect information report", lastChecked: report.submittedAt }));
      const stored = readOperations().filter((record) => !reports.some((report) => report.id === record.id));
      // Derived from event snapshots; admin status persists because verify/stale writes the full array back.
      const changeRecords = eventSeed.filter((event) => eventChanges(event).length > 0).map((event) => {
        const id = `op-eventchange-${event.id}`;
        const persisted = stored.find((record) => record.id === id);
        return persisted ?? { id, kind: "event" as const, title: event.name, area: "Automated check", source: "Change detection", status: "Needs review" as const, detail: `Detected changes: ${eventChanges(event).map((change) => change.field.toLowerCase()).join(", ")}`, lastChecked: "Automated" };
      });
      setRecords([...reports, ...changeRecords, ...stored.filter((record) => !record.id.startsWith("op-eventchange-"))]);
    };
    const syncMedia = () => setMediaRecords(readMediaRecords());
    sync();
    syncMedia();
    window.addEventListener("local-tourist-reports-change", sync);
    window.addEventListener("local-tourist-operations-change", sync);
    window.addEventListener("local-tourist-media-change", syncMedia);
    return () => { window.removeEventListener("local-tourist-reports-change", sync); window.removeEventListener("local-tourist-operations-change", sync); window.removeEventListener("local-tourist-media-change", syncMedia); };
  }, []);

  const filtered = useMemo(() => records.filter((record) => `${record.title} ${record.area} ${record.kind} ${record.status}`.toLowerCase().includes(query.toLowerCase())), [records, query]);
  const filteredMedia = useMemo(() => mediaRecords.filter((record) => `media ${record.title} ${record.platform} ${record.state}`.toLowerCase().includes(query.toLowerCase())), [mediaRecords, query]);
  const filteredGems = useMemo(() => gemCandidates.filter((candidate) => `hidden gem ${candidate.name} ${candidate.zone} ${candidate.confidence}`.toLowerCase().includes(query.toLowerCase())), [gemCandidates, query]);
  const updateStatus = (id: string, status: OperationRecord["status"]) => setRecords((current) => { const next = current.map((record) => record.id === id ? { ...record, status, lastChecked: "Just now" } : record); writeOperations(next); return next; });
  const actOnMedia = (id: string, action: Parameters<typeof applyMediaAction>[2]) => setMediaRecords((current) => { const next = applyMediaAction(current, id, action); writeMediaRecords(next); return next; });

  return <main id="main-content" className="min-h-screen bg-canvas"><div className="mx-auto min-h-screen max-w-[1320px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card"><header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8"><a href="/" className="flex items-center gap-2 text-sm font-bold"><ArrowLeft size={18} /> Local Tourist</a><div className="text-right"><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Operations</p><h1 className="mt-1 text-lg font-bold">Data review queue</h1></div></header><section className="px-5 pb-12 pt-10 sm:px-8 lg:px-14"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Source and freshness</p><h2 className="mt-3 text-4xl font-bold tracking-[-0.05em]">Keep local information trustworthy.</h2><p className="mt-4 leading-7 text-muted">Review events, experiences, videos, and hidden-gem candidates before they influence traveler recommendations.</p></div><div className="mt-8 flex items-center gap-3 border-b border-line pb-5"><MagnifyingGlass size={20} className="text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the review queue" aria-label="Search data review queue" className="w-full bg-transparent text-sm font-semibold outline-none" /></div>

      <h2 className="mt-10 text-xl font-bold tracking-[-0.02em]">Records and reports</h2>
      <div className="mt-4 grid gap-4">{filtered.map((record) => <ReviewCard key={record.id} record={record} onStatusChange={updateStatus} />)}</div>
      {!filtered.length && <div className="mt-4 border border-line bg-canvas p-8"><h3 className="text-xl font-bold">No records match this search</h3><p className="mt-2 text-muted">Try the name, area, record type, or review status.</p></div>}

      <h2 className="mt-10 text-xl font-bold tracking-[-0.02em]">External media verification</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Approve, reject, or stale-mark external videos. Only approved media ever appears on an experience page, and approval always stays traceable.</p>
      <div className="mt-4 grid gap-4">{filteredMedia.map((record) => <MediaReviewCard key={record.id} record={record} onAction={actOnMedia} />)}</div>
      {!filteredMedia.length && <div className="mt-4 border border-line bg-canvas p-5"><p className="text-sm text-muted">No media records match this search.</p></div>}

      <h2 className="mt-10 text-xl font-bold tracking-[-0.02em]">Hidden gem candidates</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Residents and community sources proposed these. Each candidate carries its source, safety flags, and verification history. Low popularity alone never qualifies a place as a hidden gem.</p>
      <div className="mt-4 grid gap-4">{filteredGems.map((candidate) => <HiddenGemCard key={candidate.id} candidate={candidate} />)}</div>
      {!filteredGems.length && <div className="mt-4 border border-line bg-canvas p-5"><p className="text-sm text-muted">No candidates match this search.</p></div>}
    </section></div></main>;
}

function ReviewCard({ record, onStatusChange }: { record: OperationRecord; onStatusChange: (id: string, status: OperationRecord["status"]) => void }) {
  const isVerified = record.status === "Verified";
  const isStale = record.status === "Stale";
  return <article className="border border-line p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-3"><StatusLabel tone={isVerified ? "green" : isStale ? "amber" : "blue"}>{record.status}</StatusLabel><span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{record.kind}</span></div><h3 className="mt-4 text-xl font-bold">{record.title}</h3><p className="mt-1 text-sm text-muted">{record.area} · {record.detail}</p></div><div className="text-left sm:text-right"><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Source</p><p className="mt-1 text-sm font-semibold">{record.source}</p></div></div><div className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted"><span><Clock size={14} className="mr-1 inline" />Last checked: {record.lastChecked}</span><span>{isVerified ? <ShieldCheck size={14} className="mr-1 inline text-green" /> : isStale ? <Warning size={14} className="mr-1 inline text-amber" /> : <Flag size={14} className="mr-1 inline text-blue" />}{isVerified ? "Approved for discovery" : isStale ? "Remove from ranking until checked" : "Review before publishing"}</span></div><div className="flex gap-2"><button onClick={() => onStatusChange(record.id, "Verified")} className="inline-flex items-center gap-1 rounded-lg bg-blue px-3 py-2 text-xs font-bold text-white"><Check size={15} /> Verify</button><button onClick={() => onStatusChange(record.id, "Stale")} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold"><Eye size={15} /> Mark stale</button></div></div></article>;
}

function MediaReviewCard({ record, onAction }: { record: MediaRecord; onAction: (id: string, action: Parameters<typeof applyMediaAction>[2]) => void }) {
  const stateTone = record.state === "Approved" ? "green" : record.state === "Archived" ? "amber" : "blue";
  return <article className="border border-line p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><StatusLabel tone={stateTone}>{record.state}</StatusLabel><span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{record.platform} · {record.mediaType} · {record.publishedAt}</span></div><h3 className="mt-4 text-xl font-bold">{record.title}</h3><p className="mt-1 text-sm text-muted">{record.creator} · {record.experienceId}</p><p className="mt-2 max-w-xl text-xs leading-5 text-muted">{record.note}</p></div><div className="text-left sm:text-right"><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">External link</p><a href={record.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-blue">{record.platform === "youtube" ? "Open on YouTube" : "Open on Instagram"}<PlayCircle size={15} /></a></div></div><div className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted"><span><Clock size={14} className="mr-1 inline" />Last checked: {record.lastChecked}</span><span>History: {record.history.length ? record.history.map((entry) => `${entry.action} (${entry.at})`).join(" · ") : "No actions yet"}</span></div><div className="flex flex-wrap gap-2">{record.state !== "Approved" && <button onClick={() => onAction(record.id, "Approved")} className="inline-flex items-center gap-1 rounded-lg bg-blue px-3 py-2 text-xs font-bold text-white"><Check size={15} /> Approve</button>}{record.state !== "Archived" && <button onClick={() => onAction(record.id, "Rejected")} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold"><X size={15} /> Reject</button>}{record.state === "Approved" && <button onClick={() => onAction(record.id, "Marked stale")} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold"><Eye size={15} /> Mark stale</button>}</div></div></article>;
}

function HiddenGemCard({ candidate }: { candidate: ReturnType<typeof hiddenGemCandidates>[number] }) {
  return <article className="border border-line p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><StatusLabel tone="blue">{candidate.confidence}</StatusLabel><span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{candidate.zone}</span><span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.1em] text-blue"><Sparkle size={13} /> Hidden gem candidate</span></div><h3 className="mt-4 text-xl font-bold">{candidate.name}</h3><p className="mt-1 text-sm text-muted">{candidate.area} · {candidate.detail}</p><div className="mt-3 flex flex-wrap gap-2">{candidate.safetyFlags.map((flag) => <span key={flag.field} className="inline-flex items-center gap-1 rounded bg-amberSoft px-2 py-1 text-xs font-semibold text-amber"><Warning size={12} />{flag.field}: {flag.flag}</span>)}</div></div><div className="text-left sm:text-right"><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Source</p><a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm font-semibold text-blue">{candidate.source}</a></div></div><div className="mt-5 border-t border-line pt-4"><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Verification history</p><ol className="mt-2 space-y-1 text-sm leading-6 text-muted">{candidate.verificationHistory.map((entry) => <li key={`${entry.state}-${entry.at}`}>{entry.state} · {entry.at}</li>)}</ol></div></article>;
}
