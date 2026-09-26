import type { Stop } from "@/lib/engine";
import { PLAN_BUFFER_MINUTES, hoursLabel, inrLabel, minutesOfDay, stopTotals } from "@/components/ananta/pipeline";
import { typeScale } from "@/components/ananta/tokens";
import { soldOutStops } from "@/components/ananta/replan/states";

/**
 * The feasibility meter. `activity ▸ travel ▸ buffer` as one proportional bar
 * measured against `ctx.availableMinutes`, with the overflow drawn past the end
 * of the track in the alarm colour.
 *
 * Buffer gets its own segment and its own number, because `plan.ts` computed
 * `bufferMinutes` for every stop and the old page merged it into a single
 * "Travel and buffer" tile. Knowing that 40 of your 200 minutes are slack is
 * the difference between a plan and a guess.
 *
 * This revision adds four things and changes nothing else:
 *
 *  - The headline is the screen's one `text-display`. It was `text-xl`, so the
 *    page h2 was quietly the largest thing here.
 *  - The bar's `aria-label` no longer lists zero segments. "Activity 0 minutes,
 *    travel 0 minutes" is a true sentence nobody can read. It now names only the
 *    segments that exist and always names the window, and an all-zero plan says
 *    so outright instead of reading as an empty bar.
 *  - Each segment carries its own label as visually hidden text, so the bar is
 *    self-describing rather than four unlabelled blocks below 480px, and the
 *    track has a floor width so it cannot collapse on a narrow phone.
 *  - A sold-out stop is surfaced here rather than silently included. A slot the
 *    provider has marked gone is still in the totals, because pretending otherwise
 *    would understate the plan, but the meter says so and hands off to the replan
 *    section, which is session 9's.
 */

const SEGMENTS = [
  { key: "activity", label: "Activity", colour: "bg-blue", text: "text-blue" },
  { key: "travel", label: "Travel", colour: "bg-green", text: "text-green" },
  { key: "buffer", label: "Buffer", colour: "bg-amber", text: "text-amber" },
] as const;

/** Segments that exist, in bar order. A zero segment is not drawn and not named. */
function present(totals: ReturnType<typeof stopTotals>) {
  return SEGMENTS.map((segment) => ({ ...segment, value: totals[segment.key] })).filter(
    (segment) => segment.value > 0,
  );
}

/** One sentence, no zeros, always the window. */
function barSentence(
  segments: readonly { label: string; value: number }[],
  availableMinutes: number,
  over: number,
  remaining: number,
) {
  const parts = segments.map((segment) => `${segment.label} ${segment.value} minutes`);
  const window = `against a window of ${availableMinutes} minutes`;
  if (!parts.length) return `Time bar, nothing allocated yet, ${window}.`;
  const over_ = over > 0 ? ` Over by ${over} minutes.` : ` ${remaining} minutes free.`;
  return `Time bar. ${parts.join(", ")}, ${window}.${over_}`;
}

export function FeasibilityMeter({
  stops,
  availableMinutes,
  deadline,
  now,
  cost,
  budget,
  soldOutHref = "#replan",
}: {
  stops: Stop[];
  availableMinutes: number;
  deadline: string | null;
  now: string;
  cost: number;
  budget: number;
  /** Where the sold-out hand-off lives on this page. */
  soldOutHref?: string;
}) {
  const totals = stopTotals(stops);
  const track = Math.max(1, availableMinutes);
  const over = Math.max(0, totals.total - availableMinutes);
  const withinTrack = Math.min(totals.total, availableMinutes);
  const remaining = Math.max(0, availableMinutes - totals.total);
  const fill = (value: number) => `${(value / track) * 100}%`;
  const drawn = present(totals);

  const startMin = minutesOfDay(now);
  const deadlineMin = deadline === null ? null : minutesOfDay(deadline);
  const finish = totals.total;
  const lateBy = deadlineMin === null ? 0 : Math.max(0, startMin + finish - deadlineMin);
  const overBudget = Math.max(0, cost - budget);
  const soldOut = soldOutStops(stops);

  return (
    <section className="border border-line p-5" aria-labelledby="meter-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={`${typeScale.micro} font-bold uppercase tracking-[0.14em] text-blue`}>
            Feasibility
          </p>
          <h2 id="meter-heading" className={`mt-2 ${typeScale.display}`}>
            {over > 0
              ? `Over your window by ${hoursLabel(over)}`
              : `${hoursLabel(remaining)} of your ${hoursLabel(availableMinutes)} still free`}
          </h2>
        </div>
        <p className="text-sm font-semibold text-muted">
          {stops.length} stop{stops.length === 1 ? "" : "s"} · {inrLabel(cost)} of {inrLabel(budget)}
        </p>
      </div>

      <div className="mt-4 min-w-[220px]">
        <div
          className="flex h-8 w-full overflow-hidden rounded border border-line bg-canvas"
          role="img"
          aria-label={barSentence(drawn, availableMinutes, over, remaining)}
        >
          {drawn.map((segment) => (
            <div
              key={segment.key}
              className={`${segment.colour} h-full`}
              style={{ width: fill(Math.min(segment.value, withinTrack)) }}
            >
              <span className="sr-only">{`${segment.label}: ${segment.value} minutes`}</span>
            </div>
          ))}
          {over > 0 && (
            <div
              className="h-full border-l-2 border-ink bg-amberSoft"
              style={{ width: `${(over / track) * 100}%` }}
            >
              <span className="sr-only">{`Overflow: ${over} minutes past the window`}</span>
            </div>
          )}
        </div>
        {drawn.length === 0 && (
          <p className="mt-2 text-xs text-muted">No time allocated yet, so the bar is empty by design.</p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SEGMENTS.map((segment) => (
          <div key={segment.key}>
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-sm ${segment.colour}`} />
              {segment.label}
            </dt>
            <dd className="mt-1 text-lg font-bold">
              {totals[segment.key]} min
              {segment.key === "buffer" && (
                <span className="ml-1 text-xs font-semibold text-muted">{PLAN_BUFFER_MINUTES} per stop</span>
              )}
            </dd>
          </div>
        ))}
        <div>
          <dt className="text-xs font-semibold text-muted">Total</dt>
          <dd className={`mt-1 text-lg font-bold ${over > 0 ? "text-amber" : ""}`}>
            {totals.total} min
            {deadlineMin !== null && (
              <span className="ml-1 text-xs font-semibold text-muted">
                {lateBy > 0 ? `${lateBy} min past your return time` : `back by your return time`}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {overBudget > 0 && (
        <p className="mt-4 border border-amber bg-amberSoft/40 px-3 py-2 text-sm font-semibold">
          {inrLabel(overBudget)} over the {inrLabel(budget)} budget you set.
        </p>
      )}

      {soldOut.length > 0 && (
        <p className="mt-4 border border-amber bg-amberSoft/40 px-3 py-2 text-sm leading-6">
          <span className="font-bold">
            {soldOut.length === 1 ? "One stop in" : `${soldOut.length} stops in`} this plan{" "}
            {soldOut.length === 1 ? "is" : "are"} sold out.
          </span>{" "}
          The minutes above still include {soldOut.length === 1 ? "it" : "them"}, because dropping{" "}
          {soldOut.length === 1 ? "it" : "them"} without asking you would be a different plan.{" "}
          <a href={soldOutHref} className="font-bold text-blue underline">
            Go to the replan section
          </a>{" "}
          to choose a replacement.
        </p>
      )}

      <p className="mt-4 text-xs leading-5 text-muted">
        Travel and buffer are straight-line estimates at the city congestion multiplier in the manifest,
        not live routing. Buffer is {PLAN_BUFFER_MINUTES} minutes per stop for walking, parking, and queueing.
        The window you see here is the one you set; nothing here is a live availability claim.
      </p>
    </section>
  );
}
