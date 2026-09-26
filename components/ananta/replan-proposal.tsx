/**
 * Compatibility shim, not a second implementation.
 *
 * `app/trips/page.tsx` imports the three components from
 * `@/components/ananta/replan-proposal`. Session 5 owns that page, so the old
 * path re-exports from `./replan/proposal` and nothing has to change there.
 * `TriggerRail` now lives in `./replan/proposal` as well, and the sold-out and
 * solving states live in `./replan/states`.
 */
export { ReplanProposal, AcceptedReplan, TriggerRail } from "./replan/proposal";
export { SoldOutState, SoldOutNotice, SolvingState, solveStages } from "./replan/states";
export type { SolveStage, AvailabilityState } from "./replan/states";
