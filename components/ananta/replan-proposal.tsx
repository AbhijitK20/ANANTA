"use client";

import { useState } from "react";
import { ArrowCounterClockwise, Check, X } from "@phosphor-icons/react/dist/ssr";
import type { Plan, ReplanResult, Stop, TriggerId } from "@/lib/engine";
import { TRIGGERS } from "@/components/ananta/replan";
import { hoursLabel } from "@/components/ananta/pipeline";

/**
 * Replanning is a proposal, never a silent edit.
 *
 * The masterplan is unambiguous: normal adaptation is always user controlled.
 * So this renders three controls and no automatic write. Accept swaps the plan,
 * keep original dismisses the proposal, and view alternatives lists what else
 * the gate had already passed so the traveller can choose for themselves.
 * All six triggers get a one-click control because all six are demo-able.
 */

export function TriggerRail({
  disabled,
  onFire,
}: {
  disabled: boolean;
  onFire: (trigger: TriggerId) => void;
}) {
  return (
    <section className="border border-line p-5">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">Something changed</p>
      <h2 className="mt-2 text-xl font-bold tracking-[-0.03em]">Replan, on your say so</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
        Each button changes one fact about the trip and re-solves. Nothing is applied until you accept it.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TRIGGERS.map((trigger) => (
          <button
            key={trigger.id}
            type="button"
            disabled={disabled}
            onClick={() => onFire(trigger.id)}
            className="border border-line p-3 text-left transition-colors hover:border-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="block text-sm font-bold">{trigger.label}</span>
            <span className="mt-1 block text-xs leading-5 text-muted">{trigger.detail}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ReplanProposal({
  result,
  before,
  alternatives,
  onAccept,
  onKeep,
}: {
  result: ReplanResult;
  before: Stop[];
  alternatives: Stop[];
  onAccept: () => void;
  onKeep: () => void;
}) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const moved = result.swaps.filter((swap) => swap.removedId || swap.addedId);

  return (
    <section className="border border-blue bg-blueSoft/40 p-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">Proposed replan</p>
          <h2 className="mt-2 text-lg font-bold">
            {moved.length
              ? `${moved.length} change${moved.length === 1 ? "" : "s"} proposed, none applied yet`
              : "Nothing needs to change"}
          </h2>
        </div>
        <p className="rounded-md bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          diffed against your original request
        </p>
      </div>

      <ul className="mt-4 space-y-3">
        {result.swaps.map((swap, index) => (
          <li key={`${swap.removedId ?? "none"}-${swap.addedId ?? "none"}-${index}`} className="border border-line bg-white p-4">
            <p className="text-sm font-semibold leading-6">{swap.reason}</p>
            <p className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-muted">
              <span className="rounded bg-canvas px-1.5 py-0.5">
                objective {swap.scoreDelta > 0 ? "+" : ""}
                {swap.scoreDelta.toFixed(3)}
              </span>
              <span className="rounded bg-canvas px-1.5 py-0.5">
                plan time {swap.minutesDelta > 0 ? "+" : ""}
                {hoursLabel(Math.abs(swap.minutesDelta))}
                {swap.minutesDelta < 0 ? " shorter" : " longer"}
              </span>
            </p>
          </li>
        ))}
      </ul>

      {before.length !== result.plan.stops.length && (
        <p className="mt-3 text-xs font-semibold text-muted">
          {before.length} stop{before.length === 1 ? "" : "s"} now,{" "}
          {result.plan.stops.length} stop{result.plan.stops.length === 1 ? "" : "s"} proposed.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={onAccept} className="inline-flex items-center gap-2 rounded-lg bg-blue px-4 py-2.5 text-sm font-bold text-white">
          <Check size={16} weight="bold" /> Accept this plan
        </button>
        <button
          onClick={() => setShowAlternatives(!showAlternatives)}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-bold"
        >
          View alternatives
        </button>
        <button
          onClick={onKeep}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-bold"
        >
          <X size={16} /> Keep the original
        </button>
      </div>

      {showAlternatives && (
        <div className="mt-5 border border-line bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
            {alternatives.length} record{alternatives.length === 1 ? "" : "s"} the gate had already passed
          </p>
          {alternatives.length ? (
            <ul className="mt-3 space-y-2">
              {alternatives.slice(0, 6).map((stop) => (
                <li key={stop.record.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold">{stop.record.name}</span>
                  <span className="text-xs text-muted">
                    {stop.record.area} · {stop.visitMinutes} min · {stop.travelMinutes} min from the last stop
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Nothing else passed the gate under the new limits, so the choice is between the proposal and the
              original plan.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function AcceptedReplan({ result, onUndo }: { result: ReplanResult; onUndo: () => void }) {
  return (
    <section className="border border-green bg-greenSoft p-5" aria-live="polite">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-green">
        <ArrowCounterClockwise size={15} /> Replan applied
      </p>
      <p className="mt-2 text-sm leading-6 text-ink">
        {result.swaps.length} change{result.swaps.length === 1 ? "" : "s"} applied against your original request.
        Objective {result.swaps[0]?.scoreDelta > 0 ? "up" : "down"}{" "}
        {Math.abs(result.swaps[0]?.scoreDelta ?? 0).toFixed(3)}.
      </p>
      <button onClick={onUndo} className="mt-3 rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-bold">
        Put the previous plan back
      </button>
    </section>
  );
}

/** The plan a proposal was measured against, for the header line. */
export type PlanLike = Plan;
