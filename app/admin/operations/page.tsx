"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clock, Eye, Flag, MagnifyingGlass, ShieldCheck, Warning } from "@phosphor-icons/react/dist/ssr";
import { StatusLabel } from "@/components/ui";
import { operationSeed, readOperations, type OperationRecord, writeOperations } from "@/lib/operations";
import { readReports } from "@/lib/reports";
import { eventChanges } from "@/lib/events";
import { eventSeed } from "@/lib/seed";

export default function OperationsPage() {
  const [records, setRecords] = useState(operationSeed);
  const [query, setQuery] = useState("");
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
    sync();
    window.addEventListener("local-tourist-reports-change", sync);
    window.addEventListener("local-tourist-operations-change", sync);
    return () => { window.removeEventListener("local-tourist-reports-change", sync); window.removeEventListener("local-tourist-operations-change", sync); };
  }, []);
  const filtered = useMemo(() => records.filter((record) => `${record.title} ${record.area} ${record.kind} ${record.status}`.toLowerCase().includes(query.toLowerCase())), [records, query]);
  const updateStatus = (id: string, status: OperationRecord["status"]) => setRecords((current) => { const next = current.map((record) => record.id === id ? { ...record, status, lastChecked: "Just now" } : record); writeOperations(next); return next; });
  return <main className="min-h-screen bg-canvas"><div className="mx-auto min-h-screen max-w-[1320px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card"><header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8"><a href="/" className="flex items-center gap-2 text-sm font-bold"><ArrowLeft size={18} /> Local Tourist</a><div className="text-right"><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Operations</p><h1 className="mt-1 text-lg font-bold">Data review queue</h1></div></header><section className="px-5 pb-12 pt-10 sm:px-8 lg:px-14"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Source and freshness</p><h2 className="mt-3 text-4xl font-bold tracking-[-0.05em]">Keep local information trustworthy.</h2><p className="mt-4 leading-7 text-muted">Review events, experiences, videos, and hidden-gem candidates before they influence traveler recommendations.</p></div><div className="mt-8 flex items-center gap-3 border-b border-line pb-5"><MagnifyingGlass size={20} className="text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the review queue" aria-label="Search data review queue" className="w-full bg-transparent text-sm font-semibold outline-none" /></div><div className="mt-8 grid gap-4">{filtered.map((record) => <ReviewCard key={record.id} record={record} onStatusChange={updateStatus} />)}</div>{!filtered.length && <div className="mt-8 border border-line bg-canvas p-8"><h3 className="text-xl font-bold">No records match this search</h3><p className="mt-2 text-muted">Try the name, area, record type, or review status.</p></div>}</section></div></main>;
}

function ReviewCard({ record, onStatusChange }: { record: OperationRecord; onStatusChange: (id: string, status: OperationRecord["status"]) => void }) {
  const isVerified = record.status === "Verified";
  const isStale = record.status === "Stale";
  return <article className="border border-line p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-3"><StatusLabel tone={isVerified ? "green" : isStale ? "amber" : "blue"}>{record.status}</StatusLabel><span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{record.kind}</span></div><h3 className="mt-4 text-xl font-bold">{record.title}</h3><p className="mt-1 text-sm text-muted">{record.area} · {record.detail}</p></div><div className="text-left sm:text-right"><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Source</p><p className="mt-1 text-sm font-semibold">{record.source}</p></div></div><div className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted"><span><Clock size={14} className="mr-1 inline" />Last checked: {record.lastChecked}</span><span>{isVerified ? <ShieldCheck size={14} className="mr-1 inline text-green" /> : isStale ? <Warning size={14} className="mr-1 inline text-amber" /> : <Flag size={14} className="mr-1 inline text-blue" />}{isVerified ? "Approved for discovery" : isStale ? "Remove from ranking until checked" : "Review before publishing"}</span></div><div className="flex gap-2"><button onClick={() => onStatusChange(record.id, "Verified")} className="inline-flex items-center gap-1 rounded-lg bg-blue px-3 py-2 text-xs font-bold text-white"><Check size={15} /> Verify</button><button onClick={() => onStatusChange(record.id, "Stale")} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold"><Eye size={15} /> Mark stale</button></div></div></article>;
}
