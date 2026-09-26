import type { ComponentId, Confidence, ScoreComponent } from "@/lib/engine";
import { COMPONENT_LABEL, motion } from "@/components/ananta/tokens";
import { UNVERIFIED_ROW_NOTE, confidenceFor, rowDepth, rowRecessed } from "@/components/ananta/why/depth";
import { contributionText, decimal3, signed3 } from "@/components/ananta/why/format";

/**
 * "Why this", ranked by magnitude.
 *
 * The ranking, the deterministic tie break on `id` and the honest overflow count
 * are ratified and unchanged. The arithmetic no longer leaks into the interface,
 * the magnitude is in the text rather than only in a decorative bar, and depth
 * carries epistemic status and nothing else.
 *
 * **Depth here means "how well do we know this", never "how big is this".** The
 * reasoning is in `./why/depth.ts` and it is load bearing: perspective projection
 * makes a mark ambiguous between a small value and a far one, so a contribution
 * rendered as `translateZ` would destroy the exact quantity this panel exists to
 * report. Magnitude is bar length plus a printed number.
 */

export function WhyThis({
  components,
  total,
  limit,
  title = "Why this",
  note,
  confidenceByComponent,
}: {
  components: ScoreComponent[];
  total?: number;
  limit?: number;
  title?: string;
  note?: string;
  /**
   * Per row epistemic status, for the caller that holds the record and knows
   * which field fed which component. Absent, every row reads as `estimate` and
   * sits flush, which is what a computed score honestly is. It never defaults to
   * `verified`, because nothing here has earned that.
   */
  confidenceByComponent?: Partial<Record<ComponentId, Confidence>>;
}) {
  const ranked = [...components].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution) || a.id.localeCompare(b.id),
  );
  const shown = limit ? ranked.slice(0, limit) : ranked;
  const peak = Math.max(...ranked.map((item) => Math.abs(item.contribution)), 0.0001);

  if (!ranked.length) {
    return (
      <section className="border border-line p-5" aria-label={title}>
        <h3 className="font-bold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          Nothing scored here, so there is no ranking to show. The record did not pass the gate.
        </p>
      </section>
    );
  }

  return (
    // Flush, because the panel is our arithmetic laid over the top of the facts.
    // A `.stage` ancestor supplies the perspective; without one these transforms
    // are inert and the panel reads from its shadow and border alone, which is
    // the intended progressive enhancement rather than a broken state.
    <section className="depth-flush border border-line p-5" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">{title}</h3>
        {total !== undefined && (
          <p className="text-sm font-semibold text-muted">
            Objective <span className={total < 0 ? "text-amber" : undefined}>{signed3(total)}</span>
          </p>
        )}
      </div>
      <ol className="mt-4 space-y-3">
        {shown.map((item) => {
          const magnitude = Math.abs(item.contribution);
          const positive = item.contribution > 0;
          const confidence = confidenceFor(item, confidenceByComponent);
          const recessed = rowRecessed(item, confidence);
          return (
            <li
              key={item.id}
              className={`${rowDepth(item, confidence)} ${motion.state} ${
                recessed ? "border border-dashed border-muted p-2" : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold">{COMPONENT_LABEL[item.id] ?? item.id}</span>
                <span className={`text-sm font-bold ${positive ? "text-green" : item.contribution < 0 ? "text-amber" : "text-muted"}`}>
                  {signed3(item.contribution)}
                </span>
              </div>
              {/*
                Bar length is the quantity channel and the printed number below
                is the same figure in text. The bar is decorative and hidden from
                assistive tech, which is only honest because the number it draws
                is also written out where the same reader meets it.
              */}
              <div aria-hidden="true" className="mt-1.5 h-1.5 w-full rounded-sm bg-canvas">
                <div
                  className={`h-full rounded-sm ${item.contribution < 0 ? "bg-amber" : "bg-blue"}`}
                  style={{ width: `${(magnitude / peak) * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs leading-5 text-muted">
                {item.sentence} {contributionText(item.contribution)}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-muted">
                Weight {decimal3(item.weight)} × normalised {decimal3(item.normalised)}
              </p>
              {recessed && <p className="mt-0.5 text-[11px] leading-4 text-muted">{UNVERIFIED_ROW_NOTE}</p>}
            </li>
          );
        })}
      </ol>
      {limit && ranked.length > limit && (
        <p className="mt-3 text-xs font-semibold text-muted">
          {ranked.length - limit} more component{ranked.length - limit === 1 ? "" : "s"} scored below these.
        </p>
      )}
      {note && <p className="mt-3 text-xs leading-5 text-muted">{note}</p>}
    </section>
  );
}
