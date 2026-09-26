"use client";

import type { ReactNode } from "react";
import type { DiscoveryContext, Plan, Stop, ValidationIssue } from "@/lib/engine";
import { typeScale, type UiState } from "@/components/ananta/tokens";
import { UiStatePanel } from "@/components/ananta/learning/ui-state";
import { SoldOutState, soldOutStops, type AvailabilityState } from "@/components/ananta/replan/states";
import { inrLabel } from "@/components/ananta/pipeline";
import type { RelaxationOption } from "@/components/ananta/pipeline";

/**
 * All nine knowledge states, decided from what actually came back.
 *
 * The contracts are blunt about this: "Every screen implements all nine. A state
 * that renders a blank div is a bug." So each one below is resolved from a measured
 * field of the run, not chosen for effect, and the resolution is exported so a test
 * can read it without rendering anything.
 *
 * Three of the nine are true on this screen unconditionally, and pretending
 * otherwise would be the dishonest version of compliance:
 *
 *  - `routing-down` is always on. `makeTravelOptions` builds every leg from
 *    haversine at the manifest congestion multiplier. There is no live routing
 *    anywhere in the request path, so the state is permanent rather than a
 *    fallback, and it is rendered as a strip under the evidence rather than as a
 *    panel that would imply the rest of the screen is degraded.
 *  - `abstained` shows when the gate declined to judge a record because a required
 *    fact was unknown. The contracts name this as the state that most resembles an
 *    error and is not one.
 *  - `partially-unknown` shows when a record in the plan carries an unverified
 *    field, with the count, and states that those fields did not decide the result.
 */

export interface TripsStateInput {
  /** Null until the first solve finishes. */
  retrieved: number | null;
  passed: number | null;
  refused: number | null;
  packed: number | null;
  drift: number | null;
  stops: readonly Stop[];
  ctx: DiscoveryContext;
  /** Records the traveller asked about that the gate would not judge. */
  abstainedNames: readonly string[];
  /** Records in the plan carrying at least one unverified field. */
  partiallyUnknown: readonly string[];
  /** Non-finite objective, or a validation that could not complete. */
  broken: string | null;
  /** `navigator.onLine`, resolved on the client. */
  online: boolean;
}

export type TripsState = UiState;

/**
 * Which states apply, in the order they should be shown. Exported so the coverage
 * requirement is testable without a DOM.
 */
export function resolveTripsStates(input: TripsStateInput): TripsState[] {
  const states: TripsState[] = [];
  if (input.broken !== null) states.push("broken");
  if (!input.online) states.push("offline");
  // Always true here and said so once, in the strip below, not as a panel.
  if (input.retrieved === 0) states.push("nothing-retrieved");
  if (input.stops.length === 0 && input.passed !== null) states.push("nothing-fits");
  if (input.abstainedNames.length > 0) states.push("abstained");
  if (input.partiallyUnknown.length > 0) states.push("partially-unknown");
  return states;
}

/** The permanent strip, rendered once and not as a blocking panel. */
export function RoutingNotice() {
  return (
    <p className="border border-dashed border-line bg-canvas px-4 py-3 text-xs leading-5 text-muted">
      <span className="font-bold text-ink">Live routing is unavailable.</span> Every kilometre and every
      minute on this screen is a straight-line estimate scaled by the city congestion multiplier in the
      manifest, computed on the device. It is an estimate and is labelled as one wherever it appears.
    </p>
  );
}

function issueList(issues: readonly ValidationIssue[], names: (id: string | null) => string) {
  if (!issues.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm leading-6">
      {issues.slice(0, 5).map((issue, index) => (
        <li key={`${issue.code}-${index}`}>
          {issue.sentence}
          {issue.offendingId ? ` Stop: ${names(issue.offendingId)}.` : ""}
        </li>
      ))}
    </ul>
  );
}

/**
 * Every state that applies, rendered deliberately. `routing-down` and `sold-out`
 * are handled by their own components so the meter and the meter, the two halves of
 * the same judgement, cannot disagree about whether a slot is gone.
 */
export function TripsStates({
  input,
  validationIssues,
  cheapest,
  nameOf,
  plan,
  onReplanAround,
  replanDisabled,
}: {
  input: TripsStateInput;
  validationIssues: readonly ValidationIssue[];
  /** The single cheapest relaxation, with the count it would unlock. */
  cheapest?: RelaxationOption | null;
  /** Names an offending record. `null` means the issue is about the plan, not a stop. */
  nameOf: (id: string | null) => string;
  plan?: Plan | null;
  onReplanAround?: (recordId: string) => void;
  replanDisabled?: boolean;
}) {
  const states = resolveTripsStates(input);
  const availability: AvailabilityState[] = soldOutStops(input.stops);
  const { ctx } = input;

  if (!states.length && !availability.length) return null;

  const body: Record<string, ReactNode> = {
    broken: (
      <>
        <p className="mt-2 text-sm leading-6">
          {input.broken} The catalogue, the gate and the plan below are unaffected.
        </p>
      </>
    ),
    offline: (
      <p className="mt-2 text-sm leading-6">
        You are offline, so nothing on this screen was fetched just now. Every number below was computed
        on this device from the committed snapshot.
      </p>
    ),
    "nothing-retrieved": (
      <p className="mt-2 text-sm leading-6">
        Retrieval returned {input.retrieved} of the catalogue. The travel window of {ctx.availableMinutes}{" "}
        minutes from {ctx.origin.area} is the filter that emptied the set; widening available time or starting
        closer to another area brings results back.
      </p>
    ),
    "nothing-fits": (
      <>
        <p className="mt-2 text-sm leading-6">
          {input.passed === 0
            ? `All ${input.refused ?? 0} retrieved records were refused by the gate before scoring began.`
            : `${input.passed} record${input.passed === 1 ? "" : "s"} passed the gate and none of them fit the window, the budget and the party together.`}
        </p>
        {cheapest ? (
          <p className="mt-2 border-l-4 border-blue bg-blueSoft/50 px-3 py-2 text-sm font-semibold leading-6">
            {cheapest.label} is the cheapest change, and it would bring back{" "}
            {cheapest.unlockedCount} record{cheapest.unlockedCount === 1 ? "" : "s"}
            {cheapest.medianShortfall !== null
              ? `. The median one is ${Math.round(cheapest.medianShortfall * 10) / 10} short.`
              : "."}
          </p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted">
            No single relaxation brings a plan back within your limits. Widen the window or raise the
            budget, and the gate re-runs against the new numbers.
          </p>
        )}
      </>
    ),
    abstained: (
      <>
        <p className="mt-2 text-sm leading-6">
          {input.abstainedNames.length === 1
            ? "One record you were shown has a required fact we do not have, so the gate declined to judge it."
            : `${input.abstainedNames.length} records you were shown have a required fact we do not have, so the gate declined to judge them.`}{" "}
          This is a refusal to guess, and it is not a rejection of the place.
        </p>
        <p className="mt-2 text-sm font-semibold">{input.abstainedNames.slice(0, 4).join(", ")}</p>
      </>
    ),
    "partially-unknown": (
      <>
        <p className="mt-2 text-sm leading-6">
          {input.partiallyUnknown.length === 1 ? "One stop in" : `${input.partiallyUnknown.length} stops in`} your
          plan carries at least one unverified field. Those fields are marked on the record page. They did
          not decide the result: an unverified field is never scored as though it were known.
        </p>
        <p className="mt-2 text-sm font-semibold">{input.partiallyUnknown.slice(0, 4).join(", ")}</p>
      </>
    ),
  };

  const actions: Record<string, { href: string; label: string } | null> = {
    "nothing-retrieved": { href: "/explore", label: "Widen the search" },
    "nothing-fits": { href: "/explore", label: "Loosen one limit" },
  };

  return (
    <div className="space-y-4">
      {states.map((state) => (
        <UiStatePanel key={state} state={state} action={actions[state] ?? null}>
          {body[state]}
        </UiStatePanel>
      ))}

      {availability.length > 0 && (
        <SoldOutState
          states={availability}
          onReplan={onReplanAround}
          replanDisabled={replanDisabled}
        />
      )}

      {validationIssues.length > 0 && (
        <details className="border border-line p-5">
          <summary className={`cursor-pointer ${typeScale.meta} font-bold text-blue`}>
            Every refusal the validator recorded ({validationIssues.length})
          </summary>
          {issueList(validationIssues, nameOf)}
          <p className="mt-3 text-xs leading-5 text-muted">
            The plan above costs {inrLabel(input.stops.reduce((sum, stop) => sum + stop.costInr, 0))} for a
            party of {ctx.partySize} inside a {inrLabel(ctx.budgetInr)} budget and a{" "}
            {ctx.availableMinutes} minute window.
            {plan ? ` The plan shown was solved against the context you first gave, and the current one is ${plan.stops.length} stop${plan.stops.length === 1 ? "" : "s"}.` : ""}
          </p>
        </details>
      )}
    </div>
  );
}
