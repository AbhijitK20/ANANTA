import type { ScoreComponent } from "@/lib/engine";
import { COMPONENT_LABEL } from "@/components/ananta/pipeline";

/**
 * "Why this", ranked by magnitude.
 *
 * The old card printed `reasons.slice(0, 3)`, a fixed `if` ladder in
 * `lib/recommendation.ts`, and then threw the score away. This takes the
 * component list the objective actually produced, sorts it by descending
 * absolute contribution, and shows the signed number, the weight, and a
 * finished sentence per component. The top contributor is first, so the first
 * line a traveller reads is the one that mattered most.
 */

const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "" : ""}${value.toFixed(3)}`;

export function WhyThis({
  components,
  total,
  limit,
  title = "Why this",
  note,
}: {
  components: ScoreComponent[];
  total?: number;
  limit?: number;
  title?: string;
  note?: string;
}) {
  const ranked = [...components].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution) || a.id.localeCompare(b.id),
  );
  const shown = limit ? ranked.slice(0, limit) : ranked;
  const peak = Math.max(...ranked.map((item) => Math.abs(item.contribution)), 0.0001);

  if (!ranked.length) {
    return (
      <section className="border border-line p-5">
        <h3 className="font-bold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          Nothing scored here, so there is no ranking to show. The record did not pass the gate.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-line p-5" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">{title}</h3>
        {total !== undefined && (
          <p className="text-sm font-semibold text-muted">
            Objective {total > 0 ? "" : ""}
            {total.toFixed(3)}
          </p>
        )}
      </div>
      <ol className="mt-4 space-y-3">
        {shown.map((item) => {
          const magnitude = Math.abs(item.contribution);
          const positive = item.contribution > 0;
          return (
            <li key={item.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold">{COMPONENT_LABEL[item.id]}</span>
                <span className={`text-sm font-bold ${positive ? "text-green" : item.contribution < 0 ? "text-amber" : "text-muted"}`}>
                  {signed(item.contribution)}
                </span>
              </div>
              <div aria-hidden="true" className="mt-1.5 h-1.5 w-full rounded-sm bg-canvas">
                <div
                  className={`h-full rounded-sm ${item.contribution < 0 ? "bg-amber" : "bg-blue"}`}
                  style={{ width: `${(magnitude / peak) * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs leading-5 text-muted">{item.sentence}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-muted">
                Weight {item.weight} × normalised {item.normalised}
              </p>
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
