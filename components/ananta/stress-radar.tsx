import type { DiscoveryContext, Stop, TriggerId } from "@/lib/engine";
import { hoursLabel, inrLabel, minutesOfDay, stopTotals } from "@/components/ananta/pipeline";
import { CONFIDENCE_TONE, depth, depthShadow } from "@/components/ananta/tokens";
import { StressTable } from "@/components/ananta/learning/stress-table";

/**
 * The Stress Radar: seven weighted dimensions on 0 to 100, with one concrete
 * rescue move for the single worst factor.
 *
 * Every dimension is measured off the plan and the context. Nothing here is a
 * decorative chart with invented spokes, and the rescue move names a constraint
 * with a number in it rather than saying "try something else".
 *
 * Four rules the earlier version broke, all of them visible to a reader:
 *
 *   1. A factor with no data behind it scored 0, which is a real number. It now
 *      carries `measured: false`, renders as the dashed unverified chip, and is
 *      labelled "not measured" in the table. A genuine zero and an absent
 *      measurement are different claims.
 *   2. The polygon dropped unmeasured axes, so a five-factor plan was drawn on
 *      a five-spoke grid and the shape looked comparable to a seven-factor one.
 *      The grid is now always seven spokes and an unmeasured axis is drawn as a
 *      dashed ray rather than silently reshaping the chart.
 *   3. There was no table. There is now, in the DOM, complete, in a real
 *      `<table>`. That is the accessibility target in section 4 of the
 *      contracts and it was the one item on this panel marked not done.
 *   4. The travel factor is computed from `Stop.travelKm`, which is a
 *      straight-line estimate at a manifest congestion multiplier. The number is
 *      labelled as that wherever it appears.
 *
 * On depth, per the spatial contract. This panel is a planar seven-axis chart and
 * stays flat: the CHI 2026 D-MO work says the depth dimension is "generally
 * discouraged" because perspective corrupts the size channel, and a radar whose
 * magnitude is read off a Z axis is exactly that failure. So the SVG gets no
 * `rotateX` and no `translateZ`. Depth is used as a frame, never as a value
 * channel: the panel is `depth-raised`, and the one thing the traveller is meant
 * to act on, the rescue move, is `depth-lifted`. That reads as "this is the one
 * thing to do" without a single score becoming ambiguous. Both are class names,
 * so nothing here computes a transform at runtime.
 */

/** km per leg at which travel efficiency reads as a zero. */
const TRAVEL_CEILING_KM = 14;

export type RadarFactor = {
  id: string;
  label: string;
  /** 0 to 100, 100 is best. Meaningless when `measured` is false. */
  score: number;
  /** False when the context has no fact to measure this factor against. */
  measured: boolean;
  /** The measured value behind the score, already in a finished clause. */
  measure: string;
  /** What to actually change. Only the worst factor's version is shown. */
  rescue: string;
  /** The session 9 trigger that performs the rescue, where one exists. */
  trigger: TriggerId | null;
  /** Set by the component on the factor it picked as worst. */
  worst?: boolean;
};

export function planFactors(stops: Stop[], ctx: DiscoveryContext): RadarFactor[] {
  const totals = stopTotals(stops);
  const window = Math.max(1, ctx.availableMinutes);

  const usedRatio = totals.total / window;
  const timeFit = Math.max(
    0,
    Math.min(100, usedRatio <= 1 ? 100 - usedRatio * 42 : 100 - Math.min(100, (usedRatio - 1) * 220)),
  );
  const budgetRatio = ctx.budgetInr > 0 ? totals.cost / ctx.budgetInr : 0;
  const budgetHeadroom = Math.max(0, Math.min(100, 100 - budgetRatio * 90));

  const meanKm = stops.length ? stops.reduce((sum, stop) => sum + stop.travelKm, 0) / stops.length : 0;
  const travelEfficiency = Math.max(0, Math.min(100, 100 - (meanKm / TRAVEL_CEILING_KM) * 100));

  // Crowd exposure needs a reason to call a stop crowded. Without weather there
  // is none, so the factor is unmeasured rather than scored at a default.
  const crowdMeasured = stops.length > 0 && ctx.weatherSeverity !== null;
  const crowd = crowdMeasured
    ? stops.reduce((sum, stop) => {
        const peak = stop.record.bestTimeOfDay === "any" ? 0.7 : 1;
        return sum + (stop.record.indoor === "outdoor" ? 1 : 0) * peak;
      }, 0) / stops.length
    : 0;
  const crowdExposure = Math.max(0, Math.min(100, 100 - crowd * 100));

  const distinct = new Set(stops.map((stop) => stop.record.category)).size;
  const variety = stops.length ? Math.max(0, Math.min(100, (distinct / stops.length) * 100)) : 0;

  const paceGap = Math.abs(stops.length - ctx.idealStops) / Math.max(1, ctx.idealStops);
  const paceMatch = Math.max(0, Math.min(100, 100 - paceGap * 100));

  const lateBy =
    ctx.deadline === null ? 0 : Math.max(0, minutesOfDay(ctx.now) + totals.total - minutesOfDay(ctx.deadline));
  const timeMeasure =
    ctx.deadline === null
      ? `${totals.total} of ${window} minutes used, ${hoursLabel(Math.max(0, window - totals.total))} free. No return time was set, so the plan is measured against the window you gave and nothing else.`
      : lateBy > 0
        ? `${totals.total} of ${window} minutes used, and ${lateBy} minutes past your return time.`
        : `${totals.total} of ${window} minutes used, back before your return time.`;
  const timeRescue =
    lateBy > 0
      ? `Drop the last stop to come back ${lateBy} minutes earlier, or move the return time.`
      : `Cut ${Math.max(1, Math.ceil((totals.total - window) / 15))} stop so the plan fits ${window} minutes, or raise the window you set.`;

  // Access is measured as a real fact only when we have access data to check.
  // No catalogue record carries an accessibility field today, so the honest
  // reading when a need is listed is "at risk and unmeasured", never a zero.
  const accessMeasured = ctx.accessNeeds.length === 0;
  const accessScore = accessMeasured ? 100 : 0;

  const factors: Omit<RadarFactor, "score" | "worst">[] = [
    {
      id: "time",
      label: "Time fit",
      measured: true,
      measure: timeMeasure,
      rescue: timeRescue,
      trigger: "time_lost",
    },
    {
      id: "pace",
      label: "Pace match",
      measured: stops.length > 0,
      measure:
        stops.length === 0
          ? "There are no stops, so the pace cannot be measured."
          : `${stops.length} stop${stops.length === 1 ? "" : "s"} against the ${ctx.idealStops} you asked for.`,
      rescue: `Fire the tired trigger to soften the pace, which drops the target to ${Math.max(ctx.minStops, ctx.idealStops - 1)} stop${Math.max(ctx.minStops, ctx.idealStops - 1) === 1 ? "" : "s"} and switches you to a relaxed pace.`,
      trigger: "tired",
    },
    {
      id: "budget",
      label: "Budget headroom",
      measured: ctx.budgetInr > 0,
      measure:
        ctx.budgetInr > 0
          ? `${inrLabel(totals.cost)} of ${inrLabel(ctx.budgetInr)}, ${inrLabel(Math.max(0, ctx.budgetInr - totals.cost))} spare.`
          : "No budget was set, so headroom is not measured. Every price behind this total is a per-category estimate, not a venue quote.",
      rescue: `Drop the stop that costs most until the plan is inside ${inrLabel(ctx.budgetInr)}.`,
      trigger: "budget_dropped",
    },
    {
      id: "travel",
      label: "Travel load",
      measured: stops.length > 0,
      measure:
        stops.length === 0
          ? "There are no legs, so travel load is not measured."
          : `${meanKm.toFixed(1)} km per leg on average, over ${stops.length} leg${stops.length === 1 ? "" : "s"}, measured as a straight line at the city congestion multiplier rather than along real streets.`,
      rescue: `Reorder the stops so neighbouring ones sit closer, or keep everything inside a ${TRAVEL_CEILING_KM} km radius.`,
      trigger: null,
    },
    {
      id: "crowd",
      label: "Crowd exposure",
      measured: crowdMeasured,
      measure: crowdMeasured
        ? `${Math.round(crowd * 100)} percent of the plan is outdoor while it is ${ctx.weatherSeverity!.replace(/_/g, " ")}. Peak-hour crowding comes from each record's own best-time field, which is unverified on most of the catalogue.`
        : stops.length === 0
          ? "There are no stops, so crowd exposure is not measured."
          : "Weather is unknown, so there is no reason to call anything crowded or quiet. This factor is not scored rather than scored at a default.",
      rescue:
        ctx.weatherSeverity === null
          ? "Tell us the weather and this factor gets scored. Until then it is left out rather than guessed."
          : "Swap one outdoor stop for an indoor one, or start later when the record's best hour is quieter.",
      trigger: ctx.weatherSeverity === null ? null : "rain_started",
    },
    {
      id: "variety",
      label: "Variety",
      measured: stops.length > 0,
      measure:
        stops.length === 0
          ? "There are no stops, so variety is not measured."
          : `${distinct} categor${distinct === 1 ? "y" : "ies"} across ${stops.length} stop${stops.length === 1 ? "" : "s"}.`,
      rescue: "Add one stop from a category the plan does not have yet.",
      trigger: null,
    },
    {
      id: "access",
      label: "Access facts",
      measured: accessMeasured,
      measure:
        ctx.accessNeeds.length === 0
          ? "No access need was listed, so nothing is at risk here."
          : `${ctx.accessNeeds.length} access need${ctx.accessNeeds.length === 1 ? "" : "s"} listed, and no record in the catalogue carries the matching fact, so this is unmeasured rather than failing.`,
      rescue: "Ask the venue directly, or report the fact so the next traveller does not have to guess.",
      trigger: "needs_restroom",
    },
  ];

  const scores: Record<string, number> = {
    time: timeFit,
    budget: budgetHeadroom,
    travel: travelEfficiency,
    crowd: crowdExposure,
    variety,
    pace: paceMatch,
    access: accessScore,
  };

  return factors.map((factor) => ({
    ...factor,
    score: factor.measured ? Math.max(0, Math.min(100, Math.round(scores[factor.id] ?? 0))) : 0,
  }));
}

/**
 * The worst factor is the worst *measured* one, with the first unmeasured factor
 * as the tiebreak so the panel always names something to act on. Ranking an
 * unmeasured factor as "worst" would read as a failure of the place rather than
 * a gap in our data.
 */
export function worstFactor(factors: RadarFactor[]): RadarFactor | null {
  if (factors.length === 0) return null;
  const measured = factors.filter((factor) => factor.measured);
  if (measured.length === 0) return factors[0];
  return measured.reduce((low, factor) => (factor.score < low.score ? factor : low), measured[0]);
}

const SIZE = 260;
const CENTRE = SIZE / 2;
const RADIUS = CENTRE - 34;

function pointAt(index: number, total: number, value: number): [number, number] {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const radius = (Math.max(0, Math.min(100, value)) / 100) * RADIUS;
  return [CENTRE + Math.cos(angle) * radius, CENTRE + Math.sin(angle) * radius];
}

export function StressRadar({
  stops,
  ctx,
  onTrigger,
  triggerLabel,
}: {
  stops: Stop[];
  ctx: DiscoveryContext;
  /**
   * Fires a session 9 trigger for the rescue move. Optional because the panel is
   * also rendered read-only on screens that do not own a replan. When it is
   * absent the rescue is a sentence, which is still an honest answer.
   */
  onTrigger?: (id: TriggerId) => void;
  /** Label for the trigger button, so the two do not drift. */
  triggerLabel?: (id: TriggerId) => string;
}) {
  const factors = planFactors(stops, ctx);
  const worst = worstFactor(factors);
  // Worst first in the reading order, because the rescue move is the point of
  // the panel and a reader should not have to scan seven rows to find it.
  const ordered = worst
    ? [worst, ...factors.filter((factor) => factor.id !== worst.id)].map((factor) =>
        factor.id === worst.id ? { ...factor, worst: true } : factor,
      )
    : factors;
  // The grid is always seven spokes. An unmeasured axis keeps its spoke so the
  // shape stays comparable between two plans.
  const spokeCount = factors.length;
  const scored = factors.filter((factor) => factor.measured);
  const polygon = scored
    .map((factor) => {
      const index = factors.findIndex((item) => item.id === factor.id);
      return pointAt(index, spokeCount, factor.score)
        .map((value) => value.toFixed(1))
        .join(",");
    })
    .join(" ");

  return (
    <section
      className={`border border-line p-5 ${depth.raised} ${depthShadow.raised}`}
      aria-labelledby="radar-heading"
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Stress radar</p>
      <h2 id="radar-heading" className="mt-2 text-xl font-bold tracking-[-0.03em]">
        Seven things that could make this plan fall over
      </h2>

      <div className="mt-5 grid gap-6 sm:grid-cols-[260px_1fr] sm:items-start">
        <div>
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="mx-auto h-auto w-full max-w-[260px]"
            role="img"
            aria-label={`Radar of ${scored.length} measured factors out of ${spokeCount}. Worst measured factor: ${worst?.label ?? "none"} at ${worst?.score ?? 0} out of 100. The same numbers are in the table below this chart.`}
          >
            {[0.25, 0.5, 0.75, 1].map((ring) => (
              <polygon
                key={ring}
                points={factors
                  .map((_, index) => pointAt(index, spokeCount, ring * 100).map((v) => v.toFixed(1)).join(","))
                  .join(" ")}
                fill="none"
                stroke="#DDE3EA"
              />
            ))}
            {factors.map((factor, index) => {
              const [x, y] = pointAt(index, spokeCount, 100);
              // Colour is not the encoding, so the unmeasured spoke is dashed as
              // well as being absent from the polygon.
              return (
                <line
                  key={factor.id}
                  x1={CENTRE}
                  y1={CENTRE}
                  x2={x}
                  y2={y}
                  stroke="#DDE3EA"
                  strokeDasharray={factor.measured ? undefined : "3 3"}
                />
              );
            })}
            {scored.length >= 3 ? (
              <polygon points={polygon} fill="rgba(23,92,211,0.18)" stroke="#175CD3" strokeWidth={2} />
            ) : null}
            {scored.map((factor) => {
              const index = factors.findIndex((item) => item.id === factor.id);
              const [x, y] = pointAt(index, spokeCount, factor.score);
              return <circle key={factor.id} cx={x} cy={y} r={3.5} fill="#175CD3" />;
            })}
          </svg>
          <p className="mt-2 text-xs leading-5 text-muted">
            {scored.length} of {spokeCount} spokes are measured. A dashed spoke has no data behind it and is
            left out of the shape rather than drawn at zero. This chart is flat on purpose: depth on an axis
            would make a low score look like a distant one.
          </p>
        </div>

        <ol className="space-y-2">
          {ordered.map((factor) => (
            <li key={factor.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold">
                  {factor.label}
                  {factor.worst ? <span className="ml-1 text-xs text-amber">worst</span> : null}
                </span>
                {factor.measured ? (
                  <span className={`text-sm font-bold ${factor.score >= 70 ? "text-green" : "text-amber"}`}>
                    {factor.score}
                  </span>
                ) : (
                  <span
                    className={`rounded-sm px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${CONFIDENCE_TONE.unverified}`}
                  >
                    not measured
                  </span>
                )}
              </div>
              {/* The bar is a value channel, so it is a length on a track and never
                  depth: putting a score on the Z axis would make a low score look
                  like a distant one, which is the ambiguity the D-MO paper warns
                  about. It is a static inline width rather than a Tailwind utility
                  because Tailwind extracts class names at build time and cannot see
                  a width computed from the score. No transform is computed anywhere
                  in this file; the depth is two class names. */}
              <div aria-hidden="true" className="mt-1 h-1.5 w-full rounded-sm bg-canvas">
                <div
                  className={`h-full rounded-sm ${
                    !factor.measured ? "bg-line" : factor.score >= 70 ? "bg-green" : "bg-amber"
                  }`}
                  style={{ width: `${factor.measured ? Math.min(100, factor.score) : 0}%` }}
                />
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">{factor.measure}</p>
            </li>
          ))}
        </ol>
      </div>

      {worst ? (
        <div className={`mt-5 border border-amber bg-amberSoft/50 p-4 ${depth.lifted} ${depthShadow.lifted}`}>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-amber">
            Worst factor: {worst.label} at {worst.measured ? `${worst.score} of 100` : "not measured"}
          </p>
          <p className="mt-2 text-sm font-semibold leading-6">{worst.rescue}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{worst.measure}</p>
          {worst.trigger && onTrigger ? (
            <button
              type="button"
              onClick={() => onTrigger(worst.trigger as TriggerId)}
              className="mt-4 inline-flex min-h-[44px] items-center border border-amber bg-white px-4 py-2 text-sm font-bold text-amber"
            >
              {triggerLabel ? triggerLabel(worst.trigger) : "Apply this change"}
            </button>
          ) : null}
          {worst.trigger && !onTrigger ? (
            <p className="mt-3 border border-dashed border-amber px-3 py-2 text-xs leading-5">
              This change has a one-click control. It lives on the screen that owns the plan, because firing
              it re-solves the whole day rather than just this panel.
            </p>
          ) : null}
        </div>
      ) : null}

      <StressTable factors={ordered} />
    </section>
  );
}
