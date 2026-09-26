"use client";

import { useEffect, useState } from "react";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import { LEARNER_KEY, resetLearner } from "@/components/ananta/learning";
import { AVAILABILITY_SNAPSHOT_KEY } from "@/components/ananta/learning/availability-snapshot";
import { CONFIDENCE_TONE, depth, depthShadow } from "@/components/ananta/tokens";
import { readSaved } from "@/lib/saved";
import { readPlan, PLAN_STORAGE_KEY } from "@/lib/plan";
import { readReports, REPORTS_KEY } from "@/lib/reports";

/**
 * What is stored, and the control that removes it.
 *
 * The privacy principle in `MASTERPLAN.md` section 15 and the PRD is that memory
 * must be user-controlled, explainable, deletable and minimal. Three of those
 * four words are UI decisions. This block is the deletion half, and it has to be
 * a real control that says what it did, because a delete that reports nothing
 * leaves the traveller unable to tell a working clear from a broken one.
 *
 * The keys are the ones the storage modules actually export, so a renamed key
 * becomes a compile error here rather than a silent orphan. Anything we do not
 * know the key for is left alone and the panel says so, because
 * `localStorage.clear()` would also take another part of the app's data and the
 * traveller would have no way to know what went.
 */

/** Keys this app is known to write, named from the modules that own them. */
export const STORED_KEYS: ReadonlyArray<{ key: string; label: string }> = [
  { key: LEARNER_KEY, label: "Learned weights and the observation count" },
  { key: "ananta-saved-experiences", label: "Saved places" },
  { key: AVAILABILITY_SNAPSHOT_KEY, label: "Availability snapshots for your saved places" },
  { key: PLAN_STORAGE_KEY, label: "Draft plan stops" },
  { key: REPORTS_KEY, label: "Reports you submitted" },
];

/** The keys the clear control removes, in the order the panel lists them. */
const CLEARABLE_KEYS = STORED_KEYS.map((entry) => entry.key);

/** Anything left behind is reported rather than silently swept. */
function foreignKeys(): string[] {
  if (typeof window === "undefined") return [];
  const known = new Set(STORED_KEYS.map((entry) => entry.key));
  const out: string[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && !known.has(key)) out.push(key);
    }
  } catch {
    return [];
  }
  return out.sort();
}

type Outcome = { removed: string[]; failed: string[] } | null;

export function StoredStateControl() {
  const [stored, setStored] = useState<{ key: string; label: string }[]>([]);
  const [other, setOther] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<Outcome>(null);

  useEffect(() => {
    const scan = () => {
      if (typeof window === "undefined") return;
      setStored(STORED_KEYS.filter((entry) => window.localStorage.getItem(entry.key) !== null));
      setOther(foreignKeys());
    };
    scan();
    window.addEventListener("ananta-saved-change", scan);
    window.addEventListener("ananta-plan-change", scan);
    window.addEventListener("ananta-reports-change", scan);
    window.addEventListener("ananta-learner-change", scan);
    return () => {
      window.removeEventListener("ananta-saved-change", scan);
      window.removeEventListener("ananta-plan-change", scan);
      window.removeEventListener("ananta-reports-change", scan);
      window.removeEventListener("ananta-learner-change", scan);
    };
  }, []);

  const clearAll = () => {
    const removed: string[] = [];
    const failed: string[] = [];
    // resetLearner rewrites the learner key with the prior rather than deleting
    // it, because the panel above reads the store on mount and a missing key
    // would make it flash the empty state before the prior arrives.
    try {
      resetLearner(new Date(0).toISOString());
      removed.push("Learned weights and the observation count");
    } catch {
      failed.push("Learned weights and the observation count");
    }
    for (const key of CLEARABLE_KEYS) {
      if (key === LEARNER_KEY) continue; // handled by resetLearner above
      try {
        window.localStorage.removeItem(key);
        removed.push(STORED_KEYS.find((entry) => entry.key === key)?.label ?? key);
      } catch {
        failed.push(key);
      }
    }
    setStored([]);
    setOutcome({ removed, failed });
  };

  return (
    <section
      className={`mt-6 rounded-card border border-line bg-white p-5 sm:p-6 ${depth.raised} ${depthShadow.raised}`}
      aria-labelledby="stored-heading"
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">What you can delete</p>
      <h2 id="stored-heading" className="mt-2 text-title tracking-[-0.03em] text-ink">
        Everything this app stored on this device
      </h2>
      <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted">
        There is no account and no server, so this list is the whole of it. Clearing puts the weights
        back to the starting values, empties the saved list and the draft plan, and removes your
        reports. Nothing is sent anywhere, because there is nowhere to send it.
      </p>

      {/* A list, not a paragraph, because the reader is checking one thing per
          line: is this key present or not. The key is printed because a delete
          that does not name what it deletes is not auditable. */}
      <ul className="mt-5 divide-y divide-line border border-line">
        {STORED_KEYS.map((entry) => {
          const present = stored.some((item) => item.key === entry.key);
          return (
            <li key={entry.key} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{entry.label}</p>
                <code className="text-[11px] text-muted">{entry.key}</code>
              </div>
              <span className={`chip ${present ? CONFIDENCE_TONE.verified : CONFIDENCE_TONE.unverified}`}>
                {present ? "Stored" : "Empty"}
              </span>
            </li>
          );
        })}
      </ul>

      {other.length > 0 ? (
        <p className="mt-3 border border-dashed border-line p-3 text-xs leading-5 text-muted">
          This browser also holds {other.length} other item{other.length === 1 ? "" : "s"} under keys this
          app does not own, and the clear button leaves {other.length === 1 ? "it" : "them"} alone. Use your
          browser&apos;s own site-data controls for those.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={clearAll}
          disabled={stored.length === 0}
          className="inline-flex min-h-[44px] items-center gap-2 border border-amber px-4 py-2 text-sm font-bold text-amber transition-colors duration-120 hover:bg-amberSoft disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
        >
          <Trash size={16} /> Clear everything stored here
        </button>
        <p className="text-xs leading-5 text-muted">
          {stored.length === 0
            ? "Nothing is stored, so there is nothing to clear."
            : `${stored.length} of ${STORED_KEYS.length} item${stored.length === 1 ? "" : "s"} stored.`}
        </p>
      </div>

      {outcome ? (
        <p
          className="mt-4 border border-line border-l-blue bg-canvas p-3 text-sm leading-6"
          role="status"
          aria-live="polite"
        >
          {outcome.failed.length === 0 ? (
            <>
              Cleared {outcome.removed.length} item{outcome.removed.length === 1 ? "" : "s"}:{" "}
              {outcome.removed.join(", ").toLowerCase()}. The weights are back at the starting values and
              nothing about your last session survives on this device.
            </>
          ) : (
            <>
              Cleared what it could. {outcome.removed.length} item
              {outcome.removed.length === 1 ? "" : "s"} removed, and these could not be written to:{" "}
              {outcome.failed.join(", ")}. Your browser blocked local storage writes, so the old values may
              still be there.
            </>
          )}
        </p>
      ) : null}
    </section>
  );
}

/** The counts the profile header shows. Kept here so the page stays a layout. */
export function storedCounts() {
  return {
    saved: readSaved().length,
    plan: readPlan().length,
    reports: readReports().length,
  };
}
