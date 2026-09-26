"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { BottomNav, StatusLabel } from "@/components/ui";
import { Footer } from "@/components/footer";
import { FeasibilityMeter } from "@/components/ananta/feasibility-meter";
import { ValidationStamp } from "@/components/ananta/trips/validation-stamp";
import { PlanTimeline } from "@/components/ananta/trips/plan-timeline";
import { RoutingNotice, TripsStates } from "@/components/ananta/trips/trips-states";
import { StressRadar, planFactors, worstFactor } from "@/components/ananta/stress-radar";
import { LearnerSummary } from "@/components/ananta/learned-weights";
import { AcceptedReplan, ReplanProposal, TriggerRail, SolvingState, solveStages } from "@/components/ananta/replan-proposal";
import { soldOutStops, type AvailabilityState } from "@/components/ananta/replan/states";
import { defaultEngineInput, useLearner, usePipeline, usePlanIds } from "@/components/ananta/use-ananta";
import { applyTrigger } from "@/components/ananta/replan";
import {
  inrLabel,
  makeTravelOptions,
  minutesOfDay,
  objectiveFast,
  pack,
  relax,
  stopTotals,
  validate,
  weightsFor,
  type PackOptions,
  type PipelineRun,
} from "@/components/ananta/pipeline";
import { anantaById, anantaRecords, DATASET_SIZE } from "@/components/ananta/records";
import { typeScale } from "@/components/ananta/tokens";
import type { DiscoveryContext, ExperienceV2, Plan, Rejection, ReplanResult, Stop, TriggerId, Weights } from "@/lib/engine";

/**
 * Trips, the proof screen. Order is `UI-UX-DESIGN.md` 6.4 and it is not negotiable:
 * a judge should hit the evidence before the plan.
 *
 *   meter, validation stamp, stress radar, the plan, the relaxation note, the
 *   trigger controls, and the proposal only once a trigger has fired.
 *
 * What this file used to do wrong, and what replaced it:
 *
 *  - `lib/plan.ts:88-95` and `generatePlanVariants` were called from a `useMemo`
 *    on the render path with `allExperiences.slice(0, 60)`. At five stops that
 *    materialises 5,461,512 arrays and evaluates each one, so a five stop plan
 *    froze the tab on every budget keystroke. That call is gone. The packer comes
 *    from the engine and is bounded by construction. No smaller `slice` was
 *    substituted, because a hidden cap is the same lie in a cheaper coat.
 *  - The timeline printed ``${index + 1}:15 PM`` for every stop past the first.
 *    It is now a real clock off `Stop.arriveBy`, and the start time it is relative
 *    to is printed above the list. See `trips/plan-timeline.tsx`.
 *  - `allExperiences.find(item => item.statusTone !== "amber" && ...)` produced
 *    the "suggested indoor alternative" as index 0 of the array, and the copy
 *    claimed it "keeps the rest of the plan within the current area", which was
 *    false in both clauses. Both are gone. Session 9's replan chooses a
 *    replacement and supplies a real reason.
 *  - The fixed "Selected because it matches the current interest and sits inside
 *    the available plan area" is gone. Session 7's per-stop `WhyThis` replaced it.
 *
 * The engine's own `relax` decides the rung and writes the note. This page never
 * writes a relaxation sentence, and where the note disagrees with the measured
 * hard checks it says so rather than picking one.
 *
 * What the visual redesign changed, and what it deliberately did not:
 *
 *  - The traveller's own inputs moved into two cards above the evidence, because
 *    they were interleaved with it and a reader could not tell where their own
 *    decisions ended and the engine's answers began.
 *  - The feasibility meter is a gauge now. See `ananta/feasibility-meter.tsx`.
 *  - The six replan triggers are a chip bar. See `ananta/replan/proposal.tsx`.
 *  - Nothing below the fold moved out of the order above, and no number on this
 *    page is typed into a string: every one is read from the run or the context.
 */

const WINDOWS = [60, 90, 120, 180, 240, 360, 480];
const IDEAL_STOPS = [1, 2, 3, 4, 5];
const PACES = ["relaxed", "normal", "packed"] as const;

/** retrieve, gate, pack, validate, relax. One function, used by the first solve and every replan. */
function solveFrom(pool: ExperienceV2[], ctx: DiscoveryContext, options: PackOptions) {
  const weights = weightsFor(ctx);
  const start = minutesOfDay(ctx.now);
  const packed = pack(
    pool.filter((record) => {
      const leg = options.originMinutes(record.id);
      return start + leg.minutes + record.durationMinutes <= ctx.availableMinutes;
    }),
    ctx,
    options,
  );
  const check = validate(packed.stops, ctx, objectiveFast(packed.stops, ctx, weights), weights);
  const eased = check.ok ? null : relax(packed.stops, ctx, check, options, weights);
  const stops = eased ? eased.stops : packed.stops;
  return {
    weights,
    packed,
    stops,
    totals: stopTotals(stops),
    validation: validate(stops, ctx, objectiveFast(stops, ctx, weights), weights),
    relaxation: eased,
  };
}

/** Records the gate would not judge because a fact it needs is unknown. */
function abstainedNames(rejections: readonly Rejection[]): string[] {
  return rejections
    .filter(
      (item) =>
        item.blocking &&
        (item.code === "unverified_required_fact" || item.causedByConfidence === "unverified"),
    )
    .map((item) => item.sentence);
}

/** Stops carrying at least one field nobody has verified. */
function partiallyUnknown(stops: readonly Stop[]): string[] {
  return stops
    .filter((stop) => Object.values(stop.record.confidence).includes("unverified"))
    .map((stop) => stop.record.name);
}

export default function TripsPage() {
  const [learner] = useLearner();
  const [planIds, commit] = usePlanIds();
  const [budget, setBudget] = useState(1500);
  const [availableMinutes, setAvailableMinutes] = useState(240);
  const [startTime, setStartTime] = useState("10:00");
  const [deadline, setDeadline] = useState("");
  const [idealStops, setIdealStops] = useState(3);
  const [pace, setPace] = useState<(typeof PACES)[number]>("normal");
  const [rainMode, setRainMode] = useState(false);
  const [hasToddler, setHasToddler] = useState(false);
  const [hasElderly, setHasElderly] = useState(false);
  const [partySize, setPartySize] = useState(1);
  const [proposal, setProposal] = useState<ReplanResult | null>(null);
  const [firedTrigger, setFiredTrigger] = useState<TriggerId | null>(null);
  const [applied, setApplied] = useState<ReplanResult | null>(null);
  const [snapshot, setSnapshot] = useState<string[] | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const input = useMemo(
    () =>
      defaultEngineInput({
        availableMinutes,
        budgetInr: budget,
        startTime,
        deadline: deadline || null,
        rainMode,
        partySize,
        hasToddler,
        hasElderly,
        pace,
        idealStops,
        minStops: 1,
        planIds,
      }),
    [availableMinutes, budget, deadline, hasElderly, hasToddler, idealStops, pace, partySize, planIds, rainMode, startTime],
  );

  const run: PipelineRun | null = usePipeline(input, learner.weights);
  const ctx = run?.ctx ?? null;

  const pool = useMemo(
    () => (run ? run.retrieved.ids.map((id) => anantaById[id]).filter(Boolean) : []),
    [run],
  );

  const solved = useMemo(() => {
    if (!ctx) return null;
    return solveFrom(pool, ctx, makeTravelOptions(ctx, anantaRecords));
  }, [ctx, pool]);

  const currentPlan: Plan | null = useMemo(() => {
    if (!ctx || !solved) return null;
    return {
      id: "draft",
      stops: solved.stops,
      objective: objectiveFast(solved.stops, ctx, solved.weights),
      createdFrom: ctx,
    };
  }, [ctx, solved]);

  const solveFor = useCallback(
    (next: DiscoveryContext): Plan => {
      const localOptions = makeTravelOptions(next, anantaRecords);
      const result = solveFrom(pool, next, localOptions);
      return {
        id: "draft",
        stops: result.stops,
        objective: objectiveFast(result.stops, next, result.weights),
        createdFrom: next,
      };
    },
    [pool],
  );

  const fire = useCallback(
    (trigger: TriggerId) => {
      if (!currentPlan || !ctx) return;
      setSnapshot(planIds);
      setApplied(null);
      setFiredTrigger(trigger);
      setProposal(applyTrigger(currentPlan, trigger, ctx, solveFor));
    },
    [ctx, currentPlan, planIds, solveFor],
  );

  const accept = useCallback(() => {
    if (!proposal) return;
    commit(proposal.plan.stops.map((stop) => stop.record.id));
    setApplied(proposal);
    setProposal(null);
  }, [commit, proposal]);

  const undo = useCallback(() => {
    if (!snapshot) return;
    commit(snapshot);
    setApplied(null);
    setSnapshot(null);
    setFiredTrigger(null);
  }, [commit, snapshot]);

  /* 1 of the nine states. Nothing is hidden while this runs. */
  if (!run || !ctx || !solved || !currentPlan) {
    return (
      <main id="main-content" className="min-h-screen bg-canvas">
        <div className="mx-auto min-h-screen max-w-[1180px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
          <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
            <a href="/" className="flex items-center gap-2 text-sm font-bold">
              <ArrowLeft size={18} /> Home
            </a>
            <h1 className="text-lg font-bold">Trips</h1>
            <a href="/explore" className="text-sm font-bold text-blue">Explore</a>
          </header>
          <div className="px-5 py-10 sm:px-8 lg:px-14">
            <SolvingState stages={solveStages({ retrieved: null, considered: null, passed: null, refused: null, packed: null, drift: null })} />
          </div>
        </div>
      </main>
    );
  }

  const { validation, packed, relaxation, totals, weights } = solved;
  const overflow = totals.total > ctx.availableMinutes;
  const overBudget = totals.cost > ctx.budgetInr;
  const factors = planFactors(solved.stops, ctx);
  const worst = worstFactor(factors);
  const availability: AvailabilityState[] = soldOutStops(solved.stops);
  const failed = validation.issues.filter((issue) => issue.code === "objective_drift").length > 0;
  const statusTone = !solved.stops.length ? "blue" : validation.ok ? "green" : "amber";
  const statusText = !solved.stops.length
    ? "Nothing fits yet"
    : validation.ok
      ? "Fits the limits you set"
      : failed
        ? "Scoring failed its own check"
        : "Needs one adjustment";

  const stateInput = {
    retrieved: run.retrieved.ids.length,
    passed: run.gated.passed.length,
    refused: run.gated.rejected.length,
    packed: solved.stops.length,
    drift: validation.drift,
    stops: solved.stops,
    ctx,
    abstainedNames: abstainedNames(run.gated.stream.flatMap((row) => row.rejections)),
    partiallyUnknown: partiallyUnknown(solved.stops),
    broken: Number.isFinite(validation.drift) ? null : "The objective could not be reduced to a finite number.",
    online,
  };

  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1180px] bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeft size={18} /> Home
          </a>
          <h1 className="text-lg font-bold">Trips</h1>
          <a href="/explore" className="text-sm font-bold text-blue">Explore</a>
        </header>

        <section className="px-5 pb-28 pt-10 sm:px-8 lg:px-14 lg:pb-14">
          <p className={`${typeScale.micro} font-bold uppercase tracking-[0.14em] text-blue`}>
            Draft plan
          </p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h2 className={typeScale.title}>Your plan, and whether it fits</h2>
              <p className="mt-3 max-w-[62ch] text-sm leading-6 text-muted">
                {solved.stops.length
                  ? `${solved.stops.length} stop${solved.stops.length === 1 ? "" : "s"} packed from ${run.gated.passed.length} record${run.gated.passed.length === 1 ? "" : "s"} that passed the gate, out of ${run.consideredCount} in the catalogue.`
                  : `Nothing in the catalogue of ${DATASET_SIZE} fits the window and the budget you set. Widen one of them and the gate re-runs.`}
              </p>
            </div>
            <p aria-live="polite" aria-atomic="true">
              <StatusLabel tone={statusTone}>{statusText}</StatusLabel>
            </p>
          </div>

          {/*
            The traveller's own inputs, in one place, before any of the evidence.
            They were previously interleaved with the results, which made it
            impossible to see where a decision ended and an answer began.
          */}
          <section className="mt-8 border border-line bg-canvas p-5" aria-labelledby="your-limits-heading">
            <h3 id="your-limits-heading" className="text-sm font-bold uppercase tracking-[0.1em] text-muted">
              What you are asking for
            </h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-semibold">
                Available time
                <select
                  value={availableMinutes}
                  onChange={(event) => setAvailableMinutes(Number(event.target.value))}
                  className="mt-2 block min-h-[44px] w-full rounded border border-line bg-white px-3 py-2 font-bold"
                >
                  {WINDOWS.map((minutes) => (
                    <option key={minutes} value={minutes}>{minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Hard budget
                <input
                  inputMode="numeric"
                  value={budget}
                  onChange={(event) => setBudget(Number(event.target.value) || 0)}
                  className="mt-2 block min-h-[44px] w-full rounded border border-line bg-white px-3 py-2 font-bold"
                  aria-label="Hard budget in rupees"
                />
              </label>
              <label className="text-sm font-semibold">
                Start time
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="mt-2 block min-h-[44px] w-full rounded border border-line bg-white px-3 py-2 font-bold"
                  aria-describedby="start-time-basis"
                />
              </label>
              <label className="text-sm font-semibold">
                Return by, optional
                <input
                  type="time"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  className="mt-2 block min-h-[44px] w-full rounded border border-line bg-white px-3 py-2 font-bold"
                  aria-label="Return by, optional"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-semibold">
                Stops you want
                <select
                  value={idealStops}
                  onChange={(event) => setIdealStops(Number(event.target.value))}
                  className="mt-2 block min-h-[44px] w-full rounded border border-line bg-white px-3 py-2 font-bold"
                >
                  {IDEAL_STOPS.map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Pace
                <select
                  value={pace}
                  onChange={(event) => setPace(event.target.value as (typeof PACES)[number])}
                  className="mt-2 block min-h-[44px] w-full rounded border border-line bg-white px-3 py-2 font-bold"
                >
                  {PACES.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                People
                <input
                  inputMode="numeric"
                  value={partySize}
                  onChange={(event) => setPartySize(Math.max(1, Number(event.target.value) || 1))}
                  className="mt-2 block min-h-[44px] w-full rounded border border-line bg-white px-3 py-2 font-bold"
                  aria-label="Party size"
                />
              </label>
              <fieldset className="text-sm font-semibold">
                <legend>Who is coming</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Toggle on={hasToddler} onClick={() => setHasToddler(!hasToddler)}>A toddler</Toggle>
                  <Toggle on={hasElderly} onClick={() => setHasElderly(!hasElderly)}>An elderly traveller</Toggle>
                  <Toggle on={rainMode} onClick={() => setRainMode(!rainMode)}>It is raining</Toggle>
                </div>
              </fieldset>
            </div>
            <p id="start-time-basis" className="mt-4 border-t border-line pt-3 text-xs leading-5 text-muted">
              Every clock on this page starts at {startTime || "the start time you set"} and is computed from
              the leg estimates above. Travel is straight-line at the manifest congestion multiplier, so a
              clock here is a plan and not a promise from a routing service.
            </p>
          </section>

          {/* 1. The signature element. */}
          <div className="mt-6">
            <FeasibilityMeter
              stops={solved.stops}
              availableMinutes={ctx.availableMinutes}
              deadline={ctx.deadline}
              now={ctx.now}
              cost={totals.cost}
              budget={ctx.budgetInr}
            />
          </div>

          {/* 2. The credibility anchor. */}
          <div className="mt-4">
            <ValidationStamp
              stops={solved.stops}
              ctx={ctx}
              soldOutIds={availability.map((state) => state.id)}
            />
          </div>

          {/* The states that qualify the evidence, resolved from the run. */}
          <div className="mt-4">
            <TripsStates
              input={stateInput}
              validationIssues={validation.issues}
              cheapest={run.cheapest}
              nameOf={(id) => (id === null ? "the plan as a whole" : (anantaById[id]?.name ?? id))}
              plan={currentPlan}
              onReplanAround={() => fire("sold_out")}
              replanDisabled={!solved.stops.length}
            />
          </div>

          <div className="mt-4">
            <RoutingNotice />
          </div>

          {/* 3. Seven factors, worst first, one rescue move.
              StressRadar already renders session 8's StressTable beneath the chart,
              which is the table equivalent the accessibility targets ask for, so
              this screen does not add a second copy of it. */}
          <div className="mt-6">
            <StressRadar
              stops={solved.stops}
              ctx={ctx}
              onTrigger={(id) => fire(id)}
              triggerLabel={(id) => `Replan: ${id.replace(/_/g, " ")}`}
            />
          </div>

          {/* 4. The plan. */}
          {solved.stops.length > 0 && (
            <div className="mt-8">
              <PlanTimeline
                stops={solved.stops}
                ctx={ctx}
                weights={weights as Weights}
                startTimeLabel={startTime || "the start time you set"}
                onRemove={(id) => commit(planIds.filter((value) => value !== id))}
              />
            </div>
          )}

          {/* 5. The rung and what it cost, from the engine. */}
          <section className="mt-8 border border-line p-5" aria-labelledby="relaxation-heading">
            <p className={`${typeScale.micro} font-bold uppercase tracking-[0.14em] text-blue`}>
              How this plan was chosen
            </p>
            <h3 id="relaxation-heading" className={`mt-2 ${typeScale.title}`}>
              Rung {packed.rung}
            </h3>
            <p className="mt-2 max-w-[68ch] text-sm leading-6">
              {relaxation ? relaxation.note : packed.relaxationNote}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              The rung and that sentence are written by the engine&apos;s own ladder in
              <code className="rounded bg-canvas px-1">lib/engine/validation/ladder.ts</code>. This page does
              not write them, and it does not soften them.
            </p>
            {!validation.ok && !relaxation && (
              <p className="mt-3 border-l-4 border-amber bg-amberSoft/50 px-3 py-2 text-sm font-semibold leading-6">
                The ladder could not reach a rung that satisfies your limits, so the plan above is shown as
                it is. The validator named the failures in the stamp above; nothing has been quietly dropped to
                make the numbers fit.
              </p>
            )}
          </section>

          {/* 6. Six one-click controls, then the proposal once one has fired. */}
          <div className="mt-6 space-y-5" id="replan">
            <TriggerRail disabled={!solved.stops.length} onFire={fire} />
            {/* 7. The proposal, only once a trigger has fired. */}
            {proposal && (
              <ReplanProposal
                result={proposal}
                trigger={firedTrigger ?? undefined}
                before={currentPlan.stops}
                alternatives={alternativesFor(ctx, pool, currentPlan.stops, makeTravelOptions(ctx, anantaRecords))}
                onAccept={accept}
                onKeep={() => {
                  setProposal(null);
                  setFiredTrigger(null);
                }}
              />
            )}
            {applied && (
              <AcceptedReplan result={applied} trigger={firedTrigger ?? undefined} onUndo={undo} />
            )}
          </div>

          <section className="mt-8 border border-line p-5">
            <p className={`${typeScale.micro} font-bold uppercase tracking-[0.12em] text-muted`}>
              What the engine saw
            </p>
            <ul className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
              <li>{run.retrievalCount} of {run.consideredCount} catalogue records reached the gate.</li>
              <li>{run.gated.passed.length} passed every hard constraint.</li>
              <li>{run.gated.rejected.length} were refused, each with a typed reason.</li>
              <li>
                {overflow
                  ? `The plan needs ${totals.total} minutes against your ${ctx.availableMinutes}.`
                  : `${ctx.availableMinutes - totals.total} minutes of the window are still free.`}
              </li>
              <li>
                {overBudget
                  ? `The plan costs ${inrLabel(totals.cost)} against ${inrLabel(ctx.budgetInr)}.`
                  : `${inrLabel(Math.max(0, ctx.budgetInr - totals.cost))} of the budget is still unspent.`}
              </li>
              <li>Worst stress factor: {worst ? worst.label : "not scored"}.</li>
            </ul>
            <div className="mt-4 border-t border-line pt-4">
              <LearnerSummary learner={learner} />
            </div>
          </section>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/explore"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded border border-line px-4 py-2 text-sm font-bold"
            >
              Add another place <ArrowRight size={17} />
            </a>
            <a
              href="/"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded bg-blue px-4 py-2 text-sm font-bold text-white"
            >
              Back to the start
            </a>
          </div>
        </section>
        <Footer />
        <BottomNav />
      </div>
    </main>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-[44px] rounded px-3 py-2 text-sm font-bold ${on ? "bg-blue text-white" : "border border-line bg-white"}`}
    >
      {children}
    </button>
  );
}

/** Gate-passed records the plan did not take, with real legs from the last stop. */
function alternativesFor(ctx: DiscoveryContext, pool: ExperienceV2[], planned: Stop[], options: PackOptions): Stop[] {
  const taken = new Set(planned.map((stop) => stop.record.id));
  const last = planned[planned.length - 1]?.record.id;
  return pool
    .filter((record) => !taken.has(record.id) && record.durationMinutes + 15 <= ctx.availableMinutes)
    .slice(0, 6)
    .map((record) => {
      const leg = last ? options.matrix(last, record.id) : options.originMinutes(record.id);
      return {
        record,
        arriveBy: leg.minutes,
        travelMinutes: leg.minutes,
        travelKm: Number(leg.km.toFixed(2)),
        visitMinutes: record.durationMinutes,
        bufferMinutes: 15,
        costInr: (record.pricePerPersonInr ?? record.priceInr) * ctx.partySize,
      };
    });
}
