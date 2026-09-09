"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, X } from "@phosphor-icons/react/dist/ssr";
import { readOperations, writeOperations } from "@/lib/operations";
import { readReports, writeReports, type ReportReason } from "@/lib/reports";

const reasons: ReportReason[] = ["Wrong hours", "Wrong price", "Closed or cancelled", "Wrong location", "Misleading media", "Duplicate listing"];

export function ReportButton({ recordId, recordTitle }: { recordId: string; recordTitle: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<ReportReason>(reasons[0]);
  const [note, setNote] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Dialog basics: Escape closes, backdrop click closes, focus moves to the dialog.
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const submit = () => {
    const report = { id: `report-${Date.now()}`, recordId, recordTitle, reason, note, submittedAt: "Just now", status: "Needs review" as const };
    writeReports([report, ...readReports()]);
    // Media complaints enter the operations queue as media records so the media reviewer handles them.
    writeOperations([{ id: `op-${report.id}`, kind: reason === "Misleading media" ? "media" as const : "experience" as const, title: recordTitle, area: "Traveler report", source: reason, status: "Needs review" as const, detail: note || "Incorrect information report", lastChecked: "Just now" }, ...readOperations()]);
    setSent(true);
  };

  return <div className="relative"><button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 text-xs font-bold text-muted hover:text-blue"><Flag size={15} /> Report incorrect information</button>{open && <div role="dialog" aria-modal="true" aria-label="Report this information" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }} className="fixed inset-0 z-30 flex items-center justify-center bg-ink/25 p-5"><div className="w-full max-w-md border border-line bg-white p-6 shadow-float"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Data correction</p><h2 className="mt-2 text-xl font-bold">Report this information</h2></div><button ref={closeButtonRef} onClick={() => setOpen(false)} aria-label="Close report dialog" className="text-muted"><X size={19} /></button></div>{sent ? <div className="mt-6 bg-greenSoft p-4 text-sm font-semibold leading-6 text-green">Report submitted. The information will remain visible until an operator reviews the source.</div> : <><label className="mt-6 block text-sm font-semibold">What is incorrect?<select value={reason} onChange={(event) => setReason(event.target.value as ReportReason)} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 text-sm outline-none focus:border-blue">{reasons.map((item) => <option key={item}>{item}</option>)}</select></label><label className="mt-4 block text-sm font-semibold">Additional detail <span className="font-normal text-muted">(optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Tell us what you noticed" className="mt-2 block w-full resize-none rounded-lg border border-line bg-white px-3 py-3 text-sm outline-none focus:border-blue" /></label><button onClick={submit} className="mt-5 w-full rounded-lg bg-blue px-4 py-3 text-sm font-bold text-white">Send report</button></>}</div></div>}</div>;
}
