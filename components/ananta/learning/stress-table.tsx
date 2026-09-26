import { CONFIDENCE_TONE } from "@/components/ananta/tokens";
import type { RadarFactor } from "@/components/ananta/stress-radar";

/**
 * The chart alternative the accessibility targets require.
 *
 * A seven-axis radar is unreadable to a screen reader, useless in print, and
 * impossible to compare between two plans. An `aria-label` does not fix that,
 * because a label carrying seven numbers in a sentence is still a sentence a
 * screen reader has to hold in one breath. So the numbers live in a real
 * `<table>` with a real header row and real cells, visually collapsed behind a
 * disclosure but present, focusable, and reachable in the reading order.
 *
 * `ponytail:` ceiling. The disclosure starts closed, which is right for a
 * sighted reader and slightly worse for a screen reader who now has to open it.
 * The alternative is showing it open by default, which pushes the panel's other
 * content below the fold. Open it with the control and the table is the
 * authoritative version either way; the SVG is decorative and says so.
 */

export function StressTable({ factors }: { factors: RadarFactor[] }) {
  return (
    <details className="mt-4 border border-line bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold">
        The same {factors.length} factors as a table
      </summary>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <caption className="sr-only">
            Every stress factor, its score out of 100, and what was measured to produce it. A score of zero
            is different from a factor with no data behind it.
          </caption>
          <thead>
            <tr className="border-b border-line bg-canvas">
              <th scope="col" className="px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-muted">
                Factor
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-muted">
                Score
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-muted">
                What was measured
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-muted">
                What to change
              </th>
            </tr>
          </thead>
          <tbody>
            {factors.map((factor) => (
              <tr key={factor.id} className="border-b border-line align-top last:border-b-0">
                <th scope="row" className="px-3 py-2 text-sm font-bold">
                  {factor.label}
                  {factor.worst ? (
                    <span className="ml-1 rounded-sm bg-amberSoft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-amber">
                      worst
                    </span>
                  ) : null}
                </th>
                <td className="px-3 py-2 text-sm">
                  {factor.measured ? (
                    <span className="font-bold">{factor.score} of 100</span>
                  ) : (
                    <span
                      className={`inline-block rounded-sm px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${CONFIDENCE_TONE.unverified}`}
                    >
                      not measured
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-sm leading-6 text-muted">{factor.measure}</td>
                <td className="px-3 py-2 text-sm leading-6 text-muted">{factor.rescue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
