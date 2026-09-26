"use client";

import type { Plan, Stop } from "@/lib/engine";
import { typeScale } from "@/components/ananta/tokens";
import { availabilityState, soldOutStops, type AvailabilityState, type SolveStage, solveStages } from "@/components/ananta/replan/states-core";
import { TriggerRail } from "@/components/ananta/replan/proposal";

/**
 * The two states that are mine above anyone else's: `sold-out` and `solving`.
 *
 * `sold-out` states the fact and its timestamp, then offers the replan. It must
 * not read as an error, because a sold-out slot is information about the world
 * and not a failure of the software. Session 5's feasibility meter needs to know
 * about a sold-out stop, so the availability state is exported in a form it can
 * consume directly: `soldOutStops` takes stops and returns the states, no
 * component required. The arithmetic lives in `states-core.ts` so it is testable
 * without a JSX runtime.
 *
 * `solving` shows the stage, not a spinner. The pipeline is six named stages and
 * the stage line is the demo: "Gate: 1107 to 23" then "Packing". Nothing is
 * hidden while this runs.
 */

export function SoldOutState({
  states,
  onReplan,
  replanDisabled,
}: {
  states: AvailabilityState[];
  /** Fires the `sold_out` trigger for the record the traveller picks. */
  onReplan?: (recordId: string) => void;
  replanDisabled?: boolean;
}) {
  if (!states.length) return null;
  return (
    <section className="border border-amber bg-amberSoft/40 p-5" aria-live="polite" aria-label="Sold out">
      <p className={`${typeScale.micro} font-bold uppercase tracking-[0.12em] text-amber`}>
        Sold out, from the provider record
      </p>
      <p className="mt-2 text-sm leading-6">
        {states.length === 1 ? "One stop in your plan" : `${states.length} stops in your plan`} sold out
        while you were planning. This is a fact about the slot, not a fault in the plan.
      </p>
      <ul className="mt-3 space-y-2">
        {states.map((state) => (
          <li key={state.id} className="border border-line bg-white p-3">
            <p className="text-sm font-bold">{state.name}</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              The record says the slot went at {state.soldOutLabel}. The provider record was last updated on{" "}
              {state.updatedAt}.
              {state.bookingUrl
                ? " A booking link is on file, so you can check whether the slot came back."
                : " No booking link is on file, so there is nothing to re-check against."}
            </p>
            {onReplan && (
              <button
                onClick={() => onReplan(state.id)}
                disabled={replanDisabled}
                className="mt-2 inline-flex min-h-[44px] items-center border border-blue px-3 py-2 text-xs font-bold text-blue disabled:cursor-not-allowed disabled:opacity-50"
              >
                Replan around {state.name}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SolvingState({ stages }: { stages: SolveStage[] }) {
  const done = stages.filter((stage) => stage.done).length;
  return (
    <section className="border border-blue bg-blueSoft/30 p-5" role="status" aria-live="polite" aria-label="Solving">
      <p className={`${typeScale.micro} font-bold uppercase tracking-[0.12em] text-blue`}>
        Working, stage {Math.min(done + 1, stages.length)} of {stages.length}
      </p>
      <h2 className={`mt-2 ${typeScale.title}`}>Nothing is hidden while this runs</h2>
      <ol className="mt-3 space-y-1">
        {stages.map((stage) => (
          <li key={stage.label} className="flex flex-wrap items-baseline gap-2 text-xs">
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${stage.done ? "bg-green" : "border border-line bg-white"}`}
            />
            <span className={stage.done ? "font-bold" : "text-muted"}>{stage.label}</span>
            <span className="text-muted">{stage.detail}</span>
            <span className="sr-only">{stage.done ? "complete" : "pending"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Convenience for a surface that has stops but no component budget. */
export function SoldOutNotice({ stops }: { stops: readonly Stop[]; plan?: Plan | null }) {
  return <SoldOutState states={soldOutStops(stops)} />;
}

export { availabilityState, solveStages, soldOutStops, TriggerRail };
export type { AvailabilityState, SolveStage };
