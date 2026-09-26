import { ArrowsClockwise } from "@phosphor-icons/react/dist/ssr";
import type { EventChange } from "@/lib/events";

/**
 * Change detection, collapsed.
 *
 * `eventChanges()` compares each event record against the previous snapshot and
 * returns the fields that moved. Both the landing strip and the events feed
 * render that same delta, so the badge is written once here rather than twice
 * with two different looks.
 *
 * It lives in `components/events/` because `/events` is the route where change
 * detection is the feature rather than a footnote, and the landing imports it
 * from there. The alternative was a shared location neither route owns.
 *
 * The collapsed label carries the count in words, not only in colour, so a
 * reader who cannot see the amber still learns that the record moved. Amber is
 * the one degraded tone in the palette and this is genuinely degraded: the
 * record no longer matches the last snapshot anyone checked.
 */
export function ChangeBadge({ changes }: { changes: EventChange[] }) {
  if (changes.length === 0) return null;

  return (
    <details className="relative">
      <summary className="inline-flex min-h-[24px] cursor-pointer list-none items-center gap-1.5 rounded-chip border border-amber bg-amberSoft px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-amber">
        <ArrowsClockwise size={13} aria-hidden="true" />
        {changes.length === 1 ? "1 field changed" : `${changes.length} fields changed`}
      </summary>
      <div className="mt-2 border border-amber bg-surface p-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-amber">
          This record changed since the last snapshot
        </p>
        <ul className="mt-2 space-y-1 text-[13px] leading-5 text-muted">
          {changes.map((change) => (
            <li key={change.field}>
              <span className="font-bold text-ink">{change.field}:</span> was {change.from}, now{" "}
              {change.to}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-5 text-muted">
          The world moved and the record moved with it. Re-check the source before planning around this.
        </p>
      </div>
    </details>
  );
}
