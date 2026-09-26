"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { typeScale, depth } from "@/components/ananta/tokens";
import type { ExperienceV2, Rejection } from "@/lib/engine";
import type { RelaxationOption } from "@/components/ananta/pipeline";

/**
 * Why a record did not make it, capped, and recessed.
 *
 * The old panel mapped every exclusion with no ceiling, so a loose filter set
 * rendered about a thousand divs. It is capped here, it says how many it is
 * hiding, and the overflow is reachable rather than deleted.
 *
 * Every item is `depth-recessed`, which is encoding 2: a refused record is
 * pushed back whatever its provenance, because "we will not send you here"
 * outranks "we know what time it opens". Recessed also desaturates and takes a
 * dashed edge, so a reader who cannot perceive depth still reads the same
 * information. When the panel opens the list **rises out of** the recessed
 * state to `depth-flush`, which is the whole point: the reasons come forward to
 * be read and settle back when the traveller is done.
 *
 * The cheapest relaxation leads, because "nothing fits" with no next step is a
 * dead end and a dead end is a bug.
 */
export function ExclusionPanel({
  rows,
  cheapest,
  cap = 12,
}: {
  rows: { record: ExperienceV2; rejections: Rejection[] }[];
  cheapest: RelaxationOption | null;
  cap?: number;
}) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  const blockingTotal = rows.reduce(
    (sum, row) => sum + row.rejections.filter((item) => item.blocking).length,
    0,
  );
  const shown = open ? rows.slice(0, cap) : [];
  const hidden = Math.max(0, rows.length - cap);

  return (
    <section className="mt-5 border-t border-line pt-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left text-sm font-bold"
      >
        <span>
          Why {rows.length.toLocaleString("en-IN")} record{rows.length === 1 ? " was" : "s were"} refused,{" "}
          {blockingTotal.toLocaleString("en-IN")} blocking reason{blockingTotal === 1 ? "" : "s"}
        </span>
        <CaretDown size={17} aria-hidden className={`shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {cheapest && (
        <p className={`mt-3 max-w-[68ch] text-sm leading-6 text-muted`}>
          <span className="font-bold text-ink">Cheapest way to widen this: </span>
          {cheapest.label}, which on its own would bring back {cheapest.unlockedCount.toLocaleString("en-IN")} record
          {cheapest.unlockedCount === 1 ? "" : "s"}.
        </p>
      )}

      {open && (
        // The list rises out of the recessed state to flush while it is being
        // read, and the whole list is inside a 3D stage so the rise is a real
        // change in elevation rather than a colour swap.
        <div className="stage mt-3">
          <div className={`stage-3d space-y-3 ${depth.flush}`}>
            {shown.map((row) => {
              const blocking = row.rejections.filter((item) => item.blocking);
              if (blocking.length === 0) return null;
              return (
                <div
                  key={row.record.id}
                  className={`border border-dashed border-line bg-canvas p-3 ${depth.recessed}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-bold">
                      <Link href={`/experience/${row.record.id}`} className="hover:text-blue hover:underline">
                        {row.record.name}
                      </Link>
                    </p>
                    <span className={`${typeScale.micro} text-muted`}>{row.record.area}</span>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {blocking.map((item, index) => (
                      <li key={`${item.code}-${index}`} className={`${typeScale.meta} leading-5 text-muted`}>
                        {item.sentence} <code className="text-[10px] text-muted">{item.code}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {hidden > 0 && (
              <p className={`${typeScale.meta} leading-5 text-muted`}>
                and {hidden.toLocaleString("en-IN")} more. Widening the cheapest constraint above brings the gate
                back on the next render, and any single place carries its own list of reasons on its own page.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
