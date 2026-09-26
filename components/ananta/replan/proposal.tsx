"use client";

import { useState } from "react";
import { Check, Info, X } from "@phosphor-icons/react/dist/ssr";
import type { Plan, ReplanResult, Stop, TriggerId } from "@/lib/engine";
import { COMPONENT_LABEL, TONE_TEXT, typeScale } from "@/components/ananta/tokens";
import { countSubstitutions } from "@/components/ananta/replan/engine";
import { intentDrift, preservedIntent } from "@/components/ananta/replan/intent";
import { TRIGGER_CONTROLS } from "@/components/ananta/replan/triggers";

/**
 * The replan proposal. Three parts, in this order, because that order is the
 * argument:
 *
 *   1. What changed. The trigger, as a fact about the world.
 *   2. What is being preserved. The traveller's own intent, named back to them
 *      from the frozen baseline, with an explicit note when the proposal
 *      substituted something.
 *   3. What is proposed, with a score delta per swap and the real count.
 *
 * Then three controls, all real: accept, view alternatives, keep original.
 * `Keep the original` is a first-class outcome and not a dismiss, because
 * sometimes the correct answer is to do nothing and say so.
 *
 * The swap count is displayed untrimmed. A replan that needed four swaps is
 * information, and hiding it to look efficient would be the exact dishonesty
 * this screen exists to avoid.
 */

const signed = (value: number): string => `${value > 0 ? "+" : ""}${value.toFixed(3)}`;

export function ReplanProposal({
  result,
  trigger,
  before,
  alternatives,
  onAccept,
  onKeep,
}: {
  result: ReplanResult;
  /**
   * The trigger that fired, so the header can name the world-change in the
   * traveller's tense. Optional because `app/trips` does not pass it yet; when
   * it is absent the panel still shows the intent, the swaps and the controls,
   * and says only "Something changed" in the header rather than guessing.
   */
  trigger?: TriggerId;
  before: Stop[];
  alternatives: Stop[];
  onAccept: () => void;
  onKeep: () => void;
}) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const spec = trigger ? TRIGGER_CONTROLS.find((control) => control.id === trigger) : undefined;
  const intent = preservedIntent(result.plan.createdFrom);
  const drift = intentDrift(
    { id: "before", stops: before, objective: result.plan.objective, createdFrom: result.plan.createdFrom },
    result.plan,
  );
  const substitutions = countSubstitutions(result.swaps);
  const changed = result.swaps.length > 0;

  return (
    <section className="border border-blue bg-blueSoft/30 p-5" aria-live="polite" aria-label="Replan proposal">
      {/* 1. What changed */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`${typeScale.micro} font-bold uppercase tracking-[0.12em] text-blue`}>
            Proposal, nothing applied
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-[-0.03em]">
            {spec ? spec.label : "Something changed"}
          </h2>
          <p className={`mt-1 ${typeScale.meta} text-muted`}>
            {spec ? `The world changed: ${spec.event.toLowerCase()}. Your context was re-solved against it.` : "The world changed and the plan was re-solved."}
          </p>
        </div>
        <p className={`${typeScale.micro} border border-line bg-white px-2 py-1 font-bold uppercase tracking-[0.08em] text-muted`}>
          diffed against your original request
        </p>
      </div>

      {/* 2. What is being preserved */}
      <div className="mt-5 border border-line bg-white p-4">
        <p className={`flex items-center gap-2 ${typeScale.micro} font-bold uppercase tracking-[0.12em] text-green`}>
          <Info size={14} /> What is being preserved
        </p>
        <p className="mt-2 text-sm font-semibold leading-6">{intent.headline}</p>
        {intent.unnamedInterest && (
          <p className="mt-1 text-xs leading-5 text-muted">
            Because nothing was named, any stop that fits your window, budget and party is on offer. That is
            a weaker promise than a named interest, and it is the one you are getting.
          </p>
        )}
        <dl className="mt-3 grid gap-x-6 gap-y-1 border-t border-line pt-3 sm:grid-cols-2">
          {intent.facets.map((facet) => (
            <div key={facet.label} className="flex gap-2 text-xs">
              <dt className="shrink-0 font-bold text-muted">{facet.label}</dt>
              <dd className="text-ink">{facet.value}</dd>
            </div>
          ))}
        </dl>
        {drift.lostCategories.length > 0 ? (
          <p className="mt-3 border border-amber bg-amberSoft/50 p-3 text-xs font-semibold leading-5">
            This proposal drops {drift.lostCategories.join(" and ")} entirely and brings in{" "}
            {drift.gainedCategories.length ? drift.gainedCategories.join(" and ") : "nothing new"}. If the
            category you wanted is no longer in the plan, keep the original instead.
          </p>
        ) : (
          <p className="mt-3 text-xs leading-5 text-muted">
            Every category in your plan survives this proposal, so nothing you were going for has been
            quietly replaced.
          </p>
        )}
      </div>

      {/* 3. What is proposed */}
      <div className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-bold">
            {changed
              ? `${result.swaps.length} change${result.swaps.length === 1 ? "" : "s"} proposed`
              : "Nothing needs to change"}
          </p>
          <p className={`${typeScale.micro} text-muted`}>
            {substitutions} substitution{substitutions === 1 ? "" : "s"} · {drift.stopped} to {drift.added} stop
            {drift.added === 1 ? "" : "s"}
          </p>
        </div>

        {changed ? (
          <ol className="mt-3 space-y-2">
            {result.swaps.map((swap, index) => (
              <li key={`${swap.removedId ?? "none"}-${swap.addedId ?? "none"}-${index}`} className="border border-line bg-white p-4">
                <p className="text-sm leading-6">{swap.reason}</p>
                <p className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-muted">
                  <span className="border border-line bg-canvas px-1.5 py-0.5">objective {signed(swap.scoreDelta)}</span>
                  <span className="border border-line bg-canvas px-1.5 py-0.5">
                    plan time {swap.minutesDelta > 0 ? "+" : ""}
                    {Math.abs(swap.minutesDelta)} min
                  </span>
                  {swap.removedId && <span className="border border-line bg-canvas px-1.5 py-0.5">out: {swap.removedId}</span>}
                  {swap.addedId && <span className="border border-line bg-canvas px-1.5 py-0.5">in: {swap.addedId}</span>}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 border border-line bg-white p-4 text-sm leading-6 text-muted">
            The plan already fits the new limits, so the right move is to keep it. There is nothing to accept.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={onAccept}
          disabled={!changed}
          className="inline-flex min-h-[44px] items-center gap-2 bg-blue px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
        >
          <Check size={16} weight="bold" /> Accept this plan
        </button>
        <button
          onClick={() => setShowAlternatives(!showAlternatives)}
          aria-expanded={showAlternatives}
          className="inline-flex min-h-[44px] items-center gap-2 border border-line bg-white px-4 py-2 text-sm font-bold"
        >
          View alternatives
        </button>
        <button
          onClick={onKeep}
          className="inline-flex min-h-[44px] items-center gap-2 border border-line bg-white px-4 py-2 text-sm font-bold"
        >
          <X size={16} /> Keep the original
        </button>
      </div>

      {showAlternatives && (
        <div className="mt-4 border border-line bg-white p-4">
          <p className={`${typeScale.micro} font-bold uppercase tracking-[0.1em] text-muted`}>
            {alternatives.length} other record{alternatives.length === 1 ? "" : "s"} the gate had already passed
          </p>
          {alternatives.length ? (
            <ul className="mt-3 space-y-2">
              {alternatives.map((stop) => (
                <li key={stop.record.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold">{stop.record.name}</span>
                  <span className="text-xs text-muted">
                    {stop.record.area} · {stop.record.category} · {stop.visitMinutes} min visit ·{" "}
                    {stop.travelMinutes} min from the previous stop
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted">
              Nothing else passed the gate under the new limits. The choice is between the proposal and the
              original plan, and both are real options.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** The state after the traveller accepts. Still names the count. */
export function AcceptedReplan({
  result,
  trigger,
  onUndo,
}: {
  result: ReplanResult;
  trigger?: TriggerId;
  onUndo: () => void;
}) {
  const spec = trigger ? TRIGGER_CONTROLS.find((control) => control.id === trigger) : undefined;
  return (
    <section className="border border-green bg-greenSoft p-5" aria-live="polite" aria-label="Replan applied">
      <p className={`${typeScale.micro} font-bold uppercase tracking-[0.12em] text-green`}>Replan applied</p>
      <p className="mt-2 text-sm leading-6 text-ink">
        {spec ? `${spec.label}: ` : ""}
        {result.swaps.length} change{result.swaps.length === 1 ? "" : "s"} applied, measured against your
        original request rather than against the plan you had a moment ago.
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">
        Your original window, budget and party were not changed by this. They are still the baseline any
        further replan will be measured against.
      </p>
      <button onClick={onUndo} className="mt-3 inline-flex min-h-[44px] items-center border border-line bg-white px-4 py-2 text-sm font-bold">
        Put the previous plan back
      </button>
    </section>
  );
}

/**
 * The six one-click controls. Exported so session 5 can place it on Trips without
 * editing this file, and so the two surfaces cannot drift apart.
 */
export function TriggerRail({
  disabled,
  onFire,
}: {
  disabled: boolean;
  onFire: (trigger: TriggerId) => void;
}) {
  return (
    <section className="border border-line p-5" aria-label="Replan triggers">
      <p className={`${typeScale.micro} font-bold uppercase tracking-[0.14em] text-blue`}>Something changed</p>
      <h2 className={`mt-2 ${typeScale.title}`}>Replan, on your say so</h2>
      <p className={`mt-2 max-w-[68ch] ${typeScale.body} text-muted`}>
        Each control simulates one real change to the trip and re-solves the plan against it. Nothing is
        applied until you accept the proposal. Every one states what it will simulate before you press it.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {TRIGGER_CONTROLS.map((control) => (
          <li key={control.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onFire(control.id)}
              className="block w-full border border-line p-3 text-left transition-colors hover:border-blue disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block text-sm font-bold">{control.label}</span>
              <span className="mt-1 block text-xs leading-5 text-muted">{control.simulates}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { COMPONENT_LABEL, TONE_TEXT };
export type { Plan };
