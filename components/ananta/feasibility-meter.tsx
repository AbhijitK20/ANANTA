import type { Stop } from "@/lib/engine";
import { PLAN_BUFFER_MINUTES, hoursLabel, inrLabel, minutesOfDay, stopTotals } from "@/components/ananta/pipeline";
import { typeScale } from "@/components/ananta/tokens";
import { soldOutStops } from "@/components/ananta/replan/states";

/**
 * The feasibility meter, as a gauge.
 *
 * The previous shape was a single proportional bar. It was correct and it was
 * unreadable: a filled bar beside a paragraph is a decoration unless you can
 * name the number it is showing, and the reader had to add the three segments
 * up themselves. A ring answers the one question a traveller actually opens
 * this screen with, "how much of my day is gone", before they read anything.
 *
 * Three properties the gauge has to keep, all of which the bar had:
 *
 *  - **The overflow is drawn, not summarised.** A plan longer than the window
 *    cannot fit inside the ring, so the ring fills and a second, outer arc in the
 *    alarm colour carries the excess. Both arcs are labelled in the `aria-label`,
 *    because a ring that silently saturates is a lie with a rounded corner.
 *  - **Buffer keeps its own segment and its own number.** `plan.ts` computed
 *    `bufferMinutes` for every stop, and merging it into a "travel and buffer"
 *    tile is how a plan becomes a guess. Knowing that 40 of your 200 minutes are
 *    slack is the difference between the two.
 *  - **Travel is labelled an estimate everywhere it appears**, because it is a
 *    straight-line distance at the manifest congestion multiplier and not a route.
 *
 * Pure SVG and Tailwind. No chart library, no animation library, and no new
 * dependency: the package list is frozen at five and `spatial-primitives.test.ts`
 * fails the build on a sixth. The colours are not re-declared here either. Each
 * arc is a `currentColor` stroke on an element carrying a `text-blue`,
 * `text-green`, `text-amber` or `text-line` class, so the gauge reads the same
 * four tokens as every chip on the site and cannot drift from them.
 *
 * The gauge is flat, like the radar. Depth on a value axis makes a high number
 * read as a near one and a low number as a far one, which is the ambiguity the
 * spatial contract warns about. The panel gets a raised frame instead.
 */

const SEGMENTS = [
  { key: "activity", label: "Activity", tone: "text-blue", swatch: "bg-blue" },
  { key: "travel", label: "Travel", tone: "text-green", swatch: "bg-green" },
  { key: "buffer", label: "Buffer", tone: "text-amber", swatch: "bg-amber" },
] as const;

const SIZE = 220;
const CENTRE = SIZE / 2;
const STROKE = 20;
/** The overflow arc sits one stroke further out, so the two never overlap. */
const RADIUS = CENTRE - STROKE - 2;
const OVERFLOW_RADIUS = RADIUS + STROKE + 6;
const RING = 2 * Math.PI * RADIUS;
const OVERFLOW_RING = 2 * Math.PI * OVERFLOW_RADIUS;

/** Segments that exist, in bar order. A zero segment is not drawn and not named. */
function present(totals: ReturnType<typeof stopTotals>) {
  return SEGMENTS.map((segment) => ({ ...segment, value: totals[segment.key] })).filter(
    (segment) => segment.value > 0,
  );
}

type Arc = { key: string; length: number; offset: number; tone: string };

/** One arc per present segment, measured against the window and offset along the ring. */
function arcsFor(drawn: readonly { key: string; value: number; tone: string }[], track: number, within: number): Arc[] {
  return drawn.reduce<Arc[]>((list, segment) => {
    const last = list[list.length - 1];
    list.push({
      key: segment.key,
      length: (Math.min(segment.value, within) / track) * RING,
      offset: last ? last.offset + last.length : 0,
      tone: segment.tone,
    });
    return list;
  }, []);
}

/** One sentence, no zeros, always the window and always the overflow. */
function gaugeSentence(
  segments: readonly { label: string; value: number }[],
  availableMinutes: number,
  over: number,
  remaining: number,
) {
  const parts = segments.map((segment) => `${segment.label} ${segment.value} minutes`);
  const window = `against a window of ${availableMinutes} minutes`;
  if (!parts.length) return `Time gauge, nothing allocated yet, ${window}.`;
  const tail = over > 0 ? ` Over by ${over} minutes.` : ` ${remaining} minutes free.`;
  return `Time gauge. ${parts.join(", ")}, ${window}.${tail}`;
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
  const drawn = present(totals);
  const arcs = arcsFor(drawn, track, withinTrack);

  const startMin = minutesOfDay(now);
  const deadlineMin = deadline === null ? null : minutesOfDay(deadline);
  const finish = totals.total;
  const lateBy = deadlineMin === null ? 0 : Math.max(0, startMin + finish - deadlineMin);
  const overBudget = Math.max(0, cost - budget);
  const soldOut = soldOutStops(stops);

  const usedPercent = track > 0 ? Math.round((totals.total / track) * 100) : 0;
  const overPercent = Math.min(100, (over / track) * 100);

  return (
    <section className="border border-line bg-white p-5" aria-labelledby="meter-heading">
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

      <div className="mt-5 grid gap-6 sm:grid-cols-[220px_1fr] sm:items-center">
        <div className="relative mx-auto w-full max-w-[220px]">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="h-auto w-full"
            role="img"
            aria-label={gaugeSentence(drawn, availableMinutes, over, remaining)}
          >
            <circle
              cx={CENTRE}
              cy={CENTRE}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              className="text-line"
              stroke="currentColor"
            />
            {over > 0 && (
              <circle
                cx={CENTRE}
                cy={CENTRE}
                r={OVERFLOW_RADIUS}
                fill="none"
                strokeWidth={4}
                className="text-amber"
                stroke="currentColor"
                strokeDasharray={`${(overPercent / 100) * OVERFLOW_RING} ${OVERFLOW_RING}`}
                transform={`rotate(-90 ${CENTRE} ${CENTRE})`}
              />
            )}
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx={CENTRE}
                cy={CENTRE}
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                className={arc.tone}
                stroke="currentColor"
                strokeLinecap="butt"
                strokeDasharray={`${arc.length} ${RING - arc.length}`}
                strokeDashoffset={-arc.offset}
                transform={`rotate(-90 ${CENTRE} ${CENTRE})`}
              />
            ))}
          </svg>
          <p className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {over > 0 ? (
              <span className="text-[30px] font-bold leading-none tracking-[-0.04em] text-amber">
                {hoursLabel(over)}
              </span>
            ) : (
              <span className="text-[34px] font-bold leading-none tracking-[-0.04em] text-ink">
                {usedPercent}%
              </span>
            )}
            <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              {over > 0 ? "past your window" : "of your window"}
            </span>
          </p>
        </div>

        <div>
          {drawn.length === 0 ? (
            <p className="text-sm leading-6 text-muted">
              No time is allocated yet, so the gauge is empty by design. Widen the window or shorten
              the list and it fills.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-3">
              {SEGMENTS.map((segment) => (
                <div key={segment.key}>
                  <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                    <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-sm ${segment.swatch}`} />
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
          )}
          {over > 0 && (
            <p className="mt-3 border-l-4 border-amber bg-amberSoft/50 px-3 py-2 text-sm font-semibold leading-6">
              The outer arc is the {over} minute{over === 1 ? "" : "s"} beyond your window. The gauge
              cannot grow past a full ring, so the excess is drawn outside it rather than folded into the
              number.
            </p>
          )}
        </div>
      </div>

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
        The gauge is measured against the window you set. Travel and buffer are straight-line estimates at
        the city congestion multiplier in the manifest, not live routing. Buffer is{" "}
        {PLAN_BUFFER_MINUTES} minutes per stop for walking, parking, and queueing. Nothing here is a live
        availability claim.
      </p>
    </section>
  );
}
