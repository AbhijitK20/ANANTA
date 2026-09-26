"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, X } from "@phosphor-icons/react/dist/ssr";
import { readOperations, writeOperations } from "@/lib/operations";
import { readReports, writeReports, type ReportReason } from "@/lib/reports";

const reasons: ReportReason[] = ["Wrong hours", "Wrong price", "Closed or cancelled", "Wrong location", "Misleading media", "Duplicate listing"];

/**
 * The dialog now does what `aria-modal="true"` claims.
 *
 * Before this it set `aria-modal`, moved focus to the close button, and closed
 * on Escape, but Tab walked straight out of the dialog into the page behind it
 * and closing left focus on a node that no longer existed. A lie in ARIA is
 * worse than no ARIA, so the trap and the restoration are both here now:
 * Tab and Shift+Tab cycle inside the panel, and focus returns to the trigger.
 */
export function ReportButton({ recordId, recordTitle }: { recordId: string; recordTitle: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<ReportReason>(reasons[0]);
  const [note, setNote] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    const focusables = () => {
      const panel = panelRef.current;
      if (!panel) return [] as HTMLElement[];
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => !node.hasAttribute("disabled"));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = focusables();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Focus goes back where it came from, so keyboard users are not dumped at the
  // top of the document every time they close a dialog.
  useEffect(() => {
    if (open) return;
    if (sent) return;
    const node = triggerRef.current;
    if (node && document.activeElement === document.body) node.focus();
  }, [open, sent]);

  const close = () => {
    setOpen(false);
    setSent(false);
    triggerRef.current?.focus();
  };

  const submit = () => {
    const report = { id: `report-${Date.now()}`, recordId, recordTitle, reason, note, submittedAt: "Just now", status: "Needs review" as const };
    writeReports([report, ...readReports()]);
    // Media complaints enter the operations queue as media records so the media reviewer handles them.
    writeOperations([
      { id: `op-${report.id}`, kind: reason === "Misleading media" ? ("media" as const) : ("experience" as const), title: recordTitle, area: "Traveler report", source: reason, status: "Needs review" as const, detail: note || "Incorrect information report", lastChecked: "Just now" },
      ...readOperations(),
    ]);
    setSent(true);
  };

  return (
    <div className="relative">
      <button ref={triggerRef} onClick={() => setOpen(true)} className="inline-flex items-center gap-2 text-xs font-bold text-muted hover:text-blue">
        <Flag size={15} /> Report incorrect information
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report this information"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink/25 p-5"
        >
          <div ref={panelRef} className="w-full max-w-md border border-line bg-white p-6 shadow-float">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Data correction</p>
                <h2 className="mt-2 text-xl font-bold">Report this information</h2>
              </div>
              <button ref={closeButtonRef} onClick={close} aria-label="Close report dialog" className="text-muted">
                <X size={19} />
              </button>
            </div>
            {sent ? (
              <div className="mt-6 bg-greenSoft p-4 text-sm font-semibold leading-6 text-green">
                Report submitted. The information stays visible until an operator reviews the source, because
                deleting a record on one traveller&apos;s word would be worse than an error that is labelled.
              </div>
            ) : (
              <>
                <label className="mt-6 block text-sm font-semibold">
                  What is incorrect?
                  <select value={reason} onChange={(event) => setReason(event.target.value as ReportReason)} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 text-sm">
                    {reasons.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 block text-sm font-semibold">
                  Additional detail <span className="font-normal text-muted">(optional)</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="Tell us what you noticed"
                    className="mt-2 block w-full resize-none rounded-lg border border-line bg-white px-3 py-3 text-sm"
                  />
                </label>
                <button onClick={submit} className="mt-5 w-full rounded-lg bg-blue px-4 py-3 text-sm font-bold text-white">
                  Send report
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
