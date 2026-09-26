import type { Rejection, RejectionUnit } from "@/lib/engine";
import { REJECTION_UNIT_LABEL } from "@/lib/engine";
import type { RelaxationOption } from "@/components/ananta/pipeline";

/**
 * "Why not that", keyed to the record the traveller actually asked about.
 *
 * The old panel listed every exclusion in one flat collapsed list with no link
 * to what was typed. This takes the typed `Rejection[]` for one record, shows
 * the code alongside the sentence so the vocabulary is inspectable, states the
 * shortfall in the unit the code declares, and names the provenance of the fact
 * that caused the refusal. Then it answers the only question that matters
 * after a refusal: which single constraint, if relaxed, buys the most back.
 */

const CONFIDENCE_TONE: Record<string, string> = {
  verified: "bg-greenSoft text-green",
  community: "bg-blueSoft text-blue",
  estimate: "bg-amberSoft text-amber",
  unverified: "bg-canvas text-muted",
};

function shortfallText(item: Rejection): string | null {
  if (item.shortfall === null) return null;
  const unit: RejectionUnit = item.unit;
  const label = unit === "inr" ? "rupees" : REJECTION_UNIT_LABEL[unit];
  const rounded = Math.round(item.shortfall * 10) / 10;
  return `${rounded.toLocaleString("en-IN")} ${label} short`;
}

export function WhyNotThat({
  recordName,
  rejections,
  cheapest,
  retrievalNote,
  bulkCount = 0,
}: {
  recordName: string;
  rejections: Rejection[];
  cheapest?: RelaxationOption | null;
  retrievalNote?: string;
  bulkCount?: number;
}) {
  if (!rejections.length) {
    return (
      <section className="border border-line p-5" aria-label="Why not that">
        <h3 className="font-bold">Why not that</h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          {retrievalNote ?? `${recordName} was never a candidate, so nothing was checked against it.`}
        </p>
        {bulkCount > 0 && (
          <p className="mt-3 text-xs font-semibold text-muted">
            {bulkCount} other record{bulkCount === 1 ? "" : "s"} were dropped before scoring.
          </p>
        )}
      </section>
    );
  }

  const blocking = rejections.filter((item) => item.blocking);
  const advisory = rejections.filter((item) => !item.blocking);

  return (
    <section className="border border-line p-5" aria-label="Why not that">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">Why not {recordName}</h3>
        <p className="text-xs font-semibold text-muted">
          {blocking.length} blocking · {advisory.length} advisory
        </p>
      </div>

      {blocking.length > 0 && (
        <ul className="mt-4 space-y-3">
          {blocking.map((item, index) => (
            <li key={`${item.code}-${index}`} className="border-l-4 border-amber bg-amberSoft/50 p-3">
              <p className="text-sm font-semibold leading-6">{item.sentence}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted">
                <code className="rounded bg-white px-1.5 py-0.5 text-ink">{item.code}</code>
                {shortfallText(item) && <span>{shortfallText(item)}</span>}
                <span
                  className={`rounded px-1.5 py-0.5 ${CONFIDENCE_TONE[item.causedByConfidence] ?? CONFIDENCE_TONE.unverified}`}
                >
                  fact: {item.causedBy}, {item.causedByConfidence}
                </span>
              </p>
            </li>
          ))}
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

      {bulkCount > 0 && (
        <p className="mt-4 text-xs font-semibold text-muted">
          {bulkCount} other record{bulkCount === 1 ? "" : "s"} were dropped at retrieval or at the gate.
        </p>
      )}
    </section>
  );
}
