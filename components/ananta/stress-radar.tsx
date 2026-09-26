import type { DiscoveryContext, Stop } from "@/lib/engine";
import { hoursLabel, inrLabel, minutesOfDay, stopTotals } from "@/components/ananta/pipeline";

/**
 * The Stress Radar: seven weighted dimensions on 0 to 100, with one concrete
 * rescue move for the single worst factor.
 *
 * Every dimension is measured off the plan and the context. Nothing here is a
 * decorative chart with invented spokes, and the rescue move names a constraint
 * with a number in it rather than saying "try something else".
 */

/** km per leg at which travel efficiency reads as a zero. */
const TRAVEL_CEILING_KM = 14;

export type RadarFactor = {
  id: string;
  label: string;
  /** 0 to 100, 100 is best. */
  score: number;
  /** The measured value behind the score, already in a finished clause. */
  measure: string;
  /** What to actually change. Only the worst factor's version is shown. */
  rescue: string;
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

  const crowd =
    stops.length > 0 && ctx.weatherSeverity !== null
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
      ? `${totals.total} of ${window} minutes used, ${hoursLabel(Math.max(0, window - totals.total))} free. No return time was set.`
      : lateBy > 0
        ? `${totals.total} of ${window} minutes used, and ${lateBy} minutes past your return time.`
        : `${totals.total} of ${window} minutes used, back before your return time.`;
  const timeRescue =
    lateBy > 0
      ? `Drop the last stop to come back ${lateBy} minutes earlier, or move the return time.`
      : `Cut ${Math.max(1, Math.ceil((totals.total - window) / 15))} stop so the plan fits ${window} minutes, or raise the window you set.`;

  const factors: Omit<RadarFactor, "score">[] = [
    {
      id: "time",
      label: "Time fit",
      measure: timeMeasure,
      rescue: timeRescue,
    },
    {
      id: "budget",
      label: "Budget headroom",
      measure: `${inrLabel(totals.cost)} of ${inrLabel(ctx.budgetInr)}, ${inrLabel(Math.max(0, ctx.budgetInr - totals.cost))} spare.`,
      rescue: `Drop the stop that costs most until the plan is inside ${inrLabel(ctx.budgetInr)}.`,
    },
    {
      id: "travel",
      label: "Travel load",
      measure: `${meanKm.toFixed(1)} km per leg on average, over ${stops.length} leg${stops.length === 1 ? "" : "s"}.`,
      rescue: `Reorder the stops so neighbouring ones sit closer, or keep everything inside a ${TRAVEL_CEILING_KM} km radius.`,
    },
    {
      id: "crowd",
      label: "Crowd exposure",
      measure:
        ctx.weatherSeverity === null
          ? "Weather is unknown, so crowd exposure is not scored."
          : `${Math.round(crowd * 100)} percent of the plan is outdoor while it is ${ctx.weatherSeverity.replace(/_/g, " ")}.`,
      rescue: "Swap one outdoor stop for an indoor one, or start later when the record's best hour is quieter.",
    },
    {
      id: "variety",
      label: "Variety",
      measure: `${distinct} categor${distinct === 1 ? "y" : "ies"} across ${stops.length} stop${stops.length === 1 ? "" : "s"}.`,
      rescue: "Add one stop from a category the plan does not have yet.",
    },
    {
      id: "pace",
      label: "Pace match",
      measure: `${stops.length} stop${stops.length === 1 ? "" : "s"} against the ${ctx.idealStops} you asked for.`,
      rescue: `Set the target to ${stops.length} stop${stops.length === 1 ? "" : "s"}, or add ${Math.max(0, ctx.idealStops - stops.length)} more.`,
    },
    {
      id: "access",
      label: "Access facts",
      measure:
        ctx.accessNeeds.length === 0
          ? "No access need was listed, so nothing is at risk here."
          : `${ctx.accessNeeds.length} access need${ctx.accessNeeds.length === 1 ? "" : "s"} listed and no record in the catalogue carries that fact.`,
      rescue: "Ask the venue directly, or report the fact so the next traveller does not have to guess.",
    },
  ];

  const scores: Record<string, number> = {
    time: timeFit,
    budget: budgetHeadroom,
    travel: travelEfficiency,
    crowd: crowdExposure,
    variety,
    pace: paceMatch,
    access: ctx.accessNeeds.length === 0 ? 100 : 0,
  };

  return factors.map((factor) => ({
    ...factor,
    score: Math.max(0, Math.min(100, Math.round(scores[factor.id] ?? 0))),
  }));
}


const SIZE = 260;
const CENTRE = SIZE / 2;
const RADIUS = CENTRE - 34;

function pointAt(index: number, total: number, value: number): [number, number] {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const radius = (Math.max(0, Math.min(100, value)) / 100) * RADIUS;
  return [CENTRE + Math.cos(angle) * radius, CENTRE + Math.sin(angle) * radius];
}

export function StressRadar({ stops, ctx }: { stops: Stop[]; ctx: DiscoveryContext }) {
  const factors = planFactors(stops, ctx);
  const worst = factors.reduce((low, factor) => (factor.score < low.score ? factor : low), factors[0]);
  const scored = factors.filter((factor) => factor.measure && !factor.measure.startsWith("Weather is unknown") && !factor.measure.startsWith("No return time"));
  const polygon = scored
    .map((factor, index) => pointAt(index, scored.length, factor.score).map((value) => value.toFixed(1)).join(","))
    .join(" ");

  return (
    <section className="border border-line p-5" aria-labelledby="radar-heading">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Stress radar</p>
      <h2 id="radar-heading" className="mt-2 text-xl font-bold tracking-[-0.03em]">
        Seven things that could make this plan fall over
      </h2>

      <div className="mt-5 grid gap-6 sm:grid-cols-[260px_1fr] sm:items-start">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="mx-auto h-auto w-full max-w-[260px]"
          role="img"
          aria-label={`Radar of ${scored.length} factors. Worst factor: ${worst.label} at ${worst.score} out of 100.`}
        >
          {[0.25, 0.5, 0.75, 1].map((ring) => (
            <polygon
              key={ring}
              points={scored.map((_, index) => pointAt(index, scored.length, ring * 100).map((v) => v.toFixed(1)).join(",")).join(" ")}
              fill="none"
              stroke="#DDE3EA"
            />
          ))}
          {scored.map((_, index) => {
            const [x, y] = pointAt(index, scored.length, 100);
            return <line key={index} x1={CENTRE} y1={CENTRE} x2={x} y2={y} stroke="#DDE3EA" />;
          })}
          <polygon points={polygon} fill="rgba(23,92,211,0.18)" stroke="#175CD3" strokeWidth={2} />
          {scored.map((factor, index) => {
            const [x, y] = pointAt(index, scored.length, factor.score);
            return <circle key={factor.id} cx={x} cy={y} r={3.5} fill="#175CD3" />;
          })}
        </svg>

        <ul className="space-y-2">
          {factors.map((factor) => (
            <li key={factor.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold">{factor.label}</span>
                <span className={`text-sm font-bold ${factor.score >= 70 ? "text-green" : "text-amber"}`}>
                  {factor.score}
                </span>
              </div>
              <div aria-hidden="true" className="mt-1 h-1.5 w-full rounded-sm bg-canvas">
                <div
                  className={`h-full rounded-sm ${factor.score >= 70 ? "bg-green" : "bg-amber"}`}
                  style={{ width: `${factor.score}%` }}
                />
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">{factor.measure}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 border border-amber bg-amberSoft/50 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-amber">Worst factor: {worst.label} at {worst.score} of 100</p>
        <p className="mt-2 text-sm font-semibold leading-6">{worst.rescue}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{worst.measure}</p>
      </div>
    </section>
  );
}
