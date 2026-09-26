import type { EventSeed } from "@/lib/seed";
import type { EventEvaluation } from "@/lib/events";
import { eventRejection } from "@/components/ananta/replan/intent";

/**
 * Event refusals, built from the engine's sentence table.
 *
 * RULE 0 forbids hand-writing a rejection sentence in the view layer, and
 * `lib/events.ts:53` hand-writes exactly that: "Starts in {gap} minutes but
 * needs about {n} minutes to reach." That sentence is a
 * `travel_time_exceeds_budget` rejection wearing a disguise, so it is rebuilt
 * here as a real `Rejection` with a real `shortfall`, and the sentence comes
 * from `contracts/codes.ts`. The shortfall is the measured deficit: how many
 * minutes short the traveller is of being able to reach the venue in time.
 *
 * `lib/**` is frozen, so the mapping lives in the view layer rather than in
 * `lib/events.ts`. Nothing here re-implements the engine; it translates an
 * existing lib type into the engine's vocabulary.
 *
 * This file is a **server-safe module**: no `"use client"`, no hooks, no JSX.
 * Both the events index and the event detail route are server components at
 * the point they call it, and a `"use client"` boundary here would turn these
 * plain functions into client references that a server component cannot call.
 * The one interactive state, `NothingReachableState`, lives in
 * `app/events/event-rejection-client.tsx` for that reason.
 */

export type EventRejection = {
  code: string;
  sentence: string;
  shortfall: number | null;
} | null;

/**
 * `null` means this is not a refusal, so nothing is invented. See
 * `eventWindowPassed` for the one honest gap in the code table.
 */
export function eventRefusal(evaluation: EventEvaluation, nowMinutes: number): EventRejection {
  const { event, status } = evaluation;
  if (status !== "Cannot reach in time") return null;
  const gap = event.startMinutes - nowMinutes;
  const deficit = Math.max(0, event.travelMinutes - gap);
  const rejection = eventRejection({
    code: "travel_time_exceeds_budget",
    shortfall: deficit,
    unit: "minutes",
    extra: `${event.venue} needs about ${event.travelMinutes} min to reach and the slot is ${gap} min away`,
  });
  return { code: rejection.code, sentence: rejection.sentence, shortfall: rejection.shortfall };
}

/**
 * An event whose window has closed is a fact about time, not a refusal on
 * account of a constraint, and the frozen `RejectionCode` union has no code that
 * says so. Rather than borrow an unrelated code or write a bespoke rejection
 * sentence, this states the plain fact with the numbers from the record, and the
 * missing code is logged as a blocker for session 1.
 * See `UI-UX-Fix-Prompts/BLOCKERS/9.md`.
 */
export function eventWindowPassed(evaluation: EventEvaluation, nowMinutes: number): string {
  const { event } = evaluation;
  const minutesAgo = nowMinutes - event.endMinutes;
  const when =
    minutesAgo < 60
      ? `It ended ${minutesAgo} min ago.`
      : `It ended ${Math.floor(minutesAgo / 60)} h ${minutesAgo % 60} min ago.`;
  return `This demo event window has already passed. ${when} The record's window runs ${event.startMinutes} to ${event.endMinutes} minutes after the reference time, and ${event.timeLabel} is the listed slot.`;
}

/** Minutes between the reference time and the slot, from the record's own fields. */
export function eventStartGap(event: EventSeed, nowMinutes: number): number {
  return event.startMinutes - nowMinutes;
}

/**
 * Whether the record carries expiry data. `EventSeed` has `endMinutes`, which is
 * relative to an injected reference time rather than an absolute instant, so the
 * label says which field the window came from instead of claiming a wall-clock
 * expiry. Logged as a blocker in `UI-UX-Fix-Prompts/BLOCKERS/9.md`.
 */
export function eventExpiry(event: EventSeed): { hasExpiry: boolean; label: string } {
  if (typeof event.endMinutes !== "number") {
    return { hasExpiry: false, label: "No expiry field is on this event record." };
  }
  return {
    hasExpiry: true,
    label: `The window on this record ends ${event.endMinutes} minutes after the reference time. There is no wall-clock expiry on the record.`,
  };
}
