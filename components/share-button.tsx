"use client";

import { useState } from "react";
import { Check, ShareNetwork } from "@phosphor-icons/react/dist/ssr";

/**
 * The share button had an `aria-label` and no handler, so it was the fourth dead
 * control on this page. It now shares through the Web Share API where the
 * browser has one, falls back to the clipboard where it does not, and says which
 * of the two happened rather than silently appearing to do nothing.
 */
export function ShareButton({ title }: { title: string }) {
  const [state, setState] = useState<"idle" | "shared" | "copied" | "failed">("idle");

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        setState("shared");
        return;
      } catch {
        // A cancelled share sheet is not a failure worth reporting.
        if ((navigator as unknown as { share?: unknown }).share) return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={share} aria-label={`Share ${title}`} className="rounded-lg border border-line p-2.5">
        {state === "copied" ? <Check size={20} className="text-green" /> : <ShareNetwork size={20} />}
      </button>
      <span aria-live="polite" className="text-[11px] font-semibold text-muted">
        {state === "shared" ? "Shared" : state === "copied" ? "Link copied" : state === "failed" ? "Copy failed, use the address bar" : ""}
      </span>
    </span>
  );
}
