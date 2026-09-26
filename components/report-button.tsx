"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Flag, X } from "@phosphor-icons/react/dist/ssr";
import { Button, Field } from "@/components/ui";
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
 *
 * Three further things the dialog was missing and now has. The page behind is
 * marked `inert` for the duration, because `aria-modal` alone only hides it from
 * a screen reader while leaving it clickable and tabbable for everyone else.
 * Scroll is locked, so a long report cannot scroll the page out from under the
 * panel. And the label, control, hint and error wiring now goes through the
 * shared `Field` from `components/ui.tsx` rather than being hand-rolled a fifth
 * time.
 *
 * A report never deletes anything. That is stated in the panel, because a
 * traveller who thinks one word removes a listing will report less honestly.
 */
export function ReportButton({ recordId, recordTitle }: { recordId: string; recordTitle: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<ReportReason>(reasons[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldPrefix = useId();

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    const focusables = () => {
      const panel = panelRef.current;
      if (!panel) return [] as HTMLElement[];
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.offsetParent !== null || node === document.activeElement);
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
      // Tab from anywhere outside the panel pulls it back in, so focus cannot
      // be left behind the overlay by a click.
      if (!panelRef.current?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // `aria-modal` tells assistive technology the rest of the page is inert.
    // Marking it inert makes that true for everyone, not just for a reader.
    const previousInert = document.body.getAttribute("inert");
    const previousOverflow = document.body.style.overflow;
    document.body.setAttribute("inert", "");
    document.body.style.overflow = "hidden";

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (previousInert === null) document.body.removeAttribute("inert");
      else document.body.setAttribute("inert", previousInert);
      document.body.style.overflow = previousOverflow;
    };
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
    setError(null);
    triggerRef.current?.focus();
  };

  const submit = () => {
    if (note.length > 800) {
      setError("Keep the detail under 800 characters so a reviewer can read it in one pass.");
      return;
    }
    setError(null);
    const report = { id: `report-${recordId}-${reason.replace(/\s+/g, "-").toLowerCase()}`, recordId, recordTitle, reason, note, submittedAt: "Just now", status: "Needs review" as const };
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
              <button ref={closeButtonRef} onClick={close} aria-label="Close report dialog" className="rounded p-1 text-muted hover:text-ink">
                <X size={19} />
              </button>
            </div>
            {sent ? (
              <div className="mt-6 bg-greenSoft p-4 text-sm font-semibold leading-6 text-green">
                Report submitted. The information stays visible until an operator reviews the source,
                because deleting a record on one traveller&apos;s word would be worse than an error
                that is labelled.
              </div>
            ) : (
              <>
                <Field
                  id={`${fieldPrefix}-reason`}
                  label="What is incorrect?"
                  className="mt-6"
                >
                  <select
                    value={reason}
                    onChange={(event) => setReason(event.target.value as ReportReason)}
                    className="block w-full rounded border border-line bg-white px-3 py-3 text-sm"
                  >
                    {reasons.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  id={`${fieldPrefix}-note`}
                  label="Additional detail"
                  hint="Optional. What did you see, and when?"
                  error={error ?? undefined}
                  className="mt-4"
                >
                  <textarea
                    value={note}
                    onChange={(event) => {
                      setNote(event.target.value);
                      if (error) setError(null);
                    }}
                    rows={3}
                    placeholder="Tell us what you noticed"
                    className="block w-full resize-none rounded border border-line bg-white px-3 py-3 text-sm"
                  />
                </Field>
                <Button onClick={submit} className="mt-5 w-full">
                  Send report
                </Button>
                <p className="mt-3 text-xs leading-5 text-muted">
                  A report never removes a record. It puts the record in a review queue, and the
                  fact stays on the page with its provenance until someone changes it.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
