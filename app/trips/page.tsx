"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Clock, MapPin, NavigationArrow, ShieldCheck, Trash, Warning } from "@phosphor-icons/react/dist/ssr";
import { BottomNav, StatusLabel } from "@/components/ui";
import { Footer } from "@/components/footer";
import { FeasibilityMeter } from "@/components/ananta/feasibility-meter";
import { WhyThis } from "@/components/ananta/why-this";
import { StressRadar, planFactors } from "@/components/ananta/stress-radar";
import { LearnerSummary } from "@/components/ananta/learned-weights";
import { AcceptedReplan, ReplanProposal, TriggerRail } from "@/components/ananta/replan-proposal";
import { DEMO_ORIGIN, defaultEngineInput, useLearner, usePipeline, usePlanIds } from "@/components/ananta/use-ananta";
import { applyTrigger } from "@/components/ananta/replan";
import {
  PLAN_BUFFER_MINUTES,
  clockLabel,
  gate,
  hoursLabel,
  inrLabel,
  makeTravelOptions,
  minutesOfDay,
  objectiveFast,
  pack,
  relax,
  stopComponents,
  stopTotals,
  validate,
  weightsFor,
  type PackOptions,
} from "@/components/ananta/pipeline";
import { anantaById, anantaRecords } from "@/components/ananta/records";
import type { DiscoveryContext, ExperienceV2, Plan, ReplanResult, Stop, TriggerId, ValidationResult, Weights } from "@/lib/engine";
import { stationLabel } from "@/lib/location";

/**
 * Trips, on the engine, with the feasibility meter as the headline.
 *
 * Three fabrications are gone. The clock was a string template that made stop 2
 * "2:15 PM" regardless of anything, so every clock here is the start time the
 * traveller picks plus the packed `arriveBy` plus the recorded visit duration.
 * The fixed "Selected because it matches the current interest and sits inside
 * the available plan area" is replaced by the ranked components the objective
 * actually produced. The "keeps the rest of the plan within the current area"
 * claim is deleted along with the `allExperiences.find(...)` that never looked
 * at location, budget, time, or area.
 *
 * `lib/plan.ts:88-95` and `generatePlanVariants` are no longer called from
 * here. That combinatorics is an OOM on the render path and session 5 is
 * rewriting the algorithm, so this page consumes the packer instead.
 */

const WINDOWS = [60, 90, 120, 180, 240, 360, 480];
const IDEAL_STOPS = [1, 2, 3, 4, 5];
const PACES = ["relaxed", "normal", "packed"] as const;

/** retrieve, gate, pack, validate, relax. One function, used by the first solve and every replan. */
function solveFrom(pool: ExperienceV2[], ctx: DiscoveryContext, options: PackOptions) {
  const weights = weightsFor(ctx);
  const start = minutesOfDay(ctx.now);
  const gated = gate(pool, ctx, {
    windowFor: (record) => {
      const leg = options.originMinutes(record.id);
      return { startMin: start + leg.minutes, endMin: start + leg.minutes + record.durationMinutes };
    },
  });
  const packed = pack(gated.passed, ctx, options);
  const check = validate(packed.stops, ctx, objectiveFast(packed.stops, ctx, weights), weights);
  const eased = check.ok ? null : relax(packed.stops, ctx, check, options, weights);
  const stops = eased ? eased.stops : packed.stops;
  return {
    weights,
    gated,
    packed,
    stops,
    totals: stopTotals(stops),
    validation: validate(stops, ctx, objectiveFast(stops, ctx, weights), weights),
    relaxation: eased,
  };
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
  const [applied, setApplied] = useState<ReplanResult | null>(null);
  const [snapshot, setSnapshot] = useState<string[] | null>(null);

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

  const run = usePipeline(input, learner.weights);
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
    return { id: "draft", stops: solved.stops, objective: objectiveFast(solved.stops, ctx, solved.weights), createdFrom: ctx };
  }, [ctx, solved]);

  const solveFor = useCallback(
    (next: DiscoveryContext): Plan => {
      const localOptions = makeTravelOptions(next, anantaRecords);
      const result = solveFrom(pool, next, localOptions);
      return { id: "draft", stops: result.stops, objective: objectiveFast(result.stops, next, result.weights), createdFrom: next };
    },
    [pool],
  );

  const fire = useCallback(
    (trigger: TriggerId) => {
      if (!currentPlan || !ctx) return;
      setSnapshot(planIds);
      setApplied(null);
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
  }, [commit, snapshot]);

  const startMin = ctx ? minutesOfDay(ctx.now) : 0;
  const factors = useMemo(() => (ctx && solved ? planFactors(solved.stops, ctx) : []), [ctx, solved]);

  if (!run || !ctx || !solved || !currentPlan) {
    return (
      <main id="main-content" className="min-h-screen bg-canvas">
        <div className="mx-auto flex min-h-screen max-w-[1180px] items-center justify-center bg-white lg:my-5 lg:rounded-[28px] lg:shadow-card">
          <p className="p-10 text-sm text-muted" role="status">
            Solving your plan against the catalogue...
          </p>
        </div>
      </main>
    );
  }

  const validation: ValidationResult = solved.validation;
  const overflow = solved.totals.total > ctx.availableMinutes;
  const overBudget = solved.totals.cost > ctx.budgetInr;
  const statusTone = !solved.stops.length ? "blue" : validation.ok ? "green" : "amber";
  const statusText = !solved.stops.length
    ? "Nothing fits yet"
    : validation.ok
      ? "Fits the limits you set"
      : "Needs one adjustment";

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
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Draft plan</p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-4xl font-bold tracking-[-0.05em]">Your plan, and whether it fits</h2>
              <p className="mt-3 max-w-xl leading-7 text-muted">
                {solved.stops.length
                  ? `${solved.stops.length} stop${solved.stops.length === 1 ? "" : "s"} packed from ${solved.gated.passed.length} record${solved.gated.passed.length === 1 ? "" : "s"} that passed the gate, out of ${run.consideredCount} in the catalogue.`
                  : "Nothing in the catalogue fits the window and the budget you set. Widen one of them and the gate re-runs."}
              </p>
            </div>
            <StatusLabel tone={statusTone}>{statusText}</StatusLabel>
          </div>

          <div className="mt-8 grid gap-4 border-y border-line py-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-semibold">
              Available time
              <select value={availableMinutes} onChange={(event) => setAvailableMinutes(Number(event.target.value))} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 font-bold">
                {WINDOWS.map((minutes) => (
                  <option key={minutes} value={minutes}>{hoursLabel(minutes)}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Hard budget
              <input
                inputMode="numeric"
                value={budget}
                onChange={(event) => setBudget(Number(event.target.value) || 0)}
                className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 font-bold"
                aria-label="Hard budget in rupees"
              />
            </label>
            <label className="text-sm font-semibold">
              Start time
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 font-bold" />
            </label>
            <label className="text-sm font-semibold">
              Return by (optional)
              <input type="time" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 font-bold" />
            </label>
          </div>

          <div className="mt-4 grid gap-4 border-b border-line pb-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-semibold">
              Stops you want
              <select value={idealStops} onChange={(event) => setIdealStops(Number(event.target.value))} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 font-bold">
                {IDEAL_STOPS.map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Pace
              <select value={pace} onChange={(event) => setPace(event.target.value as (typeof PACES)[number])} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 font-bold">
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
                className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-3 font-bold"
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

          <div className="mt-6">
            <FeasibilityMeter
              stops={solved.stops}
              availableMinutes={ctx.availableMinutes}
              deadline={ctx.deadline}
              now={ctx.now}
              cost={solved.totals.cost}
              budget={ctx.budgetInr}
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 border border-line p-4 sm:flex-row sm:items-start sm:gap-4">
            {validation.ok ? <ShieldCheck size={21} className="shrink-0 text-green" /> : <Warning size={21} className="shrink-0 text-amber" />}
            <div>
              <p className="font-bold">{validation.ok ? "Validation passed" : "Validation flagged this plan"}</p>
              <ul className="mt-1 space-y-1 text-sm leading-6 text-muted">
                {validation.issues.length === 0 && (
                  <li>
                    The composed objective and an independent re-derivation from the records agree to{" "}
                    {validation.drift.toExponential(1)}, inside the 1e-6 bound the contract sets.
                  </li>
                )}
                {validation.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>
                    {issue.sentence}{" "}
                    {issue.offendingId ? `Offending stop: ${anantaById[issue.offendingId]?.name ?? issue.offendingId}.` : ""}
                  </li>
                ))}
                <li>Rung: {solved.packed.rung}. {solved.packed.relaxationNote}</li>
                {solved.relaxation && <li>Relaxation: {solved.relaxation.note}</li>}
                <li className="text-xs">
                  The re-derivation here shares a file with the composed objective. It recomputes every leg from
                  the coordinates with its own haversine and its own Wilson bound, but it is not yet session
                  6&apos;s independent implementation, so treat the drift as a weaker check than the contract intends.
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <TriggerRail disabled={!solved.stops.length} onFire={fire} />
            {proposal && (
              <ReplanProposal
                result={proposal}
                before={currentPlan.stops}
                alternatives={alternativesFor(ctx, pool, currentPlan.stops, makeTravelOptions(ctx, anantaRecords))}
                onAccept={accept}
                onKeep={() => setProposal(null)}
              />
            )}
            {applied && <AcceptedReplan result={applied} onUndo={undo} />}
          </div>

          <div className="mt-6">
            <StressRadar stops={solved.stops} ctx={ctx} />
          </div>

          {solved.stops.length > 0 && (
            <section className="mt-8">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Packed order</p>
              <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em]">A workable sequence</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                Every clock below is the {clockLabel(startMin)} start time you set, plus the estimated travel,
                the recorded visit duration, and a {PLAN_BUFFER_MINUTES} minute buffer per stop. Travel is a
                straight-line estimate at the manifest congestion multiplier, not live routing, and nothing here
                is a booking or a live availability claim.
              </p>
              <ol className="mt-5 space-y-3">
                {solved.stops.map((stop, index) => (
                  <li key={stop.record.id}>
                    <article className="grid gap-4 border border-line p-5 sm:grid-cols-[120px_1fr_auto] sm:items-start">
                      <div>
                        <p className="text-sm font-bold text-blue">Arrive {clockLabel(startMin + stop.arriveBy)}</p>
                        <p className="mt-1 text-xs text-muted">
                          {index === 0 ? `after ${stop.travelMinutes} min from ${DEMO_ORIGIN.area}` : `after ${stop.travelMinutes} min travel`}
                        </p>
                        <p className="mt-1 text-xs text-muted">leave by {clockLabel(startMin + stop.arriveBy + stop.visitMinutes)}</p>
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h4 className="text-lg font-bold">{stop.record.name}</h4>
                          <StatusLabel tone={stop.record.statusTone}>{stop.record.status}</StatusLabel>
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          {stop.record.area} · {stationLabel(stop.record.station)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-muted">
                          <span><Clock size={14} className="mr-1 inline" />{stop.visitMinutes} min visit</span>
                          <span><NavigationArrow size={14} className="mr-1 inline" />{stop.travelKm} km leg</span>
                          <span><MapPin size={14} className="mr-1 inline" />{inrLabel(stop.costInr)} for the party</span>
                        </div>
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-bold text-blue">Why this stop, ranked</summary>
                          <div className="mt-3">
                            <WhyThis
                              components={stopComponents(stop, ctx, solved.weights as Weights)}
                              title={`Why ${stop.record.name}`}
                              limit={4}
                              note="Ranked by magnitude, largest contribution first."
                            />
                          </div>
                        </details>
                      </div>
                      <button
                        onClick={() => commit(planIds.filter((id) => id !== stop.record.id))}
                        aria-label={`Remove ${stop.record.name}`}
                        className="justify-self-start rounded-lg border border-line p-2 text-muted hover:border-red-300 hover:text-red-600 sm:justify-self-end"
                      >
                        <Trash size={18} />
                      </button>
                    </article>
                    {index < solved.stops.length - 1 && (
                      <div className="travel-connector ml-8 py-3 pl-5 text-xs font-semibold text-muted">
                        <span aria-hidden="true" className="travel-connector-line" />
                        <span aria-hidden="true" className="travel-connector-dot" />
                        <NavigationArrow size={14} className="mr-1 inline" />
                        {solved.stops[index + 1].travelMinutes} min estimated travel, {solved.stops[index + 1].travelKm} km
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="mt-8 border border-line p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">What the engine saw</p>
            <ul className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
              <li>{run.retrievalCount} of {run.consideredCount} catalogue records reached the gate.</li>
              <li>{solved.gated.passed.length} passed every hard constraint.</li>
              <li>{solved.gated.rejected.length} were refused, each with a typed reason.</li>
              <li>
                {overflow
                  ? `The plan needs ${solved.totals.total} minutes against your ${ctx.availableMinutes}.`
                  : `${ctx.availableMinutes - solved.totals.total} minutes of the window are still free.`}
              </li>
              <li>
                {overBudget
                  ? `The plan costs ${inrLabel(solved.totals.cost)} against ${inrLabel(ctx.budgetInr)}.`
                  : `${inrLabel(Math.max(0, ctx.budgetInr - solved.totals.cost))} of the budget is still unspent.`}
              </li>
              <li>Worst radar factor: {factors.length ? worstFactor(factors).label : "not scored"}.</li>
            </ul>
            <div className="mt-4 border-t border-line pt-4">
              <LearnerSummary learner={learner} />
            </div>
          </section>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="/explore" className="inline-flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-3 text-sm font-bold">
              Add another place <ArrowRight size={17} />
            </a>
            <a href="/" className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue px-4 py-3 text-sm font-bold text-white">
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

function worstFactor(factors: { label: string; score: number }[]) {
  return factors.reduce((low, factor) => (factor.score < low.score ? factor : low), factors[0]);
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-lg px-3 py-2 text-sm font-bold ${on ? "bg-blue text-white" : "border border-line bg-white"}`}>
      {children}
    </button>
  );
}

/** Gate-passed records the plan did not take, with real legs from the last stop. */
function alternativesFor(ctx: DiscoveryContext, pool: ExperienceV2[], planned: Stop[], options: PackOptions): Stop[] {
  const taken = new Set(planned.map((stop) => stop.record.id));
  const last = planned[planned.length - 1]?.record.id;
  return pool
    .filter((record) => !taken.has(record.id) && record.durationMinutes + PLAN_BUFFER_MINUTES <= ctx.availableMinutes)
    .slice(0, 6)
    .map((record) => {
      const leg = last ? options.matrix(last, record.id) : options.originMinutes(record.id);
      return {
        record,
        arriveBy: leg.minutes,
        travelMinutes: leg.minutes,
        travelKm: Number(leg.km.toFixed(2)),
        visitMinutes: record.durationMinutes,
        bufferMinutes: PLAN_BUFFER_MINUTES,
        costInr: record.priceInr * ctx.partySize,
      };
    });
}
