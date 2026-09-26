import type { Stop } from "@/lib/engine";
import { availabilityState, soldOutStops, type AvailabilityState } from "@/components/ananta/replan/intent";

/**
 * The pure half of the sold-out and solving states, in a `.ts` so the test suite
 * can import it without pulling a JSX module. The `states.tsx` component imports
 * this and adds only the markup, so the copy and the arithmetic here are the
 * single source the panel renders.
 */

/** One stage line, so the solve reads as work rather than as a wait. */
export type SolveStage = { label: string; detail: string; done: boolean };

/**
 * The stage list for the six-stage pipeline. The labels are the stage names the
 * masterplan uses, and each `detail` names a count, because "Gate: 1107 to 23"
 * is a fact and "Working" is not.
 */
export function solveStages(input: {
  retrieved: number | null;
  considered: number | null;
  passed: number | null;
  refused: number | null;
  packed: number | null;
  drift: number | null;
}): SolveStage[] {
  const count = (value: number | null): string => (value === null ? "not run yet" : String(value));
  const reached = (value: number | null): boolean => value !== null;
  return [
    {
      label: "Retrieve",
      detail:
        input.retrieved === null || input.considered === null
          ? "not run yet"
          : `${count(input.retrieved)} of ${count(input.considered)} records reached the gate`,
      done: reached(input.retrieved),
    },
    {
      label: "Gate",
      detail:
        input.passed === null
          ? "not run yet"
          : `${count(input.passed)} passed, ${count(input.refused)} refused with a stated reason`,
      done: reached(input.passed),
    },
    {
      label: "Score",
      detail: reached(input.passed) ? "ranked by the objective, largest contribution first" : "not run yet",
      done: reached(input.packed),
    },
    {
      label: "Pack",
      detail:
        input.packed === null
          ? "not run yet"
          : `${count(input.packed)} stop${input.packed === 1 ? "" : "s"} in the packed order`,
      done: reached(input.packed),
    },
    {
      label: "Validate",
      detail:
        input.drift === null
          ? "not run yet"
          : `objective re-derived independently, drift ${input.drift.toExponential(1)}`,
      done: reached(input.drift),
    },
    {
      label: "Relax",
      detail: reached(input.drift) ? "the ladder was walked only if validation failed" : "not run yet",
      done: reached(input.drift),
    },
  ];
}

/** Every sold-out stop in a plan. Session 5 reads this for the feasibility meter. */
export { availabilityState, soldOutStops, type AvailabilityState, type Stop };
