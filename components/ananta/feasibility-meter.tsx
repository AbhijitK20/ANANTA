import type { Stop } from "@/lib/engine";
import { PLAN_BUFFER_MINUTES, hoursLabel, inrLabel, minutesOfDay, stopTotals } from "@/components/ananta/pipeline";

/**
 * The feasibility meter. `activity ▸ travel ▸ buffer` as one proportional bar
 * measured against `ctx.availableMinutes`, with the overflow drawn past the end
 * of the track in the alarm colour.
 *
 * Buffer gets its own segment and its own number, because `plan.ts` computed
 * `bufferMinutes` for every stop and the old page merged it into a single
 * "Travel and buffer" tile. Knowing that 40 of your 200 minutes are slack is
 * the difference between a plan and a guess.
 */

const SEGMENTS = [
  { key: "activity", label: "Activity", colour: "bg-blue", text: "text-blue" },
  { key: "travel", label: "Travel", colour: "bg-green", text: "text-green" },
  { key: "buffer", label: "Buffer", colour: "bg-amber", text: "text-amber" },
] as const;

export function FeasibilityMeter({
  stops,
  availableMinutes,
  deadline,
  now,
  cost,
  budget,
}: {
  stops: Stop[];
  availableMinutes: number;
  deadline: string | null;
  now: string;
  cost: number;
  budget: number;
}) {
  const totals = stopTotals(stops);
  const track = Math.max(1, availableMinutes);
  const over = Math.max(0, totals.total - availableMinutes);
  const withinTrack = Math.min(totals.total, availableMinutes);
  const remaining = Math.max(0, availableMinutes - totals.total);
  const fill = (value: number) => `${(value / track) * 100}%`;

  const startMin = minutesOfDay(now);
  const deadlineMin = deadline === null ? null : minutesOfDay(deadline);
  const finish = totals.total;
  const lateBy = deadlineMin === null ? 0 : Math.max(0, startMin + finish - deadlineMin);
  const overBudget = Math.max(0, cost - budget);

  return (
    <section className="border border-line p-5" aria-labelledby="meter-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Feasibility</p>
          <h2 id="meter-heading" className="mt-2 text-xl font-bold tracking-[-0.03em]">
            {over > 0
              ? `Over your window by ${hoursLabel(over)}`
              : `${hoursLabel(remaining)} of your ${hoursLabel(availableMinutes)} still free`}
          </h2>
        </div>
        <p className="text-sm font-semibold text-muted">
          {stops.length} stop{stops.length === 1 ? "" : "s"} · {inrLabel(cost)} of {inrLabel(budget)}
        </p>
      </div>

      <div
        className="mt-4 flex h-8 w-full overflow-hidden rounded-md border border-line bg-canvas"
        role="img"
        aria-label={`Time bar. Activity ${totals.activity} minutes, travel ${totals.travel} minutes, buffer ${totals.buffer} minutes, against a window of ${availableMinutes} minutes.${over > 0 ? ` Over by ${over} minutes.` : ` ${remaining} minutes free.`}`}
      >
        {SEGMENTS.map((segment) => {
          const value = totals[segment.key];
          if (value <= 0) return null;
          return (
            <div
              key={segment.key}
              className={`${segment.colour} h-full`}
              style={{ width: fill(Math.min(value, withinTrack)) }}
            />
          );
        })}
        {over > 0 && (
          <div
            className="h-full border-l-2 border-ink bg-amberSoft"
            style={{ width: `${(over / track) * 100}%` }}
          />
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

      <p className="mt-4 text-xs leading-5 text-muted">
        Travel and buffer are straight-line estimates at the city congestion multiplier in the manifest,
        not live routing. Buffer is {PLAN_BUFFER_MINUTES} minutes per stop for walking, parking, and queueing.
        The window you see here is the one you set; nothing here is a live availability claim.
      </p>
    </section>
  );
}
