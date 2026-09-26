"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CaretDown, CaretUp } from "@phosphor-icons/react/dist/ssr";
import { typeScale, depth } from "@/components/ananta/tokens";
import { shortfallText } from "@/components/ananta/why/format";
import type { Rejection, RejectionCode } from "@/lib/engine";
import type { PipelineRun, RelaxationOption } from "@/components/ananta/pipeline";

/**
 * What we left out, and why. The credibility surface, so it is written as prose
 * and not as an error.
 *
 * **It is not an error state, and the copy is the reason.** A rejection is a
 * decision the engine made on purpose, with a number attached, so this panel
 * never says "error", never uses the alarm colour, and never leaves the traveller
 * with nothing to do. Three things make that true rather than decorative:
 *
 *   1. **Reasons before places.** The old panel mapped every refused record, so
 *      the first thing a reader met was a wall of individual refusals. Now the
 *      reasons lead, grouped and counted, each with the sentence the engine wrote
 *      and the magnitude that triggered it. The places are one click further
 *      down, for the traveller who wants to argue with a specific one.
 *   2. **A next step in the first screenful.** The cheapest single relaxation
 *      and the number of records it brings back, before any list.
 *   3. **A cap, disclosed.** A loose filter set refuses about a thousand records.
 *      Rendering all of them is about a thousand divs and it buries the reasons.
 *      The list is capped, it says how many it is holding back, and every single
 *      place still has its own page with its own reasons on it.
 *
 * Every sentence here comes from `REJECTION_CODES` through the engine. The
 * component writes no refusal prose of its own, because a refusal sentence this
 * file invented would be a claim about a record that no check made.
 *
 * Depth follows contract encoding 2. Closed, the panel is recessed and dashed,
 * because a refused record is pushed back whatever its provenance. Open, it rises
 * to flush, because the reasons have come forward to be read. That is a real
 * change in elevation, not a colour swap, and under reduced motion the dashed
 * edge and the desaturation still carry it.
 */

const REASON_CAP = 6;
const PLACE_CAP = 12;

type ReasonGroup = {
  code: RejectionCode;
  count: number;
  blocking: number;
  /** The engine's own sentence for this reason, with its own numbers in it. */
  sample: Rejection;
  /**
   * The median shortfall across every refusal with this code, so the panel can
   * say "typically 40 minutes short" and mean it. A single sample is labelled
   * "for this one" instead, because a median of one is not a typical anything.
   */
  median: Rejection | null;
  /** How many refusals carried a magnitude, so the wording can be honest. */
  measured: number;
  /** Up to three places that hit it, for the reader who wants one of them. */
  names: { id: string; name: string }[];
};

function groupReasons(run: PipelineRun): ReasonGroup[] {
  // The refused records are the ones the names come from, so the panel never
  // looks a name up in a table it does not hold.
  const recordById = new Map(run.gated.rejected.map((row) => [row.record.id, row.record]));
  const samples = new Map<RejectionCode, Rejection>();
  const names = new Map<RejectionCode, { id: string; name: string }[]>();
  const shortfalls = new Map<RejectionCode, number[]>();
  for (const row of run.gated.stream) {
    for (const item of row.rejections) {
      if (!samples.has(item.code)) samples.set(item.code, item);
      if (item.shortfall !== null && Number.isFinite(item.shortfall)) {
        const bucket = shortfalls.get(item.code) ?? [];
        bucket.push(item.shortfall);
        shortfalls.set(item.code, bucket);
      }
      const bucket = names.get(item.code) ?? [];
      const record = recordById.get(row.id);
      if (bucket.length < 3 && record) bucket.push({ id: row.id, name: record.name });
      names.set(item.code, bucket);
    }
  }
  return run.byCode.flatMap((entry) => {
    const sample = samples.get(entry.code);
    if (!sample) return [];
    const values = (shortfalls.get(entry.code) ?? []).slice().sort((a, b) => a - b);
    const middle = values.length ? values[Math.floor(values.length / 2)] : null;
    return [
      {
        ...entry,
        sample,
        median: middle === null ? null : { ...sample, shortfall: middle },
        measured: values.length,
        names: names.get(entry.code) ?? [],
      },
    ];
  });
}

export function ExclusionPanel({
  run,
  cheapest,
}: {
  run: PipelineRun;
  cheapest: RelaxationOption | null;
}) {
  const [open, setOpen] = useState(false);
  const refused = run.gated.rejected.length;
  const reasons = useMemo(() => groupReasons(run), [run]);
  if (refused === 0) return null;

  const blockingReasons = reasons.filter((reason) => reason.blocking > 0);
  const advisoryReasons = reasons.filter((reason) => reason.blocking === 0);
  const shownReasons = reasons.slice(0, REASON_CAP);
  const hiddenReasons = Math.max(0, reasons.length - REASON_CAP);
  const blockingPlaces = run.gated.rejected.filter((row) => row.rejections.some((item) => item.blocking));

  return (
    <section
      aria-label="What we left out, and why"
      className={`mt-6 rounded border border-line bg-white p-4 ${
        open ? depth.flush : `${depth.recessed} border-dashed`
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            The gate decided, and here is its reasoning
          </span>
          <span className="mt-1.5 block text-lg font-bold tracking-[-0.03em] text-ink">
            What we left out, and why
          </span>
        </span>
        <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded bg-canvas px-2 py-1 text-[11px] font-bold text-ink">
          {refused.toLocaleString("en-IN")} place{refused === 1 ? "" : "s"}
          {open ? <CaretUp size={13} aria-hidden="true" /> : <CaretDown size={13} aria-hidden="true" />}
        </span>
      </button>

      <p className="mt-3 max-w-[68ch] text-sm leading-6 text-muted">
        {run.retrievalCount.toLocaleString("en-IN")} places came back from the search and{" "}
        {refused.toLocaleString("en-IN")} of them were not put in front of you. Each refusal below is a check the
        engine ran and a number it measured. We would rather show you a short list that fits than a long one that
        nearly fits.
      </p>

      {!open ? (
        <div className="mt-3">
          {blockingReasons.slice(0, 2).map((reason) => (
            <p key={reason.code} className="mt-1.5 text-sm font-semibold leading-6 text-ink">
              {reason.sample.sentence}{" "}
              <span className="font-normal text-muted">
                {reason.blocking.toLocaleString("en-IN")} place{reason.blocking === 1 ? "" : "s"}.
              </span>
            </p>
          ))}
          {blockingReasons.length === 0 && advisoryReasons.length > 0 && (
            <p className="mt-1.5 text-sm leading-6 text-muted">
              Nothing was blocked. {refused.toLocaleString("en-IN")} place{refused === 1 ? "" : "s"} carried a fact
              we could not verify, so we did not claim it either way.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {shownReasons.map((reason) => {
            const magnitude = reason.median ? shortfallText(reason.median) : null;
            const advisory = reason.blocking === 0;
            const hit = reason.blocking > 0 ? reason.blocking : reason.count;
            return (
              <div
                key={reason.code}
                className={`border-t border-line py-3 first:border-t-0 first:pt-0 ${
                  advisory ? "border-dashed" : ""
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-semibold leading-6 text-ink">{reason.sample.sentence}</p>
                  <span className="shrink-0 text-[11px] font-bold text-muted">
                    {hit.toLocaleString("en-IN")} place{hit === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted">
                  <code className="rounded bg-canvas px-1.5 py-0.5 text-ink">{reason.code}</code>
                  {magnitude && (
                    <span>
                      {reason.measured > 1 ? "typically" : "for this one"} {magnitude}
                    </span>
                  )}
                  <span>
                    {advisory
                      ? "not blocking: we would not claim this either way"
                      : "blocking: this is what stopped the place"}
                  </span>
                </p>
                {reason.names.length > 0 && (
                  <p className="mt-1.5 text-[11px] leading-5 text-muted">
                    {reason.names.map((entry, index) => (
                      <span key={entry.id}>
                        {index > 0 && ", "}
                        <Link href={`/experience/${entry.id}`} className="font-semibold text-blue hover:underline">
                          {entry.name}
                        </Link>
                      </span>
                    ))}
                    {reason.count > reason.names.length ? " and others like them" : ""}
                  </p>
                )}
              </div>
            );
          })}

          {hiddenReasons > 0 && (
            <p className={`border-t border-line pt-3 ${typeScale.meta} text-muted`}>
              and {hiddenReasons} more reason{hiddenReasons === 1 ? "" : "s"} on this run. Every one of them is on the
              place&apos;s own page, with the same sentences and the same numbers.
            </p>
          )}

          {cheapest && (
            <div className="mt-4 rounded border border-blue bg-blueSoft/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue">
                The cheapest single change
              </p>
              <p className="mt-1.5 text-sm font-semibold leading-6 text-ink">
                Relax {cheapest.label} and {cheapest.unlockedCount.toLocaleString("en-IN")} of these come back
                {cheapest.unlockedNames.length > 0
                  ? `, including ${cheapest.unlockedNames.slice(0, 2).join(" and ")}.`
                  : "."}
              </p>
            </div>
          )}

          {blockingPlaces.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                The places themselves
              </p>
              <div className="mt-2 space-y-2">
                {blockingPlaces.slice(0, PLACE_CAP).map((row) => {
                  const blocking = row.rejections.filter((item) => item.blocking);
                  return (
                    <div key={row.record.id} className="rounded border border-dashed border-line bg-canvas p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-bold">
                          <Link
                            href={`/experience/${row.record.id}`}
                            className="hover:text-blue hover:underline"
                          >
                            {row.record.name}
                          </Link>
                        </p>
                        <span className={`${typeScale.micro} text-muted`}>{row.record.area}</span>
                      </div>
                      <ul className="mt-1 space-y-1">
                        {blocking.map((item, index) => (
                          <li key={`${item.code}-${index}`} className={`${typeScale.meta} leading-5 text-muted`}>
                            {item.sentence} <code className="text-[10px]">{item.code}</code>
                          </li>
                        ))}
                      </ul>
                      {blocking.length > 1 && (
                        <p className={`mt-1.5 ${typeScale.micro} text-muted`}>
                          {blocking.length} reasons on this one, so widening a single constraint may still leave it
                          out.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {blockingPlaces.length > PLACE_CAP && (
                <p className={`mt-2 ${typeScale.meta} text-muted`}>
                  and {blockingPlaces.length - PLACE_CAP} more. Widen the cheapest constraint above and the gate
                  runs again, and any single place carries its own list of reasons on its own page.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
