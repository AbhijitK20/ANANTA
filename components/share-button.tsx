"use client";

import { useState } from "react";
import { Check, ShareNetwork } from "@phosphor-icons/react/dist/ssr";
import { depth, motion } from "@/components/ananta/tokens";

/**
 * Share through the platform where there is one, and through the clipboard where
 * there is not.
 *
 * The button previously had an `aria-label` and no handler, so it was the fourth
 * dead control on the page. It now does something, and it says which of the two
 * things it did.
 *
 * A silent clipboard write is the failure worth designing against: the bytes
 * land, the user sees nothing move, and a working button looks broken. So every
 * outcome has a word, and the word is in an `aria-live` region rather than only in
 * the icon. A dismissed share sheet is a choice, not an error, and leaves no
 * trace; the old guard for that was a test that was true by construction on the
 * branch it sat in, so it read as a condition and did nothing.
 *
 * **Depth is `depth-flush` and stays there.** This control has no pressed state,
 * so there is no state to encode: it is always the same offer, whether or not it
 * has been used. It never gains depth on hover, for the reason in
 * `plan-button.tsx`.
 */
type ShareState = "idle" | "shared" | "copied" | "failed";

const COPY_FAILED = "Copy failed, use the address bar";

const isAbort = (error: unknown): boolean =>
  Boolean(error) && (error as { name?: string }).name === "AbortError";

export function ShareButton({ title }: { title: string }) {
  const [state, setState] = useState<ShareState>("idle");

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  const share = async () => {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        setState("shared");
      } catch (error) {
        if (!isAbort(error)) await copy(url);
      }
      return;
    }
    await copy(url);
  };

  const spoken =
    state === "shared" ? "Shared." : state === "copied" ? "Link copied." : state === "failed" ? COPY_FAILED : "";

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={share}
        aria-label={`Share ${title}`}
        className={`${depth.flush} ${motion.state} rounded-lg border border-line p-2.5`}
      >
        <span aria-hidden="true">
          {state === "copied" ? <Check size={20} className="text-green" /> : <ShareNetwork size={20} />}
        </span>
      </button>
      <span aria-live="polite" className="text-[11px] font-semibold text-muted">
        {spoken}
      </span>
    </span>
  );
}
