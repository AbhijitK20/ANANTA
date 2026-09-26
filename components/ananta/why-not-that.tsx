"use client";

import { useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react/dist/ssr";
import type { Rejection } from "@/lib/engine";
import { REJECTION_UNIT_LABEL } from "@/lib/engine";
import { CONFIDENCE_TONE, KNOWLEDGE_DEPTH, motion } from "@/components/ananta/tokens";
import type { RelaxationOption } from "@/components/ananta/pipeline";
import { shortfallText } from "@/components/ananta/why/format";
import { nearestMissText, orderByShortfall } from "@/components/ananta/why/near-miss";

/**
 * "Why not that", keyed to the record the traveller actually asked about.
 *
 * The old panel listed every exclusion in one flat collapsed list with no link to
 * what was typed. This takes the typed `Rejection[]` for one record, shows the
 * code alongside the sentence so the vocabulary is inspectable, states the
 * shortfall in the unit the code declares, and names the provenance of the fact
 * that caused the refusal. Then it answers the only question that matters after
 * a refusal: which single constraint, if relaxed, buys the most back.
 *
 * **The one depth moment on this panel.** It is closed at `depth-recessed` and
 * open at `depth-flush`, so opening it *rises out of* the recessed card the
 * rejected record sits in and the traveller's eye is physically drawn from the
 * pushed-back card to the reason it is pushed back. Session 6 established the
 * vocabulary and session 4 owns the card; this completes the motion.
 *
 * Depth is chosen by open state, never by hover, and the open and closed states
 * are class names rather than computed transforms, because session 1's
 * `reduced-motion.test.ts` depends on the stylesheet owning every transform and
 * on the reduced-motion block being able to neutralise all of them at once.
 * A transform written in JS would survive that block.
 *
 * Each rejection row also carries the depth of the fact that caused it, through
 * `KNOWLEDGE_DEPTH`: a refusal resting on an unverified fact is carved into the
 * panel, which is a real and useful signal, because it says the gate would not
 * have blocked this had it known either way.
 */

const OPEN_PANEL = "depth-flush";
const CLOSED_PANEL = "depth-recessed";

/** How the record got here, when nothing was rejected. Different fix each. */
export type NotACandidate = "never-retrieved" | "dropped-by-gate";

function emptyCopy(recordName: string, retrievalNote?: string, reason?: NotACandidate) {
  if (retrievalNote) return retrievalNote;
  if (reason === "dropped-by-gate") {
    return `${recordName} was retrieved and then dropped by a check. Widen the search or relax one constraint above to see it again.`;
  }
  return `${recordName} was never returned by the search, so nothing was checked against it. Widen the area or the travel window to bring it into range.`;
}

export function WhyNotThat({
  recordName,
  rejections,
  cheapest,
  retrievalNote,
  bulkCount = 0,
  notACandidate,
  defaultOpen = true,
}: {
  recordName: string;
  rejections: Rejection[];
  cheapest?: RelaxationOption | null;
  retrievalNote?: string;
  bulkCount?: number;
  /** Set by the caller when it knows which of the two empty cases this is. */
  notACandidate?: NotACandidate;
  /** A panel the traveller opened by asking for it should start open. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panel = `${open ? OPEN_PANEL : CLOSED_PANEL} ${motion.state} border border-line p-5`;

  if (!rejections.length) {
    return (
      <section className={panel} aria-label="Why not that">
        <h3 className="font-bold">Why not that</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{emptyCopy(recordName, retrievalNote, notACandidate)}</p>
        {bulkCount > 0 && (
          <p className="mt-3 text-xs font-semibold text-muted">
            {bulkCount} other record{bulkCount === 1 ? "" : "s"} were dropped before scoring.
          </p>
        )}
      </section>
    );
  }

  const blocking = orderByShortfall(rejections.filter((item) => item.blocking));
  const advisory = orderByShortfall(rejections.filter((item) => !item.blocking));
  const miss = nearestMissText(blocking);

  return (
    <section className={panel} aria-label="Why not that">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">Why not {recordName}</h3>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={`why-not-${recordName}`}
          className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
        >
          {open ? "Hide reasons" : "Show reasons"}
          <span aria-hidden="true">{open ? <CaretUp size={14} /> : <CaretDown size={14} />}</span>
        </button>
      </div>

      {!open ? (
        <p className="mt-2 text-sm leading-6 text-muted">
          {blocking.length} blocking reason{blocking.length === 1 ? "" : "s"} and {advisory.length} advisory.
          {miss ? ` Nearest miss: ${shortfallText(blocking.find((item) => item.shortfall !== null) ?? blocking[0])}.` : ""}
        </p>
      ) : (
        <>
          {miss && (
            <p className="mt-3 border-l-4 border-blue bg-blueSoft/50 px-3 py-2 text-sm font-semibold leading-6 text-ink">
              {miss}
            </p>
          )}

          {blocking.length > 0 && (
            <ul className="mt-4 space-y-3">
              {blocking.map((item, index) => {
                const magnitude = shortfallText(item);
                return (
                  <li
                    key={`${item.code}-${index}`}
                    className={`${KNOWLEDGE_DEPTH[item.causedByConfidence]} border-l-4 border-amber bg-amberSoft/50 p-3`}
                  >
                    <p className="text-sm font-semibold leading-6">{item.sentence}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted">
                      <code className="rounded bg-white px-1.5 py-0.5 text-ink">{item.code}</code>
                      {magnitude && <span>{magnitude}</span>}
                      <span
                        className={`rounded px-1.5 py-0.5 ${CONFIDENCE_TONE[item.causedByConfidence] ?? CONFIDENCE_TONE.unverified}`}
                      >
                        fact: {item.causedBy}, {item.causedByConfidence}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {advisory.length > 0 && (
            <>
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.1em] text-muted">
                Not blocking, but not known either
              </p>
              <ul className="mt-2 space-y-2">
                {advisory.map((item, index) => (
                  <li key={`${item.code}-${index}`} className="flex gap-2 text-sm leading-6 text-muted">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                    <span>
                      {item.sentence}{" "}
                      <code className="text-[11px]">{item.code}</code>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {cheapest && (
            <div className="mt-5 border border-blue bg-blueSoft/40 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-blue">Cheapest thing to relax</p>
              <p className="mt-2 text-sm font-semibold leading-6">
                {cheapest.label} is the only thing standing between{" "}
                {cheapest.unlockedCount} record{cheapest.unlockedCount === 1 ? "" : "s"} and your results.
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {cheapest.unlockedNames.slice(0, 3).join(", ")}
                {cheapest.unlockedCount > 3 ? ` and ${cheapest.unlockedCount - 3} more` : ""}.
                {cheapest.medianShortfall !== null
                  ? ` The median one is ${Math.round(cheapest.medianShortfall * 10) / 10} ${REJECTION_UNIT_LABEL[cheapest.unit] || cheapest.unit} short.`
                  : ""}
              </p>
            </div>
          )}
        </>
      )}

      {bulkCount > 0 && (
        <p className="mt-4 text-xs font-semibold text-muted">
          {bulkCount} other record{bulkCount === 1 ? "" : "s"} were dropped at retrieval or at the gate.
        </p>
      )}
    </section>
  );
}
